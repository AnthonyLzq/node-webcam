#!/usr/bin/env node

const { createHash } = require('crypto')
const { readFileSync } = require('fs')
const { join, resolve } = require('path')

const root = resolve(__dirname, '..')
const manifestPath = join(root, 'prebuilds', 'native-manifest.json')

const sha256 = entry =>
  createHash('sha256')
    .update(readFileSync(join(root, ...entry.split('/'))))
    .digest('hex')

const assertObject = (value, label) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Invalid native manifest ${label}`)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

assertObject(manifest, 'root')
assertObject(manifest.sources, 'sources')
assertObject(manifest.prebuilds, 'prebuilds')

if (manifest.version !== 1)
  throw new Error(`Unsupported native manifest version: ${manifest.version}`)

if (manifest.algorithm !== 'sha256')
  throw new Error(`Unsupported native manifest algorithm: ${manifest.algorithm}`)

for (const entry of [
  ...Object.keys(manifest.sources),
  ...Object.keys(manifest.prebuilds)
]) {
  const expectedHash = manifest.sources[entry] ?? manifest.prebuilds[entry]
  const actualHash = sha256(entry)

  if (expectedHash !== actualHash)
    throw new Error(
      `Native manifest hash mismatch for ${entry}: expected ${expectedHash}, received ${actualHash}`
    )
}

console.log('Native prebuild manifest is fresh.')
