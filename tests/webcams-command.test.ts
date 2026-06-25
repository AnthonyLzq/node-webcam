import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

import { FSWebcam, ImageSnapWebcam, WindowsWebcam } from '../src/webcams'

describe('backend command generation', () => {
  it('preserves the default fswebcam command', () => {
    const command = new FSWebcam({}).generateSh('photo.jpeg')

    assert.equal(
      command,
      'fswebcam -q -r 1280x720 -F 1 -D 0 --no-banner --jpeg -1 photo.jpeg'
    )
  })

  it('preserves fswebcam command options that affect shell arguments', () => {
    const command = new FSWebcam({
      title: 'Front Camera',
      subtitle: 'Desk',
      timestamp: '%Y-%m-%d',
      device: '/dev/video2',
      greyScale: true,
      rotation: 180,
      skip: 3,
      output: 'png'
    }).generateSh('photo.png')

    assert.equal(
      command,
      'fswebcam -q -r 1280x720 -F 1 -D 0 --title Front Camera ' +
        '--subtitle Desk --timestamp %Y-%m-%d -d /dev/video2 --greyscale ' +
        '--rotate 180 --no-banner --skip 3 --png -1 photo.png'
    )
  })

  it('preserves the default imagesnap command', () => {
    const command = new ImageSnapWebcam({}).generateSh('photo.jpeg')

    assert.equal(command, 'imagesnap -q photo.jpeg')
  })

  it('preserves imagesnap delay and device arguments', () => {
    const command = new ImageSnapWebcam({
      delay: 2,
      device: 'FaceTime HD Camera'
    }).generateSh('photo.jpeg')

    assert.equal(
      command,
      'imagesnap -w 2 -d "FaceTime HD Camera" -q photo.jpeg'
    )
  })

  it('preserves the default Windows CommandCam command', () => {
    const bin = resolve(
      process.cwd(),
      'src',
      'bindings',
      'CommandCam',
      'CommandCam.exe'
    )

    const command = new WindowsWebcam({}).generateSh('photo.bmp')

    assert.equal(command, `${bin} /filename photo.bmp`)
  })

  it('preserves Windows delay and device arguments', () => {
    const bin = resolve(
      process.cwd(),
      'src',
      'bindings',
      'CommandCam',
      'CommandCam.exe'
    )

    const command = new WindowsWebcam({
      delay: 2,
      device: '1'
    }).generateSh('photo.bmp')

    assert.equal(command, `${bin} /delay 2000 /devnum 1 /filename photo.bmp`)
  })
})
