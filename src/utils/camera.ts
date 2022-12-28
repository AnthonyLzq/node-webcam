import os from 'os'
import fs from 'fs'

const getLinuxCameras = (cb?: (camPaths: string[]) => unknown) => {
  const req = /^video/i
  const dir = '/dev/'

  fs.readdir(dir, (error, data) => {
    if (error) {
      console.error(`Error while reading the dir: ${dir}`, error)

      throw error
    }

    const cameras = data.reduce<string[]>((acc, d) => {
      if (d.match(req)) acc.push(dir + d)

      return acc
    }, [])

    cb?.(cameras)
  })
}

const getCameras = (cb?: (camPaths: string[]) => unknown) => {
  switch (os.platform()) {
    case 'linux':
    case 'darwin':
      return getLinuxCameras(cb)
  }
}

export { getLinuxCameras, getCameras }
