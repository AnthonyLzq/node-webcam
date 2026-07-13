import os from 'os'
import { existsSync } from 'fs'
import { join } from 'path'

import { WebcamError } from '../errors'

const getCommandCamBaseDirectory = ({
  env = process.env,
  homedir = os.homedir()
}: {
  env?: NodeJS.ProcessEnv
  homedir?: string
} = {}) => {
  if (env.NODE_WEBCAM_COMMANDCAM_DIR) return env.NODE_WEBCAM_COMMANDCAM_DIR

  return join(
    env.LOCALAPPDATA || join(homedir, 'AppData', 'Local'),
    'node-webcam',
    'CommandCam'
  )
}

const getCommandCamCachePath = (
  options: {
    env?: NodeJS.ProcessEnv
    homedir?: string
  } = {}
) => join(getCommandCamBaseDirectory(options), 'CommandCam.exe')

const resolveCommandCamPath = ({
  env = process.env,
  homedir = os.homedir()
}: {
  env?: NodeJS.ProcessEnv
  homedir?: string
} = {}) => {
  const candidates = [
    env.NODE_WEBCAM_COMMANDCAM_PATH,
    getCommandCamCachePath({ env, homedir })
  ].filter((candidate): candidate is string => Boolean(candidate))
  const commandCamPath = candidates.find(candidate => existsSync(candidate))

  if (commandCamPath) return commandCamPath

  throw new WebcamError({
    code: 'COMMANDCAM_NOT_INSTALLED',
    message:
      'CommandCam.exe is not installed. Run "npx @anthonylzq/node-webcam setup windows" on Windows or set NODE_WEBCAM_COMMANDCAM_PATH.',
    details: {
      candidates
    }
  })
}

export {
  getCommandCamBaseDirectory,
  getCommandCamCachePath,
  resolveCommandCamPath
}
