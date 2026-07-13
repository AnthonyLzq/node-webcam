#!/usr/bin/env node

const crypto = require('node:crypto')
const fs = require('node:fs')
const https = require('node:https')
const os = require('node:os')
const path = require('node:path')
const packageJson = require('../package.json')

const {
  minBytes: MIN_COMMAND_CAM_BYTES,
  releaseTag: COMMAND_CAM_RELEASE_TAG,
  sha256: COMMAND_CAM_SHA256
} = packageJson.nodeWebcam.commandCam
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 15_000
const DEFAULT_MAX_REDIRECTS = 3
const SKIP_DOWNLOAD_VALUES = new Set(['1', 'true', 'yes'])
const STRICT_DOWNLOAD_VALUES = new Set(['1', 'true', 'yes'])

const getRepositorySlug = () => {
  const repository =
    typeof packageJson.repository === 'string'
      ? packageJson.repository
      : packageJson.repository?.url
  const match = repository?.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?/)

  if (match) return match[1]

  return `${packageJson.maintainers[0].name}/${packageJson.name.replace(
    /^@[^/]+\//,
    ''
  )}`
}

const getCommandCamDownloadUrl = ({ env = process.env } = {}) => {
  if (env.NODE_WEBCAM_COMMANDCAM_URL) return env.NODE_WEBCAM_COMMANDCAM_URL

  const releaseTag =
    env.NODE_WEBCAM_COMMANDCAM_RELEASE_TAG || COMMAND_CAM_RELEASE_TAG

  return `https://github.com/${getRepositorySlug()}/releases/download/${releaseTag}/CommandCam.exe`
}

const getCommandCamBaseDirectory = ({
  env = process.env,
  homedir = os.homedir()
} = {}) => {
  if (env.NODE_WEBCAM_COMMANDCAM_DIR) return env.NODE_WEBCAM_COMMANDCAM_DIR

  return path.join(
    env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local'),
    'node-webcam',
    'CommandCam'
  )
}

const getCommandCamPath = (options = {}) =>
  path.join(getCommandCamBaseDirectory(options), 'CommandCam.exe')

const getCommandCamTargetFiles = options => [getCommandCamPath(options)]

const getTimeoutMs = env => {
  const timeout = Number(env.NODE_WEBCAM_COMMANDCAM_TIMEOUT_MS)

  if (Number.isFinite(timeout) && timeout > 0) return timeout

  return DEFAULT_DOWNLOAD_TIMEOUT_MS
}

const getExpectedSha256 = env =>
  env.NODE_WEBCAM_COMMANDCAM_SHA256 || COMMAND_CAM_SHA256

const isEnabled = (values, value) =>
  typeof value === 'string' && values.has(value.toLowerCase())

const hashBuffer = buffer =>
  crypto.createHash('sha256').update(buffer).digest('hex')

const verifyCommandCamBuffer = ({
  buffer,
  expectedSha256,
  minBytes = MIN_COMMAND_CAM_BYTES
}) => {
  if (buffer.length < minBytes)
    throw new Error(
      `CommandCam.exe download is too small: ${buffer.length} bytes`
    )

  const actualSha256 = hashBuffer(buffer)

  if (actualSha256 !== expectedSha256)
    throw new Error(
      `CommandCam.exe checksum mismatch: expected ${expectedSha256}, received ${actualSha256}`
    )
}

const existingTargetsAreValid = ({ expectedSha256, targetFiles }) =>
  targetFiles.every(file => {
    if (!fs.existsSync(file)) return false

    const buffer = fs.readFileSync(file)

    try {
      verifyCommandCamBuffer({ buffer, expectedSha256 })

      return true
    } catch (_error) {
      return false
    }
  })

const resolveRedirectUrl = (url, location) => new URL(location, url).toString()

const downloadCommandCam = ({
  maxRedirects = DEFAULT_MAX_REDIRECTS,
  timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS,
  url
}) =>
  new Promise((resolve, reject) => {
    const requestUrl = url

    const makeRequest = (nextUrl, redirectsRemaining) => {
      const request = https.get(nextUrl, response => {
        const { location } = response.headers
        const statusCode = response.statusCode ?? 0
        const isRedirect = [301, 302, 303, 307, 308].includes(statusCode)

        if (isRedirect) {
          response.resume()

          if (!location) {
            reject(new Error(`CommandCam.exe redirect missing Location header`))

            return
          }

          if (redirectsRemaining <= 0) {
            reject(new Error(`CommandCam.exe exceeded redirect limit`))

            return
          }

          makeRequest(
            resolveRedirectUrl(nextUrl, location),
            redirectsRemaining - 1
          )

          return
        }

        if (statusCode !== 200) {
          response.resume()
          reject(
            new Error(
              `CommandCam.exe download failed with HTTP status ${statusCode}`
            )
          )

          return
        }

        const chunks = []

        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => resolve(Buffer.concat(chunks)))
        response.on('error', reject)
      })

      request.setTimeout(timeoutMs, () => {
        request.destroy(
          new Error(
            `CommandCam.exe download timed out after ${timeoutMs}ms: ${requestUrl}`
          )
        )
      })
      request.on('error', reject)
    }

    makeRequest(url, maxRedirects)
  })

const writeCommandCamTargets = ({ buffer, targetFiles }) => {
  for (const file of targetFiles) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, buffer)
  }
}

const installCommandCam = async ({
  download = downloadCommandCam,
  env = process.env,
  logger = console,
  platform = os.platform(),
  strict = isEnabled(STRICT_DOWNLOAD_VALUES, env.NODE_WEBCAM_COMMANDCAM_STRICT),
  targetFiles = getCommandCamTargetFiles({ env })
} = {}) => {
  if (!platform.match(/win/)) return { status: 'skipped', reason: 'platform' }

  if (isEnabled(SKIP_DOWNLOAD_VALUES, env.NODE_WEBCAM_SKIP_COMMANDCAM_DOWNLOAD))
    return { status: 'skipped', reason: 'env' }

  const expectedSha256 = getExpectedSha256(env)

  if (existingTargetsAreValid({ expectedSha256, targetFiles }))
    return { status: 'skipped', reason: 'exists' }

  const url = getCommandCamDownloadUrl({ env })
  const timeoutMs = getTimeoutMs(env)

  logger.info(`Downloading CommandCam.exe from ${url}`)

  try {
    const buffer = await download({ timeoutMs, url })

    verifyCommandCamBuffer({ buffer, expectedSha256 })
    writeCommandCamTargets({ buffer, targetFiles })

    for (const file of targetFiles) logger.info(`Installed ${file}`)

    return { status: 'installed', targetFiles }
  } catch (error) {
    if (strict) throw error

    logger.warn(
      `Unable to install CommandCam.exe automatically: ${error.message}`
    )
    logger.warn(
      'Windows webcam capture will require a manually installed CommandCam.exe or NODE_WEBCAM_COMMANDCAM_PATH.'
    )

    return { error, status: 'failed' }
  }
}

module.exports = {
  COMMAND_CAM_SHA256,
  COMMAND_CAM_RELEASE_TAG,
  downloadCommandCam,
  getCommandCamBaseDirectory,
  getCommandCamDownloadUrl,
  getCommandCamPath,
  getCommandCamTargetFiles,
  installCommandCam,
  resolveRedirectUrl,
  verifyCommandCamBuffer
}
