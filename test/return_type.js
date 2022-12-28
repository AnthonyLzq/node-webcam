/**
 * Callback return type testing
 *
 * @requires mocha
 *
 */
'use strict'

const NodeWebcam = require('./../index.js')

const Chai = require('chai')

const assert = Chai.assert

const Async = require('async')

// Return types to test

const ReturnTypes = ['base64', 'buffer', 'location']

const ReturnTypeInstances = {
  base64: 'string',
  buffer: 'object',
  location: 'string'
}

// Main test sequence

describe('Webcam Callback Return Type', function () {
  returnTypesTest()

  badTypeTest()
})

/**
 * Buffer return types
 */

function returnTypesTest() {
  Async.map(ReturnTypes, captureFunc)

  function captureFunc(returnType, callback) {
    const expectedType = ReturnTypeInstances[returnType]

    it('Should return ' + returnType + ' on callback', function (itCallback) {
      this.timeout(6000)

      const options = {
        callbackReturn: returnType
      }

      const Webcam = NodeWebcam.create(options)

      const url = __dirname + '/output/returntype_' + returnType

      Webcam.capture(url, function (err, data) {
        assert.equal(typeof data, expectedType)

        callback()

        itCallback()
      })
    })
  }
}

/**
 * Bad type test
 */

function badTypeTest() {
  it('Should return Error on bad return type on callback', function (itCallback) {
    this.timeout(6000)

    const options = {
      callbackReturn: 'OBVISIOUSLY FAKE RETURN TYPE'
    }

    const Webcam = NodeWebcam.create(options)

    const url = __dirname + '/output/returntype_fake'

    Webcam.capture(url, function (err, data) {
      assert.instanceOf(err, Error)

      itCallback()
    })
  })
}
