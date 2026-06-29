import { execFile } from 'child_process'
import { readFile } from 'fs/promises'
import { basename, resolve } from 'path'
import { promisify } from 'util'

import {
  WebcamError,
  getCommandErrorCode,
  getCommandErrorMessage
} from '../errors'
import { logDiagnostic } from '../logger'
import { recordCaptureMetric } from '../metrics'
import { Shot, getPlatformCameras, setDefaults } from '../utils'
import type { WebcamConfig } from '../types'

const asyncExecFile = promisify(execFile)
const r = /(?<=\.)[^.]*$/
const ALLOWED_FILE_TYPES = ['jpg', 'jpeg', 'png', 'bmp']
const captureQueues = new Map<string, Promise<void>>()
let diagnosticCounter = 0

export type WebcamCommand = {
  file: string
  args: string[]
}

type CaptureReturnType = 'buffer' | 'base64'

const runQueueKey = async <T>(key: string, task: () => Promise<T>) => {
  const previous = captureQueues.get(key) ?? Promise.resolve()

  let release!: () => void
  const current = previous
    .catch(() => undefined)
    .then(
      () =>
        new Promise<void>(resolve => {
          release = resolve
        })
    )

  captureQueues.set(key, current)

  await previous.catch(() => undefined)

  try {
    return await task()
  } finally {
    release()

    if (captureQueues.get(key) === current) captureQueues.delete(key)
  }
}

const runQueued = async <T>(keys: string[], task: () => Promise<T>) => {
  const uniqueKeys = [...new Set(keys)].sort()

  const runNext = async (index: number): Promise<T> => {
    const key = uniqueKeys[index]

    if (!key) return task()

    return runQueueKey(key, () => runNext(index + 1))
  }

  return runNext(0)
}

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

  /**
   * @deprecated Use `listWebcams()` for platform-aware async camera listing.
   */
  async list(): Promise<string[]> {
    return this.listWebcams()
  }

  async listWebcams(): Promise<string[]> {
    return getPlatformCameras()
  }

  async hasCamera(camera: string) {
    return (await this.listWebcams()).includes(camera)
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

  protected validateOutputPath(path: string) {
    const trimmedPath = path.trim()
    const fileName = basename(path)

    if (trimmedPath.startsWith('-'))
      throw new WebcamError({
        code: 'INVALID_OUTPUT_PATH',
        message: `Invalid output path, path must not start with "-": ${path}`,
        details: { path }
      })

    if (fileName.startsWith('-'))
      throw new WebcamError({
        code: 'INVALID_OUTPUT_PATH',
        message: `Invalid output path, file name must not start with "-": ${fileName}`,
        details: { fileName, path }
      })
  }

  protected createDiagnosticId(operation: string) {
    diagnosticCounter += 1

    return `${operation}-${diagnosticCounter}`
  }

  protected getBackendName() {
    return this.constructor.name
  }

  protected getCaptureQueueKeys(path: string) {
    const device =
      typeof this.#options.device === 'string' && this.#options.device.trim()
        ? this.#options.device.trim()
        : 'default'

    return [
      `capture:device:${this.getBackendName()}:${device}`,
      `capture:path:${resolve(path)}`
    ]
  }

  protected getElapsedMs(startedAt: number) {
    return Date.now() - startedAt
  }

  protected logDiagnostic(
    event: string,
    details: Record<string, unknown>,
    level: 'debug' | 'error' | 'info' = 'debug'
  ) {
    if (!this.#options.verbose) return

    logDiagnostic({ details, event, level })
  }

  protected async executeCommand(command: WebcamCommand) {
    await asyncExecFile(command.file, command.args, {
      maxBuffer: 1024 * 10_000,
      signal: this.#options.signal,
      timeout: this.#options.timeout
    })
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

    this.validateOutputPath(path)

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

    if (!Number.isFinite(this.#options.timeout) || this.#options.timeout < 0)
      throw new WebcamError({
        code: 'INVALID_TIMEOUT',
        message: `Invalid timeout: ${this.#options.timeout}`,
        details: {
          timeout: this.#options.timeout
        }
      })

    const queuedAt = Date.now()

    return runQueued(this.getCaptureQueueKeys(path), async () =>
      this.runCapture(command, path, returnType, Date.now() - queuedAt)
    )
  }

  private async runCapture(
    command: WebcamCommand,
    path: string,
    returnType: CaptureReturnType,
    queueWaitMs: number
  ) {
    const operationId = this.createDiagnosticId('capture')
    const startedAt = Date.now()
    const diagnosticBase = {
      args: command.args,
      backend: this.getBackendName(),
      file: command.file,
      operationId,
      path,
      queueWaitMs,
      returnType,
      timeout: this.#options.timeout
    }

    this.logDiagnostic('capture:start', diagnosticBase)

    try {
      await this.executeCommand(command)
    } catch (error) {
      const code = getCommandErrorCode(error, {
        timeout: this.#options.timeout
      })
      const elapsedMs = this.getElapsedMs(startedAt)
      const typedError = new WebcamError({
        code,
        message: getCommandErrorMessage({
          code,
          file: command.file,
          timeout: this.#options.timeout
        }),
        cause: error,
        details: {
          args: command.args,
          elapsedMs,
          file: command.file,
          operationId,
          path,
          returnType,
          signalAborted: this.#options.signal?.aborted ?? false,
          timeout: this.#options.timeout
        }
      })

      recordCaptureMetric({
        backend: this.getBackendName(),
        bytes: 0,
        code,
        elapsedMs,
        queueWaitMs,
        returnType,
        status: 'failed'
      })

      this.logDiagnostic(
        'capture:error',
        {
          ...diagnosticBase,
          code,
          elapsedMs
        },
        'error'
      )

      throw typedError
    }

    let buffer: Buffer

    try {
      buffer = await readFile(path)
    } catch (error) {
      const elapsedMs = this.getElapsedMs(startedAt)
      const typedError = new WebcamError({
        code: 'OUTPUT_READ_FAILED',
        message: `Unable to read captured output: ${path}`,
        cause: error,
        details: {
          elapsedMs,
          operationId,
          path,
          returnType
        }
      })

      recordCaptureMetric({
        backend: this.getBackendName(),
        bytes: 0,
        code: 'OUTPUT_READ_FAILED',
        elapsedMs,
        queueWaitMs,
        returnType,
        status: 'failed'
      })

      this.logDiagnostic(
        'capture:error',
        {
          ...diagnosticBase,
          code: 'OUTPUT_READ_FAILED',
          elapsedMs
        },
        'error'
      )

      throw typedError
    }

    if (this.#options.saveShots) this.#shots.push(this.createShot(path, buffer))

    const elapsedMs = this.getElapsedMs(startedAt)

    recordCaptureMetric({
      backend: this.getBackendName(),
      bytes: buffer.length,
      elapsedMs,
      queueWaitMs,
      returnType,
      status: 'succeeded'
    })

    this.logDiagnostic(
      'capture:success',
      {
        ...diagnosticBase,
        bytes: buffer.length,
        elapsedMs
      },
      'info'
    )

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
    return this.getShot(this.#shots.length - 1)
  }

  getShotBuffer(index: number): Buffer {
    const shot = this.getShot(index)

    return shot.data
  }

  getLastShotBuffer(): Buffer {
    const shot = this.getLastShot()

    return shot.data
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
