import { existsSync } from 'fs'
import { createRequire } from 'module'
import { join, resolve } from 'path'

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
const requireFromNative = createRequire(resolve(__dirname, 'native.js'))
const defaultNativePackageRoots = [
  resolve(__dirname, '..', '..'),
  resolve(__dirname, '..')
]
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
  if (process.platform !== 'linux') return undefined

  if (addonPath) {
    if (!existsSync(addonPath)) return undefined

    const candidate: unknown = requireFromNative(addonPath)

    if (!isNativeWebcamAddon(candidate)) return undefined

    return candidate
  }

  for (const packageRoot of defaultNativePackageRoots) {
    if (!existsSync(join(packageRoot, 'package.json'))) continue

    try {
      const nodeGypBuild = requireFromNative('node-gyp-build') as (
        dir: string
      ) => unknown
      const candidate = nodeGypBuild(packageRoot)

      if (isNativeWebcamAddon(candidate)) return candidate
    } catch (_error) {
      continue
    }
  }

  return undefined
}

export {
  defaultNativeAddonPath,
  defaultNativePackageRoots,
  defaultNativeAddonPaths,
  loadNativeWebcamAddon
}
