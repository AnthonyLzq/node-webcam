import http from 'http'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { platform } from 'os'
import ws from 'ws'

import { capture } from '../../dist/'

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
  setInterval(async () => {
    const result = await capture({
      location: resolve(__dirname, 'picture.png'),
      type: platform(),
      options: {
        output: 'png'
      }
    })

    broadcast(result)
  }, 2500)
}

// Main
const init = () => {
  setupHTTP()
  setupWebcam()

  console.log(`Visit localhost:${PORT}`)
}

init()
