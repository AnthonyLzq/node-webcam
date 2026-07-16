#!/usr/bin/env node

const { execFileSync } = require('child_process')
const { existsSync, readFileSync } = require('fs')
const { join, resolve } = require('path')

const root = resolve(__dirname, '..')
const packageJson = require('../package.json')
const changelogPath = join(root, 'CHANGELOG.md')
const version = packageJson.version

if (!version) throw new Error('Unable to update changelog without package version')

const changelog = existsSync(changelogPath)
  ? readFileSync(changelogPath, 'utf8')
  : ''
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const versionHeading = new RegExp(
  `^## \\[?${escapedVersion}(?:\\]|\\s|$)`,
  'm'
)

if (versionHeading.test(changelog)) {
  console.log(`CHANGELOG.md already contains ${version}`)
  process.exit(0)
}

const standardVersionBin = require.resolve('standard-version/bin/cli.js')

execFileSync(process.execPath, [standardVersionBin, '--release-as', version], {
  cwd: root,
  stdio: 'inherit'
})
