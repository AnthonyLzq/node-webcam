import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

type CaptureBackend = 'ffmpeg' | 'fswebcam' | 'native'

type NativeV4l2Options = {
  device: string
  height: number
  timeoutMs: number
  width: number
}

type NativeV4l2Addon = {
  captureMjpeg(options: NativeV4l2Options): Buffer
  isAvailable(options: NativeV4l2Options): boolean
}

type CaptureStats = {
  averageBytes: number
  captures: number
  maxMs: number
  meanMs: number
  medianMs: number
  minMs: number
  p95Ms: number
  totalMs: number
}

type BenchmarkReport = {
  backends: CaptureBackend[]
  device: string
  generatedAt: string
  height: number
  iterations: number
  outputRoot: string
  results: Partial<Record<CaptureBackend, CaptureStats>>
  warmup: number
  width: number
}

const root = resolve(__dirname, '..')
const outputRoot = join(root, 'tmp', 'benchmarks', `capture-${Date.now()}`)

const getArg = (name: string, defaultValue: string) => {
  const prefix = `--${name}=`
  const arg = process.argv.find(value => value.startsWith(prefix))

  return arg ? arg.slice(prefix.length) : defaultValue
}

const getNumberArg = (name: string, defaultValue: number) => {
  const value = Number(getArg(name, String(defaultValue)))

  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`Invalid --${name}: ${value}`)

  return value
}

const hasCommand = (command: string) => {
  try {
    execFileSync('sh', ['-c', 'command -v "$1"', 'sh', command], {
      stdio: 'ignore'
    })

    return true
  } catch (_error) {
    return false
  }
}

const isBackend = (value: string): value is CaptureBackend =>
  value === 'native' || value === 'ffmpeg' || value === 'fswebcam'

const getBackends = (): CaptureBackend[] => {
  const requested = getArg(
    'backends',
    process.env.NODE_WEBCAM_BENCHMARK_BACKENDS || 'native,fswebcam'
  )
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  const backends: CaptureBackend[] = []

  for (const backend of requested) {
    if (!isBackend(backend))
      throw new Error(
        `Invalid backend "${backend}". Expected native, ffmpeg or fswebcam.`
      )

    backends.push(backend)
  }

  return backends
}

const formatMs = (value: number) => `${value.toFixed(2)}ms`

const formatBytes = (value: number) =>
  new Intl.NumberFormat('en-US').format(value)

const createBar = (value: number, max: number, width = 20) => {
  const filled = Math.max(1, Math.round((value / max) * width))

  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
}

const toMarkdownTable = (report: BenchmarkReport) => {
  const lines = [
    '# Capture backend benchmark',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Device: \`${report.device}\``,
    `- Resolution: ${report.width}x${report.height}`,
    `- Timed captures per backend: ${report.iterations}`,
    `- Warmup captures per backend: ${report.warmup}`,
    '',
    '| Backend | Captures | Total | Mean | Median | p95 | Min | Max | Avg bytes |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  ]

  for (const backend of report.backends) {
    const result = report.results[backend]

    if (!result) continue

    lines.push(
      [
        `| ${backend}`,
        result.captures,
        formatMs(result.totalMs),
        formatMs(result.meanMs),
        formatMs(result.medianMs),
        formatMs(result.p95Ms),
        formatMs(result.minMs),
        formatMs(result.maxMs),
        formatBytes(result.averageBytes)
      ].join(' | ') + ' |'
    )
  }

  lines.push('')

  const means = report.backends
    .map(backend => report.results[backend]?.meanMs)
    .filter((value): value is number => typeof value === 'number')
  const maxMean = Math.max(...means, 1)

  lines.push(
    'Relative mean latency, scaled to the slowest backend in this run:',
    '',
    '| Backend | Mean latency | Relative bar |',
    '| --- | ---: | --- |'
  )

  for (const backend of report.backends) {
    const result = report.results[backend]

    if (!result) continue

    lines.push(
      `| ${backend} | ${formatMs(result.meanMs)} | \`${createBar(
        result.meanMs,
        maxMean
      )}\` |`
    )
  }

  lines.push('')

  return `${lines.join('\n')}\n`
}

const loadNativeAddon = (addonPath: string): NativeV4l2Addon => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const candidate: unknown = require(addonPath)

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('isAvailable' in candidate) ||
    !('captureMjpeg' in candidate) ||
    typeof candidate.isAvailable !== 'function' ||
    typeof candidate.captureMjpeg !== 'function'
  )
    throw new Error(`Native addon has an unexpected shape: ${addonPath}`)

  return candidate as NativeV4l2Addon
}

const stats = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((acc, value) => acc + value, 0)
  const percentile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]

  return {
    totalMs: Number(sum.toFixed(2)),
    meanMs: Number((sum / values.length).toFixed(2)),
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
    p95Ms: Number(percentile(95).toFixed(2)),
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2))
  }
}

