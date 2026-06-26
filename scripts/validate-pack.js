#!/usr/bin/env node

const { execFileSync } = require('child_process')
const {
  existsSync,
  mkdtempSync,
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
  'bin/postinstall.js',
  'dist/index.d.ts',
  'dist/index.js',
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

try {
  const pack = parsePackOutput(exec('npm', ['pack', '--json', '--ignore-scripts']))
  const packageEntries = pack.files.map(file => file.path)
  const forbiddenEntries = packageEntries.filter(entry =>
    forbiddenPackageEntries.test(entry)
  )
  const missingEntries = requiredPackageEntries.filter(
    entry => !packageEntries.includes(entry)
  )

  if (forbiddenEntries.length > 0)
    throw new Error(
      `Unexpected entries in package tarball: ${forbiddenEntries.join(', ')}`
    )

  if (missingEntries.length > 0)
    throw new Error(
      `Required entries missing from package tarball: ${missingEntries.join(', ')}`
    )

  tarballPath = join(root, pack.filename)
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

  execFileSync(
    process.execPath,
    [
      '-e',
      [
        "const webcam = require('@anthonylzq/node-webcam')",
        "for (const key of ['capture', 'create', 'list', 'listWebcams', 'getMetricsReport', 'resetMetrics']) {",
        "  if (typeof webcam[key] !== 'function') throw new Error(`Missing export: ${key}`)",
        '}'
      ].join('\n')
    ],
    {
      cwd: consumerDirectory,
      stdio: 'ignore'
    }
  )

  writeFileSync(
    join(consumerDirectory, 'index.ts'),
    [
      "import { create, getMetricsReport, listWebcams, type NodeWebcamConfig, type WebcamMetricsReport } from '@anthonylzq/node-webcam'",
      "const options: Partial<NodeWebcamConfig> = { device: false, output: 'jpg', timeout: 1 }",
      "const webcam = create(options, 'linux')",
      'void webcam.listWebcams()',
      "void listWebcams('linux')",
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
        include: ['index.ts']
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

  console.log(
    `Validated package tarball (${pack.entryCount} files) and temporary consumer.`
  )
} finally {
  if (tarballPath) rmSync(tarballPath, { force: true })
  if (consumerDirectory)
    rmSync(consumerDirectory, { force: true, recursive: true })
}
