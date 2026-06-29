# [@anthonylzq/node-webcam](https://github.com/AnthonyLzq/node-webcam)

Cross platform webcam usage

## Install

### Linux

```
# Linux relies on fswebcam currently
# ubuntu

sudo apt-get install fswebcam

# arch
# fswebcam requires a build from the AUR

yay -S fswebcam
```

### Mac OSX

```
# Mac OSX relies on imagesnap
# Repo https://github.com/rharder/imagesnap
# Available through brew

brew install imagesnap
```

### Windows

Standalone exe included. See [src/bindings/CommandCam](https://github.com/chuckfairy/node-webcam/tree/master/src/bindings/CommandCam)

## Usage

### API Usage

- The simplest use case:

  ```ts
  import { capture } from '@anthonylzq/node-webcam'

  const main = async () => {
    const result = await capture({
      location: 'picture.jpeg'
    })

    console.log('buffer', result.buffer)
    console.log('base64', result.toBase64())
  }
  ```

- In case you want to use another file type such as `jpg`, `png` or `bmp` you **must** indicate it in the `options` object, otherwise you will get an error:

  ```ts
  import { capture } from '@anthonylzq/node-webcam'

  const main = async () => {
    const result = await capture({
      location: 'picture.png',
      options: {
        output: 'png'
      }
    })

    console.log('buffer', result.buffer)
  }
  ```

  This is because in order to build the captured image correctly the file extension and output type must match.

- In case you need something more advance you can use the `create` function that will give you a class that will handle the usage of the webcam for you.

  ```ts
  import { create } from '@anthonylzq/node-webcam'

  const webcam = create()
  ```

- In case you want to list the available cameras in your OS, you can use the `listWebcams` function:

  ```ts
  import { listWebcams } from '@anthonylzq/node-webcam'

  const cameras = await listWebcams()
  ```

- The default configuration for all the webcams classes and methods can be found in the `defaults` object:

  ```ts
  import { defaults } from '@anthonylzq/node-webcam'

  console.log(defaults)
  /**
   * {
   *   width: 1280,
   *   height: 720,
   *   quality: 100,
   *   delay: 0,
   *   title: '',
   *   subtitle: '',
   *   timestamp: '',
   *   saveShots: true,
   *   output: 'jpeg',
   *   device: '',
   *   verbose: false,
   *   timeout: 0,
   *   frames: 1,
   *   greyScale: false,
   *   rotation: 0,
   *   bottomBanner: false,
   *   topBanner: false,
   *   skip: 0
   * }
   */
  ```

- In case you want aggregate capture metrics, you can use the optional metrics helpers:

  ```ts
  import { getMetricsReport, resetMetrics } from '@anthonylzq/node-webcam'

  const metrics = getMetricsReport()

  console.log(metrics.captures.total)
  console.log(metrics.captures.averageElapsedMs)

  resetMetrics()
  ```

## Author

- **Charlie Abeling** - _Initial Work_ - _Documentation_ - [chuckfairy](https://github.com/chuckfairy).

## Maintainers

- **Anthony Luzquiños** - _Rework_ - _Documentation_ - [AnthonyLzq](https://github.com/AnthonyLzq).

<!-- ## Contributors

- **Andree Anchi** - _Bug reports_ - [andreewaD](https://github.com/andreewD). -->