import http from 'http'
import ws from 'ws'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { capture } from '../../src/'

const PORT = 9090
const html = readFileSync(resolve(__dirname, 'www/index.html'))
const wss = new ws.Server({ port: 9091 })

// Broadcast to all.
const broadcast = () => {
  wss.clients.forEach(client => {
    client.send(resolve(__dirname, '..', '..', 'location.jpeg'))
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
  setInterval(() => {
    capture({ cb: broadcast })
  }, 2500)
}

// Main
const init = () => {
  setupHTTP()
  setupWebcam()

  console.log(`Visit localhost:${PORT}`)
}

init()
