# [@anthonylzq/node-webcam](https://github.com/AnthonyLzq/node-webcam)

Cross platform webcam usage

# Install

## Linux

```
# Linux relies on fswebcam currently
# ubuntu

sudo apt-get install fswebcam

# arch
# fswebcam requires a build from the AUR, it is not listed for installation on pacman/pamac

sudo pamac build fswebcam
```

## Mac OSX

```
# Mac OSX relies on imagesnap
# Repo https://github.com/rharder/imagesnap
# Available through brew

brew install imagesnap
```

## Windows

Standalone exe included. See [src/bindings/CommandCam](https://github.com/chuckfairy/node-webcam/tree/master/src/bindings/CommandCam)


# Usage

### API Usage

The simplest use case:

```ts
import { platform } from 'os'
import { capture } from '@anthonylzq/node-webcam'

const callback = (base64Result: string) => {
  console.log('base64Result', base64Result)
}

const main = async () => {
  await capture({
    cb: callback,
    location: resolve(__dirname, 'picture.jpeg'),
    type: platform()
  })
}
```

In case you need something more advance you can use the `create` function that will give you a class that will handle the usage of the webcam for you.

```ts
import { platform } from 'os'
import { create } from '@anthonylzq/node-webcam'

// The supported platforms are: linux, darwin, win32 and win64. Besides you can use 'fswebcam' as second parameter instead of "platform()"
const Webcam = create({}, platform())
```

In case you want to list the available cameras in your OS, you can use the `list` function:

```ts
import { platform } from 'os'
import { create } from '@anthonylzq/node-webcam'

const cameras = create({}, platform())
```

The default configuration for all the webcams classes and methods can be found in the `defaults` object:

```ts
import { platform } from 'os'
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
 *   callbackReturn: 'location',
 *   verbose: false,
 *   frames: 1,
 *   greyScale: false,
 *   rotation: 0,
 *   bottomBanner: false,
 *   topBanner: false,
 *   skip: 0
 * }
 */
```

## Author

- **Charlie Abeling** - _Initial Work_ - _Documentation_ - [chuckfairy](https://github.com/chuckfairy).

## Maintainers

- **Anthony Luzquiños** - _Rework_ - _Documentation_ - [AnthonyLzq](https://github.com/AnthonyLzq).

<!-- ## Contributors

- **Andree Anchi** - _Bug reports_ - [andreewaD](https://github.com/andreewD). -->