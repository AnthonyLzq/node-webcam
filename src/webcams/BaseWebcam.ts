import { execFile } from 'child_process'
import { readFile, rm, writeFile } from 'fs/promises'
import { basename, extname, resolve } from 'path'
import { promisify } from 'util'

import {
  WebcamError,
  getCommandErrorCode,
  getCommandErrorMessage
} from '../errors'
import { logDiagnostic } from '../logger'
import { recordCaptureMetric, WebcamBackendType } from '../metrics'
import { Shot, getPlatformCameras, setDefaults } from '../utils'
import type { WebcamConfig } from '../types'

const asyncExecFile = promisify(execFile)
const r = /(?<=\.)[^.]*$/
const ALLOWED_FILE_TYPES = ['jpg', 'jpeg', 'png', 'bmp']
const captureQueues = new Map<string, Promise<void>>()
let diagnosticCounter = 0
let temporaryCaptureCounter = 0

export type WebcamCommand = {
  file: string
  args: string[]
}

export type WebcamBackendCapture =
  | {
      buffer: Buffer
      kind: 'buffer'
      mimeType?: string
    }
  | {
      kind: 'file'
      mimeType?: string
      path: string
    }

export type WebcamCaptureExecution = {
  details?: Record<string, unknown>
  run: () => Promise<WebcamBackendCapture>
}

export type WebcamCaptureOptions = {
  location: string
}

export type WebcamCaptureResult = {
  backend: string
  backendType: WebcamBackendType
  buffer: Buffer
  bytes: number
  elapsedMs: number
  location: string
  mimeType: string
  queueWaitMs: number
  toBase64: () => string
}

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

