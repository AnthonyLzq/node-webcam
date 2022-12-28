/**
 * Class and executable ubiquity
 *
 */
'use strict'

const NodeWebcam = require('./../index.js')

const Async = require('async')

const CamTypes = {
  linux: ['FSWebcam'],

  darwin: ['ImageSnapWebcam'],

  win32: ['WindowsWebcam'],

  win64: ['WindowsWebcam']
}

// Main test sequence

describe('Webcam Ubiquity', function () {
  // webcam class ubiquity

  it("Should output from it's platforms drivers", ubiquityTest)
})

function ubiquityTest(done) {
  this.timeout(6000)

  const platform = NodeWebcam.Factory.Platform

  const types = CamTypes[platform]

  const url = __dirname + '/output/test_image'

  Async.map(types, captureFromCam, done)

  function captureFromCam(type, callback) {
    const Webcam = new NodeWebcam[type]()

    Webcam.capture(url, function () {
      callback()
    })
  }
}
