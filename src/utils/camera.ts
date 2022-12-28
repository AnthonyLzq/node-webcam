import os from 'os'
import fs from 'fs'

const getLinuxCameras = (cb?: (camPaths: string[]) => unknown) => {
  const req = /^video/i
  const dir = '/dev/'
  const result = fs.readdirSync(dir)
  const cameras = result.reduce<string[]>((acc, d) => {
    if (d.match(req)) acc.push(dir + d)

    return acc
  }, [])

  cb?.(cameras)

  return cameras
}

const getCameras = (cb?: (camPaths: string[]) => unknown) => {
  switch (os.platform()) {
    case 'linux':
    case 'darwin':
      return getLinuxCameras(cb)
  }
}

export { getLinuxCameras, getCameras }
