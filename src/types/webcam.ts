export type WebcamCaptureSaveHandler = (
  path: string,
  buffer: Buffer
) => boolean | Promise<boolean | void> | void

/**
 * Controls whether capture output is persisted to `location`.
 *
 * - `true`: write the captured buffer to `location` before resolving.
 * - `false`: skip file persistence and only return the buffer in the result.
 * - function: run custom persistence logic with `(path, buffer)`.
 *   Return `true` to also run the default write; return `false`/`void` to skip it.
 */
export type WebcamCaptureSaveStrategy = boolean | WebcamCaptureSaveHandler

export type WebcamConfig = {
  // Picture related
  width: number // 1280
  height: number // 720
  quality: number // 100

  // Delay to take shot
  delay: number // 0

  // Title of the saved picture
  title: string // ''

  // Subtitle of the saved picture
  subtitle: string // ''

  // Timestamp of the saved picture
  timestamp: string // ''

  // Keep captured buffers in the in-memory shot history.
  saveShots: boolean // true

  // Persist captured output to the requested location.
  save: WebcamCaptureSaveStrategy // true

  // [jpeg png] support varies
  // Webcam.OutputTypes
  output: 'jpeg' | 'jpg' | 'png' | 'bmp' // jpeg

  // Which camera to use
  // Use Webcam.list() for results
  // false for default device
  device: string | false // ''

  // Optional ffmpeg binary path. Defaults to "ffmpeg" from PATH.
  ffmpegPath?: string

  // Logging
  verbose: boolean // false

  // Maximum capture command runtime in milliseconds. 0 disables timeout.
  timeout: number // 0

  // AbortSignal used to cancel an in-flight capture command
  signal?: AbortSignal

  // Frames
  frames: number // 1

  // Grey scale
  greyScale: boolean // false

  // Rotation
  rotation: number // 0

  // Banners
  topBanner: boolean
  bottomBanner: boolean

  // Skip
  skip: number // 0
}
