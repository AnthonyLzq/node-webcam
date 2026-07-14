import type { WebcamConfig } from '../types'
import { WebcamError } from '../errors'

const defaults: WebcamConfig = {
  width: 1280,
  height: 720,
  quality: 100,
  delay: 0,
  title: '',
  subtitle: '',
  timestamp: '',
  save: true,
  saveShots: true,
  output: 'jpeg',
  device: '',
  verbose: false,
  timeout: 0,
  frames: 1,
  greyScale: false,
  rotation: 0,
  bottomBanner: false,
  topBanner: false,
  skip: 0
}

const validOutputs: WebcamConfig['output'][] = ['bmp', 'jpeg', 'jpg', 'png']

const describeValue = (value: unknown) => {
  if (typeof value === 'number' && Number.isNaN(value)) return 'NaN'

  return JSON.stringify(value)
}

const throwInvalidOption = (
  option: keyof WebcamConfig,
  expected: string,
  value: unknown
): never => {
  throw new WebcamError({
    code: 'INVALID_CONFIG_OPTION',
    message: `Invalid webcam option "${option}": expected ${expected}, received ${describeValue(
      value
    )}`,
    details: {
      expected,
      option,
      value
    }
  })
}

const validateFiniteNumber = (
  config: WebcamConfig,
  option: keyof WebcamConfig,
  {
    integer = false,
    max,
    min
  }: { integer?: boolean; max?: number; min: number }
) => {
  const value = config[option]

  if (typeof value !== 'number' || !Number.isFinite(value))
    throwInvalidOption(option, 'a finite number', value)

  const numberValue = value as number

  if (integer && !Number.isInteger(numberValue))
    throwInvalidOption(option, 'an integer', numberValue)

  if (numberValue < min)
    throwInvalidOption(
      option,
      `a number greater than or equal to ${min}`,
      numberValue
    )

  if (max !== undefined && numberValue > max)
    throwInvalidOption(
      option,
      `a number less than or equal to ${max}`,
      numberValue
    )
}

const validateString = (config: WebcamConfig, option: keyof WebcamConfig) => {
  const value = config[option]

  if (typeof value !== 'string') throwInvalidOption(option, 'a string', value)
}

const validateBoolean = (config: WebcamConfig, option: keyof WebcamConfig) => {
  const value = config[option]

  if (typeof value !== 'boolean') throwInvalidOption(option, 'a boolean', value)
}

const validateTimeoutOption = (timeout: unknown) => {
  if (typeof timeout !== 'number' || !Number.isFinite(timeout))
    throwInvalidOption('timeout', 'a finite number', timeout)

  const timeoutValue = timeout as number

  if (!Number.isInteger(timeoutValue))
    throwInvalidOption('timeout', 'an integer', timeoutValue)

  if (timeoutValue < 0)
    throwInvalidOption(
      'timeout',
      'a number greater than or equal to 0',
      timeoutValue
    )
}

const isAbortSignalLike = (value: unknown): value is AbortSignal =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { aborted?: unknown }).aborted === 'boolean' &&
  typeof (value as { addEventListener?: unknown }).addEventListener ===
    'function' &&
  typeof (value as { removeEventListener?: unknown }).removeEventListener ===
    'function'

const validateWebcamConfig = (config: WebcamConfig) => {
  validateFiniteNumber(config, 'width', { integer: true, min: 1, max: 16_384 })
  validateFiniteNumber(config, 'height', { integer: true, min: 1, max: 16_384 })
  validateFiniteNumber(config, 'quality', { integer: true, min: 0, max: 100 })
  validateFiniteNumber(config, 'delay', { min: 0, max: 3_600 })
  validateTimeoutOption(config.timeout)
  validateFiniteNumber(config, 'frames', { integer: true, min: 1, max: 1_000 })
  validateFiniteNumber(config, 'rotation', {
    integer: true,
    min: -360,
    max: 360
  })
  validateFiniteNumber(config, 'skip', { integer: true, min: 0, max: 1_000 })

  validateString(config, 'title')
  validateString(config, 'subtitle')
  validateString(config, 'timestamp')

  validateBoolean(config, 'saveShots')
  validateBoolean(config, 'verbose')
  validateBoolean(config, 'greyScale')
  validateBoolean(config, 'bottomBanner')
  validateBoolean(config, 'topBanner')

  if (!validOutputs.includes(config.output))
    throwInvalidOption('output', validOutputs.join(', '), config.output)

  if (typeof config.device !== 'string' && config.device !== false)
    throwInvalidOption('device', 'a string or false', config.device)

  if (typeof config.save !== 'boolean' && typeof config.save !== 'function')
    throwInvalidOption('save', 'a boolean or function', config.save)

  if (config.ffmpegPath !== undefined && typeof config.ffmpegPath !== 'string')
    throwInvalidOption('ffmpegPath', 'a string', config.ffmpegPath)

  if (config.signal !== undefined && !isAbortSignalLike(config.signal))
    throwInvalidOption('signal', 'an AbortSignal-like object', config.signal)
}

const setDefaults = (options: Partial<WebcamConfig> = {}): WebcamConfig => {
  const config = {
    ...defaults,
    ...options
  }

  validateWebcamConfig(config)

  return config
}

export { setDefaults, defaults, validateTimeoutOption, validateWebcamConfig }
