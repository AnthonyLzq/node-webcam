import type { WebcamConfig } from 'types'

const setDefaults = (
  options: Partial<WebcamConfig> = {},
  defaults: WebcamConfig = {
    width: 1280,
    height: 720,
    quality: 100,
    delay: 0,
    title: '',
    subtitle: '',
    timestamp: '',
    saveShots: true,
    output: 'jpeg',
    device: '',
    callbackReturn: 'location',
    verbose: false,
    frames: 1,
    greyScale: false,
    rotation: 0,
    bottomBanner: false,
    topBanner: false,
    skip: 0
  }
): WebcamConfig => {
  return {
    ...defaults,
    ...options
  }
}

export { setDefaults }
