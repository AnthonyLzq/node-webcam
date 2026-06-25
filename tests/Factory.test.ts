import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { WebcamError } from '../src/errors'
import { Factory } from '../src/Factory'
import { FSWebcam, ImageSnapWebcam, WindowsWebcam } from '../src/webcams'

describe('Factory', () => {
  it('creates the linux backend', () => {
    const webcam = new Factory({}).create('linux')

    assert.ok(webcam instanceof FSWebcam)
  })

  it('creates the fswebcam backend alias', () => {
    const webcam = new Factory({}).create('fswebcam')

    assert.ok(webcam instanceof FSWebcam)
  })

  it('creates the macOS backend', () => {
    const webcam = new Factory({}).create('darwin')

    assert.ok(webcam instanceof ImageSnapWebcam)
  })

  it('creates the Windows backend aliases', () => {
    const factory = new Factory({})

    assert.ok(factory.create('win32') instanceof WindowsWebcam)
    assert.ok(factory.create('win64') instanceof WindowsWebcam)
  })

  it('rejects unsupported backend types', () => {
    assert.throws(() => new Factory({}).create('unsupported'), {
      code: 'UNSUPPORTED_WEBCAM_TYPE',
      message: 'Webcam type is not supported',
      name: 'WebcamError'
    })

    try {
      new Factory({}).create('unsupported')
      assert.fail('Expected Factory.create to throw')
    } catch (error) {
      assert.ok(error instanceof WebcamError)
      assert.deepEqual(error.details?.requestedType, 'unsupported')
    }
  })
})
