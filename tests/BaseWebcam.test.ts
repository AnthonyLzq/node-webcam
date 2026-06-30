import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'

import { WebcamError } from '../src/errors'
import { resetLogger, setLogger, WebcamLogEntry } from '../src/logger'
import {
  BaseWebcam,
  WebcamCaptureExecution,
  WebcamCommand
} from '../src/webcams/BaseWebcam'
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

class Base64CountingWebcam extends BaseWebcam {
  base64Calls = 0

  generateCommand(location: string) {
    return {
      file: process.execPath,
      args: ['-e', writeFixtureImageScript, location]
    }
  }

  getBase64FromBuffer(shotBuffer: Buffer) {
    this.base64Calls += 1

    return super.getBase64FromBuffer(shotBuffer)
  }
}

class FakeCaptureWebcam extends BaseWebcam {
  static activeCaptures = 0
  static maxActiveCaptures = 0

  activeCaptures = 0
  calls = 0
  failFirstCapture = false
  maxActiveCaptures = 0

  static resetGlobalCaptures() {
    FakeCaptureWebcam.activeCaptures = 0
    FakeCaptureWebcam.maxActiveCaptures = 0
  }

  generateCommand(location: string) {
    return { file: 'fake', args: [location] }
  }

  protected async executeCommand(command: WebcamCommand) {
    this.calls += 1
    const call = this.calls
    this.activeCaptures += 1
    FakeCaptureWebcam.activeCaptures += 1
    this.maxActiveCaptures = Math.max(
      this.maxActiveCaptures,
      this.activeCaptures
    )
    FakeCaptureWebcam.maxActiveCaptures = Math.max(
      FakeCaptureWebcam.maxActiveCaptures,
      FakeCaptureWebcam.activeCaptures
    )

    try {
      await new Promise(resolve => setTimeout(resolve, 20))

      if (this.failFirstCapture && call === 1)
        throw new Error('fake capture failed')

      await writeFile(command.args[0], Buffer.from([call]))
    } finally {
      this.activeCaptures -= 1
      FakeCaptureWebcam.activeCaptures -= 1
    }
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

class BufferWebcam extends BaseWebcam {
  protected getBackendType() {
    return 'native' as const
  }

  protected createCaptureExecution(): WebcamCaptureExecution {
    return {
      run: async () => ({
        buffer: Buffer.from([1, 2, 3]),
        kind: 'buffer',
        mimeType: 'image/png'
      })
    }
  }
}

const createWriteImageWebcam = (
  location: string,
  options?: ConstructorParameters<typeof BaseWebcam>[0]
) =>
  new CommandWebcam(options, {
    file: process.execPath,
    args: ['-e', writeFixtureImageScript, location]
  })

describe('BaseWebcam', () => {
  it('returns a defensive copy of options', () => {
    const webcam = new BaseWebcam({ width: 640 })
    const options = webcam.options

    options.width = 320

    assert.equal(webcam.options.width, 640)
  })

  it('rejects paths without an extension before executing commands', async () => {
    const webcam = new BaseWebcam({})

    await assert.rejects(() => webcam.capture({ location: 'photo' }), {
      code: 'INVALID_OUTPUT_PATH',
      message: 'Invalid path, missing type file',
      name: 'WebcamError'
    })
  })

  it('rejects output paths whose file name starts with a dash', async () => {
    const webcam = new BaseWebcam({ output: 'jpg' })

    await assert.rejects(
      () =>
        webcam.capture({
          location: '/tmp/--exec=echo injected.jpg'
        }),
      {
        code: 'INVALID_OUTPUT_PATH',
        message:
          'Invalid output path, file name must not start with "-": --exec=echo injected.jpg',
        name: 'WebcamError'
      }
    )
  })

  it('rejects unsupported file extensions before executing commands', async () => {
    const webcam = new BaseWebcam({})

    await assert.rejects(() => webcam.capture({ location: 'photo.gif' }), {
      code: 'INVALID_FILE_EXTENSION',
      message: 'Invalid file extension: gif',
      name: 'WebcamError'
    })
  })

  it('rejects mismatched output and file extension before execution', async () => {
    const webcam = new BaseWebcam({ output: 'jpeg' })

    await assert.rejects(() => webcam.capture({ location: 'photo.png' }), {
      code: 'OUTPUT_MISMATCH',
      message: 'The output (jpeg) and the file type (png) does not match',
      name: 'WebcamError'
    })
  })

  it('wraps missing command binaries with a typed error', async () => {
    const webcam = new CommandWebcam(
      { output: 'png' },
      { file: 'definitely-not-node-webcam-command', args: [] }
    )

    await assert.rejects(() => webcam.capture({ location: 'photo.png' }), {
      code: 'BINARY_NOT_FOUND',
      message:
        'Webcam command binary was not found: definitely-not-node-webcam-command',
      name: 'WebcamError'
    })
  })

  it('wraps failed commands with command details', async () => {
    const webcam = new CommandWebcam(
      { output: 'png' },
      { file: process.execPath, args: ['-e', 'process.exit(7)'] }
    )

    try {
      await webcam.capture({ location: 'photo.png' })
      assert.fail('Expected command failure')
    } catch (error) {
      assert.ok(error instanceof WebcamError)
      assert.equal(error.code, 'COMMAND_FAILED')
      assert.deepEqual(error.details?.file, process.execPath)
      assert.deepEqual(error.details?.args, ['-e', 'process.exit(7)'])
    }
  })

  it('wraps timed out capture commands with a typed error', async () => {
    const webcam = new CommandWebcam(
      { output: 'png', timeout: 10 },
      { file: process.execPath, args: ['-e', waitForeverScript] }
    )

    try {
      await webcam.capture({ location: 'photo.png' })
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
    const webcam = new CommandWebcam(
      {
        output: 'png',
        signal: controller.signal
      },
      { file: process.execPath, args: ['-e', waitForeverScript] }
    )
    const timer = setTimeout(() => controller.abort(), 10)

    try {
      await webcam.capture({ location: 'photo.png' })
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

    await assert.rejects(() => webcam.capture({ location: 'photo.png' }), {
      code: 'INVALID_TIMEOUT',
      message: 'Invalid timeout: -1',
      name: 'WebcamError'
    })
  })

  it('wraps missing capture output with a typed error', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new CommandWebcam(
      { output: 'png' },
      { file: process.execPath, args: ['-e', 'process.exit(0)'] }
    )

    try {
      await assert.rejects(() => webcam.capture({ location: path }), {
        code: 'OUTPUT_READ_FAILED',
        message: `Unable to read captured output: ${path}`,
        name: 'WebcamError'
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('executes capture commands without a shell', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = createWriteImageWebcam(path, { output: 'png' })

    try {
      const result = await webcam.capture({
        location: path
      })

      assert.deepEqual([...result.buffer], [1, 2, 3])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('saves captured shots in memory by default', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = createWriteImageWebcam(path, { output: 'png' })

    try {
      await webcam.capture({ location: path })

      const shot = webcam.getLastShot()

      assert.equal(shot.location, path)
      assert.deepEqual([...shot.data], [1, 2, 3])
      assert.deepEqual([...webcam.getLastShotBuffer()], [1, 2, 3])
      assert.deepEqual([...webcam.getShotBuffer(0)], [1, 2, 3])
      assert.equal(webcam.getLastShotBase64(), 'data:image/png;base64,AQID')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('does not retain captured buffers when saveShots is false', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = createWriteImageWebcam(path, {
      output: 'png',
      saveShots: false
    })

    try {
      await webcam.capture({ location: path })

      assert.throws(() => webcam.getLastShot(), {
        code: 'SHOT_NOT_FOUND',
        message: 'Index out of bonds',
        name: 'WebcamError'
      })
      assert.throws(() => webcam.getLastShotBuffer(), {
        code: 'SHOT_NOT_FOUND',
        message: 'Index out of bonds',
        name: 'WebcamError'
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('serializes concurrent captures that share an output path', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new FakeCaptureWebcam({
      output: 'png',
      saveShots: false
    })

    try {
      await Promise.all([
        webcam.capture({ location: path }),
        webcam.capture({ location: path })
      ])

      assert.equal(webcam.maxActiveCaptures, 1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('serializes same-file captures with relative and absolute paths', async () => {
    const directory = mkdtempSync(join(process.cwd(), '.tmp-node-webcam-'))
    const absolutePath = join(directory, 'photo.png')
    const relativePath = relative(process.cwd(), absolutePath)
    const firstWebcam = new FakeCaptureWebcam({
      device: 'first-device',
      output: 'png',
      saveShots: false
    })
    const secondWebcam = new FakeCaptureWebcam({
      device: 'second-device',
      output: 'png',
      saveShots: false
    })

    FakeCaptureWebcam.resetGlobalCaptures()

    try {
      await Promise.all([
        firstWebcam.capture({ location: relativePath }),
        secondWebcam.capture({ location: absolutePath })
      ])

      assert.equal(FakeCaptureWebcam.maxActiveCaptures, 1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('treats device false as the default device for queues', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const firstPath = join(directory, 'first.png')
    const secondPath = join(directory, 'second.png')
    const webcam = new FakeCaptureWebcam({
      device: false,
      output: 'png',
      saveShots: false
    })

    try {
      await Promise.all([
        webcam.capture({ location: firstPath }),
        webcam.capture({ location: secondPath })
      ])

      assert.equal(webcam.maxActiveCaptures, 1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('serializes concurrent captures that share the default device', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const firstPath = join(directory, 'first.png')
    const secondPath = join(directory, 'second.png')
    const webcam = new FakeCaptureWebcam({
      output: 'png',
      saveShots: false
    })

    try {
      await Promise.all([
        webcam.capture({ location: firstPath }),
        webcam.capture({ location: secondPath })
      ])

      assert.equal(webcam.maxActiveCaptures, 1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('allows concurrent captures with different output paths and devices', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const firstPath = join(directory, 'first.png')
    const secondPath = join(directory, 'second.png')
    const firstWebcam = new FakeCaptureWebcam({
      device: 'first-device',
      output: 'png',
      saveShots: false
    })
    const secondWebcam = new FakeCaptureWebcam({
      device: 'second-device',
      output: 'png',
      saveShots: false
    })

    FakeCaptureWebcam.resetGlobalCaptures()

    try {
      await Promise.all([
        firstWebcam.capture({ location: firstPath }),
        secondWebcam.capture({ location: secondPath })
      ])

      assert.equal(FakeCaptureWebcam.maxActiveCaptures, 2)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('releases output path queues after capture failures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new FakeCaptureWebcam({
      output: 'png',
      saveShots: false
    })
    webcam.failFirstCapture = true

    try {
      const first = webcam.capture({ location: path })
      const second = webcam.capture({ location: path })

      await assert.rejects(() => first, {
        code: 'COMMAND_FAILED',
        name: 'WebcamError'
      })
      assert.deepEqual([...(await second).buffer], [2])
      assert.equal(webcam.maxActiveCaptures, 1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('clears retained shots', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = createWriteImageWebcam(path, { output: 'png' })

    try {
      await webcam.capture({ location: path })

      webcam.clear()

      assert.throws(() => webcam.getLastShot(), {
        code: 'SHOT_NOT_FOUND',
        message: 'Index out of bonds',
        name: 'WebcamError'
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('does not build base64 output unless requested', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new Base64CountingWebcam({ output: 'png' })

    try {
      await webcam.capture({ location: path })

      assert.equal(webcam.base64Calls, 0)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('builds base64 output lazily when requested', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = new Base64CountingWebcam({ output: 'png' })

    try {
      const result = await webcam.capture({
        location: path
      })

      assert.equal(webcam.base64Calls, 0)
      assert.equal(result.toBase64(), 'data:image/png;base64,AQID')
      assert.equal(webcam.base64Calls, 1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('returns structured capture results', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = createWriteImageWebcam(path, { output: 'png' })

    try {
      const result = await webcam.capture({
        location: path
      })

      assert.equal(result.backend, 'CommandWebcam')
      assert.equal(result.backendType, 'legacy')
      assert.equal(result.bytes, 3)
      assert.deepEqual([...result.buffer], [1, 2, 3])
      assert.equal(result.location, path)
      assert.equal(result.mimeType, 'image/png')
      assert.equal(typeof result.elapsedMs, 'number')
      assert.equal(typeof result.queueWaitMs, 'number')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('returns the same public result shape for buffer-producing backends', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'native-photo.png')
    const webcam = new BufferWebcam({ output: 'png' })

    try {
      const result = await webcam.capture({ location: path })

      assert.equal(result.backend, 'BufferWebcam')
      assert.equal(result.backendType, 'native')
      assert.equal(result.bytes, 3)
      assert.deepEqual([...result.buffer], [1, 2, 3])
      assert.deepEqual([...(await readFile(path))], [1, 2, 3])
      assert.equal(result.location, path)
      assert.equal(result.mimeType, 'image/png')
      assert.equal(result.toBase64(), 'data:image/png;base64,AQID')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('stays silent by default during successful captures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = createWriteImageWebcam(path, { output: 'png' })

    try {
      const calls = await captureConsoleOutput(async () => {
        await webcam.capture({ location: path })
      })

      assert.equal(calls.length, 0)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('emits verbose capture diagnostics for successful captures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-'))
    const path = join(directory, 'photo.png')
    const webcam = createWriteImageWebcam(path, {
      output: 'png',
      verbose: true
    })

    try {
      const calls = await captureConsoleOutput(async () => {
        await webcam.capture({ location: path })
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

      assert.equal(startDetails.backend, 'CommandWebcam')
      assert.equal(startDetails.backendType, 'legacy')
      assert.equal(startDetails.file, process.execPath)
      assert.deepEqual(startDetails.args, ['-e', writeFixtureImageScript, path])
      assert.equal(startDetails.path, path)
      assert.match(String(startDetails.operationId), /^capture-\d+$/)
      assert.equal(successDetails.operationId, startDetails.operationId)
      assert.equal(successDetails.bytes, 3)
      assert.equal(typeof successDetails.elapsedMs, 'number')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('emits verbose capture diagnostics for command failures', async () => {
    const webcam = new CommandWebcam(
      { output: 'png', verbose: true },
      { file: 'definitely-not-node-webcam-command', args: [] }
    )

    const calls = await captureConsoleOutput(async () => {
      await assert.rejects(() => webcam.capture({ location: 'photo.png' }), {
        code: 'BINARY_NOT_FOUND'
      })
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
    const webcam = createWriteImageWebcam(path, {
      output: 'png',
      verbose: true
    })
    const entries: WebcamLogEntry[] = []

    setLogger({
      log: entry => {
        entries.push(entry)
      }
    })

    try {
      await webcam.capture({ location: path })
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
    assert.equal(entries[0].details.backend, 'CommandWebcam')
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
  it('copies constructor input data', () => {
    const data = Buffer.from([1, 2, 3])
    const shot = new Shot('photo.jpeg', data)

    data[0] = 9

    assert.deepEqual([...shot.data], [1, 2, 3])
  })

  it('returns defensive copies of captured data', () => {
    const shot = new Shot('photo.jpeg', Buffer.from([1, 2, 3]))
    const data = shot.data

    data[0] = 9

    assert.deepEqual([...shot.data], [1, 2, 3])
  })
})
