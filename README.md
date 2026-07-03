# [@anthonylzq/node-webcam](https://github.com/AnthonyLzq/node-webcam)

Cross platform webcam usage

## Install

### Linux

Linux uses the bundled native V4L2 addon when a matching prebuild is available,
then falls back to `ffmpeg` when it is installed, and finally to `fswebcam`.

```
# Optional fallback backends
# ubuntu

sudo apt-get install ffmpeg fswebcam

# arch
# fswebcam requires a build from the AUR

yay -S ffmpeg fswebcam
```

### Mac OSX

macOS uses `ffmpeg` when it is installed, then falls back to `imagesnap`.

```
# Optional preferred backend
brew install ffmpeg

# Legacy fallback backend
# Repo https://github.com/rharder/imagesnap

brew install imagesnap
```

### Windows

Windows uses `ffmpeg` when it is installed and a camera `device` name is
provided, then falls back to `CommandCam.exe`. The package `postinstall`
downloads the CommandCam release asset on Windows, verifies its SHA-256
checksum, and installs it under the built package bindings. The CommandCam
release tag and checksum are pinned in `package.json` and only need updates when
that binary changes. Set `NODE_WEBCAM_SKIP_COMMANDCAM_DOWNLOAD=1` to skip the
download, or `NODE_WEBCAM_COMMANDCAM_STRICT=1` to fail installation if the
verified download cannot complete.

## Backend selection

`capture()` and `create()` choose the first available backend for the current
platform. The public API does not require backend selection.

| Platform | Selection order |
| --- | --- |
| Linux | `native:v4l2` -> `ffmpeg:v4l2` -> `fswebcam` |
| macOS | `ffmpeg:avfoundation` -> `imagesnap` |
| Windows | `ffmpeg:dshow` -> `CommandCam` |

Fallback only happens while selecting a backend. If the selected backend starts
a capture and fails because of permissions, an invalid device, a timeout, or an
unsupported format, the error is surfaced instead of silently trying the next
backend. The backend used for a capture is available as `result.backend` and
`result.backendType`.

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

- If you only need the returned buffer and want to skip file persistence, set `save` to `false`:

  ```ts
  import { capture } from '@anthonylzq/node-webcam'

  const result = await capture({
    location: 'picture.jpeg',
    options: {
      save: false
    }
  })

  console.log(result.buffer)
  ```

  You can also provide a custom save handler:

  ```ts
  await capture({
    location: 'picture.jpeg',
    options: {
      save: async (path, buffer) => {
        await uploadSomewhere(path, buffer)
        return false
      }
    }
  })
  ```

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
   *   save: true,
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