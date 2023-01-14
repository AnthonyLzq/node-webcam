/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function */
import { resolve } from 'path'

import { Factory } from './Factory'
import { BaseWebcam, FSWebcam, ImageSnapWebcam, WindowsWebcam } from './webcams'
import type { WebcamConfig } from './types'

const create = (options: Partial<WebcamConfig>, type: string) =>
  new Factory(options).create(type)

const capture = async (
  {
    location = 'location.jpeg',
    type = 'linux',
    options = {},
    cb = (value?: string | Buffer) => {},
    returnType = 'base64'
  }: {
    location?: string
    type?: string
    options?: Partial<WebcamConfig>
    cb?: (value?: string | Buffer) => void
    returnType?: 'base64' | 'buffer'
  } = {
    location: 'location.jpeg',
    type: 'linux',
    options: {},
    cb: (value?: string | Buffer) => {},
    returnType: 'base64'
  }
) => {
  const Webcam = create(options, type)
  const path = resolve(__dirname, location)
  const result = await Webcam.capture(
    Webcam.generateSh(location),
    path,
    returnType
  )

  cb?.(result)

  return result
}

const list = (type: string) => create({}, type).list()

export {
  create,
  capture,
  list,
  Factory,
  BaseWebcam,
  FSWebcam,
  ImageSnapWebcam,
  WindowsWebcam
}
export { defaults } from './utils'

export type NodeWebcamConfig = WebcamConfig
