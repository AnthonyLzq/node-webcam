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

describe('create', () => {
  afterEach(() => {
    mock.restoreAll()
  })

  it('creates the linux backend on linux', () => {
    mock.method(os, 'platform', () => 'linux')

    const webcam = create()

    assert.ok(webcam instanceof FSWebcam)
  })

  it('creates the macOS backend on darwin', () => {
    mock.method(os, 'platform', () => 'darwin')

    const webcam = create()

    assert.ok(webcam instanceof ImageSnapWebcam)
  })

  it('creates the Windows backend on win32', () => {
    mock.method(os, 'platform', () => 'win32')

    const webcam = create()

    assert.ok(webcam instanceof WindowsWebcam)
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
