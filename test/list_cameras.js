/**
 * Base 64 image test
 *
 */
'use strict'

const NodeWebcam = require('./../index.js')

const Path = require('path')

const Chai = require('chai')

const assert = Chai.assert

const Async = require('async')

let List = []

// Main test sequence

describe('Webcam List', function () {
  // Default webcam list

  it('Should list all availible cameras', listTest)

  it('Should capture each device', deviceCheck)
})

// base 64 capture webcam

function listTest(done) {
  const Webcam = NodeWebcam.Factory.create({})

  Webcam.list(function (list) {
    console.log('Camera List', list)

    List = list

    done()
  })
}

// use each camera

function deviceCheck(done) {
  this.timeout(6000)

  const Webcam = NodeWebcam.Factory.create({})

  const url = Path.resolve(__dirname, 'output', 'test_image')

  let index = 0

  // Main device capture

  function captureFunc(device, callback) {
    Webcam.opts.device = device

    const urlDevice = url + '_' + index

    Webcam.capture(urlDevice, function (err, data) {
      if (
        err != null &&
        !err.message.includes(
          'VIDIOC_ENUMINPUT: Inappropriate ioctl for device'
        )
      )
        assert.typeOf(err, 'null')

      callback()
    })

    index++
  }

  Async.mapSeries(List, captureFunc, function () {
    done()
  })
}
