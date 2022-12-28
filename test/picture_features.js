/**
 * Picture features testing
 *
 * @requires mocha
 *
 */
'use strict'

const NodeWebcam = require('./../index.js')

const Chai = require('chai')

const assert = Chai.assert

const Async = require('async')

const Features = [
  {
    name: 'Grayscale',
    options: {
      greyscale: true
    }
  },
  {
    name: 'Rotation',
    options: {
      rotation: '50'
    }
  },
  {
    name: 'Saturation',
    options: {
      saturation: '100%'
    }
  },
  {
    name: 'Clean',
    options: {}
  },
  {
    name: 'Skip',
    options: {
      skip: 1
    }
  },
  {
    name: 'NumberOfFrames',
    options: {
      numberOfFrames: 40
    }
  }
]

// Main test sequence

describe('Webcam Features', function () {
  // feature test setup

  featureTest()
})

function featureTest() {
  Async.map(Features, captureFeature)

  function captureFeature(feature, callback) {
    it('Should use Feature ' + feature.name, function (itCallback) {
      this.timeout(6000)

      const Webcam = NodeWebcam.create(feature.options)

      const url = __dirname + '/output/feature_' + feature.name

      Webcam.capture(url, function (err, data) {
        assert.typeOf(err, 'null')

        callback()

        itCallback()
      })
    })
  }
}
