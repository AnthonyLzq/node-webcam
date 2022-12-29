import { exec } from 'child_process'
import { promisify } from 'util'
import { resolve } from 'path'

import { BaseWebcam } from './BaseWebcam'

const asyncExec = promisify(exec)

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

  generateSh(location: string): string {
    const { options } = this
    const device = options.device ? `/devnum ${options.device}` : ''
    const delay = options.delay ? `/delay ${options.delay}` : ''

    return `${this.#bin} ${delay} ${device} /filename ${location}`.replace(
      / +/g,
      ' '
    )
  }

  async listWebcams(): Promise<string[]> {
    const sh = `${this.#bin} /devlist`
    const result = await asyncExec(sh)

    if (result.stderr) {
      if (this.options.verbose)
        console.error('Error while listing webcams: ', result.stderr)

      throw new Error(result.stderr)
    }

    const lines = result.stdout.split('\n')

    return lines.reduce<string[]>((acc, line) => {
      const formattedLine = line.replace('\r', '')

      if (
        ['Available capture devices:', 'Available capture devices:'].includes(
          formattedLine
        ) ||
        !formattedLine
      )
        return acc

      acc.push(formattedLine)

      return acc
    }, [])
  }
}

export { WindowsWebcam }
