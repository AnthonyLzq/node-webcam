import type { WebcamConfig } from '../types'
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

    const timeoutMs =
      options.timeout && options.timeout > 0 ? options.timeout : 5000

    return addon.isAvailable({
      device,
      height: options.height ?? 720,
      timeoutMs,
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
    const timeoutMs = options.timeout > 0 ? options.timeout : 5_000
    const nativeOptions = {
      device,
      height: options.height,
      timeoutMs,
      width: options.width
    }

    return {
      details: {
        addon: this.#addonPath ?? defaultNativeAddonPath,
        device,
        nativeOptions
      },
      run: async () => ({
        buffer: this.#addon.captureMjpeg(nativeOptions),
        kind: 'buffer',
        mimeType: this.getCaptureMimeType()
      })
    }
  }
}

export { NativeLinuxWebcam }
