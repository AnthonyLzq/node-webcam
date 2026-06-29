import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

import { FSWebcam, ImageSnapWebcam, WindowsWebcam } from '../src/webcams'

describe('backend command generation', () => {
  it('preserves the default fswebcam command', () => {
    const webcam = new FSWebcam({})
    const command = webcam.generateSh('photo.jpeg')

    assert.equal(
      command,
      'fswebcam -q -r 1280x720 -F 1 -D 0 --no-banner --jpeg -1 photo.jpeg'
    )
    assert.deepEqual(webcam.generateCommand('photo.jpeg'), {
      file: 'fswebcam',
      args: [
        '-q',
        '-r',
        '1280x720',
        '-F',
        '1',
        '-D',
        '0',
        '--no-banner',
        '--jpeg',
        '-1',
        'photo.jpeg'
      ]
    })
  })

  it('preserves fswebcam command options that affect shell arguments', () => {
    const webcam = new FSWebcam({
      title: 'Front Camera',
      subtitle: 'Desk',
      timestamp: '%Y-%m-%d',
      device: '/dev/video2',
      greyScale: true,
      rotation: 180,
      skip: 3,
      output: 'png'
    })
    const command = webcam.generateSh('photo.png')

    assert.equal(
      command,
      'fswebcam -q -r 1280x720 -F 1 -D 0 --title Front Camera ' +
        '--subtitle Desk --timestamp %Y-%m-%d -d /dev/video2 --greyscale ' +
        '--rotate 180 --no-banner --skip 3 --png -1 photo.png'
    )
    assert.deepEqual(webcam.generateCommand('photo.png'), {
      file: 'fswebcam',
      args: [
        '-q',
        '-r',
        '1280x720',
        '-F',
        '1',
        '-D',
        '0',
        '--title',
        'Front Camera',
        '--subtitle',
        'Desk',
        '--timestamp',
        '%Y-%m-%d',
        '-d',
        '/dev/video2',
        '--greyscale',
        '--rotate',
        '180',
        '--no-banner',
        '--skip',
        '3',
        '--png',
        '-1',
        'photo.png'
      ]
    })
  })

  it('preserves the default imagesnap command', () => {
    const webcam = new ImageSnapWebcam({})
    const command = webcam.generateSh('photo.jpeg')

    assert.equal(command, 'imagesnap -q photo.jpeg')
    assert.deepEqual(webcam.generateCommand('photo.jpeg'), {
      file: 'imagesnap',
      args: ['-q', 'photo.jpeg']
    })
  })

  it('preserves imagesnap delay and device arguments', () => {
    const webcam = new ImageSnapWebcam({
      delay: 2,
      device: 'FaceTime HD Camera'
    })
    const command = webcam.generateSh('photo.jpeg')

    assert.equal(
      command,
      'imagesnap -w 2 -d "FaceTime HD Camera" -q photo.jpeg'
    )
    assert.deepEqual(webcam.generateCommand('photo.jpeg'), {
      file: 'imagesnap',
      args: ['-w', '2', '-d', 'FaceTime HD Camera', '-q', 'photo.jpeg']
    })
  })

  it('preserves the default Windows CommandCam command', () => {
    const bin = resolve(
      process.cwd(),
      'src',
      'bindings',
      'CommandCam',
      'CommandCam.exe'
    )

    const webcam = new WindowsWebcam({})
    const command = webcam.generateSh('photo.bmp')

    assert.equal(command, `${bin} /filename photo.bmp`)
    assert.deepEqual(webcam.generateCommand('photo.bmp'), {
      file: bin,
      args: ['/filename', 'photo.bmp']
    })
  })

  it('preserves Windows delay and device arguments', () => {
    const bin = resolve(
      process.cwd(),
      'src',
      'bindings',
      'CommandCam',
      'CommandCam.exe'
    )

    const webcam = new WindowsWebcam({
      delay: 2,
      device: '1'
    })
    const command = webcam.generateSh('photo.bmp')

    assert.equal(command, `${bin} /delay 2000 /devnum 1 /filename photo.bmp`)
    assert.deepEqual(webcam.generateCommand('photo.bmp'), {
      file: bin,
      args: ['/delay', '2000', '/devnum', '1', '/filename', 'photo.bmp']
    })
  })

  it('rejects Windows CommandCam output paths longer than its native buffer', () => {
    const webcam = new WindowsWebcam({})
    const longPath = `${'a'.repeat(96)}.bmp`

    assert.throws(() => webcam.generateCommand(longPath), {
      code: 'INVALID_OUTPUT_PATH',
      message:
        'Invalid Windows output path, CommandCam paths must be 99 bytes or less: 100',
      name: 'WebcamError'
    })
    assert.throws(() => webcam.generateSh(longPath), {
      code: 'INVALID_OUTPUT_PATH',
      name: 'WebcamError'
    })
  })

  it('rejects Windows CommandCam output paths containing double quotes', () => {
    const webcam = new WindowsWebcam({})

    assert.throws(() => webcam.generateCommand('"quoted.bmp'), {
      code: 'INVALID_OUTPUT_PATH',
      message:
        'Invalid Windows output path, CommandCam paths must not contain double quotes',
      name: 'WebcamError'
    })
    assert.throws(() => webcam.generateSh('quoted".bmp'), {
      code: 'INVALID_OUTPUT_PATH',
      name: 'WebcamError'
    })
  })

  it('keeps shell metacharacters inside fswebcam argument values', () => {
    const webcam = new FSWebcam({
      title: 'hello; rm -rf /',
      device: '/dev/video 2'
    })

    assert.deepEqual(webcam.generateCommand('photo name.jpeg').args, [
      '-q',
      '-r',
      '1280x720',
      '-F',
      '1',
      '-D',
      '0',
      '--title',
      'hello; rm -rf /',
      '-d',
      '/dev/video 2',
      '--no-banner',
      '--jpeg',
      '-1',
      'photo name.jpeg'
    ])
  })

  it('rejects fswebcam output locations that look like options', () => {
    const webcam = new FSWebcam({ output: 'jpg' })

    assert.throws(
      () => webcam.generateCommand('--exec=sh -c "echo injected" #.jpg'),
      {
        code: 'INVALID_OUTPUT_PATH',
        message:
          'Invalid output path, path must not start with "-": --exec=sh -c "echo injected" #.jpg',
        name: 'WebcamError'
      }
    )
    assert.throws(
      () => webcam.generateSh('--exec=sh -c "echo injected" #.jpg'),
      {
        code: 'INVALID_OUTPUT_PATH',
        name: 'WebcamError'
      }
    )
    assert.throws(
      () => webcam.generateCommand('--exec=sh -c "echo injected" #/photo.jpg'),
      {
        code: 'INVALID_OUTPUT_PATH',
        message:
          'Invalid output path, path must not start with "-": --exec=sh -c "echo injected" #/photo.jpg',
        name: 'WebcamError'
      }
    )
  })
})
