/**
 * API for imagesnap Mac OSX
 *
 * @requires [ imagesnap ]
 *
 * @param Object options
 *
 */
'use strict'

const CHILD_PROCESS = require('child_process')

const EXEC = CHILD_PROCESS.exec

const Webcam = require('./../Webcam.js')

const { setDefaults } = require('../utils')

// Main class

function ImageSnapWebcam(options) {
  const scope = this

  scope.opts = setDefaults(options, ImageSnapWebcam.Defaults)

  // Without a delay imagesnap will not work
  // Test on macbook 2015 13' retina

  if (scope.opts.delay < 1) scope.opts.delay = 1

  // Construct

  Webcam.call(scope, scope.opts)
}

ImageSnapWebcam.prototype = Object.create(Webcam.prototype)

ImageSnapWebcam.prototype.constructor = ImageSnapWebcam

ImageSnapWebcam.prototype.bin = 'imagesnap'

/**
 * @override
 *
 * Generate shell statement
 *
 * @param String location
 *
 */
ImageSnapWebcam.prototype.generateSh = function (location) {
  const scope = this

  const verbose = scope.opts.verbose ? '-v' : '-q'

  const delay = scope.opts.delay ? '-w ' + scope.opts.delay : ''

  const device = scope.opts.device ? "-d '" + scope.opts.device + "'" : ''

  const sh =
    scope.bin + ' ' + delay + ' ' + device + ' ' + verbose + ' ' + location

  return sh
}

/**
 * @Override
 *
 * Webcam list
 *
 * @param Function callback
 *
 */
ImageSnapWebcam.prototype.list = function (callback) {
  const scope = this

  const sh = scope.bin + ' -l'

  const cams = []

  EXEC(sh, function (err, data, out) {
    const lines = data.split('\n')

    const ll = lines.length

    for (let i = 0; i < ll; i++) {
      let line = lines[i]

      if (line === 'Video Devices:' || !line) continue

      // imagesnap update adds extra stuff
      line = line.replace(/.*?\[(.*?)\].*/, '$1')

      cams.push(line)
    }

    callback && callback(cams)
  })
}

// Defaults

ImageSnapWebcam.Defaults = {
  delay: 1
}

// Export

module.exports = ImageSnapWebcam
