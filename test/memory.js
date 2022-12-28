/**
 * Capture and dont save use memory
 *
 */
'use strict'

const NodeWebcam = require('./../index.js')

const Path = require('path')

const FS = require('fs')

const Chai = require('chai')

const assert = Chai.assert

// Main capture sequence

describe('Memory Capture', function () {
  // Default webcam capture using global API

  it('Should capture and save to memory', function (done) {
    this.timeout(6000)

    const opts = {
      callbackReturn: 'base64'
    }

    const Webcam = NodeWebcam.capture(null, opts, function (err, data) {
      assert.typeOf(err, 'null')

      assert.typeOf(data, 'string')

      const writeLocal = __dirname + '/output/test_image_memory_64.html'

      const content = "<img src='" + data + "'>"

      FS.writeFile(writeLocal, content, function (err) {
        assert.typeOf(err, 'null')

        done()
      })
    })
  })
})
