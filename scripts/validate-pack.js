#!/usr/bin/env node

const { execFileSync } = require('child_process')
const { createHash } = require('crypto')
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
const forbiddenPackageEntries = /^(?:\.goals|docs|examples|src|tests|tsconfig|binding\.gyp|native|\.(?:github|vscode))(?:\/|$)/
const requiredPackageEntries = [
  'LICENSE',
  'README.md',
  'bin/node-webcam.js',
  'bin/setup.js',
  'dist/cjs/index.js',
  'dist/esm/index.js',
  'dist/esm/package.json',
  'dist/types/index.d.ts',
  'package.json',
  'prebuilds/native-manifest.json',
  'static/node-webcam.png'
]
const requiredNativeManifestSources = [
  'binding.gyp',
  'native/linux_v4l2.cc',
  'native/unsupported.cc'
]

const execNode = (args, options = {}) =>
  execFileSync(process.execPath, args, {
    cwd: root,
    stdio: 'ignore',
    ...options
  })

const quoteCmdArg = arg => `"${String(arg).replace(/"/g, '""')}"`

const execNpm = (args, options = {}) => {
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath))
    return execNode([process.env.npm_execpath, ...args], options)

  if (process.platform === 'win32')
    return execFileSync(
      process.env.ComSpec || 'cmd.exe',
      ['/d', '/s', '/c', ['npm', ...args.map(quoteCmdArg)].join(' ')],
      {
        cwd: root,
        stdio: 'ignore',
        ...options
      }
    )

  return execFileSync('npm', args, {
    cwd: root,
    stdio: 'ignore',
    ...options
  })
}

const parsePackOutput = output => {
  const start = output.indexOf('[')

  if (start === -1) throw new Error(`Unable to parse npm pack output: ${output}`)

  return JSON.parse(output.slice(start))[0]
}

const sha256 = entry =>
  createHash('sha256')
    .update(readFileSync(join(root, ...entry.split('/'))))
    .digest('hex')

