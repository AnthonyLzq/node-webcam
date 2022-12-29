import os from 'os'
import fs from 'fs'

const getLinuxCameras = () => {
  const req = /^video/i
  const dir = '/dev/'
  const result = fs.readdirSync(dir)
  const cameras = result.reduce<string[]>((acc, d) => {
    if (d.match(req)) acc.push(dir + d)

    return acc
  }, [])

  return cameras
}

const getCameras = () => {
  switch (os.platform()) {
    case 'linux':
    case 'darwin':
      return getLinuxCameras()
  }
}

export { getLinuxCameras, getCameras }