const summarize = ({
  bytes,
  times
}: {
  bytes: number[]
  times: number[]
}): CaptureStats => ({
  ...stats(times),
  averageBytes: Math.round(
    bytes.reduce((acc, value) => acc + value, 0) / bytes.length
  ),
  captures: times.length
})

const measure = (capture: () => number) => {
  const started = process.hrtime.bigint()
  const bytes = capture()
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000

  return { bytes, elapsedMs }
}

const assertJpeg = (buffer: Buffer, backend: string) => {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8)
    throw new Error(`${backend} capture did not return JPEG bytes.`)
}

const getOutputPath = (backend: CaptureBackend, index: number) =>
  join(
    outputRoot,
    backend,
    index < 0
      ? `${backend}-warmup-${String(Math.abs(index)).padStart(3, '0')}.jpg`
      : `${backend}-${String(index).padStart(3, '0')}.jpg`
  )

const iterations = getNumberArg(
  'iterations',
  Number(process.env.NODE_WEBCAM_BENCHMARK_ITERATIONS || 100)
)
const warmup = getNumberArg(
  'warmup',
  Number(process.env.NODE_WEBCAM_BENCHMARK_WARMUP || 3)
)
const width = getNumberArg(
  'width',
  Number(process.env.NODE_WEBCAM_NATIVE_WIDTH || 1280)
)
const height = getNumberArg(
  'height',
  Number(process.env.NODE_WEBCAM_NATIVE_HEIGHT || 720)
)
const timeoutMs = getNumberArg(
  'timeout-ms',
  Number(process.env.NODE_WEBCAM_NATIVE_TIMEOUT_MS || 5000)
)
const device = getArg(
  'device',
  process.env.NODE_WEBCAM_NATIVE_DEVICE || '/dev/video0'
)
const backends = getBackends()
const addonPath = join(root, 'build', 'Release', 'node_webcam_native.node')
const nativeAddon = existsSync(addonPath)
  ? loadNativeAddon(addonPath)
  : undefined

mkdirSync(outputRoot, { recursive: true })

const captures: Record<CaptureBackend, (index: number) => number> = {
  native: index => {
    if (!nativeAddon) throw new Error(`Native addon is not built: ${addonPath}`)

    if (!nativeAddon.isAvailable({ device, height, timeoutMs, width }))
      throw new Error(
        `Native V4L2 addon is not available for ${device} at ${width}x${height}`
      )

    const output = getOutputPath('native', index)
    const buffer = nativeAddon.captureMjpeg({
      device,
      height,
      timeoutMs,
      width
    })

    assertJpeg(buffer, 'Native')
    writeFileSync(output, buffer)

    return buffer.length
  },
  ffmpeg: index => {
    if (!hasCommand('ffmpeg')) throw new Error('ffmpeg was not found in PATH.')

    const output = getOutputPath('ffmpeg', index)

    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'video4linux2',
        '-input_format',
        'mjpeg',
        '-video_size',
        `${width}x${height}`,
        '-i',
        device,
        '-frames:v',
        '1',
        '-y',
        output
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    return statSync(output).size
  },
  fswebcam: index => {
    if (!hasCommand('fswebcam'))
      throw new Error('fswebcam was not found in PATH.')

    const output = getOutputPath('fswebcam', index)

    execFileSync(
      'fswebcam',
      [
        '-q',
        '-r',
        `${width}x${height}`,
        '-F',
        '1',
        '-D',
        '0',
        '--no-banner',
        '--jpeg',
        '-1',
        output
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )

    return statSync(output).size
  }
}

console.log(
  `Benchmarking ${iterations} captures and ${warmup} warmups for ${backends.join(
    ', '
  )} at ${width}x${height} on ${device}`
)

const results: BenchmarkReport['results'] = {}

for (const backend of backends) {
  const times = []
  const bytes = []

  mkdirSync(join(outputRoot, backend), { recursive: true })

  for (let index = 0; index < warmup; index += 1) captures[backend](-index - 1)

  for (let index = 0; index < iterations; index += 1) {
    const result = measure(() => captures[backend](index))

    times.push(result.elapsedMs)
    bytes.push(result.bytes)
  }

  results[backend] = summarize({ bytes, times })
}

const report: BenchmarkReport = {
  backends,
  device,
  generatedAt: new Date().toISOString(),
  height,
  iterations,
  outputRoot,
  results,
  warmup,
  width
}

writeFileSync(
  join(outputRoot, 'results.json'),
  `${JSON.stringify(report, null, 2)}\n`
)
writeFileSync(
  join(root, 'tmp', 'benchmark-results.json'),
  `${JSON.stringify(report, null, 2)}\n`
)
writeFileSync(join(outputRoot, 'results.md'), toMarkdownTable(report))
writeFileSync(
  join(root, 'tmp', 'benchmark-results.md'),
  toMarkdownTable(report)
)

console.log(JSON.stringify(report, null, 2))
