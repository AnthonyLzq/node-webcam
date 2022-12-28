/**
 * Base 64 image test
 *
 */
'use strict'

const NodeWebcam = require('./../index.js')

const Path = require('path')

const FS = require('fs')

const Chai = require('chai')

const assert = Chai.assert

// Main capture sequence

describe('Base 64 Capture', function () {
  // Default webcam capture using global API

  it('Should capture and grab a base64 image', base64Capture)
})

// base 64 capture webcam

function base64Capture(done) {
  this.timeout(6000)

  const url = Path.resolve(__dirname, 'output', 'test_image')

  const Webcam = NodeWebcam.Factory.create({
    saveShots: true
  })

  Webcam.capture(url, function (err, url) {
    Webcam.getBase64(Webcam.shots.length - 1, function (err, base64) {
      assert.equal(err, null)

      const writeLocal = __dirname + '/output/test_image_64.html'

      const content = "<img src='" + base64 + "'>"

      FS.writeFile(writeLocal, content, function (err) {
        assert.typeOf(err, 'null')

        done()
      })
    })
  })
}
