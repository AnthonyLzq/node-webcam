#!/usr/bin/env node
// @ts-check

const { existsSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')

/**
 * @typedef {object} NativeV4l2Options
 * @property {string} device
 * @property {number} [height]
 * @property {number} [timeoutMs]
 * @property {number} [width]
 */

/**
 * @typedef {object} NativeV4l2Addon
 * @property {(options: NativeV4l2Options) => boolean} isAvailable
 * @property {(options: NativeV4l2Options) => Buffer} captureMjpeg
 */

/**
 * @param {string} addonPath
 * @returns {NativeV4l2Addon}
 */
const loadNativeAddon = addonPath => {
  const candidate = require(addonPath)

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    typeof candidate.isAvailable !== 'function' ||
    typeof candidate.captureMjpeg !== 'function'
  )
    throw new Error(`Native addon has an unexpected shape: ${addonPath}`)

  return candidate
}

if (process.platform !== 'linux') {
  console.log('Skipping native V4L2 smoke test on non-Linux platform.')
  process.exit(0)
}

const addonPath = join(
  __dirname,
  '..',
  'build',
  'Release',
  'node_webcam_native.node'
)

if (!existsSync(addonPath)) {
  throw new Error(`Native addon is not built: ${addonPath}`)
}

const addon = loadNativeAddon(addonPath)
const device = process.env.NODE_WEBCAM_NATIVE_DEVICE || '/dev/video0'

if (!addon.isAvailable({ device })) {
  console.log(
    `Skipping native V4L2 smoke test; ${device} is not available or does not support MJPEG.`
  )
  process.exit(0)
}

const buffer = addon.captureMjpeg({
  device,
  height: Number(process.env.NODE_WEBCAM_NATIVE_HEIGHT || 720),
  timeoutMs: Number(process.env.NODE_WEBCAM_NATIVE_TIMEOUT_MS || 2000),
  width: Number(process.env.NODE_WEBCAM_NATIVE_WIDTH || 1280)
})
const output = join(tmpdir(), `node-webcam-native-${process.pid}.jpg`)

if (buffer[0] !== 0xff || buffer[1] !== 0xd8)
  throw new Error('Native V4L2 capture did not return a JPEG buffer.')

writeFileSync(output, buffer)

console.log(`Captured ${buffer.length} bytes from ${device} to ${output}`)

if (process.env.NODE_WEBCAM_NATIVE_KEEP_OUTPUT !== '1') {
  rmSync(output, { force: true })
  console.log('Removed native V4L2 smoke test output.')
}
