import os from 'os'

import { WebcamError } from './errors'
import { BaseWebcam, FSWebcam, ImageSnapWebcam, WindowsWebcam } from './webcams'
import { getPlatformCameras } from './utils'
import type { WebcamCaptureResult } from './webcams/BaseWebcam'
import type { WebcamConfig } from './types'

type CaptureRequest = {
  location?: string
  options?: Partial<WebcamConfig>
  cb?: (value: WebcamCaptureResult) => void
}

const supportedPlatforms = ['linux', 'darwin', 'win32']

const create = (options: Partial<WebcamConfig> = {}) => {
  const currentPlatform = os.platform()

  switch (currentPlatform) {
    case 'linux':
      return new FSWebcam(options)
    case 'darwin':
      return new ImageSnapWebcam(options)
    case 'win32':
      return new WindowsWebcam(options)
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

const capture = async ({
  location = 'location.jpeg',
  options = {},
  cb
}: CaptureRequest = {}) => {
  const Webcam = create(options)
  const result = await Webcam.capture({ location })

  if (cb) cb(result)

  return result
}

const list = async () => getPlatformCameras()

const listWebcams = async () => getPlatformCameras()

export {
  create,
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
