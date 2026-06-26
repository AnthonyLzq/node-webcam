import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { list, listWebcams } from '../src'
import { WebcamError } from '../src/errors'
import {
  getCameras,
  getImageSnapListCommand,
  getPlatformCameras,
  getWindowsListCommand,
  parseImageSnapCameras,
  parseWindowsCameras
} from '../src/utils'
import { BaseWebcam } from '../src/webcams/BaseWebcam'

describe('camera listing', () => {
  it('returns an array from the deprecated async list API', async () => {
    const cameras = await new BaseWebcam({}).list()

    assert.ok(Array.isArray(cameras))
  })

  it('returns an array from the common async listWebcams API', async () => {
    const cameras = await new BaseWebcam({}).listWebcams()

    assert.ok(Array.isArray(cameras))
  })

  it('returns an array from the platform camera helper', async () => {
    const cameras = await getCameras()

    assert.ok(Array.isArray(cameras))
  })

  it('returns Linux cameras from the platform-aware helper', async () => {
    const cameras = await getPlatformCameras({ platform: 'linux' })

    assert.ok(Array.isArray(cameras))
  })

  it('returns an empty array for unsupported platforms', async () => {
    assert.deepEqual(await getPlatformCameras({ platform: 'freebsd' }), [])
  })

  it('builds the macOS imagesnap listing command', () => {
    assert.deepEqual(getImageSnapListCommand(), {
      file: 'imagesnap',
      args: ['-l']
    })
  })

  it('builds the Windows CommandCam listing command', () => {
    assert.deepEqual(getWindowsListCommand('CommandCam.exe'), {
      file: 'CommandCam.exe',
      args: ['/devlist']
    })
  })

  it('parses imagesnap camera output', () => {
    assert.deepEqual(
      parseImageSnapCameras(
        [
          'Video Devices:',
          'FaceTime HD Camera (Built-in) [0x123456]',
          'External Camera [0xabcdef]',
          ''
        ].join('\n')
      ),
      ['0x123456', '0xabcdef']
    )
  })

  it('parses Windows CommandCam device output', () => {
    assert.deepEqual(
      parseWindowsCameras(
        [
          'Available capture devices:\r',
          'Integrated Webcam\r',
          'USB Camera\r',
          ''
        ].join('\n')
      ),
      ['Integrated Webcam', 'USB Camera']
    )
  })

  it('exposes top-level list as a deprecated async listing API', async () => {
    const cameras = await list('linux')

    assert.ok(Array.isArray(cameras))
  })

  it('exposes top-level listWebcams as the async listing API', async () => {
    const cameras = await listWebcams('linux')

    assert.ok(Array.isArray(cameras))
  })

  it('preserves typed errors from top-level list factory validation', async () => {
    await assert.rejects(() => list('unsupported'), {
      code: 'UNSUPPORTED_WEBCAM_TYPE',
      name: 'WebcamError'
    })

    await assert.rejects(() => listWebcams('unsupported'), {
      code: 'UNSUPPORTED_WEBCAM_TYPE',
      name: 'WebcamError'
    })

    await listWebcams('unsupported').catch(error => {
      assert.ok(error instanceof WebcamError)
    })
  })
})
