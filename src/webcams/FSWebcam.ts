import { BaseWebcam } from './BaseWebcam'

class FSWebcam extends BaseWebcam {
  #bin: string

  constructor(options?: Partial<WebcamConfig>) {
    super(options)
    this.#bin = 'fswebcam'

    if (options?.quality && options.quality > 9) this.setMaxQuality()
  }

  generateSh(location: string): string {
    const options = super.options
    const resolution = ` -r ${options.width}x${options.height}`
    const frames = `-F ${options.frames}`
    const output = `--${options.output}`
    const { quality } = options
    const delay = `-D ${options.delay}`
    const title = options.title ? `--title ${options.title}` : ''
    const subtitle = options.subtitle ? `--subtitle ${options.subtitle}` : ''
    const timestamp = options.timestamp
      ? `--timestamp ${options.timestamp}`
      : ''
    const device = options.device ? `-d ${options.device}` : ''
    const grey = options.greyScale ? '--greyscale' : ''
    const rotation = options.rotation ? `--rotate ${options.rotation}` : ''
    const banner =
      !options.topBanner && !options.bottomBanner
        ? '--no-banner'
        : options.topBanner
        ? '--top-banner'
        : '--bottom-banner'
    const skip = options.skip ? `--skip ${options.skip}` : ''
    const verbose = options.verbose ? '' : ' -q'
    const shellLocation = location || '- -'

    return `${
      this.#bin
    } ${verbose} ${resolution} ${frames} ${output} ${quality} ${delay} ${title} ${subtitle} ${timestamp} ${device} ${grey} ${rotation} ${banner} ${skip} ${shellLocation}`.replace(
      / +/g,
      ' '
    )
  }

  getListControlsSh() {
    const {
      options: { device }
    } = this
    const devSwitch = device ? ' --device=' + device.trim() : ''

    return `${this.#bin} ${devSwitch} --list-controls`
  }
}

export { FSWebcam }
