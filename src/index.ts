/* eslint-disable @typescript-eslint/no-empty-function */
import { Factory } from './Factory'
import type { WebcamTypes } from './Factory'
import { BaseWebcam, FSWebcam, ImageSnapWebcam, WindowsWebcam } from './webcams'

const create = (options: Partial<WebcamConfig>, type: keyof WebcamTypes) =>
  new Factory(options).create(type)

const capture = async (
  {
    location = 'location.jpeg',
    type = 'linux',
    options = {},
    cb = () => {}
  }: {
    location?: string
    type?: keyof WebcamTypes
    options?: Partial<WebcamConfig>
    cb?: () => void
  } = {
    location: 'location.jpeg',
    type: 'linux',
    options: {},
    cb: () => {}
  }
) => {
  const Webcam = create(options, type)

  await Webcam.capture(Webcam.generateSh(location))

  cb()
}

const list = (type: keyof WebcamTypes) => create({}, type).list()

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

export type NodeWebcamConfig = WebcamConfig
