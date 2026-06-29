import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { getMetricsReport, resetMetrics } from '../src'
import { BaseWebcam, WebcamCommand } from '../src/webcams/BaseWebcam'

const waitForeverScript = 'setTimeout(() => {}, 1000)'

class MetricsWebcam extends BaseWebcam {
  calls = 0

  generateCommand(location: string) {
    return { file: 'fake', args: [location] }
  }

  protected async executeCommand(command: WebcamCommand) {
    this.calls += 1
    await new Promise(resolve => setTimeout(resolve, 10))
    await writeFile(command.args[0], Buffer.from([1, 2, 3, 4]))
  }
}

class CommandWebcam extends BaseWebcam {
  #command: WebcamCommand

  constructor(
    options: ConstructorParameters<typeof BaseWebcam>[0],
    command: WebcamCommand
  ) {
    super(options)
    this.#command = command
  }

  generateCommand() {
    return this.#command
  }
}

describe('metrics', () => {
  beforeEach(() => {
    resetMetrics()
  })

  afterEach(() => {
    resetMetrics()
  })

  it('starts with an empty metrics report', () => {
    assert.deepEqual(getMetricsReport(), {
      captures: {
        aborted: 0,
        averageElapsedMs: 0,
        averageQueueWaitMs: 0,
        bytesRead: 0,
        failed: 0,
        maxElapsedMs: 0,
        maxQueueWaitMs: 0,
        succeeded: 0,
        timedOut: 0,
        total: 0,
        totalElapsedMs: 0,
        totalQueueWaitMs: 0
      },
      byBackend: {}
    })
  })

  it('records successful capture metrics by backend', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new MetricsWebcam({ output: 'png', saveShots: false })

    try {
      await webcam.capture({ location: path })

      const report = getMetricsReport()

      assert.equal(report.captures.total, 1)
      assert.equal(report.captures.succeeded, 1)
      assert.equal(report.captures.failed, 0)
      assert.equal(report.captures.bytesRead, 4)
      assert.ok(report.captures.totalElapsedMs >= 0)
      assert.ok(report.captures.averageElapsedMs >= 0)
      assert.equal(report.byBackend.MetricsWebcam.total, 1)
      assert.equal(report.byBackend.MetricsWebcam.bytesRead, 4)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('records timeout and abort failures', async () => {
    const timeoutWebcam = new CommandWebcam(
      { output: 'png', timeout: 10 },
      { file: process.execPath, args: ['-e', waitForeverScript] }
    )
    const controller = new AbortController()
    const abortedWebcam = new CommandWebcam(
      {
        output: 'png',
        signal: controller.signal
      },
      { file: process.execPath, args: ['-e', waitForeverScript] }
    )
    const timer = setTimeout(() => controller.abort(), 10)

    try {
      await assert.rejects(
        () =>
          timeoutWebcam.capture({
            location: 'timeout.png'
          }),
        { code: 'COMMAND_TIMEOUT' }
      )
      await assert.rejects(
        () =>
          abortedWebcam.capture({
            location: 'aborted.png'
          }),
        { code: 'COMMAND_ABORTED' }
      )

      const report = getMetricsReport()

      assert.equal(report.captures.total, 2)
      assert.equal(report.captures.failed, 2)
      assert.equal(report.captures.timedOut, 1)
      assert.equal(report.captures.aborted, 1)
    } finally {
      clearTimeout(timer)
    }
  })

  it('records queue wait time for serialized captures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new MetricsWebcam({ output: 'png', saveShots: false })

    try {
      await Promise.all([
        webcam.capture({ location: path }),
        webcam.capture({ location: path })
      ])

      const report = getMetricsReport()

      assert.equal(report.captures.total, 2)
      assert.equal(report.captures.succeeded, 2)
      assert.ok(report.captures.maxQueueWaitMs > 0)
      assert.ok(report.captures.averageQueueWaitMs > 0)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
