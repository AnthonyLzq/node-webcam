type WebcamConfig = {
  // Picture related
  width: number // 1280
  height: number // 720
  quality: number // 100

  // Delay to take shot
  delay: number // 0

  // Title of the saved picture
  title: boolean // false

  // Subtitle of the saved picture
  subtitle: boolean // false

  // Timestamp of the saved picture
  timestamp: boolean // false

  // Save shots in memory
  saveShots: boolean // true

  // [jpeg png] support varies
  // Webcam.OutputTypes
  output: 'jpeg' | 'png' // jpeg

  // Which camera to use
  // Use Webcam.list() for results
  // false for default device
  device: string | boolean // false

  // [location buffer base64]
  // Webcam.CallbackReturnTypes
  callbackReturn: 'location' | 'buffer' | 'base64' // 'location'

  // Logging
  verbose: boolean // false
}
