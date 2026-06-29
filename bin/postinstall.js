#!/usr/bin/env node
const https = require('https')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { maintainers, name, version } = require('../package.json')

const tag = `v${version}`

const init = () => {
  // Windows check
  if (!os.platform().match(/win/)) return

  // Bindings paths
  const files = [
    'dist/cjs/bindings/CommandCam/CommandCam.exe',
    'dist/esm/bindings/CommandCam/CommandCam.exe'
  ]

  // Github release url create
  const repo = `${maintainers[0].name}/${name}`.replace('@anthonylzq/', '')
  const url = `https://github.com/${repo}/releases/download/${tag}/CommandCam.exe`

  // Download exe release
  console.log('Downloading ' + url)

  function makeRequest(url) {
    https.get(url, function (response) {
      if (response.statusCode === 302) {
        console.log('Redirecting ' + response.headers.location)
        makeRequest(response.headers.location)

        return
      }

      const chunks = []

      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => {
        const buffer = Buffer.concat(chunks)

        for (const file of files) {
          fs.mkdirSync(path.dirname(file), { recursive: true })
          fs.writeFileSync(file, buffer)
          console.log('Downloaded Windows file ' + file)
        }
      })
    })
  }

  makeRequest(url)
}

init()
