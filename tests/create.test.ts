import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it, mock } from 'node:test'

import {
  capture,
  create,
  FSWebcam,
  ImageSnapWebcam,
  WebcamError,
  WindowsWebcam
} from '../src'
import { FFmpegWebcam } from '../src/webcams/FFmpegWebcam'
import { NativeLinuxWebcam } from '../src/webcams/NativeLinuxWebcam'
import type { NativeWebcamAddon } from '../src/native'

const unavailableNativeAddon: NativeWebcamAddon = {
  captureMjpeg: () => Buffer.from([1, 2, 3]),
  captureMjpegAsync: async () => Buffer.from([1, 2, 3]),
  isAvailable: () => false
}

const availableNativeAddon: NativeWebcamAddon = {
  captureMjpeg: () => Buffer.from([1, 2, 3]),
  captureMjpegAsync: async () => Buffer.from([1, 2, 3]),
  isAvailable: () => true
}

const createFailingNativeAddon = (code: string, message: string) => ({
  captureMjpeg: () => {
    const error = new Error(message) as Error & { code: string }

    error.code = code

    throw error
  },
  captureMjpegAsync: async () => {
    const error = new Error(message) as Error & { code: string }

    error.code = code

    throw error
  },
  isAvailable: () => true
})

const createCommandCamFixture = () => {
  const directory = mkdtempSync(join(os.tmpdir(), 'node-webcam-commandcam-'))
  const commandCamPath = join(directory, 'CommandCam.exe')

  writeFileSync(commandCamPath, '')

  return {
    commandCamPath,
    cleanup: () => rmSync(directory, { force: true, recursive: true })
  }
}

