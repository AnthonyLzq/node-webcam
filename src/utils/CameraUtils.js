/**
 * Shared camera utils
 *
 */
'use strict'

const OS = require('os')

const FS = require('fs')

var CameraUtils = {
  getCameras(callback) {
    switch (CameraUtils.Platform) {
      case 'linux':
      case 'darwin':
        return CameraUtils.getLinuxCameras(callback)
    }
  },

  // Linux cameras read /dev dir

  getLinuxCameras(callback) {
    const reg = /^video/i

    const dir = '/dev/'

    FS.readdir(dir, function (err, data) {
      if (err) throw err

      const cams = []

      const dl = data.length

      for (let i = 0; i < dl; i++) {
        const camPath = data[i]

        if (camPath.match(reg)) cams.push(dir + camPath)
      }

      callback && callback(cams)
    })
  }
}

CameraUtils.Platform = OS.platform()

module.exports = CameraUtils
