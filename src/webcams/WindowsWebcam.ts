import { tmpdir } from 'os'
import { extname, join } from 'path'

import { WebcamError } from '../errors'
import type { WebcamConfig } from '../types'
import { getPlatformCameras, resolveCommandCamPath } from '../utils'
import { BaseWebcam, WebcamCommand } from './BaseWebcam'

const COMMAND_CAM_MAX_ARGUMENT_BYTES = 99
const COMMAND_CAM_SUPPORTED_OUTPUT = 'bmp'
const commandCamDeviceNumberPattern = /^[1-9]\d*$/
const commandCamUnsupportedOutputExtensions = new Set(['jpeg', 'jpg', 'png'])
let commandCamTemporaryCaptureCounter = 0

const createUnsupportedCommandCamOutputError = (output: string) =>
  new WebcamError({
    code: 'UNSUPPORTED_OUTPUT_FORMAT',
    message:
      'CommandCam only supports bmp output. Install ffmpeg for jpeg, jpg, or png capture on Windows.',
    details: {
      backend: 'CommandCam',
      output,
      supportedOutputs: [COMMAND_CAM_SUPPORTED_OUTPUT]
    }
  })

const getCommandCamDeviceArgs = (device: WebcamConfig['device']) => {
  if (typeof device !== 'string') return []

  const normalizedDevice = device.trim()

  if (!normalizedDevice) return []

  return commandCamDeviceNumberPattern.test(normalizedDevice)
    ? ['/devnum', normalizedDevice]
    : ['/devname', normalizedDevice]
}

const quoteCommandCamShellArg = (arg: string) =>
  /\s/.test(arg) ? `"${arg}"` : arg

const createCommandCamTemporaryCapturePath = (path: string) => {
  commandCamTemporaryCaptureCounter += 1

  return join(
    tmpdir(),
    `nw-${process.pid.toString(36)}-${Date.now().toString(
      36
    )}-${commandCamTemporaryCaptureCounter.toString(36)}${extname(path)}`
  )
}

class WindowsWebcam extends BaseWebcam {
  #bin: string

  constructor(options?: Partial<WebcamConfig>) {
    if (options?.output && options.output !== COMMAND_CAM_SUPPORTED_OUTPUT)
      throw createUnsupportedCommandCamOutputError(options.output)

    super({ ...options, output: COMMAND_CAM_SUPPORTED_OUTPUT })
    this.#bin = resolveCommandCamPath()

    if (options?.delay) super.setDelayInMilliseconds()
  }

  /**
   * @deprecated Use `generateCommand()` for safe argument-based execution.
   */
  generateSh(location: string): string {
    this.validateOutputPath(location)

    const { options } = this
    const args = [
      ...(options.delay ? ['/delay', String(options.delay)] : []),
      ...getCommandCamDeviceArgs(options.device),
      '/filename',
      location
    ]

    return [this.#bin, ...args.map(quoteCommandCamShellArg)].join(' ')
  }

  generateCommand(location: string): WebcamCommand {
    this.validateOutputPath(location)

    const { options } = this
    const args = []

    if (options.delay) args.push('/delay', String(options.delay))
    args.push(...getCommandCamDeviceArgs(options.device))

    args.push('/filename', location)

    return { file: this.#bin, args }
  }

  protected validateOutputPath(path: string) {
    super.validateOutputPath(path)

    const extension = extname(path).slice(1).toLowerCase()
    const bytes = Buffer.byteLength(path, 'utf8')

    if (commandCamUnsupportedOutputExtensions.has(extension))
      throw createUnsupportedCommandCamOutputError(extension)

    if (path.includes('"'))
      throw new WebcamError({
        code: 'INVALID_OUTPUT_PATH',
        message:
          'Invalid Windows output path, CommandCam paths must not contain double quotes',
        details: { path }
      })

    if (bytes > COMMAND_CAM_MAX_ARGUMENT_BYTES)
      throw new WebcamError({
        code: 'INVALID_OUTPUT_PATH',
        message: `Invalid Windows output path, CommandCam paths must be ${COMMAND_CAM_MAX_ARGUMENT_BYTES} bytes or less: ${bytes}`,
        details: {
          bytes,
          maxBytes: COMMAND_CAM_MAX_ARGUMENT_BYTES,
          path
        }
      })
  }

  protected createTemporaryCapturePath(path: string) {
    return createCommandCamTemporaryCapturePath(path)
  }

  async listWebcams(): Promise<string[]> {
    const { options } = this

    return getPlatformCameras({
      platform: 'win32',
      signal: options.signal,
      timeout: options.timeout,
      windowsCommandCamPath: this.#bin
    })
  }
}

export { WindowsWebcam }
