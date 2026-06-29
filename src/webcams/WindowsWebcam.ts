import { resolve } from 'path'

import type { WebcamConfig } from '../types'
import { getPlatformCameras } from '../utils'
import { BaseWebcam, WebcamCommand } from './BaseWebcam'

class WindowsWebcam extends BaseWebcam {
  #bin: string

  constructor(options?: Partial<WebcamConfig>) {
    super({ ...options, output: 'bmp' })
    this.#bin = resolve(
      __dirname,
      '..',
      'bindings',
      'CommandCam',
      'CommandCam.exe'
    )

    if (options?.delay) super.setDelayInMilliseconds()
  }

  /**
   * @deprecated Use `generateCommand()` for safe argument-based execution.
   */
  generateSh(location: string): string {
    this.validateOutputPath(location)

    const { options } = this
    const device = options.device ? `/devnum ${options.device}` : ''
    const delay = options.delay ? `/delay ${options.delay}` : ''

    return `${this.#bin} ${delay} ${device} /filename ${location}`.replace(
      / +/g,
      ' '
    )
  }

  generateCommand(location: string): WebcamCommand {
    this.validateOutputPath(location)

    const { options } = this
    const args = []

    if (options.delay) args.push('/delay', String(options.delay))
    if (options.device) args.push('/devnum', options.device)

    args.push('/filename', location)

    return { file: this.#bin, args }
  }

  async listWebcams(): Promise<string[]> {
    return getPlatformCameras({
      platform: 'win32',
      windowsCommandCamPath: this.#bin
    })
  }
}

export { WindowsWebcam }
