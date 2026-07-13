export type WebcamErrorCode =
  | 'BINARY_NOT_FOUND'
  | 'COMMAND_ABORTED'
  | 'CAMERA_LIST_FAILED'
  | 'COMMAND_FAILED'
  | 'COMMAND_TIMEOUT'
  | 'COMMANDCAM_NOT_INSTALLED'
  | 'INVALID_FILE_EXTENSION'
  | 'INVALID_CONFIG_OPTION'
  | 'INVALID_OUTPUT_PATH'
  | 'INVALID_TIMEOUT'
  | 'NATIVE_CAPTURE_FAILED'
  | 'NATIVE_DEVICE_BUSY'
  | 'NATIVE_DEVICE_NOT_FOUND'
  | 'NATIVE_DEVICE_UNSUPPORTED'
  | 'NATIVE_FORMAT_UNSUPPORTED'
  | 'NATIVE_FRAME_EMPTY'
  | 'NATIVE_FRAME_TIMEOUT'
  | 'NATIVE_PERMISSION_DENIED'
  | 'OUTPUT_MISMATCH'
  | 'OUTPUT_READ_FAILED'
  | 'OUTPUT_WRITE_FAILED'
  | 'SHOT_NOT_FOUND'
  | 'UNSUPPORTED_WEBCAM_TYPE'

type WebcamErrorOptions = {
  code: WebcamErrorCode
  message: string
  cause?: unknown
  details?: Record<string, unknown>
}

class WebcamError extends Error {
  code: WebcamErrorCode
  cause?: unknown
  details?: Record<string, unknown>

  constructor({ code, message, cause, details }: WebcamErrorOptions) {
    super(message)
    this.name = 'WebcamError'
    this.code = code
    this.cause = cause
    this.details = details
  }
}

const hasErrorCode = (error: unknown, code: string) => {
  if (typeof error !== 'object' || error === null) return false

  return (error as { code?: unknown }).code === code
}

const hasErrorName = (error: unknown, name: string) => {
  if (typeof error !== 'object' || error === null) return false

  return (error as { name?: unknown }).name === name
}

const wasKilled = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false

  return (error as { killed?: unknown }).killed === true
}

const getCommandErrorCode = (
  error: unknown,
  { timeout = 0 }: { timeout?: number } = {}
): WebcamErrorCode => {
  if (hasErrorCode(error, 'ENOENT')) return 'BINARY_NOT_FOUND'

  if (hasErrorCode(error, 'ABORT_ERR') || hasErrorName(error, 'AbortError'))
    return 'COMMAND_ABORTED'

  if (timeout > 0 && wasKilled(error)) return 'COMMAND_TIMEOUT'

  return 'COMMAND_FAILED'
}

const getCommandErrorMessage = ({
  code,
  file,
  timeout
}: {
  code: WebcamErrorCode
  file: string
  timeout: number
}) => {
  switch (code) {
    case 'BINARY_NOT_FOUND':
      return `Webcam command binary was not found: ${file}`
    case 'COMMAND_TIMEOUT':
      return `Webcam command timed out after ${timeout}ms: ${file}`
    case 'COMMAND_ABORTED':
      return `Webcam command was aborted: ${file}`
    default:
      return `Webcam command failed: ${file}`
  }
}

export { WebcamError, getCommandErrorCode, getCommandErrorMessage }
