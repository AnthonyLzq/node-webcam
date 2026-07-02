import { existsSync } from 'fs'
import { resolve } from 'path'

export type NativeV4l2Options = {
  device: string
  height: number
  timeoutMs: number
  width: number
}

export type NativeWebcamAddon = {
  captureMjpeg(options: NativeV4l2Options): Buffer
  isAvailable(options: NativeV4l2Options): boolean
}

const nativeAddonFile = ['build', 'Release', 'node_webcam_native.node']
const defaultNativeAddonPaths = [
  resolve(__dirname, '..', ...nativeAddonFile),
  resolve(__dirname, '..', '..', ...nativeAddonFile),
  resolve(process.cwd(), ...nativeAddonFile)
]
const defaultNativeAddonPath = defaultNativeAddonPaths[0]

const isNativeWebcamAddon = (
  candidate: unknown
): candidate is NativeWebcamAddon =>
  typeof candidate === 'object' &&
  candidate !== null &&
  'isAvailable' in candidate &&
  'captureMjpeg' in candidate &&
  typeof candidate.isAvailable === 'function' &&
  typeof candidate.captureMjpeg === 'function'

const loadNativeWebcamAddon = (addonPath?: string) => {
  const addonPaths = addonPath ? [addonPath] : defaultNativeAddonPaths
  const resolvedAddonPath = addonPaths.find(path => existsSync(path))

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  if (!resolvedAddonPath) return undefined

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const candidate: unknown = require(resolvedAddonPath)

  if (!isNativeWebcamAddon(candidate)) return undefined

  return candidate
}

export {
  defaultNativeAddonPath,
  defaultNativeAddonPaths,
  loadNativeWebcamAddon
}
