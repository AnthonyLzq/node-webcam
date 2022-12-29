/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function */
import { Factory } from './Factory'
import type { WebcamTypes } from './Factory'
import { BaseWebcam, FSWebcam, ImageSnapWebcam, WindowsWebcam } from './webcams'
import { resolve } from 'path'

const create = (options: Partial<WebcamConfig>, type: keyof WebcamTypes) =>
  new Factory(options).create(type)

const capture = async (
  {
    location = 'location.jpeg',
    type = 'linux',
    options = {},
    cb = (value?: string) => {}
  }: {
    location?: string
    type?: keyof WebcamTypes
    options?: Partial<WebcamConfig>
    cb?: (value?: string) => void
  } = {
    location: 'location.jpeg',
    type: 'linux',
    options: {},
    cb: (value?: string) => {}
  }
) => {
  const Webcam = create(options, type)
  const path = resolve(__dirname, location)
  const base64Result = await Webcam.capture(Webcam.generateSh(location), path)

  cb(base64Result)
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
