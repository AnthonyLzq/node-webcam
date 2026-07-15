export type WebcamLogLevel = 'debug' | 'error' | 'info' | 'warn'

export type WebcamLogEntry = {
  level: WebcamLogLevel
  event: string
  details: Record<string, unknown>
}

export type WebcamLogger = {
  log: (entry: WebcamLogEntry) => void
}

const consoleLogger: WebcamLogger = {
  log: ({ details, event, level }) => {
    console[level]('[node-webcam]', event, details)
  }
}

let logger = consoleLogger

const setLogger = (nextLogger: WebcamLogger) => {
  logger = nextLogger
}

const resetLogger = () => {
  logger = consoleLogger
}

const logDiagnostic = (entry: WebcamLogEntry) => {
  logger.log(entry)
}

export { logDiagnostic, resetLogger, setLogger }
