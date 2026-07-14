import type { WebcamConfig } from '../types'
import { WebcamError, WebcamErrorCode } from '../errors'
import { getLinuxCameras } from '../utils'
import {
  defaultNativeAddonPath,
  loadNativeWebcamAddon,
  NativeWebcamAddon
} from '../native'
import { BaseWebcam, WebcamCaptureExecution } from './BaseWebcam'

type NativeLinuxWebcamOptions = Partial<WebcamConfig> & {
  nativeAddon?: NativeWebcamAddon
  nativeAddonPath?: string
}

const nativeCodeMap: Record<string, WebcamErrorCode> = {
  NODE_WEBCAM_NATIVE_CAPTURE_FAILED: 'NATIVE_CAPTURE_FAILED',
  NODE_WEBCAM_NATIVE_DEVICE_BUSY: 'NATIVE_DEVICE_BUSY',
  NODE_WEBCAM_NATIVE_DEVICE_NOT_FOUND: 'NATIVE_DEVICE_NOT_FOUND',
  NODE_WEBCAM_NATIVE_DEVICE_UNSUPPORTED: 'NATIVE_DEVICE_UNSUPPORTED',
  NODE_WEBCAM_NATIVE_FORMAT_UNSUPPORTED: 'NATIVE_FORMAT_UNSUPPORTED',
  NODE_WEBCAM_NATIVE_FRAME_EMPTY: 'NATIVE_FRAME_EMPTY',
  NODE_WEBCAM_NATIVE_FRAME_TIMEOUT: 'NATIVE_FRAME_TIMEOUT',
  NODE_WEBCAM_NATIVE_PERMISSION_DENIED: 'NATIVE_PERMISSION_DENIED'
}

const getNativeErrorCode = (error: unknown): WebcamErrorCode => {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code

    if (typeof code === 'string' && nativeCodeMap[code])
      return nativeCodeMap[code]
  }

  const message = error instanceof Error ? error.message : String(error)

  if (message.includes('No such file or directory'))
    return 'NATIVE_DEVICE_NOT_FOUND'
  if (message.includes('Permission denied')) return 'NATIVE_PERMISSION_DENIED'
  if (message.includes('Device or resource busy')) return 'NATIVE_DEVICE_BUSY'
  if (
    message.includes('does not support') ||
    message.includes('Unable to query V4L2 capabilities')
  )
    return 'NATIVE_DEVICE_UNSUPPORTED'
  if (message.includes('MJPEG') || message.includes('Unable to configure V4L2'))
    return 'NATIVE_FORMAT_UNSUPPORTED'
  if (message.includes('Timed out waiting for V4L2 frame'))
    return 'NATIVE_FRAME_TIMEOUT'
  if (message.includes('empty frame')) return 'NATIVE_FRAME_EMPTY'

  return 'NATIVE_CAPTURE_FAILED'
}

class NativeLinuxWebcam extends BaseWebcam {
  #addon: NativeWebcamAddon
  #addonPath?: string

  constructor(options: NativeLinuxWebcamOptions = {}) {
    const { nativeAddon, ...webcamOptions } = options

    super(webcamOptions)
    this.#addonPath = webcamOptions.nativeAddonPath

    const addon =
      nativeAddon ??
      (webcamOptions.nativeAddonPath
        ? loadNativeWebcamAddon(webcamOptions.nativeAddonPath)
        : loadNativeWebcamAddon())

    if (!addon) throw new Error('Native Linux webcam addon is not available')

    this.#addon = addon
  }

  static isAvailable(options: NativeLinuxWebcamOptions = {}) {
    const addon =
      options.nativeAddon ??
      (options.nativeAddonPath
        ? loadNativeWebcamAddon(options.nativeAddonPath)
        : loadNativeWebcamAddon())

    if (!addon) return false

    if (options.output && !['jpeg', 'jpg'].includes(options.output))
      return false

    const device =
      typeof options.device === 'string' && options.device
        ? options.device
        : '/dev/video0'

    return addon.isAvailable({
      device,
      height: options.height ?? 720,
      timeoutMs: options.timeout && options.timeout > 0 ? options.timeout : 0,
      width: options.width ?? 1280
    })
  }

  listWebcams(): Promise<string[]> {
    return Promise.resolve(getLinuxCameras())
  }

  protected getBackendName() {
    return 'native:v4l2'
  }

  protected getBackendType() {
    return 'native' as const
  }

  protected getCaptureMimeType() {
    return 'image/jpeg'
  }

  protected createCaptureExecution(): WebcamCaptureExecution {
    const { options } = this
    const device =
      typeof options.device === 'string' && options.device
        ? options.device
        : '/dev/video0'
    const nativeOptions = {
      device,
      height: options.height,
      timeoutMs: options.timeout,
      width: options.width
    }

    return {
      details: {
        addon: this.#addonPath ?? defaultNativeAddonPath,
        device,
        nativeOptions
      },
      run: async () => {
        try {
          return {
            buffer: await this.#addon.captureMjpegAsync(nativeOptions),
            kind: 'buffer',
            mimeType: this.getCaptureMimeType()
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          const nativeCode =
            typeof error === 'object' && error !== null
              ? (error as { code?: unknown }).code
              : undefined

          throw new WebcamError({
            code: getNativeErrorCode(error),
            message,
            cause: error,
            details: {
              addon: this.#addonPath ?? defaultNativeAddonPath,
              device,
              nativeCode,
              nativeOptions
            }
          })
        }
      }
    }
  }
}

export { NativeLinuxWebcam }
