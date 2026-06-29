import http from 'http'
import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { platform, tmpdir } from 'os'
import ws from 'ws'

import { capture } from '@anthonylzq/node-webcam'

const CAPTURE_INTERVAL_MS = 2500
const CAPTURE_LOCATION = join(
  tmpdir(),
  `node-webcam-websocket-${process.pid}.jpg`
)
const PORT = 9090
const html = readFileSync(resolve(__dirname, 'www/index.html'))
const wss = new ws.Server({ port: 9091 })

// Broadcast to all.
const broadcast = (base64Result: string | Buffer) => {
  wss.clients.forEach(client => {
    client.send(base64Result)
  })
}

const setupHTTP = () => {
  const server = http.createServer()

  server.on('request', (request, response) => {
    response.write(html)
    response.end()
  })

  server.listen(PORT)
}

const setupWebcam = () => {
  const captureFrame = async () => {
    try {
      if (wss.clients.size === 0) return

      const result = await capture({
        location: CAPTURE_LOCATION,
        type: platform(),
        returnType: 'base64',
        options: {
          output: 'jpg',
          saveShots: false
        }
      })

      broadcast(result)
    } catch (error) {
      console.error('Unable to capture webcam frame:', error)
    } finally {
      setTimeout(captureFrame, CAPTURE_INTERVAL_MS)
    }
  }

  captureFrame()
}

// Main
const init = () => {
  setupHTTP()
  setupWebcam()

  console.log(`Visit localhost:${PORT}`)
}

init()