describe('create', () => {
  afterEach(() => {
    mock.restoreAll()
    delete process.env.NODE_WEBCAM_COMMANDCAM_PATH
  })

  it('creates the linux backend on linux', () => {
    mock.method(os, 'platform', () => 'linux')
    mock.method(FFmpegWebcam, 'isAvailable', () => false)

    const webcam = create({ output: 'png' })

    assert.ok(webcam instanceof FSWebcam)
  })

  it('uses ffmpeg on Linux before falling back to fswebcam', () => {
    mock.method(os, 'platform', () => 'linux')
    mock.method(NativeLinuxWebcam, 'isAvailable', () => false)
    mock.method(FFmpegWebcam, 'isAvailable', () => true)

    const webcam = create({ output: 'png' })

    assert.ok(webcam instanceof FFmpegWebcam)
  })

  it('keeps fswebcam on Linux when legacy-only options are requested', () => {
    mock.method(os, 'platform', () => 'linux')
    mock.method(NativeLinuxWebcam, 'isAvailable', () => true)
    mock.method(FFmpegWebcam, 'isAvailable', () => true)

    const webcam = create({
      output: 'jpeg',
      title: 'Desk'
    })

    assert.ok(webcam instanceof FSWebcam)
  })

  it('uses ffmpeg on Linux when an ffmpeg path is explicitly configured', () => {
    mock.method(os, 'platform', () => 'linux')
    mock.method(NativeLinuxWebcam, 'isAvailable', () => true)
    mock.method(FFmpegWebcam, 'isAvailable', () => true)

    const webcam = create({
      ffmpegPath: '/usr/bin/ffmpeg',
      output: 'jpeg'
    })

    assert.ok(webcam instanceof FFmpegWebcam)
  })

  it('reports the native Linux backend as available when its addon is available', () => {
    const available = NativeLinuxWebcam.isAvailable({
      nativeAddon: availableNativeAddon
    })

    assert.equal(available, true)
  })

  it('reports the native Linux backend as unavailable when its addon is unavailable', () => {
    const available = NativeLinuxWebcam.isAvailable({
      nativeAddon: unavailableNativeAddon
    })

    assert.equal(available, false)
  })

  it('does not use the native Linux backend for unsupported output formats', () => {
    const available = NativeLinuxWebcam.isAvailable({
      nativeAddon: availableNativeAddon,
      output: 'png'
    })

    assert.equal(available, false)
  })

  it('maps native Linux addon errors to WebcamError codes', async () => {
    const cases = [
      ['NODE_WEBCAM_NATIVE_DEVICE_NOT_FOUND', 'NATIVE_DEVICE_NOT_FOUND'],
      ['NODE_WEBCAM_NATIVE_PERMISSION_DENIED', 'NATIVE_PERMISSION_DENIED'],
      ['NODE_WEBCAM_NATIVE_DEVICE_BUSY', 'NATIVE_DEVICE_BUSY'],
      ['NODE_WEBCAM_NATIVE_DEVICE_UNSUPPORTED', 'NATIVE_DEVICE_UNSUPPORTED'],
      ['NODE_WEBCAM_NATIVE_FORMAT_UNSUPPORTED', 'NATIVE_FORMAT_UNSUPPORTED'],
      ['NODE_WEBCAM_NATIVE_FRAME_TIMEOUT', 'NATIVE_FRAME_TIMEOUT'],
      ['NODE_WEBCAM_NATIVE_FRAME_EMPTY', 'NATIVE_FRAME_EMPTY'],
      ['NODE_WEBCAM_NATIVE_CAPTURE_FAILED', 'NATIVE_CAPTURE_FAILED']
    ] as const

    for (const [nativeCode, code] of cases) {
      const webcam = new NativeLinuxWebcam({
        nativeAddon: createFailingNativeAddon(nativeCode, nativeCode)
      })

      await assert.rejects(() => webcam.capture({ location: 'photo.jpeg' }), {
        code,
        name: 'WebcamError'
      })
    }
  })

  it('captures through the native addon async API', async () => {
    const webcam = new NativeLinuxWebcam({
      nativeAddon: {
        captureMjpeg: () => {
          throw new Error('sync capture should not be used')
        },
        captureMjpegAsync: async () => Buffer.from([1, 2, 3]),
        isAvailable: () => true
      },
      save: false
    })

    const result = await webcam.capture({ location: 'photo.jpeg' })

    assert.equal(result.backend, 'native:v4l2')
    assert.equal(result.backendType, 'native')
    assert.deepEqual([...result.buffer], [1, 2, 3])
  })

  it('creates the macOS backend on darwin', () => {
    mock.method(os, 'platform', () => 'darwin')
    mock.method(FFmpegWebcam, 'isAvailable', () => false)

    const webcam = create()

    assert.ok(webcam instanceof ImageSnapWebcam)
  })

  it('uses ffmpeg on macOS before falling back to imagesnap', () => {
    mock.method(os, 'platform', () => 'darwin')
    mock.method(FFmpegWebcam, 'isAvailable', () => true)

    const webcam = create()

    assert.ok(webcam instanceof FFmpegWebcam)
  })

  it('keeps imagesnap on macOS when legacy-only options are requested', () => {
    mock.method(os, 'platform', () => 'darwin')
    mock.method(FFmpegWebcam, 'isAvailable', () => true)

    const webcam = create({ delay: 1 })

    assert.ok(webcam instanceof ImageSnapWebcam)
  })

  it('creates the Windows backend on win32', () => {
    mock.method(os, 'platform', () => 'win32')
    mock.method(FFmpegWebcam, 'isAvailable', () => false)
    const { cleanup, commandCamPath } = createCommandCamFixture()
    process.env.NODE_WEBCAM_COMMANDCAM_PATH = commandCamPath

    try {
      const webcam = create()

      assert.ok(webcam instanceof WindowsWebcam)
    } finally {
      cleanup()
    }
  })

  it('uses a backend-compatible default capture location on Windows', async () => {
    mock.method(os, 'platform', () => 'win32')
    mock.method(FFmpegWebcam, 'isAvailable', () => false)
    const { cleanup, commandCamPath } = createCommandCamFixture()
    process.env.NODE_WEBCAM_COMMANDCAM_PATH = commandCamPath

    try {
      const captured: string[] = []

      mock.method(
        WindowsWebcam.prototype,
        'capture',
        async ({ location }: { location: string }) => {
          captured.push(location)

          return {
            backend: 'WindowsWebcam',
            backendType: 'legacy',
            buffer: Buffer.from([]),
            bytes: 0,
            elapsedMs: 0,
            location,
            mimeType: 'image/bmp',
            queueWaitMs: 0,
            toBase64: () => ''
          }
        }
      )

      await capture()

      assert.deepEqual(captured, ['location.bmp'])
    } finally {
      cleanup()
    }
  })

  it('uses ffmpeg on Windows before falling back to CommandCam', () => {
    mock.method(os, 'platform', () => 'win32')
    mock.method(FFmpegWebcam, 'isAvailable', () => true)

    const webcam = create({ device: 'Integrated Webcam' })

    assert.ok(webcam instanceof FFmpegWebcam)
  })

  it('keeps CommandCam on Windows when legacy-only options are requested', () => {
    mock.method(os, 'platform', () => 'win32')
    mock.method(FFmpegWebcam, 'isAvailable', () => true)
    const { cleanup, commandCamPath } = createCommandCamFixture()
    process.env.NODE_WEBCAM_COMMANDCAM_PATH = commandCamPath

    try {
      const webcam = create({
        delay: 1,
        device: 'Integrated Webcam'
      })

      assert.ok(webcam instanceof WindowsWebcam)
    } finally {
      cleanup()
    }
  })

  it('rejects unsupported current platforms', () => {
    mock.method(os, 'platform', () => 'freebsd')

    assert.throws(() => create(), {
      code: 'UNSUPPORTED_WEBCAM_TYPE',
      message: 'Webcam type is not supported',
      name: 'WebcamError'
    })

    try {
      create()
      assert.fail('Expected create to throw')
    } catch (error) {
      assert.ok(error instanceof WebcamError)
      assert.deepEqual(error.details?.requestedType, 'freebsd')
    }
  })
})
