/**
 * API for fswebcam
 *
 * @requires [ fswebcam ]
 *
 * @param Object options
 *
 */
'use strict'

const Webcam = require('./../Webcam.js')

const Utils = require('./../utils/Utils.js')

const Shot = require('./../Shot.js')

// Main class

function FSWebcam(options) {
  const scope = this

  scope.opts = Utils.setDefaults(options, FSWebcam.Defaults)

  Webcam.call(scope, scope.opts)

  if (scope.opts.output === 'png' && scope.opts.quality > 9)
    scope.opts.quality = 9
}

FSWebcam.prototype = Object.create(Webcam.prototype)

FSWebcam.prototype.constructor = FSWebcam

FSWebcam.prototype.bin = 'fswebcam'

/**
 * @override
 *
 * Create shot possibly from memory stdout
 *
 */

FSWebcam.prototype.createShot = function (location, data) {
  if (location === null) var data = Buffer.from(data)

  return new Shot(location, data)
}

/**
 * @override
 *
 * Generate shell statement
 *
 * @param String location
 *
 */
FSWebcam.prototype.generateSh = function (location) {
  const scope = this

  const resolution = ' -r ' + scope.opts.width + 'x' + scope.opts.height

  // Adding frame rate
  const frames = scope.opts.frames ? '-F ' + scope.opts.frames : ''

  const output = '--' + scope.opts.output

  const quality = scope.opts.quality

  const delay = scope.opts.delay ? '-D ' + scope.opts.delay : ''

  const title = scope.opts.title ? '--title ' + scope.opts.title : ''

  const subtitle = scope.opts.subtitle
    ? '--subtitle ' + scope.opts.subtitle
    : ''

  const timestamp = scope.opts.timestamp
    ? '--timestamp ' + scope.opts.timestamp
    : ''

  const device = scope.opts.device ? '-d ' + scope.opts.device : ''

  const grey = scope.opts.greyscale ? '--greyscale' : ''

  const rotation = scope.opts.rotation ? '--rotate ' + scope.opts.rotation : ''

  const banner =
    !scope.opts.topBanner && !scope.opts.bottomBanner
      ? '--no-banner'
      : scope.opts.topBanner
      ? '--top-banner'
      : '--bottom-banner'

  const skip = scope.opts.skip ? '--skip ' + scope.opts.skip : ''

  if (scope.opts.saturation)
    scope.opts.setValues.Saturation = scope.opts.saturation

  const setValues = scope.getControlSetString(scope.opts.setValues)

  const verbose = scope.opts.verbose ? '' : ' -q'

  // Use memory if null location

  const shellLocation = location === null ? '- -' : location

  const sh =
    scope.bin +
    ' ' +
    verbose +
    ' ' +
    resolution +
    ' ' +
    frames +
    ' ' +
    output +
    ' ' +
    quality +
    ' ' +
    delay +
    ' ' +
    title +
    ' ' +
    subtitle +
    ' ' +
    timestamp +
    ' ' +
    device +
    ' ' +
    grey +
    ' ' +
    rotation +
    ' ' +
    banner +
    ' ' +
    setValues +
    ' ' +
    skip +
    ' ' +
    shellLocation

  return sh
}

/**
 * Get control values string
 *
 * @param {Object} setValues
 *
 * @returns {String}
 *
 */
FSWebcam.prototype.getControlSetString = function (setValues) {
  let str = ''

  if (typeof setValues !== 'object') return str

  for (const setName in setValues) {
    const val = setValues[setName]

    if (!val) continue

    // Add a space to separate values if there are multiple control values being set
    if (str.length > 0) str += ' '

    str += `-s ${setName}=${val}`
  }

  return str
}

/**
 * Get shell statement to get the available camera controls
 *
 * @returns {String}
 *
 */
FSWebcam.prototype.getListControlsSh = function () {
  const scope = this

  const devSwitch = scope.opts.device
    ? ' --device=' + scope.opts.device.trim()
    : ''

  return scope.bin + devSwitch + ' --list-controls'
}

