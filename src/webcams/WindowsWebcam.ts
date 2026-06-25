import { execFile } from 'child_process'
import { promisify } from 'util'
import { resolve } from 'path'

import { WebcamError, getCommandErrorCode } from '../errors'
import type { WebcamConfig } from '../types'
import { BaseWebcam, WebcamCommand } from './BaseWebcam'

const asyncExecFile = promisify(execFile)

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
    const { options } = this
    const device = options.device ? `/devnum ${options.device}` : ''
    const delay = options.delay ? `/delay ${options.delay}` : ''

    return `${this.#bin} ${delay} ${device} /filename ${location}`.replace(
      / +/g,
      ' '
    )
  }

  generateCommand(location: string): WebcamCommand {
    const { options } = this
    const args = []

    if (options.delay) args.push('/delay', String(options.delay))
    if (options.device) args.push('/devnum', options.device)

    args.push('/filename', location)

    return { file: this.#bin, args }
  }

  async listWebcams(): Promise<string[]> {
    const command = { file: this.#bin, args: ['/devlist'] }
    const operationId = this.createDiagnosticId('list')
    const startedAt = Date.now()
    let result

    this.logDiagnostic('list:start', {
      ...command,
      backend: this.getBackendName(),
      operationId
    })

    try {
      result = await asyncExecFile(command.file, command.args)
    } catch (error) {
      const code = getCommandErrorCode(error)
      const elapsedMs = this.getElapsedMs(startedAt)

      this.logDiagnostic(
        'list:error',
        {
          ...command,
          backend: this.getBackendName(),
          code,
          elapsedMs,
          operationId
        },
        'error'
      )

      throw new WebcamError({
        code: code === 'BINARY_NOT_FOUND' ? code : 'CAMERA_LIST_FAILED',
        message:
          code === 'BINARY_NOT_FOUND'
            ? `Webcam command binary was not found: ${this.#bin}`
            : 'Unable to list webcams',
        cause: error,
        details: {
          ...command,
          elapsedMs,
          operationId
        }
      })
    }

    if (result.stderr) {
      const elapsedMs = this.getElapsedMs(startedAt)

      this.logDiagnostic(
        'list:error',
        {
          ...command,
          backend: this.getBackendName(),
          code: 'CAMERA_LIST_FAILED',
          elapsedMs,
          operationId
        },
        'error'
      )

      throw new WebcamError({
        code: 'CAMERA_LIST_FAILED',
        message: result.stderr,
        details: {
          ...command,
          elapsedMs,
          operationId
        }
      })
    }

    const lines = result.stdout.split('\n')

    const webcams = lines.reduce<string[]>((acc, line) => {
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

    this.logDiagnostic(
      'list:success',
      {
        ...command,
        backend: this.getBackendName(),
        cameraCount: webcams.length,
        elapsedMs: this.getElapsedMs(startedAt),
        operationId
      },
      'info'
    )

    return webcams
  }
}

export { WindowsWebcam }
