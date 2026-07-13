import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os, { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, mock } from 'node:test'

import { list, listWebcams } from '../src'
import {
  getCameras,
  getImageSnapListCommand,
  getLinuxCameras,
  getPlatformCameras,
  getWindowsListCommand,
  parseImageSnapCameras,
  parseWindowsCameras
} from '../src/utils'
import { BaseWebcam } from '../src/webcams/BaseWebcam'

const waitForeverScript = 'setTimeout(() => {}, 1000)'

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

  it('filters Linux camera listing to capture-capable video devices', () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-linux-dev-'))
    const video0 = join(directory, 'video0')
    const video1 = join(directory, 'video1')
    const video10 = join(directory, 'video10')
    const probedDevices: string[] = []

    writeFileSync(video1, '')
    writeFileSync(join(directory, 'audio0'), '')
    writeFileSync(video10, '')
    writeFileSync(video0, '')
    writeFileSync(join(directory, 'video-metadata'), '')

    try {
      const cameras = getLinuxCameras({
        deviceDirectory: directory,
        isCaptureDevice: device => {
          probedDevices.push(device)

          return device !== video1
        }
      })

      assert.deepEqual(cameras, [video0, video10])
      assert.deepEqual(probedDevices, [video0, video1, video10])
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('uses the native V4L2 capture probe for Linux camera listing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-linux-dev-'))
    const video0 = join(directory, 'video0')
    const video1 = join(directory, 'video1')

    writeFileSync(video0, '')
    writeFileSync(video1, '')

    try {
      const cameras = getLinuxCameras({
        deviceDirectory: directory,
        nativeAddon: {
          isCaptureDevice: ({ device }) => device === video0
        }
      })

      assert.deepEqual(cameras, [video0])
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
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

  it('parses successful Windows CommandCam list output from stderr', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-commandcam-'))
    const commandCam = join(directory, 'CommandCam')

    writeFileSync(
      commandCam,
      [
        '#!/usr/bin/env node',
        "process.stderr.write('Available capture devices:\\nIntegrated Webcam\\nUSB Camera\\n')"
      ].join('\n')
    )
    chmodSync(commandCam, 0o755)

    try {
      const cameras = await getPlatformCameras({
        platform: 'win32',
        windowsCommandCamPath: commandCam
      })

      assert.deepEqual(cameras, ['Integrated Webcam', 'USB Camera'])
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('uses the configured CommandCam path for Windows platform listing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-commandcam-'))
    const commandCam = join(directory, 'CommandCam')
    const originalCommandCamPath = process.env.NODE_WEBCAM_COMMANDCAM_PATH

    writeFileSync(
      commandCam,
      [
        '#!/usr/bin/env node',
        "process.stderr.write('Available capture devices:\\nIntegrated Webcam\\n')"
      ].join('\n')
    )
    chmodSync(commandCam, 0o755)
    process.env.NODE_WEBCAM_COMMANDCAM_PATH = commandCam

    try {
      const cameras = await getPlatformCameras({ platform: 'win32' })

      assert.deepEqual(cameras, ['Integrated Webcam'])
    } finally {
      if (originalCommandCamPath === undefined)
        delete process.env.NODE_WEBCAM_COMMANDCAM_PATH
      else process.env.NODE_WEBCAM_COMMANDCAM_PATH = originalCommandCamPath

      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('wraps timed out camera listing commands', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-imagesnap-'))
    const imagesnap = join(directory, 'imagesnap')
    const originalPath = process.env.PATH

    writeFileSync(
      imagesnap,
      ['#!/usr/bin/env node', waitForeverScript].join('\n')
    )
    chmodSync(imagesnap, 0o755)
    process.env.PATH = `${directory}:${originalPath}`

    try {
      await assert.rejects(
        () => getPlatformCameras({ platform: 'darwin', timeout: 10 }),
        {
          code: 'COMMAND_TIMEOUT',
          message: 'Webcam command timed out after 10ms: imagesnap',
          name: 'WebcamError'
        }
      )
    } finally {
      process.env.PATH = originalPath
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('wraps aborted camera listing commands', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-commandcam-'))
    const commandCam = join(directory, 'CommandCam')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10)

    writeFileSync(
      commandCam,
      ['#!/usr/bin/env node', waitForeverScript].join('\n')
    )
    chmodSync(commandCam, 0o755)

    try {
      await assert.rejects(
        () =>
          getPlatformCameras({
            platform: 'win32',
            signal: controller.signal,
            windowsCommandCamPath: commandCam
          }),
        {
          code: 'COMMAND_ABORTED',
          message: `Webcam command was aborted: ${commandCam}`,
          name: 'WebcamError'
        }
      )
    } finally {
      clearTimeout(timer)
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('passes instance timeout options to camera listing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'node-webcam-imagesnap-'))
    const imagesnap = join(directory, 'imagesnap')
    const originalPath = process.env.PATH
    const webcam = new BaseWebcam({ timeout: 10 })

    writeFileSync(
      imagesnap,
      ['#!/usr/bin/env node', waitForeverScript].join('\n')
    )
    chmodSync(imagesnap, 0o755)
    process.env.PATH = `${directory}:${originalPath}`
    mock.method(os, 'platform', () => 'darwin')

    try {
      await assert.rejects(() => webcam.listWebcams(), {
        code: 'COMMAND_TIMEOUT',
        name: 'WebcamError'
      })
    } finally {
      mock.restoreAll()
      process.env.PATH = originalPath
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('exposes top-level list as a deprecated async listing API', async () => {
    const cameras = await list()

    assert.ok(Array.isArray(cameras))
  })

  it('exposes top-level listWebcams as the async listing API', async () => {
    const cameras = await listWebcams()

    assert.ok(Array.isArray(cameras))
  })
})
