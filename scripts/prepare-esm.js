#!/usr/bin/env node

const { existsSync, readdirSync, readFileSync, writeFileSync } = require('fs')
const { dirname, extname, join, relative, sep } = require('path')

const distDirectory = join(__dirname, '..', 'dist', 'esm')
const packageJsonPath = join(distDirectory, 'package.json')
const dirnameShim = [
  "import { dirname as __node_dirname } from 'path';",
  "import { fileURLToPath as __node_fileURLToPath } from 'url';",
  'const __filename = __node_fileURLToPath(import.meta.url);',
  'const __dirname = __node_dirname(__filename);'
].join('\n')

const findJavaScriptFiles = directory =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) return findJavaScriptFiles(path)
    if (entry.isFile() && path.endsWith('.js')) return [path]

    return []
  })

const normalizeSpecifier = specifier => specifier.split('/').join(sep)

const getRelativeImportPath = (fromFile, targetFile) => {
  const specifier = relative(dirname(fromFile), targetFile).split(sep).join('/')

  return specifier.startsWith('.') ? specifier : `./${specifier}`
}

const resolveRelativeSpecifier = (fromFile, specifier) => {
  if (!specifier.startsWith('.')) return specifier
  if (extname(specifier)) return specifier

  const target = join(dirname(fromFile), normalizeSpecifier(specifier))
  const fileTarget = `${target}.js`
  const indexTarget = join(target, 'index.js')

  if (existsSync(fileTarget)) return getRelativeImportPath(fromFile, fileTarget)
  if (existsSync(indexTarget)) return getRelativeImportPath(fromFile, indexTarget)

  return specifier
}

const rewriteSpecifiers = (file, source) =>
  source.replace(
    /\b(from\s+['"]|import\s*\(\s*['"])(\.[^'"]+)(['"]\s*\)?)/g,
    (_match, prefix, specifier, suffix) =>
      `${prefix}${resolveRelativeSpecifier(file, specifier)}${suffix}`
  )

writeFileSync(packageJsonPath, `${JSON.stringify({ type: 'module' }, null, 2)}\n`)

for (const file of findJavaScriptFiles(distDirectory)) {
  const source = readFileSync(file, 'utf8')
  const withSpecifiers = rewriteSpecifiers(file, source)
  const withDirname = withSpecifiers.includes('__dirname')
    ? `${dirnameShim}\n${withSpecifiers}`
    : withSpecifiers

  writeFileSync(file, withDirname)
}
