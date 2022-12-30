import { exec } from 'child_process'
import { promisify } from 'util'

import type { WebcamConfig } from 'types'
import { BaseWebcam } from './BaseWebcam'

const asyncExec = promisify(exec)

class ImageSnapWebcam extends BaseWebcam {
  #bin: string

  constructor(options?: Partial<WebcamConfig>) {
    super(options)
    this.#bin = 'imagesnap'

    if (options?.delay && options?.delay < 1) super.setMaxDelay()
  }

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

  async listWebcams(): Promise<string[]> {
    const sh = `${this.#bin} -l`
    const result = await asyncExec(sh)

    if (result.stderr) {
      if (this.options.verbose)
        console.error('Error while listing webcams: ', result.stderr)

      throw new Error(result.stderr)
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
