import os from 'os'

import { WebcamError } from './errors'
import {
  BaseWebcam,
  FFmpegWebcam,
  FSWebcam,
  ImageSnapWebcam,
  NativeLinuxWebcam,
  WindowsWebcam
} from './webcams'
import { getPlatformCameras, setDefaults } from './utils'
import type { WebcamCaptureResult } from './webcams/BaseWebcam'
import type { WebcamConfig } from './types'

type CaptureRequest = {
  location?: string
  options?: Partial<WebcamConfig>
  cb?: (value: WebcamCaptureResult) => void
}

type ListRequest = Pick<Partial<WebcamConfig>, 'signal' | 'timeout'>
type Platform = 'darwin' | 'linux' | 'win32'

const supportedPlatforms = ['linux', 'darwin', 'win32']
type BackendSelection =
  | 'ffmpeg'
  | 'fswebcam'
  | 'imagesnap'
  | 'native-linux'
  | 'windows'
const legacyOnlyOptions: Array<[keyof WebcamConfig, unknown]> = [
  ['bottomBanner', false],
  ['delay', 0],
  ['frames', 1],
  ['greyScale', false],
  ['quality', 100],
  ['rotation', 0],
  ['skip', 0],
  ['subtitle', ''],
  ['timestamp', ''],
  ['title', ''],
  ['topBanner', false]
]

const hasOwn = (options: Partial<WebcamConfig>, option: keyof WebcamConfig) =>
  Object.prototype.hasOwnProperty.call(options, option)

const hasRequestedNonDefaultOption = (
  options: Partial<WebcamConfig>,
  option: keyof WebcamConfig,
  defaultValue: unknown
) => {
  if (!hasOwn(options, option)) return false

  return (options as Record<string, unknown>)[option] !== defaultValue
}

const hasLegacyOnlyOptions = (options: Partial<WebcamConfig>) =>
  legacyOnlyOptions.some(([option, defaultValue]) =>
    hasRequestedNonDefaultOption(options, option, defaultValue)
  )

const canUseNativeLinuxBackend = (options: Partial<WebcamConfig>) => {
  if (hasLegacyOnlyOptions(options)) return false
  if (hasRequestedNonDefaultOption(options, 'ffmpegPath', undefined))
    return false
  if (hasRequestedNonDefaultOption(options, 'signal', undefined)) return false

  return true
}

const canUseFFmpegBackend = (options: Partial<WebcamConfig>) =>
  !hasLegacyOnlyOptions(options)

const instantiateBackend = (
  backend: BackendSelection,
  config: WebcamConfig,
  platform: Platform
): BaseWebcam => {
  switch (backend) {
    case 'native-linux':
      return new NativeLinuxWebcam(config)
    case 'ffmpeg':
      return new FFmpegWebcam(config, platform)
    case 'fswebcam':
      return new FSWebcam(config)
    case 'imagesnap':
      return new ImageSnapWebcam(config)
    case 'windows':
      return new WindowsWebcam(config)
  }
}

const selectBackend = (
  config: WebcamConfig,
  currentPlatform: Platform
): BackendSelection => {
  switch (currentPlatform) {
    case 'linux':
      if (
        canUseNativeLinuxBackend(config) &&
        NativeLinuxWebcam.isAvailable(config)
      )
        return 'native-linux'

      if (
        canUseFFmpegBackend(config) &&
        FFmpegWebcam.isAvailable(config, currentPlatform)
      )
        return 'ffmpeg'

      return 'fswebcam'
    case 'darwin':
      if (
        canUseFFmpegBackend(config) &&
        FFmpegWebcam.isAvailable(config, currentPlatform)
      )
        return 'ffmpeg'

      return 'imagesnap'
    case 'win32':
      if (
        canUseFFmpegBackend(config) &&
        FFmpegWebcam.isAvailable(config, currentPlatform)
      )
        return 'ffmpeg'

      return 'windows'
    default:
      throw new WebcamError({
        code: 'UNSUPPORTED_WEBCAM_TYPE',
        message: 'Webcam type is not supported',
        details: {
          requestedType: currentPlatform,
          supportedTypes: supportedPlatforms
        }
      })
  }
}

const create = (options: Partial<WebcamConfig> = {}): BaseWebcam => {
  const config = setDefaults(options)
  const currentPlatform = os.platform()

  if (
    currentPlatform !== 'linux' &&
    currentPlatform !== 'darwin' &&
    currentPlatform !== 'win32'
  )
    throw new WebcamError({
      code: 'UNSUPPORTED_WEBCAM_TYPE',
      message: 'Webcam type is not supported',
      details: {
        requestedType: currentPlatform,
        supportedTypes: supportedPlatforms
      }
    })

  const backend = selectBackend(config, currentPlatform)

  return instantiateBackend(backend, config, currentPlatform)
}

const clearBackendCaches = () => {
  FFmpegWebcam.clearAvailabilityCache()
}

const clearBackendSelectionCache = clearBackendCaches

const capture = async ({ location, options = {}, cb }: CaptureRequest = {}) => {
  const Webcam = create(options)
  const captureLocation = location ?? `location.${Webcam.options.output}`
  const result = await Webcam.capture({ location: captureLocation })

  if (cb) cb(result)

  return result
}

const list = async (options: ListRequest = {}) => getPlatformCameras(options)

const listWebcams = async (options: ListRequest = {}) =>
  getPlatformCameras(options)

export {
  create,
  clearBackendCaches,
  clearBackendSelectionCache,
  capture,
  list,
  listWebcams,
  BaseWebcam,
  FSWebcam,
  ImageSnapWebcam,
  WindowsWebcam
}
export { defaults } from './utils'
export { WebcamError }
export { getMetricsReport, resetMetrics } from './metrics'

export type NodeWebcamConfig = WebcamConfig
export type { WebcamErrorCode } from './errors'
export type {
  WebcamCaptureSaveHandler,
  WebcamCaptureSaveStrategy
} from './types'
export type {
  WebcamBackendType,
  WebcamCaptureMetrics,
  WebcamMetricsReport
} from './metrics'
export type {
  WebcamBackendCapture,
  WebcamCaptureOptions,
  WebcamCaptureExecution,
  WebcamCaptureResult
} from './webcams/BaseWebcam'
