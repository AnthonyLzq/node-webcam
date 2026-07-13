import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import { promisify } from 'util'

import {
  WebcamError,
  getCommandErrorCode,
  getCommandErrorMessage
} from '../errors'
import { resolveCommandCamPath } from './commandCam'

const asyncExecFile = promisify(execFile)

type CameraListCommand = {
  file: string
  args: string[]
}

type GetCamerasOptions = {
  platform?: string
  signal?: AbortSignal
  timeout?: number
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

const getCameras = (options: GetCamerasOptions = {}) => {
  return getPlatformCameras(options)
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
  getWindowsListCommand(resolveCommandCamPath())

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

const runCameraListCommand = async (
  { args, file }: CameraListCommand,
  { signal, timeout = 0 }: Pick<GetCamerasOptions, 'signal' | 'timeout'> = {}
) => {
  try {
    const result = await asyncExecFile(file, args, {
      signal,
      timeout
    })

    return result
  } catch (error) {
    if (error instanceof WebcamError) throw error

    const code = getCommandErrorCode(error, { timeout })
    const isCommandError =
      code === 'BINARY_NOT_FOUND' ||
      code === 'COMMAND_ABORTED' ||
      code === 'COMMAND_TIMEOUT'

    throw new WebcamError({
      code: isCommandError ? code : 'CAMERA_LIST_FAILED',
      message: isCommandError
        ? getCommandErrorMessage({
            code,
            file,
            timeout
          })
        : 'Unable to list webcams',
      cause: error,
      details: {
        args,
        file,
        signalAborted: signal?.aborted ?? false,
        timeout
      }
    })
  }
}

const getPlatformCameras = async ({
  platform = os.platform(),
  signal,
  timeout = 0,
  windowsCommandCamPath
}: GetCamerasOptions = {}) => {
  switch (platform) {
    case 'linux':
      return getLinuxCameras()
    case 'darwin': {
      const command = getImageSnapListCommand()
      const { stderr, stdout } = await runCameraListCommand(command, {
        signal,
        timeout
      })

      if (stderr)
        throw new WebcamError({
          code: 'CAMERA_LIST_FAILED',
          message: stderr,
          details: command
        })

      return parseImageSnapCameras(stdout)
    }
    case 'win32':
    case 'win64': {
      const command = windowsCommandCamPath
        ? getWindowsListCommand(windowsCommandCamPath)
        : getDefaultWindowsListCommand()
      const { stderr, stdout } = await runCameraListCommand(command, {
        signal,
        timeout
      })

      return parseWindowsCameras(stdout || stderr)
    }
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
