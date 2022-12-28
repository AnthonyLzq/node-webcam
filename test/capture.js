/**
 * Mocha Basic capture setups
 *
 */
'use strict'

const NodeWebcam = require('./../index.js')

const Path = require('path')

const FS = require('fs')

const Chai = require('chai')

const assert = Chai.assert

// Main capture sequence

describe('Capture', function () {
  // Default webcam capture using global API

  it('Should capture from default webcam', function (done) {
    this.timeout(6000)

    const url = Path.resolve(__dirname, 'output', 'test_image')

    const Webcam = NodeWebcam.capture(url, {}, function (err, url) {
      assert.typeOf(err, 'null')

      FS.unlinkSync(url)

      done()
    })
  })

  // Default webcam capture using global API

  it('Should fail to capture from fake webcam', function (done) {
    this.timeout(6000)

    const url = Path.resolve(__dirname, 'output', 'test_image')

    const opts = { device: 'OBVIOUSLY-FAKE-WEBCAM' }

    const Webcam = NodeWebcam.capture(url, opts, function (err, url) {
      assert.equal(err instanceof Error, true)

      done()
    })
  })
})
