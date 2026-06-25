import { execFile } from 'child_process'
import { readFileSync } from 'fs'
import { promisify } from 'util'

import { WebcamError, getCommandErrorCode } from '../errors'
import { Shot, getCameras, setDefaults } from '../utils'
import type { WebcamConfig } from '../types'

const asyncExecFile = promisify(execFile)
const r = /(?<=\.)[^.]*$/
const ALLOWED_FILE_TYPES = ['jpg', 'jpeg', 'png', 'bmp']

export type WebcamCommand = {
  file: string
  args: string[]
}

type CaptureReturnType = 'buffer' | 'base64'

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

  async capture(
    command: WebcamCommand,
    path: string,
    returnType: CaptureReturnType
  ) {
    const match = path.match(r)

    if (!match)
      throw new WebcamError({
        code: 'INVALID_OUTPUT_PATH',
        message: 'Invalid path, missing type file',
        details: { path }
      })

    if (!match[0])
      throw new WebcamError({
        code: 'INVALID_FILE_EXTENSION',
        message: `Invalid type extension: ${match[0]}`,
        details: { extension: match[0], path }
      })

    if (!ALLOWED_FILE_TYPES.includes(match[0]))
      throw new WebcamError({
        code: 'INVALID_FILE_EXTENSION',
        message: `Invalid file extension: ${match[0]}`,
        details: {
          allowedFileTypes: ALLOWED_FILE_TYPES,
          extension: match[0],
          path
        }
      })

    if (this.#options.output !== match[0])
      throw new WebcamError({
        code: 'OUTPUT_MISMATCH',
        message: `The output (${this.#options.output}) and the file type (${
          match[0]
        }) does not match`,
        details: {
          extension: match[0],
          output: this.#options.output,
          path
        }
      })

    if (!['buffer', 'base64'].includes(returnType))
      throw new WebcamError({
        code: 'INVALID_RETURN_TYPE',
        message: `Invalid returnType: ${returnType}`,
        details: {
          allowedReturnTypes: ['buffer', 'base64'],
          returnType
        }
      })

    try {
      await asyncExecFile(command.file, command.args, {
        maxBuffer: 1024 * 10_000
      })
    } catch (error) {
      const code = getCommandErrorCode(error)
      const typedError = new WebcamError({
        code,
        message:
          code === 'BINARY_NOT_FOUND'
            ? `Webcam command binary was not found: ${command.file}`
            : `Webcam command failed: ${command.file}`,
        cause: error,
        details: {
          args: command.args,
          file: command.file,
          path,
          returnType
        }
      })

      if (this.#options.verbose) console.error('Error while capturing: ', error)

      throw typedError
    }

    let buffer: Buffer

    try {
      buffer = readFileSync(path)
    } catch (error) {
      const typedError = new WebcamError({
        code: 'OUTPUT_READ_FAILED',
        message: `Unable to read captured output: ${path}`,
        cause: error,
        details: {
          path,
          returnType
        }
      })

      if (this.#options.verbose) console.error('Error while capturing: ', error)

      throw typedError
    }

    if (returnType === 'buffer') return buffer

    return this.getBase64FromBuffer(buffer)
  }

  getShot(index: number): Shot {
    if (index < 0 || index >= this.#shots.length)
      throw new WebcamError({
        code: 'SHOT_NOT_FOUND',
        message: 'Index out of bonds',
        details: { index, shots: this.#shots.length }
      })

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
