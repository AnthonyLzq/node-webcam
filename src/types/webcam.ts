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

  // Save shots in memory
  saveShots: boolean // true

  // [jpeg png] support varies
  // Webcam.OutputTypes
  output: 'jpeg' | 'jpg' | 'png' | 'bmp' // jpeg

  // Which camera to use
  // Use Webcam.list() for results
  // false for default device
  device: string // '

  // Logging
  verbose: boolean // false

  // Frames
  frames: number // 1

  // Grey scale
  greyScale: boolean // false

  // Rotation
  rotation: number // 0

  // Banners
  topBanner: false
  bottomBanner: false

  // Skip
  skip: number // 0
}
