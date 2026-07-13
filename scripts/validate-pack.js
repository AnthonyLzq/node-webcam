#!/usr/bin/env node

const { execFileSync } = require('child_process')
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require('fs')
const { tmpdir } = require('os')
const { join, resolve } = require('path')

const root = resolve(__dirname, '..')
const forbiddenPackageEntries = /^(?:\.goals|docs|examples|src|tests|tsconfig|\.(?:github|vscode))(?:\/|$)/
const requiredPackageEntries = [
  'LICENSE',
  'README.md',
  'bin/node-webcam.js',
  'bin/setup.js',
  'binding.gyp',
  'dist/cjs/index.js',
  'dist/esm/index.js',
  'dist/esm/package.json',
  'dist/types/index.d.ts',
  'native/linux_v4l2.cc',
  'native/unsupported.cc',
  'package.json'
]

const exec = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options
  })

const parsePackOutput = output => {
  const start = output.indexOf('[')

  if (start === -1) throw new Error(`Unable to parse npm pack output: ${output}`)

  return JSON.parse(output.slice(start))[0]
}

let tarballPath
let consumerDirectory
let lifecycleConsumerDirectory

try {
  const pack = parsePackOutput(exec('npm', ['pack', '--json', '--ignore-scripts']))
  tarballPath = join(root, pack.filename)
  const packageEntries = pack.files.map(file => file.path)
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const forbiddenEntries = packageEntries.filter(entry =>
    forbiddenPackageEntries.test(entry)
  )
  const legacyCommandCamEntries = packageEntries.filter(entry =>
    /^dist\/(?:cjs|esm)\/bindings\/CommandCam\//.test(entry)
  )
  const missingEntries = requiredPackageEntries.filter(
    entry => !packageEntries.includes(entry)
  )
  const nativePrebuildEntries = packageEntries.filter(entry =>
    /^prebuilds\/linux-[^/]+\/.+\.node$/.test(entry)
  )
  const untaggedLinuxPrebuildEntries = nativePrebuildEntries.filter(
    entry => !/\.(?:glibc|musl)\.node$/.test(entry)
  )

  if (forbiddenEntries.length > 0)
    throw new Error(
      `Unexpected entries in package tarball: ${forbiddenEntries.join(', ')}`
    )

  if (legacyCommandCamEntries.length > 0)
    throw new Error(
      `Unexpected legacy CommandCam bindings in package tarball: ${legacyCommandCamEntries.join(
        ', '
      )}`
    )

  if (missingEntries.length > 0)
    throw new Error(
      `Required entries missing from package tarball: ${missingEntries.join(', ')}`
    )

  if (nativePrebuildEntries.length === 0)
    throw new Error('Required Linux native prebuild missing from package tarball')

  if (JSON.stringify(Object.keys(packageJson.exports ?? {})) !== JSON.stringify(['.']))
    throw new Error('Package exports must remain root-only until public subpaths are approved')

  if (untaggedLinuxPrebuildEntries.length > 0)
    throw new Error(
      `Linux native prebuilds must include a libc tag: ${untaggedLinuxPrebuildEntries.join(
        ', '
      )}`
    )

  consumerDirectory = mkdtempSync(join(tmpdir(), 'node-webcam-consumer-'))

  writeFileSync(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({ name: 'node-webcam-consumer', private: true }, null, 2)
  )

  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      tarballPath
    ],
    {
      cwd: consumerDirectory,
      stdio: 'ignore'
    }
  )

  lifecycleConsumerDirectory = mkdtempSync(
    join(tmpdir(), 'node-webcam-lifecycle-consumer-')
  )

  writeFileSync(
    join(lifecycleConsumerDirectory, 'package.json'),
    JSON.stringify(
      { name: 'node-webcam-lifecycle-consumer', private: true },
      null,
      2
    )
  )

  execFileSync(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      tarballPath
    ],
    {
      cwd: lifecycleConsumerDirectory,
      stdio: 'ignore'
    }
  )

  execFileSync(
    process.execPath,
    [
      '-e',
      [
        "const webcam = require('@anthonylzq/node-webcam')",
        "for (const key of ['capture', 'create', 'list', 'listWebcams', 'getMetricsReport', 'resetMetrics']) {",
        "  if (typeof webcam[key] !== 'function') throw new Error(`Missing export: ${key}`)",
        '}',
        "const instance = webcam.create({ output: 'jpeg', saveShots: false })",
        "if (!['native', 'legacy'].includes(instance.getBackendType())) throw new Error('Unexpected backend type')"
      ].join('\n')
    ],
    {
      cwd: consumerDirectory,
      stdio: 'ignore'
    }
  )

  writeFileSync(
    join(consumerDirectory, 'index.mjs'),
    [
      "import * as webcam from '@anthonylzq/node-webcam'",
      "for (const key of ['capture', 'create', 'list', 'listWebcams', 'getMetricsReport', 'resetMetrics']) {",
      "  if (typeof webcam[key] !== 'function') throw new Error(`Missing ESM export: ${key}`)",
      '}',
      "const instance = webcam.create({ output: 'jpeg', saveShots: false })",
      "if (!['native', 'legacy'].includes(instance.getBackendType())) throw new Error('Unexpected ESM backend type')"
    ].join('\n')
  )

  execFileSync(process.execPath, ['index.mjs'], {
    cwd: consumerDirectory,
    stdio: 'ignore'
  })

  writeFileSync(
    join(consumerDirectory, 'index.ts'),
    [
      "import { capture, create, getMetricsReport, listWebcams, type NodeWebcamConfig, type WebcamMetricsReport } from '@anthonylzq/node-webcam'",
      "const options: Partial<NodeWebcamConfig> = { device: false, output: 'jpg', save: false, timeout: 1 }",
      'const webcam = create(options)',
      'void webcam.listWebcams()',
      'void listWebcams()',
      'void capture({ location: "photo.jpg", options }).then(result => result.buffer)',
      'const report: WebcamMetricsReport = getMetricsReport()',
      'const total: number = report.captures.total',
      'void total'
    ].join('\n')
  )

  writeFileSync(
    join(consumerDirectory, 'index.mts'),
    [
      "import { capture, create, getMetricsReport, listWebcams, type NodeWebcamConfig, type WebcamMetricsReport } from '@anthonylzq/node-webcam'",
      "const options: Partial<NodeWebcamConfig> = { device: false, output: 'jpg', save: async (_path, _buffer) => false, timeout: 1 }",
      'const webcam = create(options)',
      'void webcam.listWebcams()',
      'void listWebcams()',
      'void capture({ location: "photo.jpg", options }).then(result => result.toBase64())',
      'const report: WebcamMetricsReport = getMetricsReport()',
      'const total: number = report.captures.total',
      'void total'
    ].join('\n')
  )

  writeFileSync(
    join(consumerDirectory, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'Node16',
          moduleResolution: 'node16',
          skipLibCheck: true,
          strict: true,
          target: 'ES2020',
          typeRoots: [join(root, 'node_modules', '@types')]
        },
        include: ['index.ts', 'index.mts']
      },
      null,
      2
    )
  )

  const tscPath = join(root, 'node_modules', 'typescript', 'lib', 'tsc.js')

  if (!existsSync(tscPath)) throw new Error(`Missing TypeScript compiler: ${tscPath}`)

  execFileSync(process.execPath, [tscPath, '-p', 'tsconfig.json'], {
    cwd: consumerDirectory,
    stdio: 'ignore'
  })

  execFileSync(
    process.platform === 'win32'
      ? join(consumerDirectory, 'node_modules', '.bin', 'node-webcam.cmd')
      : join(consumerDirectory, 'node_modules', '.bin', 'node-webcam'),
    ['setup', 'windows'],
    {
      cwd: consumerDirectory,
      stdio: 'ignore'
    }
  )

  console.log(
    `Validated package tarball (${pack.entryCount} files) and temporary consumer.`
  )
} finally {
  if (tarballPath) rmSync(tarballPath, { force: true })
  if (consumerDirectory)
    rmSync(consumerDirectory, { force: true, recursive: true })
  if (lifecycleConsumerDirectory)
    rmSync(lifecycleConsumerDirectory, { force: true, recursive: true })
}
