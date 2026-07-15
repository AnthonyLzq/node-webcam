#!/usr/bin/env node

const { createHash } = require('crypto')
const { readdirSync, readFileSync, writeFileSync } = require('fs')
const { join, relative, resolve, sep } = require('path')

const root = resolve(__dirname, '..')
const manifestPath = join(root, 'prebuilds', 'native-manifest.json')
const sourceEntries = [
  'binding.gyp',
  'native/linux_v4l2.cc',
  'native/unsupported.cc'
]

const toPackagePath = filePath => relative(root, filePath).split(sep).join('/')

const sha256 = filePath =>
  createHash('sha256').update(readFileSync(filePath)).digest('hex')

const listFiles = directory => {
  const files = []

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) files.push(...listFiles(entryPath))
    else files.push(entryPath)
  }

  return files
}

const prebuildEntries = listFiles(join(root, 'prebuilds'))
  .filter(file => file.endsWith('.node'))
  .map(toPackagePath)
  .sort()

if (prebuildEntries.length === 0)
  throw new Error('Cannot write native manifest without native prebuilds')

const manifest = {
  version: 1,
  algorithm: 'sha256',
  sources: Object.fromEntries(
    sourceEntries.map(entry => [entry, sha256(join(root, entry))])
  ),
  prebuilds: Object.fromEntries(
    prebuildEntries.map(entry => [entry, sha256(join(root, entry))])
  )
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${toPackagePath(manifestPath)}`)
