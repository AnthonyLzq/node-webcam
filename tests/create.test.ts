import assert from 'node:assert/strict'
import os from 'node:os'
import { afterEach, describe, it, mock } from 'node:test'

import {
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
  isAvailable: () => false
}

const availableNativeAddon: NativeWebcamAddon = {
  captureMjpeg: () => Buffer.from([1, 2, 3]),
  isAvailable: () => true
}

const createFailingNativeAddon = (code: string, message: string) => ({
  captureMjpeg: () => {
    const error = new Error(message) as Error & { code: string }

    error.code = code

    throw error
  },
  isAvailable: () => true
})

describe('create', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('creates the linux backend on linux', () => {
    mock.method(os, 'platform', () => 'linux')
    mock.method(FFmpegWebcam, 'isAvailable', () => false)

    const webcam = create({ output: 'png' })

    assert.ok(webcam instanceof FSWebcam)
  })

  it('uses ffmpeg on Linux before falling back to fswebcam', () => {
    mock.method(os, 'platform', () => 'linux')
    mock.method(FFmpegWebcam, 'isAvailable', () => true)

    const webcam = create({ output: 'png' })

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

  it('creates the Windows backend on win32', () => {
    mock.method(os, 'platform', () => 'win32')
    mock.method(FFmpegWebcam, 'isAvailable', () => false)

    const webcam = create()

    assert.ok(webcam instanceof WindowsWebcam)
  })

  it('uses ffmpeg on Windows before falling back to CommandCam', () => {
    mock.method(os, 'platform', () => 'win32')
    mock.method(FFmpegWebcam, 'isAvailable', () => true)

    const webcam = create({ device: 'Integrated Webcam' })

    assert.ok(webcam instanceof FFmpegWebcam)
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
