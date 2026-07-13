#!/usr/bin/env node

const { rmSync } = require('fs')
const { resolve } = require('path')

rmSync(resolve(__dirname, '..', 'dist'), {
  force: true,
  recursive: true
})
