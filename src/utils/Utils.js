/**
 * JS utils
 *
 */
var Utils = {
  // Highly used as an inheritance

  setDefaults(object, defaults) {
    var defaults = typeof defaults === 'object' ? defaults : {}
    var object = typeof object === 'object' ? object : {}

    if (object === defaults) return object

    for (const defaultName in defaults) {
      const defaultVal = defaults[defaultName]
      const objectVal = object[defaultName]

      if (typeof defaultVal === 'object')
        object[defaultName] = Utils.setDefaults(objectVal, defaultVal)
      else if (typeof objectVal === 'undefined')
        object[defaultName] = defaults[defaultName]
    }

    return object
  },

  // Node-webcam escape string

  escape(cmd) {
    return '"' + cmd.replace(/(["\s'$`\\()])/g, '\\$1') + '"'
  }
}

module.exports = Utils
