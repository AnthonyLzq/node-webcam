#!/usr/bin/env node
const https = require('https')
const fs = require('fs')
const os = require('os')
const { author, name, version } = require('../package.json')

const tag = `v${version}`

const init = () => {
  // Windows check
  if (!os.platform().match(/win/)) return

  // Bindings path
  const file = fs.createWriteStream('src/bindings/CommandCam/CommandCam.exe')

  // Github release url create
  const repo = `${author.name}/${name}`
  const url = `'https://github.com/${repo}/releases/download/${tag}/CommandCam.exe`

  // Download exe release
  console.log('Downloading ' + url)

  function makeRequest(url) {
    https.get(url, function (response) {
      if (response.statusCode === 302) {
        console.log('Redirecting ' + response.headers.location)
        makeRequest(response.headers.location)

        return
      }

      console.log('Downloaded Windows file ' + file.path)
      response.pipe(file)
    })
  }

  makeRequest(url)
}

init()
