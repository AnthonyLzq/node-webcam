import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { WebcamError } from '../src/errors'
import { BaseWebcam } from '../src/webcams/BaseWebcam'
import { Shot } from '../src/utils'

describe('BaseWebcam', () => {
  it('returns a defensive copy of options', () => {
    const webcam = new BaseWebcam({ width: 640 })
    const options = webcam.options

    options.width = 320

    assert.equal(webcam.options.width, 640)
  })

  it('rejects paths without an extension before executing commands', async () => {
    const webcam = new BaseWebcam({})

    await assert.rejects(
      () =>
        webcam.capture({ file: 'should-not-run', args: [] }, 'photo', 'buffer'),
      {
        code: 'INVALID_OUTPUT_PATH',
        message: 'Invalid path, missing type file',
        name: 'WebcamError'
      }
    )
  })

  it('rejects unsupported file extensions before executing commands', async () => {
    const webcam = new BaseWebcam({})

    await assert.rejects(
      () =>
        webcam.capture(
          { file: 'should-not-run', args: [] },
          'photo.gif',
          'buffer'
        ),
      {
        code: 'INVALID_FILE_EXTENSION',
        message: 'Invalid file extension: gif',
        name: 'WebcamError'
      }
    )
  })

  it('rejects mismatched output and file extension before execution', async () => {
    const webcam = new BaseWebcam({ output: 'jpeg' })

    await assert.rejects(
      () =>
        webcam.capture(
          { file: 'should-not-run', args: [] },
          'photo.png',
          'buffer'
        ),
      {
        code: 'OUTPUT_MISMATCH',
        message: 'The output (jpeg) and the file type (png) does not match',
        name: 'WebcamError'
      }
    )
  })

  it('rejects invalid return types before executing commands', async () => {
    const webcam = new BaseWebcam({ output: 'png' })

    await assert.rejects(
      () =>
        webcam.capture(
          { file: 'should-not-run', args: [] },
          'photo.png',
          'json' as 'buffer'
        ),
      {
        code: 'INVALID_RETURN_TYPE',
        message: 'Invalid returnType: json',
        name: 'WebcamError'
      }
    )
  })

  it('wraps missing command binaries with a typed error', async () => {
    const webcam = new BaseWebcam({ output: 'png' })

    await assert.rejects(
      () =>
        webcam.capture(
          { file: 'definitely-not-node-webcam-command', args: [] },
          'photo.png',
          'buffer'
        ),
      {
        code: 'BINARY_NOT_FOUND',
        message:
          'Webcam command binary was not found: definitely-not-node-webcam-command',
        name: 'WebcamError'
      }
    )
  })

  it('wraps failed commands with command details', async () => {
    const webcam = new BaseWebcam({ output: 'png' })

    try {
      await webcam.capture(
        { file: process.execPath, args: ['-e', 'process.exit(7)'] },
        'photo.png',
        'buffer'
      )
      assert.fail('Expected command failure')
    } catch (error) {
      assert.ok(error instanceof WebcamError)
      assert.equal(error.code, 'COMMAND_FAILED')
      assert.deepEqual(error.details?.file, process.execPath)
      assert.deepEqual(error.details?.args, ['-e', 'process.exit(7)'])
    }
  })

  it('wraps missing capture output with a typed error', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new BaseWebcam({ output: 'png' })

    try {
      await assert.rejects(
        () =>
          webcam.capture(
            { file: process.execPath, args: ['-e', 'process.exit(0)'] },
            path,
            'buffer'
          ),
        {
          code: 'OUTPUT_READ_FAILED',
          message: `Unable to read captured output: ${path}`,
          name: 'WebcamError'
        }
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('executes capture commands without a shell', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new BaseWebcam({ output: 'png' })

    try {
      const result = await webcam.capture(
        {
          file: process.execPath,
          args: [
            '-e',
            'require("node:fs").writeFileSync(process.argv[1], Buffer.from([1, 2, 3]))',
            path
          ]
        },
        path,
        'buffer'
      )

      assert.deepEqual([...(result as Buffer)], [1, 2, 3])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('throws a typed error for missing shot indexes', () => {
    const webcam = new BaseWebcam({})

    assert.throws(() => webcam.getShot(0), {
      code: 'SHOT_NOT_FOUND',
      message: 'Index out of bonds',
      name: 'WebcamError'
    })
  })
})

describe('Shot', () => {
  it('returns defensive copies of captured data', () => {
    const shot = new Shot('photo.jpeg', Buffer.from([1, 2, 3]))
    const data = shot.data

    data[0] = 9

    assert.deepEqual([...shot.data], [1, 2, 3])
  })
})
