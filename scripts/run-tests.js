#!/usr/bin/env node

const { spawnSync } = require('child_process')
const { readdirSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const testsRoot = join(root, 'tests')

const listTestFiles = directory => {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) files.push(...listTestFiles(entryPath))
    else if (entry.name.endsWith('.test.ts')) files.push(entryPath)
  }

  return files.sort()
}

const testFiles = listTestFiles(testsRoot)

if (testFiles.length === 0) throw new Error('No test files found')

const result = spawnSync(
  process.execPath,
  ['--test', '-r', 'ts-node/register', ...testFiles],
  {
    cwd: root,
    stdio: 'inherit'
  }
)

if (result.error) throw result.error

process.exitCode = result.status ?? 1
