import { exec } from 'child_process'
import { promisify } from 'util'
import { readFileSync } from 'fs'

import { Shot } from '../Shot'
import { getCameras, setDefaults } from 'utils'

const asyncExec = promisify(exec)

class BaseWebcam {
  #shots: Shot[]
  #options: WebcamConfig

  constructor(options?: Partial<WebcamConfig>) {
    this.#shots = []
    this.#options = setDefaults(options)
  }

  get options(): WebcamConfig {
    return Object.assign({}, this.#options)
  }

  setMaxQuality(): void {
    this.#options.quality = 9
  }

  setMaxDelay(): void {
    this.#options.delay = 1
  }

  setDelayInMilliseconds(): void {
    this.#options.delay = this.#options.delay * 1_000
  }

  clone() {
    return new BaseWebcam(this.#options)
  }

  clear() {
    this.#shots = []
  }

  list(): string[] | void {
    return getCameras()
  }

  hasCamera(camera: string) {
    return this.list()?.includes(camera) ?? false
  }

  getListControlsSh(bin: string) {
    const devSwitch =
      typeof this.#options.device === 'string' && this.#options.device
        ? `--device=${this.#options.device.trim()}`
        : ''

    return `${bin} ${devSwitch} --list-controls`
  }

  createShot(location: string, data: Buffer) {
    return new Shot(location, data)
  }

  async capture(sh: string) {
    try {
      await asyncExec(sh, { maxBuffer: 1024 * 10_000 })
    } catch (error) {
      if (this.#options.verbose) console.error('Error while shotting: ', error)
    }
  }

  getShot(index: number): Shot {
    if (index < 0 || index > this.#shots.length)
      throw new Error('Index out of bonds')

    return this.#shots[index]
  }

  getLastShot(): Shot {
    return this.#shots[this.#shots.length - 1]
  }

  getShotBuffer(index: number): Buffer {
    const shot = this.getShot(index)

    return readFileSync(shot.location)
  }

  getLastShotBuffer(): Buffer {
    const shot = this.getLastShot()

    return readFileSync(shot.location)
  }

  getBase64FromBuffer(shotBuffer: Buffer) {
    return `data:image/${this.#options.output};base64,${shotBuffer.toString(
      'base64'
    )}`
  }

  getBase64(index: number): string {
    const shot = this.getShot(index)

    return this.getBase64FromBuffer(shot.data)
  }

  getLastShotBase64(): string {
    const shot = this.getLastShot()

    return this.getBase64FromBuffer(shot.data)
  }
}

export { BaseWebcam }
