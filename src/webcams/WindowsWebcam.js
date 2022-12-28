/**
 * API for Windows
 *
 * @requires [ CommandCam ]
 *
 * @param Object options
 *
 */
'use strict'

const CHILD_PROCESS = require('child_process')

const EXEC = CHILD_PROCESS.exec

const Webcam = require('./../Webcam.js')

const { setDefaults } = require('../utils')

const Path = require('path')

// Main class

function WindowsWebcam(options) {
  const scope = this

  scope.opts = setDefaults(options, WindowsWebcam.Defaults)

  // Construct

  Webcam.call(scope, scope.opts)

  // command cam uses miliseconds

  scope.opts.delay = scope.opts.delay * 1000
}

WindowsWebcam.prototype = Object.create(Webcam.prototype)

WindowsWebcam.prototype.constructor = WindowsWebcam

WindowsWebcam.prototype.bin =
  '"' +
  Path.resolve(__dirname, '..', 'bindings', 'CommandCam', 'CommandCam.exe') +
  '"'

/**
 * @override
 *
 * Generate shell statement
 *
 * @param String location
 *
 */
WindowsWebcam.prototype.generateSh = function (location) {
  const scope = this

  const device = scope.opts.device ? '/devnum ' + scope.opts.device : ''

  const delay = scope.opts.delay ? '/delay ' + scope.opts.delay : ''

  const sh =
    scope.bin + ' ' + delay + ' ' + device + ' ' + '/filename ' + location

  return sh
}

/**
 * List webcam devices using bin
 *
 * @param Function callback
 *
 */

WindowsWebcam.prototype.list = function (callback) {
  const scope = this

  const sh = scope.bin + ' /devlist'

  const cams = []

  EXEC(sh, function (err, data, out) {
    if (err) throw err

    const lines = out.split('\n')

    const ll = lines.length

    let camNum = 1

    for (let i = 0; i < ll; i++) {
      let line = lines[i]
      line = line.replace('\r', '')

      if (
        !!line &&
        line !== 'Available capture devices:' &&
        'No video devices found'
      ) {
        cams.push(camNum.toString())
        camNum++
      }
    }

    callback && callback(cams)
  })
}

// Defaults

WindowsWebcam.Defaults = {
  output: 'bmp'
}

// Export

module.exports = WindowsWebcam