const createDefaultTemporaryCapturePath = (path: string) => {
  const extension = extname(path)
  const pathWithoutExtension = extension
    ? path.slice(0, -extension.length)
    : path

  temporaryCaptureCounter += 1

  return `${pathWithoutExtension}.node-webcam-${
    process.pid
  }-${Date.now()}-${temporaryCaptureCounter}${extension}`
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
    return getPlatformCameras({
      signal: this.#options.signal,
      timeout: this.#options.timeout
    })
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

  generateCommand(_location: string): WebcamCommand {
    throw new WebcamError({
      code: 'COMMAND_FAILED',
      message: 'Capture command generation is not implemented',
      details: { location: _location }
    })
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

  protected validateCapturePath(path: string) {
    this.validateOutputPath(path)
  }

  protected createDiagnosticId(operation: string) {
    diagnosticCounter += 1

    return `${operation}-${diagnosticCounter}`
  }

  protected getBackendName() {
    return this.constructor.name
  }

  protected getBackendType(): WebcamBackendType {
    return 'legacy'
  }

  protected getCaptureMimeType() {
    return `image/${
      this.#options.output === 'jpg' ? 'jpeg' : this.#options.output
    }`
  }

  protected getCaptureDeviceKey() {
    return typeof this.#options.device === 'string' &&
      this.#options.device.trim()
      ? this.#options.device.trim()
      : 'default'
  }

  protected getCaptureQueueKeys(path: string) {
    const device = this.getCaptureDeviceKey()

    return [
      `capture:device:${process.platform}:${device}`,
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

  protected createCaptureExecution(path: string): WebcamCaptureExecution {
    const command = this.generateCommand(path)

    return {
      details: {
        args: command.args,
        file: command.file
      },
      run: async () => {
        await this.executeCommand(command)

        return {
          kind: 'file',
          mimeType: this.getCaptureMimeType(),
          path
        }
      }
    }
  }

  protected shouldUseTemporaryCapturePath() {
    // CLI-style backends must write somewhere before BaseWebcam can read the
    // buffer. When persistence is disabled or customized, write to a temporary
    // path first so the requested `location` is not created unless `save` asks
    // for it.
    return this.#options.save !== true
  }

  protected createTemporaryCapturePath(path: string) {
    return createDefaultTemporaryCapturePath(path)
  }

  private async persistCaptureOutput(path: string, buffer: Buffer) {
    const { save } = this.#options

    if (save === false) return

    if (save === true) {
      await writeFile(path, buffer)

      return
    }

    const result = await save(path, buffer)

    if (result === true) await writeFile(path, buffer)
  }

  async capture({
    location
  }: WebcamCaptureOptions): Promise<WebcamCaptureResult> {
    const path = resolve(location)
    const match = path.match(r)

    if (!match)
      throw new WebcamError({
        code: 'INVALID_OUTPUT_PATH',
        message: 'Invalid path, missing type file',
        details: { path }
      })

    this.validateCapturePath(path)

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

    if (!Number.isFinite(this.#options.timeout) || this.#options.timeout < 0)
      throw new WebcamError({
        code: 'INVALID_TIMEOUT',
        message: `Invalid timeout: ${this.#options.timeout}`,
        details: {
          timeout: this.#options.timeout
        }
      })

    const queuedAt = Date.now()

    return runQueued(this.getCaptureQueueKeys(path), async () => {
      const executionPath = this.shouldUseTemporaryCapturePath()
        ? this.createTemporaryCapturePath(path)
        : path

      return this.runCapture(path, executionPath, Date.now() - queuedAt)
    })
  }

  private async runCapture(
    path: string,
    executionPath: string,
    queueWaitMs: number
  ) {
    const operationId = this.createDiagnosticId('capture')
    const startedAt = Date.now()
    const execution = this.createCaptureExecution(executionPath)
    const backend = this.getBackendName()
    const backendType = this.getBackendType()
    const temporaryCapturePath =
      executionPath !== path ? executionPath : undefined
    const diagnosticDetails = execution.details ?? {}
    const diagnosticBase: Record<string, unknown> = {
      ...diagnosticDetails,
      backend,
      backendType,
      executionPath,
      operationId,
      path,
      queueWaitMs,
      timeout: this.#options.timeout
    }

    this.logDiagnostic('capture:start', diagnosticBase)

    let capture: WebcamBackendCapture

    try {
      capture = await execution.run()
    } catch (error) {
      const code =
        error instanceof WebcamError
          ? error.code
          : getCommandErrorCode(error, {
              timeout: this.#options.timeout
            })
      const elapsedMs = this.getElapsedMs(startedAt)
      const file =
        typeof diagnosticBase.file === 'string'
          ? diagnosticBase.file
          : this.getBackendName()
      const typedError = new WebcamError({
        code,
        message:
          error instanceof WebcamError
            ? error.message
            : getCommandErrorMessage({
                code,
                file,
                timeout: this.#options.timeout
              }),
        cause: error,
        details: {
          ...(error instanceof WebcamError ? error.details : {}),
          ...diagnosticDetails,
          elapsedMs,
          operationId,
          path,
          signalAborted: this.#options.signal?.aborted ?? false,
          timeout: this.#options.timeout
        }
      })

      recordCaptureMetric({
        backend,
        backendType,
        bytes: 0,
        code,
        elapsedMs,
        queueWaitMs,
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

      if (temporaryCapturePath) await rm(temporaryCapturePath, { force: true })

      throw typedError
    }

    let buffer: Buffer
    let mimeType = capture.mimeType ?? this.getCaptureMimeType()

    try {
      if (capture.kind === 'buffer') buffer = Buffer.from(capture.buffer)
      else {
        buffer = await readFile(capture.path)
        mimeType = capture.mimeType ?? this.getCaptureMimeType()
      }
    } catch (error) {
      const elapsedMs = this.getElapsedMs(startedAt)
      const typedError = new WebcamError({
        code: 'OUTPUT_READ_FAILED',
        message: `Unable to read captured output: ${path}`,
        cause: error,
        details: {
          elapsedMs,
          operationId,
          path
        }
      })

      recordCaptureMetric({
        backend,
        backendType,
        bytes: 0,
        code: 'OUTPUT_READ_FAILED',
        elapsedMs,
        queueWaitMs,
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

      if (temporaryCapturePath) await rm(temporaryCapturePath, { force: true })

      throw typedError
    }

    try {
      if (
        !(
          capture.kind === 'file' &&
          capture.path === path &&
          this.#options.save === true
        )
      )
        await this.persistCaptureOutput(path, buffer)
    } catch (error) {
      const elapsedMs = this.getElapsedMs(startedAt)
      const typedError = new WebcamError({
        code: 'OUTPUT_WRITE_FAILED',
        message: `Unable to persist captured output: ${path}`,
        cause: error,
        details: {
          elapsedMs,
          operationId,
          path
        }
      })

      recordCaptureMetric({
        backend,
        backendType,
        bytes: 0,
        code: 'OUTPUT_WRITE_FAILED',
        elapsedMs,
        queueWaitMs,
        status: 'failed'
      })

      this.logDiagnostic(
        'capture:error',
        {
          ...diagnosticBase,
          code: 'OUTPUT_WRITE_FAILED',
          elapsedMs
        },
        'error'
      )

      throw typedError
    } finally {
      if (temporaryCapturePath) await rm(temporaryCapturePath, { force: true })
    }

    if (this.#options.saveShots) this.#shots.push(this.createShot(path, buffer))

    const elapsedMs = this.getElapsedMs(startedAt)

    recordCaptureMetric({
      backend,
      backendType,
      bytes: buffer.length,
      elapsedMs,
      queueWaitMs,
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

    return {
      backend,
      backendType,
      buffer,
      bytes: buffer.length,
      elapsedMs,
      location: path,
      mimeType,
      queueWaitMs,
      toBase64: () => `data:${mimeType};base64,${buffer.toString('base64')}`
    }
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
    return `data:${this.getCaptureMimeType()};base64,${shotBuffer.toString(
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
