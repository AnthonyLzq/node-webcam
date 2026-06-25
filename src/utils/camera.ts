import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import { resolve } from 'path'
import { promisify } from 'util'

import { WebcamError, getCommandErrorCode } from '../errors'

const asyncExecFile = promisify(execFile)

type CameraListCommand = {
  file: string
  args: string[]
}

type GetCamerasOptions = {
  platform?: string
  windowsCommandCamPath?: string
}

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
  return getPlatformCameras()
}

const getImageSnapListCommand = (): CameraListCommand => ({
  file: 'imagesnap',
  args: ['-l']
})

const getWindowsListCommand = (file: string): CameraListCommand => ({
  file,
  args: ['/devlist']
})

const getDefaultWindowsListCommand = () =>
  getWindowsListCommand(
    resolve(__dirname, '..', 'bindings', 'CommandCam', 'CommandCam.exe')
  )

const parseImageSnapCameras = (stdout: string) => {
  const lines = stdout.split('\n')

  return lines.reduce<string[]>((acc, line) => {
    if (line === 'Video Devices:' || !line) return acc

    acc.push(line.replace(/.*?\[(.*?)\].*/, '$1'))

    return acc
  }, [])
}

const parseWindowsCameras = (stdout: string) => {
  const lines = stdout.split('\n')

  return lines.reduce<string[]>((acc, line) => {
    const formattedLine = line.replace('\r', '')

    if (formattedLine === 'Available capture devices:' || !formattedLine)
      return acc

    acc.push(formattedLine)

    return acc
  }, [])
}

const runCameraListCommand = async ({ args, file }: CameraListCommand) => {
  try {
    const result = await asyncExecFile(file, args)

    if (result.stderr)
      throw new WebcamError({
        code: 'CAMERA_LIST_FAILED',
        message: result.stderr,
        details: { args, file }
      })

    return result.stdout
  } catch (error) {
    if (error instanceof WebcamError) throw error

    const code = getCommandErrorCode(error)

    throw new WebcamError({
      code: code === 'BINARY_NOT_FOUND' ? code : 'CAMERA_LIST_FAILED',
      message:
        code === 'BINARY_NOT_FOUND'
          ? `Webcam command binary was not found: ${file}`
          : 'Unable to list webcams',
      cause: error,
      details: { args, file }
    })
  }
}

const getPlatformCameras = async ({
  platform = os.platform(),
  windowsCommandCamPath
}: GetCamerasOptions = {}) => {
  switch (platform) {
    case 'linux':
      return getLinuxCameras()
    case 'darwin':
      return parseImageSnapCameras(
        await runCameraListCommand(getImageSnapListCommand())
      )
    case 'win32':
    case 'win64':
      return parseWindowsCameras(
        await runCameraListCommand(
          windowsCommandCamPath
            ? getWindowsListCommand(windowsCommandCamPath)
            : getDefaultWindowsListCommand()
        )
      )
    default:
      return []
  }
}

export {
  getCameras,
  getDefaultWindowsListCommand,
  getImageSnapListCommand,
  getLinuxCameras,
  getPlatformCameras,
  getWindowsListCommand,
  parseImageSnapCameras,
  parseWindowsCameras
}
