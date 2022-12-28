/**
 *
 * Webcam base class
 *
 * @class Webcam
 * @constructor
 * @param {Object} options composition options
 * used to set
 *
 */
'use strict'

const { exec } = require('child_process')
const fs = require('fs')

const { getCameras, setDefaults } = require('./utils')
// eslint-disable-next-line import/extensions
const { Shot } = require('./Shot')

/*
 * Main class
 *
 */

function Webcam(options) {
  const scope = this

  scope.shots = []

  scope.opts = setDefaults(options)
}

Webcam.prototype = {
  constructor: Webcam,

  /**
   * Main opts from construction
   *
   * @property opts
   * @type {Object}
   *
   */

  opts: {},

  /**
   * Array of Shot objects
   *
   * @property shots
   * @type {Shots[]}
   *
   */

  shots: [],

  /**
   * Basic camera instance clone
   *
   * @method clone
   *
   * @return Webcam
   *
   */

  clone() {
    return new this.constructor(this.opts)
  },

  /**
   * Clear shot and camera memory data
   *
   * @method clear
   *
   */

  clear() {
    const scope = this

    scope.shots = []
  },

  /**
   * List available cameras
   *
   * @method list
   *
   * @param {Function} callback returns a list of cameras
   *
   */

  list: getCameras,

  /**
   * List available camera controls
   *
   * @method listControls
   *
   * @param {Function(Array<CameraControl>)} callback Function that receives
   * camera controls
   *
   * @param {String} stdoutOverride fswebcam command output override (for
   * testing purposes)
   *
   */
  // TODO: mover a FSWebcam
  listControls(callback, stdoutOverride) {
    const scope = this

    let sh

    try {
      sh = scope.getListControlsSh()
    } catch (_) {
      callback && callback([])
    }

    // Shell execute

    const shArgs = {
      maxBuffer: 1024 * 10000
    }

    exec(sh, shArgs, function (err, out, derr) {
      if (err) return callback && callback(err)

      if (scope.opts.verbose && derr) console.log(derr)

      scope.parseListControls(stdoutOverride || out + derr, callback)
    })
  },

  /**
   * Has camera
   *
   * @method hasCamera
   *
   * @param {Function} callback returns a Boolean
   *
   */

  hasCamera(callback) {
    const scope = this

    scope.list(function (list) {
      callback && callback(!!list.length)
    })
  },

  /**
   * Capture shot
   *
   * @method capture
   *
   * @param {String} location
   * @param {Function} callback
   * @return void
   *
   */

  capture(location, callback) {
    const scope = this

    if (
      location === null &&
      scope.opts.callbackReturn === Webcam.CallbackReturnTypes.location
    ) {
      console.warn(
        'If capturing image in memory your callback return type cannot be the location'
      )

      scope.opts.callbackReturn = 'buffer'
    }

    const fileType = Webcam.OutputTypes[scope.opts.output]

    const newLocation =
      location === null
        ? null
        : location.match(/\..*$/)
        ? location
        : location + '.' + fileType

    // Shell statement grab

    const sh = scope.generateSh(newLocation)

    if (scope.opts.verbose) console.log(sh)

    // Shell execute

    const shArgs = {
      maxBuffer: 1024 * 10_000
    }

    exec(sh, shArgs, function (err, out, derr) {
      if (err) return callback && callback(err)

      if (scope.opts.verbose && derr) console.log(derr)

      // Run validation overrides

      let validationErrors

      if ((validationErrors = scope.runCaptureValidations(derr)))
        return callback && callback(validationErrors)

      // Callbacks

      const shot = scope.createShot(newLocation, derr)

      if (scope.opts.saveShots) scope.shots.push(shot)

      callback && scope.handleCallbackReturnType(callback, shot)
    })
  },

  /**
   * Generate cli command string
   *
   * @method generateSh
   *
   * @return {String}
   *
   */

  generateSh(location) {
    return ''
  },

  /**
   * Create a shot overider
   *
   * @method createShot
   *
   * @return {String}
   *
   */

  createShot(location, data) {
    return new Shot(location, data)
  },

  /**
   * Get shot instances from cache index
   *
   * @method getShot
   *
   * @param {Number} shot Index of shots called
   * @param {Function} callback Returns a call from fs.readFile data
   *
   * @throws Error if shot at index not found
   *
   * @return {Boolean}
   *
   */

  getShot(index, callback) {
    const scope = this

    const shot = scope.shots[index | 0]

    if (!shot) {
      throw new Error('Shot number ' + index + ' not found')

      return
    }

    return shot
  },

  /**
   * Get last shot taken image data
   *
   * @method getLastShot
   *
   * @throws Error Camera has no last shot
   *
   * @return {Shot}
   *
   */

  getLastShot() {
    const scope = this

    if (!scope.shots.length) {
      throw new Error('Camera has no last shot')

      return
    }

    return scope.getShot(scope.shots.length - 1)
  },

  /**
   * Get shot buffer from location
   * 0 indexed
   *
   * @method getShotBuffer
   *
   * @param {Number} shot Index of shots called
   * @param {Function} callback Returns a call from fs.readFile data
   *
   * @return {Boolean}
   *
   */

  getShotBuffer(shot, callback) {
    const scope = this

    if (typeof shot === 'number') shot = scope.getShot(shot)

    if (shot.location)
      fs.readFile(shot.location, function (err, data) {
        callback(err, data)
      })
    else if (!shot.data) callback(new Error('Shot not valid'))
    else callback(null, shot.data)
  },

  /**
   * Get last shot buffer taken image data
   *
   * @method getLastShotBuffer
   *
   * @throws Error Shot not found
   *
   * @return {Shot}
   *
   */

  getLastShotBuffer(callback) {
    const scope = this

    const shot = scope.getLastShot()

    scope.getShotBuffer(shot, callback)
  },

  /**
   * Get shot base64 as image
   * if passed Number will return a base 64 in the callback
   *
   * @method getBase64
   *
   * @param {Number|fs.readFile} shot To be converted
   * @param {Function( Error|null, Mixed )} callback Returns base64 string
   *
   * @return {String} Dont use
   *
   */

  getBase64(shot, callback) {
    const scope = this

    scope.getShotBuffer(shot, function (err, data) {
      if (err) {
        callback(err)

        return
      }

      const base64 = scope.getBase64FromBuffer(data)

      callback(null, base64)
    })
  },

  /**
   * Get base64 string from bufer
   *
   * @method getBase64
   *
   * @param {Number|fs.readFile} shot To be converted
   * @param {Function( Error|null, Mixed )} callback Returns base64 string
   *
   * @return {String} Dont use
   *
   */

  getBase64FromBuffer(shotBuffer) {
    const scope = this

    const image =
      'data:image/' +
      scope.opts.output +
      ';base64,' +
      Buffer.from(shotBuffer).toString('base64')

    return image
  },

  /**
   * Get last shot taken base 64 string
   *
   * @method getLastShot64
   *
   * @param {Function} callback
   *
   */

  getLastShot64(callback) {
    const scope = this

    if (!scope.shots.length)
      callback && callback(new Error('Camera has no last shot'))

    scope.getBase64(scope.shots.length - 1, callback)
  },

  /**
   * Get last shot taken image data
   *
   * @method handleCallbackReturnType
   *
   * @param {Function} callback
   * @param {String} location
   *
   * @throws Error callbackReturn Type not valid
   *
   */

  handleCallbackReturnType(callback, shot) {
    const scope = this

    switch (scope.opts.callbackReturn) {
      case Webcam.CallbackReturnTypes.location:
        return callback(null, shot.location)

      case Webcam.CallbackReturnTypes.buffer:
        return scope.getShotBuffer(shot, callback)

      case Webcam.CallbackReturnTypes.base64:
        return scope.getBase64(shot, callback)

      default:
        return callback(
          new Error(
            'Callback return type not valid ' + scope.opts.callbackReturn
          )
        )
    }
  },

  /**
   * Data validations for a command line output
   *
   * @override
   *
   * @param {String} Command exec output
   *
   * @return {Error|null}
   *
   */

  runCaptureValidations(data) {
    return null
  }
}

/**
 * Global output types
 * Various for platform
 *
 * @property Webcam.OutputTypes
 *
 * @type Object
 * @static
 *
 */

Webcam.OutputTypes = {
  jpeg: 'jpg',

  png: 'png',

  bmp: 'bmp'
}

/**
 * Global output types
 * Various for platform
 *
 * @property Webcam.CallbackReturnTypes
 *
 * @type Object
 * @static
 *
 */

Webcam.CallbackReturnTypes = {
  default: 'location',

  location: 'location', // Shot location
  buffer: 'buffer', // Buffer object
  base64: 'base64' // String ex : "data..."
}

// Export

module.exports = Webcam
