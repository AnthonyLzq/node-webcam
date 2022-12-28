const setDefaults = (
  object: Partial<WebcamConfig> = {},
  defaults: WebcamConfig = {
    width: 1280,
    height: 720,
    quality: 100,
    delay: 0,
    title: false,
    subtitle: false,
    timestamp: false,
    saveShots: true,
    output: 'jpeg',
    device: false,
    callbackReturn: 'location',
    verbose: false
  }
): WebcamConfig => {
  return {
    ...defaults,
    ...object
  }
}

export { setDefaults }
