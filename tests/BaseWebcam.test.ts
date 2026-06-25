import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { BaseWebcam } from '../src/webcams/BaseWebcam'
import { Shot } from '../src/utils'

describe('BaseWebcam', () => {
  it('returns a defensive copy of options', () => {
    const webcam = new BaseWebcam({ width: 640 })
    const options = webcam.options

    options.width = 320

    assert.equal(webcam.options.width, 640)
  })

  it('rejects paths without an extension before executing commands', async () => {
    const webcam = new BaseWebcam({})

    await assert.rejects(
      () => webcam.capture('should-not-run', 'photo', 'buffer'),
      /Invalid path, missing type file/
    )
  })

  it('rejects unsupported file extensions before executing commands', async () => {
    const webcam = new BaseWebcam({})

    await assert.rejects(
      () => webcam.capture('should-not-run', 'photo.gif', 'buffer'),
      /Invalid file extension: gif/
    )
  })

  it('rejects mismatched output and file extension before execution', async () => {
    const webcam = new BaseWebcam({ output: 'jpeg' })

    await assert.rejects(
      () => webcam.capture('should-not-run', 'photo.png', 'buffer'),
      /The output \(jpeg\) and the file type \(png\) does not match/
    )
  })
})

describe('Shot', () => {
  it('returns defensive copies of captured data', () => {
    const shot = new Shot('photo.jpeg', Buffer.from([1, 2, 3]))
    const data = shot.data

    data[0] = 9

    assert.deepEqual([...shot.data], [1, 2, 3])
  })
})
