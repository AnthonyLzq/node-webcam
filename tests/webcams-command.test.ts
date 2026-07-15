import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { describe, it } from 'node:test'

import { WebcamCommand } from '../src/webcams/BaseWebcam'
import {
  FFmpegWebcam,
  FSWebcam,
  ImageSnapWebcam,
  WindowsWebcam
} from '../src/webcams'

const isWindows = process.platform === 'win32'
const posixIt = isWindows ? it.skip : it

class CapturingWindowsWebcam extends WindowsWebcam {
  executionPaths: string[] = []

  protected async executeCommand(command: WebcamCommand) {
    const outputPath = command.args.at(-1)

    if (!outputPath) throw new Error('Missing CommandCam output path')

    this.executionPaths.push(outputPath)
    await writeFile(outputPath, Buffer.from([1, 2, 3]))
  }
}

const withCommandCamPath = (fn: (commandCamPath: string) => void) => {
  const directory = mkdtempSync(join(tmpdir(), 'node-webcam-commandcam-'))
  const commandCamPath = join(directory, 'CommandCam.exe')
  const originalCommandCamPath = process.env.NODE_WEBCAM_COMMANDCAM_PATH

  writeFileSync(commandCamPath, '')
  process.env.NODE_WEBCAM_COMMANDCAM_PATH = commandCamPath

  try {
    fn(commandCamPath)
  } finally {
    if (originalCommandCamPath === undefined)
      delete process.env.NODE_WEBCAM_COMMANDCAM_PATH
    else process.env.NODE_WEBCAM_COMMANDCAM_PATH = originalCommandCamPath

    rmSync(directory, { force: true, recursive: true })
  }
}

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
    withCommandCamPath(commandCamPath => {
      const webcam = new WindowsWebcam({})
      const command = webcam.generateSh('photo.bmp')

      assert.equal(command, `${commandCamPath} /filename photo.bmp`)
      assert.deepEqual(webcam.generateCommand('photo.bmp'), {
        file: commandCamPath,
        args: ['/filename', 'photo.bmp']
      })
    })
  })

  it('preserves Windows delay and device arguments', () => {
    withCommandCamPath(commandCamPath => {
      const webcam = new WindowsWebcam({
        delay: 2,
        device: '1'
      })
      const command = webcam.generateSh('photo.bmp')

      assert.equal(
        command,
        `${commandCamPath} /delay 2000 /devnum 1 /filename photo.bmp`
      )
      assert.deepEqual(webcam.generateCommand('photo.bmp'), {
        file: commandCamPath,
        args: ['/delay', '2000', '/devnum', '1', '/filename', 'photo.bmp']
      })
    })
  })

  it('uses CommandCam device names for non-numeric Windows devices', () => {
    withCommandCamPath(commandCamPath => {
      const webcam = new WindowsWebcam({
        device: 'Integrated Webcam'
      })
      const command = webcam.generateSh('photo.bmp')

      assert.equal(
        command,
        `${commandCamPath} /devname "Integrated Webcam" /filename photo.bmp`
      )
      assert.deepEqual(webcam.generateCommand('photo.bmp'), {
        file: commandCamPath,
        args: ['/devname', 'Integrated Webcam', '/filename', 'photo.bmp']
      })
    })
  })

  it('treats zero as a CommandCam device name, not a device number', () => {
    withCommandCamPath(commandCamPath => {
      const webcam = new WindowsWebcam({
        device: '0'
      })

      assert.deepEqual(webcam.generateCommand('photo.bmp'), {
        file: commandCamPath,
        args: ['/devname', '0', '/filename', 'photo.bmp']
      })
    })
  })

  it('rejects non-bmp CommandCam output paths with a backend-specific error', () => {
    withCommandCamPath(() => {
      const webcam = new WindowsWebcam({})

      assert.throws(() => webcam.generateCommand('photo.jpg'), {
        code: 'UNSUPPORTED_OUTPUT_FORMAT',
        message:
          'CommandCam only supports bmp output. Install ffmpeg for jpeg, jpg, or png capture on Windows.',
        name: 'WebcamError'
      })
      assert.throws(() => webcam.generateSh('photo.png'), {
        code: 'UNSUPPORTED_OUTPUT_FORMAT',
        name: 'WebcamError'
      })
    })
  })

  it('uses a short temporary CommandCam path for memory-only captures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-commandcam-'))
    const commandCamPath = join(directory, 'CommandCam.exe')
    const originalCommandCamPath = process.env.NODE_WEBCAM_COMMANDCAM_PATH
    const targetOverheadBytes = Buffer.byteLength(
      join(directory, '.bmp'),
      'utf8'
    )
    const target = join(
      directory,
      `${'a'.repeat(Math.max(1, 87 - targetOverheadBytes))}.bmp`
    )

    writeFileSync(commandCamPath, '')
    process.env.NODE_WEBCAM_COMMANDCAM_PATH = commandCamPath

    try {
      const webcam = new CapturingWindowsWebcam({ save: false })
      const result = await webcam.capture({ location: target })
      const [executionPath] = webcam.executionPaths

      assert.ok(Buffer.byteLength(target, 'utf8') <= 99)
      assert.notEqual(executionPath, target)
      assert.equal(extname(executionPath), '.bmp')
      assert.ok(Buffer.byteLength(executionPath, 'utf8') <= 99)
      assert.equal(existsSync(target), false)
      assert.deepEqual([...result.buffer], [1, 2, 3])
    } finally {
      if (originalCommandCamPath === undefined)
        delete process.env.NODE_WEBCAM_COMMANDCAM_PATH
      else process.env.NODE_WEBCAM_COMMANDCAM_PATH = originalCommandCamPath

      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('does not apply the CommandCam path limit to memory-only logical paths', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-commandcam-'))
    const commandCamPath = join(directory, 'CommandCam.exe')
    const originalCommandCamPath = process.env.NODE_WEBCAM_COMMANDCAM_PATH
    const targetOverheadBytes = Buffer.byteLength(
      join(directory, '.bmp'),
      'utf8'
    )
    const target = join(
      directory,
      `${'a'.repeat(Math.max(1, 105 - targetOverheadBytes))}.bmp`
    )

    writeFileSync(commandCamPath, '')
    process.env.NODE_WEBCAM_COMMANDCAM_PATH = commandCamPath

    try {
      const webcam = new CapturingWindowsWebcam({ save: false })
      const result = await webcam.capture({ location: target })
      const [executionPath] = webcam.executionPaths

      assert.ok(Buffer.byteLength(target, 'utf8') > 99)
      assert.ok(Buffer.byteLength(executionPath, 'utf8') <= 99)
      assert.equal(existsSync(target), false)
      assert.equal(result.location, target)
      assert.deepEqual([...result.buffer], [1, 2, 3])
    } finally {
      if (originalCommandCamPath === undefined)
        delete process.env.NODE_WEBCAM_COMMANDCAM_PATH
      else process.env.NODE_WEBCAM_COMMANDCAM_PATH = originalCommandCamPath

      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('persists long CommandCam logical paths through short temporary captures', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-commandcam-'))
    const commandCamPath = join(directory, 'CommandCam.exe')
    const originalCommandCamPath = process.env.NODE_WEBCAM_COMMANDCAM_PATH
    const targetOverheadBytes = Buffer.byteLength(
      join(directory, '.bmp'),
      'utf8'
    )
    const target = join(
      directory,
      `${'a'.repeat(Math.max(1, 105 - targetOverheadBytes))}.bmp`
    )

    writeFileSync(commandCamPath, '')
    process.env.NODE_WEBCAM_COMMANDCAM_PATH = commandCamPath

    try {
      const webcam = new CapturingWindowsWebcam({ save: true })
      const result = await webcam.capture({ location: target })
      const [executionPath] = webcam.executionPaths

      assert.ok(Buffer.byteLength(target, 'utf8') > 99)
      assert.ok(Buffer.byteLength(executionPath, 'utf8') <= 99)
      assert.notEqual(executionPath, target)
      assert.deepEqual([...readFileSync(target)], [1, 2, 3])
      assert.deepEqual([...result.buffer], [1, 2, 3])
    } finally {
      if (originalCommandCamPath === undefined)
        delete process.env.NODE_WEBCAM_COMMANDCAM_PATH
      else process.env.NODE_WEBCAM_COMMANDCAM_PATH = originalCommandCamPath

      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('builds the Linux ffmpeg command', () => {
    const webcam = new FFmpegWebcam(
      {
        device: '/dev/video2',
        ffmpegPath: '/usr/bin/ffmpeg',
        output: 'jpg'
      },
      'linux'
    )

    assert.deepEqual(webcam.generateCommand('photo.jpg'), {
      file: '/usr/bin/ffmpeg',
      args: [
        '-hide_banner',
        '-loglevel',
        'error',
        '-video_size',
        '1280x720',
        '-f',
        'video4linux2',
        '-i',
        '/dev/video2',
        '-frames:v',
        '1',
        '-y',
        'photo.jpg'
      ]
    })
  })

  it('builds the macOS ffmpeg command', () => {
    const webcam = new FFmpegWebcam(
      {
        device: 'FaceTime HD Camera',
        ffmpegPath: '/usr/bin/ffmpeg'
      },
      'darwin'
    )

    assert.deepEqual(webcam.generateCommand('photo.jpeg'), {
      file: '/usr/bin/ffmpeg',
      args: [
        '-hide_banner',
        '-loglevel',
        'error',
        '-video_size',
        '1280x720',
        '-f',
        'avfoundation',
        '-i',
        'FaceTime HD Camera:none',
        '-frames:v',
        '1',
        '-y',
        'photo.jpeg'
      ]
    })
  })

  it('builds the Windows ffmpeg command', () => {
    const webcam = new FFmpegWebcam(
      {
        device: 'Integrated Webcam',
        ffmpegPath: 'C:\\ffmpeg\\ffmpeg.exe'
      },
      'win32'
    )

    assert.deepEqual(webcam.generateCommand('photo.jpeg'), {
      file: 'C:\\ffmpeg\\ffmpeg.exe',
      args: [
        '-hide_banner',
        '-loglevel',
        'error',
        '-video_size',
        '1280x720',
        '-f',
        'dshow',
        '-i',
        'video=Integrated Webcam',
        '-frames:v',
        '1',
        '-y',
        'photo.jpeg'
      ]
    })
  })

  posixIt('probes ffmpeg without opening the Linux camera', () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-ffmpeg-'))
    const ffmpeg = join(directory, 'ffmpeg')
    const device = join(directory, 'video0')
    const argsPath = join(directory, 'args.json')
    const originalArgsPath = process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH

    writeFileSync(device, '')
    writeFileSync(
      ffmpeg,
      [
        '#!/usr/bin/env node',
        "require('node:fs').writeFileSync(process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH, JSON.stringify(process.argv.slice(2)))"
      ].join('\n')
    )
    chmodSync(ffmpeg, 0o755)
    process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH = argsPath
    FFmpegWebcam.clearAvailabilityCache()

    try {
      assert.equal(
        FFmpegWebcam.isAvailable(
          {
            device,
            ffmpegPath: ffmpeg,
            height: 480,
            linuxCaptureDeviceProbe: () => true,
            width: 640
          },
          'linux'
        ),
        true
      )
      assert.deepEqual(JSON.parse(readFileSync(argsPath, 'utf8')), ['-version'])
    } finally {
      if (originalArgsPath === undefined)
        delete process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH
      else process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH = originalArgsPath

      FFmpegWebcam.clearAvailabilityCache()
      rmSync(directory, { force: true, recursive: true })
    }
  })

  posixIt('does not select ffmpeg when the binary probe fails', () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-ffmpeg-'))
    const ffmpeg = join(directory, 'ffmpeg')
    const device = join(directory, 'video0')

    writeFileSync(device, '')
    writeFileSync(ffmpeg, '#!/usr/bin/env node\nprocess.exit(1)')
    chmodSync(ffmpeg, 0o755)
    FFmpegWebcam.clearAvailabilityCache()

    try {
      assert.equal(
        FFmpegWebcam.isAvailable(
          { device, ffmpegPath: ffmpeg, linuxCaptureDeviceProbe: () => true },
          'linux'
        ),
        false
      )
    } finally {
      FFmpegWebcam.clearAvailabilityCache()
      rmSync(directory, { force: true, recursive: true })
    }
  })

  posixIt('does not run ffmpeg when the Linux device is not capturable', () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-ffmpeg-'))
    const ffmpeg = join(directory, 'ffmpeg')
    const device = join(directory, 'video0')
    const argsPath = join(directory, 'args.json')
    const originalArgsPath = process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH

    writeFileSync(device, '')
    writeFileSync(
      ffmpeg,
      [
        '#!/usr/bin/env node',
        "require('node:fs').writeFileSync(process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH, JSON.stringify(process.argv.slice(2)))"
      ].join('\n')
    )
    chmodSync(ffmpeg, 0o755)
    process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH = argsPath

    try {
      assert.equal(
        FFmpegWebcam.isAvailable(
          {
            device,
            ffmpegPath: ffmpeg,
            linuxCaptureDeviceProbe: () => false
          },
          'linux'
        ),
        false
      )
      assert.equal(existsSync(argsPath), false)
    } finally {
      if (originalArgsPath === undefined)
        delete process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH
      else process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH = originalArgsPath

      rmSync(directory, { force: true, recursive: true })
    }
  })

  posixIt(
    'bounds ffmpeg binary probes even when capture timeout is disabled',
    () => {
      const directory = mkdtempSync(join(tmpdir(), 'node-webcam-ffmpeg-'))
      const ffmpeg = join(directory, 'ffmpeg')
      const device = join(directory, 'video0')

      writeFileSync(device, '')
      writeFileSync(
        ffmpeg,
        ['#!/usr/bin/env node', 'setTimeout(() => {}, 1000)'].join('\n')
      )
      chmodSync(ffmpeg, 0o755)

      try {
        assert.equal(
          FFmpegWebcam.isAvailable(
            {
              device,
              ffmpegPath: ffmpeg,
              ffmpegProbeTimeout: 10,
              linuxCaptureDeviceProbe: () => true,
              timeout: 0
            },
            'linux'
          ),
          false
        )
      } finally {
        rmSync(directory, { force: true, recursive: true })
      }
    }
  )

  it('rejects fractional ffmpeg availability timeouts before spawning', () => {
    assert.throws(
      () =>
        FFmpegWebcam.isAvailable(
          {
            ffmpegPath: 'ffmpeg',
            timeout: 0.5
          },
          'darwin'
        ),
      {
        code: 'INVALID_CONFIG_OPTION',
        message:
          'Invalid webcam option "timeout": expected an integer, received 0.5',
        name: 'WebcamError'
      }
    )
  })

  it('rejects oversized ffmpeg availability timeouts before spawning', () => {
    assert.throws(
      () =>
        FFmpegWebcam.isAvailable(
          {
            ffmpegPath: 'ffmpeg',
            timeout: Number.MAX_SAFE_INTEGER
          },
          'darwin'
        ),
      {
        code: 'INVALID_CONFIG_OPTION',
        message:
          'Invalid webcam option "timeout": expected a number less than or equal to 2147483647, received 9007199254740991',
        name: 'WebcamError'
      }
    )
  })

  posixIt('does not run ffmpeg when the Linux device does not exist', () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-ffmpeg-'))
    const ffmpeg = join(directory, 'ffmpeg')
    const argsPath = join(directory, 'args.json')
    const originalArgsPath = process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH

    writeFileSync(
      ffmpeg,
      [
        '#!/usr/bin/env node',
        "require('node:fs').writeFileSync(process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH, JSON.stringify(process.argv.slice(2)))"
      ].join('\n')
    )
    chmodSync(ffmpeg, 0o755)
    process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH = argsPath
    FFmpegWebcam.clearAvailabilityCache()

    try {
      assert.equal(
        FFmpegWebcam.isAvailable(
          {
            device: join(directory, 'missing-video0'),
            ffmpegPath: ffmpeg
          },
          'linux'
        ),
        false
      )
      assert.equal(existsSync(argsPath), false)
    } finally {
      if (originalArgsPath === undefined)
        delete process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH
      else process.env.NODE_WEBCAM_FFMPEG_ARGS_PATH = originalArgsPath

      FFmpegWebcam.clearAvailabilityCache()
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('rejects Windows CommandCam output paths longer than its native buffer', () => {
    withCommandCamPath(() => {
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
  })

  it('rejects Windows CommandCam output paths containing double quotes', () => {
    withCommandCamPath(() => {
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
