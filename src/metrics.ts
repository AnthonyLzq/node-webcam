import type { WebcamErrorCode } from './errors'

type WebcamCaptureStatus = 'failed' | 'succeeded'

export type WebcamBackendType = 'ffmpeg' | 'legacy' | 'native'

type WebcamCaptureMetric = {
  backend: string
  backendType: WebcamBackendType
  bytes: number
  code?: WebcamErrorCode
  elapsedMs: number
  queueWaitMs: number
  status: WebcamCaptureStatus
}

export type WebcamCaptureMetrics = {
  aborted: number
  averageElapsedMs: number
  averageQueueWaitMs: number
  bytesRead: number
  failed: number
  maxElapsedMs: number
  maxQueueWaitMs: number
  succeeded: number
  timedOut: number
  total: number
  totalElapsedMs: number
  totalQueueWaitMs: number
}

export type WebcamMetricsReport = {
  captures: WebcamCaptureMetrics
  byBackend: Record<string, WebcamCaptureMetrics>
  byBackendType: Record<WebcamBackendType, WebcamCaptureMetrics>
}

type WebcamMutableCaptureMetrics = Omit<
  WebcamCaptureMetrics,
  'averageElapsedMs' | 'averageQueueWaitMs'
>

type WebcamMutableMetrics = {
  captures: WebcamMutableCaptureMetrics
  byBackend: Record<string, WebcamMutableCaptureMetrics>
  byBackendType: Record<WebcamBackendType, WebcamMutableCaptureMetrics>
}

const createCaptureMetrics = (): WebcamMutableCaptureMetrics => ({
  aborted: 0,
  bytesRead: 0,
  failed: 0,
  maxElapsedMs: 0,
  maxQueueWaitMs: 0,
  succeeded: 0,
  timedOut: 0,
  total: 0,
  totalElapsedMs: 0,
  totalQueueWaitMs: 0
})

let metrics: WebcamMutableMetrics = {
  captures: createCaptureMetrics(),
  byBackend: {},
  byBackendType: {
    ffmpeg: createCaptureMetrics(),
    legacy: createCaptureMetrics(),
    native: createCaptureMetrics()
  }
}

const finalizeCaptureMetrics = (
  captureMetrics: WebcamMutableCaptureMetrics
): WebcamCaptureMetrics => ({
  ...captureMetrics,
  averageElapsedMs:
    captureMetrics.total === 0
      ? 0
      : captureMetrics.totalElapsedMs / captureMetrics.total,
  averageQueueWaitMs:
    captureMetrics.total === 0
      ? 0
      : captureMetrics.totalQueueWaitMs / captureMetrics.total
})

const updateCaptureMetrics = (
  captureMetrics: WebcamMutableCaptureMetrics,
  metric: WebcamCaptureMetric
) => {
  captureMetrics.total += 1
  captureMetrics.bytesRead += metric.bytes
  captureMetrics.totalElapsedMs += metric.elapsedMs
  captureMetrics.totalQueueWaitMs += metric.queueWaitMs
  captureMetrics.maxElapsedMs = Math.max(
    captureMetrics.maxElapsedMs,
    metric.elapsedMs
  )
  captureMetrics.maxQueueWaitMs = Math.max(
    captureMetrics.maxQueueWaitMs,
    metric.queueWaitMs
  )

  if (metric.status === 'succeeded') captureMetrics.succeeded += 1
  else captureMetrics.failed += 1

  if (metric.code === 'COMMAND_ABORTED') captureMetrics.aborted += 1
  if (
    metric.code === 'COMMAND_TIMEOUT' ||
    metric.code === 'NATIVE_FRAME_TIMEOUT'
  )
    captureMetrics.timedOut += 1
}

const recordCaptureMetric = (metric: WebcamCaptureMetric) => {
  updateCaptureMetrics(metrics.captures, metric)

  metrics.byBackend[metric.backend] =
    metrics.byBackend[metric.backend] ?? createCaptureMetrics()

  updateCaptureMetrics(metrics.byBackend[metric.backend], metric)

  updateCaptureMetrics(metrics.byBackendType[metric.backendType], metric)
}

const getMetricsReport = (): WebcamMetricsReport => ({
  captures: finalizeCaptureMetrics(metrics.captures),
  byBackend: Object.fromEntries(
    Object.entries(metrics.byBackend).map(([backend, backendMetrics]) => [
      backend,
      finalizeCaptureMetrics(backendMetrics)
    ])
  ),
  byBackendType: {
    ffmpeg: finalizeCaptureMetrics(metrics.byBackendType.ffmpeg),
    legacy: finalizeCaptureMetrics(metrics.byBackendType.legacy),
    native: finalizeCaptureMetrics(metrics.byBackendType.native)
  }
})

const resetMetrics = () => {
  metrics = {
    captures: createCaptureMetrics(),
    byBackend: {},
    byBackendType: {
      ffmpeg: createCaptureMetrics(),
      legacy: createCaptureMetrics(),
      native: createCaptureMetrics()
    }
  }
}

export { getMetricsReport, recordCaptureMetric, resetMetrics }
