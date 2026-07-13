#!/usr/bin/env node

const { cpSync, existsSync } = require('fs')
const { resolve } = require('path')

const root = resolve(__dirname, '..')
const source = resolve(root, 'src', 'bindings')

if (!existsSync(source)) process.exit(0)

for (const target of [
  resolve(root, 'dist', 'cjs', 'bindings'),
  resolve(root, 'dist', 'esm', 'bindings')
]) {
  cpSync(source, target, {
    force: true,
    recursive: true
  })
}
