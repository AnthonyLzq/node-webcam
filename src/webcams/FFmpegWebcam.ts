import os from 'os'
import { spawnSync } from 'child_process'
import { existsSync } from 'fs'

import { WebcamError } from '../errors'
import type { WebcamConfig } from '../types'
import { getPlatformCameras } from '../utils'
import { BaseWebcam, WebcamCommand } from './BaseWebcam'

type FFmpegPlatform = 'darwin' | 'linux' | 'win32'

const supportedFFmpegPlatforms = ['darwin', 'linux', 'win32']

const isFFmpegPlatform = (platform: string): platform is FFmpegPlatform =>
  supportedFFmpegPlatforms.includes(platform)

class FFmpegWebcam extends BaseWebcam {
  #bin: string
  #platform: FFmpegPlatform

  constructor(options: Partial<WebcamConfig> = {}, platform = os.platform()) {
    super(options)

    if (!isFFmpegPlatform(platform))
      throw new WebcamError({
        code: 'UNSUPPORTED_WEBCAM_TYPE',
        message: 'FFmpeg webcam platform is not supported',
        details: {
          platform,
          supportedPlatforms: supportedFFmpegPlatforms
        }
      })

    this.#bin =
      options.ffmpegPath || process.env.NODE_WEBCAM_FFMPEG_PATH || 'ffmpeg'
    this.#platform = platform
  }

  static isAvailable(
    options: Partial<WebcamConfig> = {},
    platform = os.platform()
  ) {
    if (!isFFmpegPlatform(platform)) return false

    const device = FFmpegWebcam.getDevice(options, platform)

    if (platform === 'win32' && !device) return false

    if (platform === 'linux' && !existsSync(device)) return false

    const bin =
      options.ffmpegPath || process.env.NODE_WEBCAM_FFMPEG_PATH || 'ffmpeg'

    const result = spawnSync(bin, FFmpegWebcam.getAvailabilityProbeArgs(), {
      stdio: 'ignore',
      timeout: options.timeout && options.timeout > 0 ? options.timeout : 0
    })

    return result.status === 0
  }

  static clearAvailabilityCache() {
    // Kept for compatibility with older tests and callers. Availability is no
    // longer cached because devices, permissions, PATH, and env can change.
  }

  static getAvailabilityProbeArgs() {
    return ['-version']
  }

  static getDevice(options: Partial<WebcamConfig>, platform: FFmpegPlatform) {
    if (typeof options.device === 'string' && options.device.trim())
      return options.device.trim()

    if (platform === 'linux') return '/dev/video0'
    if (platform === 'darwin') return 'default'

    return ''
  }

  generateCommand(location: string): WebcamCommand {
    this.validateOutputPath(location)

    const { options } = this
    const args = [
      '-hide_banner',
      '-loglevel',
      options.verbose ? 'warning' : 'error',
      '-video_size',
      `${options.width}x${options.height}`
    ]
    const device = FFmpegWebcam.getDevice(options, this.#platform)

    switch (this.#platform) {
      case 'linux':
        args.push('-f', 'video4linux2', '-i', device)
        break
      case 'darwin':
        args.push('-f', 'avfoundation', '-i', `${device}:none`)
        break
      case 'win32':
        if (!device)
          throw new WebcamError({
            code: 'COMMAND_FAILED',
            message: 'FFmpeg DirectShow capture requires a device name'
          })

        args.push('-f', 'dshow', '-i', `video=${device}`)
        break
    }

    args.push('-frames:v', '1', '-y', location)

    return { file: this.#bin, args }
  }

  listWebcams(): Promise<string[]> {
    const { options } = this

    return getPlatformCameras({
      platform: this.#platform,
      signal: options.signal,
      timeout: options.timeout
    })
  }

  protected getBackendName() {
    switch (this.#platform) {
      case 'linux':
        return 'ffmpeg:v4l2'
      case 'darwin':
        return 'ffmpeg:avfoundation'
      case 'win32':
        return 'ffmpeg:dshow'
    }
  }

  protected getBackendType() {
    return 'ffmpeg' as const
  }
}

export { FFmpegWebcam }
