export type WebcamErrorCode =
  | 'BINARY_NOT_FOUND'
  | 'CAMERA_LIST_FAILED'
  | 'COMMAND_FAILED'
  | 'INVALID_FILE_EXTENSION'
  | 'INVALID_OUTPUT_PATH'
  | 'INVALID_RETURN_TYPE'
  | 'OUTPUT_MISMATCH'
  | 'OUTPUT_READ_FAILED'
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
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

const hasErrorCode = (error: unknown, code: string) => {
  if (typeof error !== 'object' || error === null) return false

  return (error as { code?: unknown }).code === code
}

const getCommandErrorCode = (error: unknown): WebcamErrorCode =>
  hasErrorCode(error, 'ENOENT') ? 'BINARY_NOT_FOUND' : 'COMMAND_FAILED'

export { WebcamError, getCommandErrorCode }
