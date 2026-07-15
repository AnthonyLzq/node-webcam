import { WebcamError } from '../errors'
import type { WebcamConfig } from '../types'
import { BaseWebcam, WebcamCommand } from './BaseWebcam'

const FSWEBCAM_SUPPORTED_OUTPUTS = ['jpeg', 'jpg', 'png']

const assertSupportedOutput = (output: WebcamConfig['output']) => {
  if (!FSWEBCAM_SUPPORTED_OUTPUTS.includes(output))
    throw new WebcamError({
      code: 'UNSUPPORTED_OUTPUT_FORMAT',
      message:
        'fswebcam does not support bmp output. Use jpeg, jpg, png, or install ffmpeg for bmp capture on Linux.',
      details: {
        backend: 'fswebcam',
        output,
        supportedOutputs: FSWEBCAM_SUPPORTED_OUTPUTS
      }
    })
}

class FSWebcam extends BaseWebcam {
  #bin: string

  constructor(options?: Partial<WebcamConfig>) {
    if (options?.output) assertSupportedOutput(options.output)

    super(options)
    this.#bin = 'fswebcam'

    if (options?.quality && options.quality > 9) this.setMaxQuality()
  }

  /**
   * @deprecated Use `generateCommand()` for safe argument-based execution.
   */
  generateSh(location: string): string {
    this.validateOutputPath(location)

    const options = super.options
    assertSupportedOutput(options.output)
    const resolution = ` -r ${options.width}x${options.height}`
    const frames = `-F ${options.frames}`
    const delay = `-D ${options.delay}`
    const output = options.output === 'jpg' ? '' : `--${options.output} -1`
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
    } ${verbose} ${resolution} ${frames} ${delay} ${title} ${subtitle} ${timestamp} ${device} ${grey} ${rotation} ${banner} ${skip} ${output} ${shellLocation}`.replace(
      / +/g,
      ' '
    )
  }

  generateCommand(location: string): WebcamCommand {
    this.validateOutputPath(location)

    const options = super.options
    assertSupportedOutput(options.output)
    const args = [
      ...(options.verbose ? [] : ['-q']),
      '-r',
      `${options.width}x${options.height}`,
      '-F',
      String(options.frames),
      '-D',
      String(options.delay)
    ]

    if (options.title) args.push('--title', options.title)
    if (options.subtitle) args.push('--subtitle', options.subtitle)
    if (options.timestamp) args.push('--timestamp', options.timestamp)
    if (options.device) args.push('-d', options.device)
    if (options.greyScale) args.push('--greyscale')
    if (options.rotation) args.push('--rotate', String(options.rotation))

    if (!options.topBanner && !options.bottomBanner) args.push('--no-banner')
    else if (options.topBanner) args.push('--top-banner')
    else args.push('--bottom-banner')

    if (options.skip) args.push('--skip', String(options.skip))
    if (options.output !== 'jpg') args.push(`--${options.output}`, '-1')

    if (location) args.push(location)
    else args.push('-', '-')

    return { file: this.#bin, args }
  }

  getListControlsSh() {
    const {
      options: { device }
    } = this

    const devSwitch = device ? ' --device=' + device.trim() : ''

    return `${this.#bin} ${devSwitch} --list-controls`
  }

  protected getCaptureDeviceKey() {
    const { device } = this.options

    return typeof device === 'string' && device.trim()
      ? device.trim()
      : '/dev/video0'
  }
}

export { FSWebcam }
