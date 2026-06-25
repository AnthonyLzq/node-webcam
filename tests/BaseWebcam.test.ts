import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { WebcamError } from '../src/errors'
import { resetLogger, setLogger, WebcamLogEntry } from '../src/logger'
import { BaseWebcam } from '../src/webcams/BaseWebcam'
import { Shot } from '../src/utils'

type ConsoleCall = {
  args: unknown[]
  level: 'debug' | 'error' | 'info' | 'warn'
}

const captureConsoleOutput = async (fn: () => Promise<void>) => {
  const calls: ConsoleCall[] = []
  const originalConsoleDebug = console.debug
  const originalConsoleError = console.error
  const originalConsoleInfo = console.info
  const originalConsoleWarn = console.warn

  console.debug = (...args: unknown[]) => {
    calls.push({ args, level: 'debug' })
  }
  console.error = (...args: unknown[]) => {
    calls.push({ args, level: 'error' })
  }
  console.info = (...args: unknown[]) => {
    calls.push({ args, level: 'info' })
  }
  console.warn = (...args: unknown[]) => {
    calls.push({ args, level: 'warn' })
  }

  try {
    await fn()
  } finally {
    console.debug = originalConsoleDebug
    console.error = originalConsoleError
    console.info = originalConsoleInfo
    console.warn = originalConsoleWarn
  }

  return calls
}

const writeFixtureImageScript =
  'require("node:fs").writeFileSync(process.argv[1], Buffer.from([1, 2, 3]))'
const waitForeverScript = 'setTimeout(() => {}, 1000)'

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

  it('wraps timed out capture commands with a typed error', async () => {
    const webcam = new BaseWebcam({ output: 'png', timeout: 10 })

    try {
      await webcam.capture(
        { file: process.execPath, args: ['-e', waitForeverScript] },
        'photo.png',
        'buffer'
      )
      assert.fail('Expected timeout failure')
    } catch (error) {
      assert.ok(error instanceof WebcamError)
      assert.equal(error.code, 'COMMAND_TIMEOUT')
      assert.equal(
        error.message,
        `Webcam command timed out after 10ms: ${process.execPath}`
      )
      assert.equal(error.details?.timeout, 10)
      assert.equal(typeof error.details?.elapsedMs, 'number')
    }
  })

  it('wraps aborted capture commands with a typed error', async () => {
    const controller = new AbortController()
    const webcam = new BaseWebcam({
      output: 'png',
      signal: controller.signal
    })
    const timer = setTimeout(() => controller.abort(), 10)

    try {
      await webcam.capture(
        { file: process.execPath, args: ['-e', waitForeverScript] },
        'photo.png',
        'buffer'
      )
      assert.fail('Expected abort failure')
    } catch (error) {
      assert.ok(error instanceof WebcamError)
      assert.equal(error.code, 'COMMAND_ABORTED')
      assert.equal(
        error.message,
        `Webcam command was aborted: ${process.execPath}`
      )
      assert.equal(error.details?.signalAborted, true)
      assert.equal(typeof error.details?.elapsedMs, 'number')
    } finally {
      clearTimeout(timer)
    }
  })

  it('rejects invalid capture timeouts before executing commands', async () => {
    const webcam = new BaseWebcam({ output: 'png', timeout: -1 })

    await assert.rejects(
      () =>
        webcam.capture(
          { file: 'should-not-run', args: [] },
          'photo.png',
          'buffer'
        ),
      {
        code: 'INVALID_TIMEOUT',
        message: 'Invalid timeout: -1',
        name: 'WebcamError'
      }
    )
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
          args: ['-e', writeFixtureImageScript, path]
        },
        path,
        'buffer'
      )

      assert.deepEqual([...(result as Buffer)], [1, 2, 3])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('stays silent by default during successful captures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new BaseWebcam({ output: 'png' })

    try {
      const calls = await captureConsoleOutput(async () => {
        await webcam.capture(
          {
            file: process.execPath,
            args: ['-e', writeFixtureImageScript, path]
          },
          path,
          'buffer'
        )
      })

      assert.equal(calls.length, 0)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('emits verbose capture diagnostics for successful captures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new BaseWebcam({ output: 'png', verbose: true })

    try {
      const calls = await captureConsoleOutput(async () => {
        await webcam.capture(
          {
            file: process.execPath,
            args: ['-e', writeFixtureImageScript, path]
          },
          path,
          'buffer'
        )
      })

      assert.equal(calls.length, 2)
      assert.equal(calls[0].level, 'debug')
      assert.equal(calls[1].level, 'info')
      assert.deepEqual(calls[0].args.slice(0, 2), [
        '[node-webcam]',
        'capture:start'
      ])
      assert.deepEqual(calls[1].args.slice(0, 2), [
        '[node-webcam]',
        'capture:success'
      ])

      const startDetails = calls[0].args[2] as Record<string, unknown>
      const successDetails = calls[1].args[2] as Record<string, unknown>

      assert.equal(startDetails.backend, 'BaseWebcam')
      assert.equal(startDetails.file, process.execPath)
      assert.deepEqual(startDetails.args, ['-e', writeFixtureImageScript, path])
      assert.equal(startDetails.path, path)
      assert.equal(startDetails.returnType, 'buffer')
      assert.match(String(startDetails.operationId), /^capture-\d+$/)
      assert.equal(successDetails.operationId, startDetails.operationId)
      assert.equal(successDetails.bytes, 3)
      assert.equal(typeof successDetails.elapsedMs, 'number')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('emits verbose capture diagnostics for command failures', async () => {
    const webcam = new BaseWebcam({ output: 'png', verbose: true })

    const calls = await captureConsoleOutput(async () => {
      await assert.rejects(
        () =>
          webcam.capture(
            { file: 'definitely-not-node-webcam-command', args: [] },
            'photo.png',
            'buffer'
          ),
        { code: 'BINARY_NOT_FOUND' }
      )
    })

    assert.equal(calls.length, 2)
    assert.equal(calls[0].level, 'debug')
    assert.equal(calls[1].level, 'error')
    assert.deepEqual(calls[0].args.slice(0, 2), [
      '[node-webcam]',
      'capture:start'
    ])
    assert.deepEqual(calls[1].args.slice(0, 2), [
      '[node-webcam]',
      'capture:error'
    ])

    const startDetails = calls[0].args[2] as Record<string, unknown>
    const errorDetails = calls[1].args[2] as Record<string, unknown>

    assert.equal(errorDetails.operationId, startDetails.operationId)
    assert.equal(errorDetails.code, 'BINARY_NOT_FOUND')
    assert.equal(errorDetails.file, 'definitely-not-node-webcam-command')
    assert.deepEqual(errorDetails.args, [])
    assert.equal(typeof errorDetails.elapsedMs, 'number')
  })

  it('routes verbose diagnostics through the logger abstraction', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new BaseWebcam({ output: 'png', verbose: true })
    const entries: WebcamLogEntry[] = []

    setLogger({
      log: entry => {
        entries.push(entry)
      }
    })

    try {
      await webcam.capture(
        {
          file: process.execPath,
          args: ['-e', writeFixtureImageScript, path]
        },
        path,
        'buffer'
      )
    } finally {
      resetLogger()
      rmSync(directory, { recursive: true, force: true })
    }

    assert.deepEqual(
      entries.map(entry => [entry.level, entry.event]),
      [
        ['debug', 'capture:start'],
        ['info', 'capture:success']
      ]
    )
    assert.equal(entries[0].details.backend, 'BaseWebcam')
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
