import { execFile } from 'child_process'
import { promisify } from 'util'

import { WebcamError, getCommandErrorCode } from '../errors'
import type { WebcamConfig } from '../types'
import { BaseWebcam, WebcamCommand } from './BaseWebcam'

const asyncExecFile = promisify(execFile)

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
    let result: {
      stdout: string;
      stderr: string;
    }

    try {
      result = await asyncExecFile(this.#bin, ['-l'])
    } catch (error) {
      const code = getCommandErrorCode(error)

      throw new WebcamError({
        code: code === 'BINARY_NOT_FOUND' ? code : 'CAMERA_LIST_FAILED',
        message:
          code === 'BINARY_NOT_FOUND'
            ? `Webcam command binary was not found: ${this.#bin}`
            : 'Unable to list webcams',
        cause: error,
        details: {
          args: ['-l'],
          file: this.#bin
        }
      })
    }

    if (result.stderr) {
      if (this.options.verbose)
        console.error('Error while listing webcams: ', result.stderr)

      throw new WebcamError({
        code: 'CAMERA_LIST_FAILED',
        message: result.stderr,
        details: {
          args: ['-l'],
          file: this.#bin
        }
      })
    }

    const lines = result.stdout.split('\n')

    return lines.reduce<string[]>((acc, line) => {
      if (line === 'Video Devices:' || !line) return acc

      acc.push(line.replace(/.*?\[(.*?)\].*/, '$1'))

      return acc
    }, [])
  }
}

export { ImageSnapWebcam }