/**
 * Parse output of list camera controls shell command
 *
 * @param {String} stdout Output of the list camera control shell command
 *
 * @param {Function(Array<CameraControl>)} callback Function that receives
 * camera controls
 *
 */
FSWebcam.prototype.parseListControls = function (stdout, callback) {
  const cameraControls = []

  let inOptions = false

  let prefixLength = 0

  const headerRegExp = new RegExp(
    '(?<prefix>.*)------------------\\s+-------------\\s+-----.*'
  )

  const rangeRegExp = new RegExp(
    '(?<name>.*?)' +
      '\\s+-?\\d+(?:\\s+\\(\\d+%\\))?\\s+' +
      '(?<min>-?\\d+)' +
      ' - ' +
      '(?<max>-?\\d+)',
    'i'
  )

  for (let line of stdout.split(/\n|\r|\n\r|\r\n/)) {
    line = line.slice(prefixLength).trim()

    inOptions = inOptions && line.startsWith('-') ? false : inOptions

    if (inOptions) {
      const rangeGroups = line.match(rangeRegExp)

      if (rangeGroups) {
        var name = rangeGroups.groups.name

        const minRange = parseInt(rangeGroups.groups.min)

        const maxRange = parseInt(rangeGroups.groups.max)

        cameraControls.push({
          name,
          type: 'range',
          min: minRange,
          max: maxRange
        })
      } else if (line.lastIndexOf('|') !== -1) {
        const opts = []

        let opt = ''

        var name = ''

        let idx = line.lastIndexOf('|')

        while (idx !== -1) {
          opt = line.slice(idx + 1).trim()

          opts.push(opt)

          var firstIdx = line.indexOf(opt)

          const lastIdx = line.lastIndexOf(opt)

          if (!name && firstIdx !== -1 && firstIdx !== lastIdx) {
            name = line.slice(0, firstIdx).trim()

            line = line.slice(firstIdx + opt.length)

            idx = line.lastIndexOf('|')
          }

          line = line.slice(0, idx).trim()

          idx = line.lastIndexOf('|')
        }

        if (name && line.trim()) opts.push(line.trim())
        else if (!name) {
          // Find largest number of words with two consecutive matches

          const words = line
            .split(' ')
            .filter(function (item) {
              return Boolean(item)
            })
            .reverse()

          let num_words = 1

          opt = words.slice(0, num_words).reverse().join(' ')

          let re = new RegExp(opt + '\\s+' + opt)

          while (!re.test(line)) {
            num_words += 1

            opt = words.slice(0, num_words).reverse().join(' ')

            re = new RegExp(opt + '\\s+' + opt)
          }

          var firstIdx = line.indexOf(opt)

          name = line.slice(0, firstIdx).trim()

          opts.push(opt)
        }

        cameraControls.push({
          name,
          type: 'list',
          opts: opts.reverse()
        })
      }
    }

    const obj = line.match(headerRegExp)

    if (obj) {
      inOptions = true

      // The output of the fswebcam --list-controls command has
      // terminal escape characters at the beginning of the each line

      prefixLength = obj.groups.prefix.length
    }
  }

  callback && callback(cameraControls)
}

/**
 * Data validations based on fs output
 *
 * @inheritdoc
 *
 */

FSWebcam.prototype.runCaptureValidations = function (data) {
  if (FSWebcam.Validations.noWebcam.exec(data))
    return new Error('No webcam found')

  return null
}

// Defaults

FSWebcam.Defaults = {
  topBanner: false,

  bottomBanner: false,

  title: false,

  subTitle: false,

  timestamp: false,

  greyscale: false,

  saturation: false,

  skip: false,

  setValues: {}
}

// Validations const

FSWebcam.Validations = {
  noWebcam: /no.*such.*(file|device)/i
}

// Export

module.exports = FSWebcam
