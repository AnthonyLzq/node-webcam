#!/usr/bin/env node

const { execFileSync } = require('child_process')

const report = process.report?.getReport?.()
const glibcVersion = report?.header?.glibcVersionRuntime

if (process.platform !== 'linux' || process.arch !== 'x64' || !glibcVersion)
  throw new Error(
    'Publishing currently requires a Linux x64 glibc environment so the bundled native prebuild is rebuilt for the package tarball.'
  )

const run = (command, args) =>
  execFileSync(command, args, {
    stdio: 'inherit'
  })

run('npm', ['run', 'native:prebuild'])
run('npm', ['run', 'pack:check'])
