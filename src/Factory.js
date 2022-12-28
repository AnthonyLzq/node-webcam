/**
 * Factory based on OS output
 *
 */
const OS = require('os')

// Webcam types

const FSWebcam = require('./webcams/FSWebcam.js')

const ImageSnapWebcam = require('./webcams/ImageSnapWebcam.js')

const WindowsWebcam = require('./webcams/WindowsWebcam.js')

// Main singleton

var Factory = new (function () {
  const scope = this

  // Main Class get

  scope.create = function (options, type) {
    const p = type || Factory.Platform

    const Type = Factory.Types[p]

    if (!Type)
      throw new Error('Sorry, no webcam type specified yet for platform ' + p)

    return new Type(options)
  }
})()

Factory.Platform = OS.platform()

// OS Webcam types

Factory.Types = {
  linux: FSWebcam,

  darwin: ImageSnapWebcam,

  fswebcam: FSWebcam,

  win32: WindowsWebcam,

  win64: WindowsWebcam
}

// Export

module.exports = Factory
