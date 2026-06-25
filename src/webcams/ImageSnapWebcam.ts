import type { WebcamConfig } from '../types'
import { getPlatformCameras } from '../utils'
import { BaseWebcam, WebcamCommand } from './BaseWebcam'

class ImageSnapWebcam extends BaseWebcam {
  #bin: string

  constructor(options?: Partial<WebcamConfig>) {
    super(options)
    this.#bin = 'imagesnap'

    if (options?.delay && options?.delay < 1) super.setMaxDelay()
  }

  /**
   * @deprecated Use `generateCommand()` for safe argument-based execution.
   */
  generateSh(location: string): string {
    const { options } = this
    const verbose = options.verbose ? '-v' : '-q'
    const delay = options.delay ? `-w ${options.delay}` : ''
    const device = options.device ? `-d "${options.device}"` : ''

    return `${this.#bin} ${delay} ${device} ${verbose} ${location}`.replace(
      / +/g,
      ' '
    )
  }

  generateCommand(location: string): WebcamCommand {
    const { options } = this
    const args = []

    if (options.delay) args.push('-w', String(options.delay))
    if (options.device) args.push('-d', options.device)

    args.push(options.verbose ? '-v' : '-q', location)

    return { file: this.#bin, args }
  }

  async listWebcams(): Promise<string[]> {
    return getPlatformCameras({ platform: 'darwin' })
  }
}

export { ImageSnapWebcam }
