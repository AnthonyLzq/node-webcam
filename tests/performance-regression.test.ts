import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { BaseWebcam, WebcamCommand } from '../src/webcams/BaseWebcam'

const writeFixtureImageScript =
  'require("node:fs").writeFileSync(process.argv[1], Buffer.from([1, 2, 3]))'
const waitForeverScript = 'setTimeout(() => {}, 1000)'

class StressWebcam extends BaseWebcam {
  activeCaptures = 0
  base64Calls = 0
  calls = 0
  maxActiveCaptures = 0

  getBase64FromBuffer(shotBuffer: Buffer) {
    this.base64Calls += 1

    return super.getBase64FromBuffer(shotBuffer)
  }

  protected async executeCommand(command: WebcamCommand) {
    this.calls += 1
    this.activeCaptures += 1
    this.maxActiveCaptures = Math.max(
      this.maxActiveCaptures,
      this.activeCaptures
    )

    try {
      await new Promise(resolve => setTimeout(resolve, 10))
      await writeFile(command.args[0], Buffer.alloc(1024 * 256, this.calls))
    } finally {
      this.activeCaptures -= 1
    }
  }
}

describe('performance regressions', () => {
  it('serializes repeated concurrent captures to the same path', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new StressWebcam({ output: 'png', saveShots: false })

    try {
      await Promise.all(
        Array.from({ length: 5 }, () =>
          webcam.capture({ file: 'fake', args: [path] }, path, 'buffer')
        )
      )

      assert.equal(webcam.calls, 5)
      assert.equal(webcam.maxActiveCaptures, 1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('releases path queues after timeout failures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const timeoutWebcam = new BaseWebcam({ output: 'png', timeout: 10 })
    const successWebcam = new BaseWebcam({ output: 'png', saveShots: false })

    try {
      const firstCapture = timeoutWebcam.capture(
        { file: process.execPath, args: ['-e', waitForeverScript] },
        path,
        'buffer'
      )
      const secondCapture = successWebcam.capture(
        { file: process.execPath, args: ['-e', writeFixtureImageScript, path] },
        path,
        'buffer'
      )

      await assert.rejects(() => firstCapture, {
        code: 'COMMAND_TIMEOUT',
        name: 'WebcamError'
      })
      assert.deepEqual([...((await secondCapture) as Buffer)], [1, 2, 3])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('avoids retaining and base64-encoding repeated buffer captures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const webcam = new StressWebcam({ output: 'png', saveShots: false })

    try {
      for (let index = 0; index < 3; index += 1) {
        const path = join(directory, `${index}.png`)

        await webcam.capture({ file: 'fake', args: [path] }, path, 'buffer')
      }

      assert.equal(webcam.base64Calls, 0)
      assert.throws(() => webcam.getLastShot(), {
        code: 'SHOT_NOT_FOUND',
        name: 'WebcamError'
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
