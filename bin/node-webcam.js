#!/usr/bin/env node

const { installCommandCam } = require('./setup')

const printUsage = () => {
  console.log('Usage: node-webcam setup windows')
}

const [command, target] = process.argv.slice(2)

if (command !== 'setup' || target !== 'windows') {
  printUsage()
  process.exitCode = 1
} else {
  installCommandCam({ strict: true })
    .then(result => {
      if (result.status === 'skipped' && result.reason === 'platform') {
        console.log('CommandCam setup is only required on Windows.')
        return
      }

      if (result.status === 'skipped') {
        console.log(`CommandCam setup skipped: ${result.reason}`)
      }
    })
    .catch(error => {
      console.error(error.message)
      process.exitCode = 1
    })
}
