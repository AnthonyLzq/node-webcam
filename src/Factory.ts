import { platform } from 'os'

import { WebcamError } from './errors'
import { FSWebcam, ImageSnapWebcam, WindowsWebcam } from './webcams'
import type { WebcamConfig } from './types'

export type WebcamTypes = {
  linux: FSWebcam
  fswebcam: FSWebcam
  darwin: ImageSnapWebcam
  win32: WindowsWebcam
  win64: WindowsWebcam
}

class Factory {
  #platform: ReturnType<typeof platform>
  #types: WebcamTypes

  constructor(options: Partial<WebcamConfig>) {
    this.#platform = platform()
    this.#types = {
      linux: new FSWebcam(options),
      fswebcam: new FSWebcam(options),
      darwin: new ImageSnapWebcam(options),
      win32: new WindowsWebcam(options),
      win64: new WindowsWebcam(options)
    }
  }

  create(type: string) {
    if (!Object.keys(this.#types).includes(type))
      throw new WebcamError({
        code: 'UNSUPPORTED_WEBCAM_TYPE',
        message: 'Webcam type is not supported',
        details: {
          requestedType: type,
          supportedTypes: Object.keys(this.#types)
        }
      })

    const p = (type || this.#platform) as keyof WebcamTypes

    return this.#types[p]
  }
}

export { Factory }