const assertObject = (value, label) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Invalid native manifest ${label}`)
}

const assertNativeManifest = ({ nativePrebuildEntries, packageEntries }) => {
  const manifestEntry = 'prebuilds/native-manifest.json'
  const manifest = JSON.parse(readFileSync(join(root, manifestEntry), 'utf8'))

  assertObject(manifest, 'root')
  assertObject(manifest.sources, 'sources')
  assertObject(manifest.prebuilds, 'prebuilds')

  if (manifest.version !== 1)
    throw new Error(`Unsupported native manifest version: ${manifest.version}`)

  if (manifest.algorithm !== 'sha256')
    throw new Error(
      `Unsupported native manifest algorithm: ${manifest.algorithm}`
    )

  const sourceEntries = Object.keys(manifest.sources).sort()
  const prebuildEntries = Object.keys(manifest.prebuilds).sort()
  const expectedSourceEntries = [...requiredNativeManifestSources].sort()
  const expectedPrebuildEntries = [...nativePrebuildEntries].sort()

  if (JSON.stringify(sourceEntries) !== JSON.stringify(expectedSourceEntries))
    throw new Error(
      `Native manifest sources must be exactly: ${requiredNativeManifestSources.join(
        ', '
      )}`
    )

  if (JSON.stringify(prebuildEntries) !== JSON.stringify(expectedPrebuildEntries))
    throw new Error(
      `Native manifest prebuild entries do not match package prebuilds: ${prebuildEntries.join(
        ', '
      )}`
    )

  for (const entry of sourceEntries) {
    const expectedHash = manifest.sources[entry]
    const actualHash = sha256(entry)

    if (expectedHash !== actualHash)
      throw new Error(
        `Native manifest hash mismatch for ${entry}: expected ${expectedHash}, received ${actualHash}`
      )
  }

  for (const entry of prebuildEntries) {
    if (!packageEntries.includes(entry))
      throw new Error(`Native manifest entry missing from package: ${entry}`)

    const expectedHash = manifest.prebuilds[entry]
    const actualHash = sha256(entry)

    if (expectedHash !== actualHash)
      throw new Error(
        `Native manifest hash mismatch for ${entry}: expected ${expectedHash}, received ${actualHash}`
      )
  }
}

let tarballPath
let consumerDirectory
let lifecycleConsumerDirectory

try {
  const pack = parsePackOutput(execNpm(['pack', '--json', '--ignore-scripts'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }))
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
  const packageMajorVersion = Number.parseInt(
    String(packageJson.version).split('.')[0],
    10
  )
  const smokeOutput = process.platform === 'win32' ? 'bmp' : 'jpeg'

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

  assertNativeManifest({ nativePrebuildEntries, packageEntries })

  if (!Number.isFinite(packageMajorVersion) || packageMajorVersion < 3)
    throw new Error(
      `Breaking API changes must be published as a major version >= 3, received ${packageJson.version}`
    )

  if (JSON.stringify(Object.keys(packageJson.exports ?? {})) !== JSON.stringify(['.']))
    throw new Error('Package exports must remain root-only until public subpaths are approved')

  if (untaggedLinuxPrebuildEntries.length > 0)
    throw new Error(
      `Linux native prebuilds must include a libc tag: ${untaggedLinuxPrebuildEntries.join(
        ', '
      )}`
    )

  consumerDirectory = mkdtempSync(join(tmpdir(), 'node-webcam-consumer-'))
  const commandCamFixturePath = join(consumerDirectory, 'CommandCam.exe')
  const consumerEnv = {
    ...process.env,
    NODE_WEBCAM_COMMANDCAM_PATH: commandCamFixturePath,
    NODE_WEBCAM_SKIP_COMMANDCAM_DOWNLOAD: '1'
  }

  writeFileSync(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({ name: 'node-webcam-consumer', private: true }, null, 2)
  )
  writeFileSync(commandCamFixturePath, '')

  execNpm(
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
      env: consumerEnv,
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

  execNpm(
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

  execNode(
    [
      '-e',
      [
        "const webcam = require('@anthonylzq/node-webcam')",
        "for (const key of ['capture', 'clearBackendCaches', 'create', 'list', 'listWebcams', 'getMetricsReport', 'resetMetrics']) {",
        "  if (typeof webcam[key] !== 'function') throw new Error(`Missing export: ${key}`)",
        '}',
        `const instance = webcam.create({ output: '${smokeOutput}', saveShots: false })`,
        "if (!['ffmpeg', 'native', 'legacy'].includes(instance.getBackendType())) throw new Error('Unexpected backend type')"
      ].join('\n')
    ],
    {
      cwd: consumerDirectory,
      env: consumerEnv,
      stdio: 'ignore'
    }
  )

  writeFileSync(
    join(consumerDirectory, 'index.mjs'),
    [
      "import * as webcam from '@anthonylzq/node-webcam'",
      "for (const key of ['capture', 'clearBackendCaches', 'create', 'list', 'listWebcams', 'getMetricsReport', 'resetMetrics']) {",
      "  if (typeof webcam[key] !== 'function') throw new Error(`Missing ESM export: ${key}`)",
      '}',
      `const instance = webcam.create({ output: '${smokeOutput}', saveShots: false })`,
      "if (!['ffmpeg', 'native', 'legacy'].includes(instance.getBackendType())) throw new Error('Unexpected ESM backend type')"
    ].join('\n')
  )

  execNode(['index.mjs'], {
    cwd: consumerDirectory,
    env: consumerEnv,
    stdio: 'ignore'
  })

  writeFileSync(
    join(consumerDirectory, 'index.ts'),
    [
      "import { capture, clearBackendCaches, create, getMetricsReport, listWebcams, type NodeWebcamConfig, type WebcamMetricsReport } from '@anthonylzq/node-webcam'",
      "const options: Partial<NodeWebcamConfig> = { device: false, output: 'jpg', save: false, timeout: 1 }",
      'clearBackendCaches()',
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
      "import { capture, clearBackendCaches, create, getMetricsReport, listWebcams, type NodeWebcamConfig, type WebcamMetricsReport } from '@anthonylzq/node-webcam'",
      "const options: Partial<NodeWebcamConfig> = { device: false, output: 'jpg', save: async (_path, _buffer) => false, timeout: 1 }",
      'clearBackendCaches()',
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
          target: 'ES2020'
        },
        include: ['index.ts', 'index.mts']
      },
      null,
      2
    )
  )

  const tscPath = join(root, 'node_modules', 'typescript', 'lib', 'tsc.js')

  if (!existsSync(tscPath)) throw new Error(`Missing TypeScript compiler: ${tscPath}`)

  execNode([tscPath, '-p', 'tsconfig.json'], {
    cwd: consumerDirectory,
    env: consumerEnv,
    stdio: 'ignore'
  })

  execNode(
    [
      join(
        consumerDirectory,
        'node_modules',
        '@anthonylzq',
        'node-webcam',
        'bin',
        'node-webcam.js'
      ),
      'setup',
      'windows'
    ],
    {
      cwd: consumerDirectory,
      env: consumerEnv,
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
