# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### 3.0.1 (2026-07-16)

## [3.0.0](https://github.com/AnthonyLzq/node-webcam/compare/v2.2.0...v3.0.0) (2026-07-15)


### ⚠ BREAKING CHANGES

* **api:** return structured capture results and auto-select backends

### Features

* add capture timeout and abort signal support ([00f7ee9](https://github.com/AnthonyLzq/node-webcam/commit/00f7ee915c36e1da29073f2fac98f4cd2760c782))
* add ffmpeg webcam backend fallback ([4456a4d](https://github.com/AnthonyLzq/node-webcam/commit/4456a4d2f0d1471cdc4b9487650c34d472d3b4f0))
* add optional capture file persistence ([77ff62f](https://github.com/AnthonyLzq/node-webcam/commit/77ff62f9ee275cfdc611a2f81ed8555dae4d50a8))
* add verbose webcam diagnostics with pluggable logger ([9ee15ad](https://github.com/AnthonyLzq/node-webcam/commit/9ee15ad94b47dadcc0ca0eb9dd4e1f5d7d334996))
* **api:** return structured capture results and auto-select backends ([e1680df](https://github.com/AnthonyLzq/node-webcam/commit/e1680df46276553cf5bc6c4af0bbd9fdd7f6c8df))
* expose aggregate capture metrics report ([647ebb5](https://github.com/AnthonyLzq/node-webcam/commit/647ebb59a06f27148667f39001d790a4064ddbc4))
* **native:** prefer V4L2 addon for Linux captures ([e47be2d](https://github.com/AnthonyLzq/node-webcam/commit/e47be2db99e6a47e944666db5ec37a54654cff7f))
* **native:** prototype Linux V4L2 capture addon ([a3b8db9](https://github.com/AnthonyLzq/node-webcam/commit/a3b8db99041039408e16071e0e485a5b635377ac))
* **native:** ship Linux V4L2 prebuild in package ([96f9251](https://github.com/AnthonyLzq/node-webcam/commit/96f925193c41c837dd52b1aba5878ae4040635cd))
* publish dual CJS and ESM builds ([798338f](https://github.com/AnthonyLzq/node-webcam/commit/798338f6038b71b182bae78bcd7584663aec5bfb))
* replace CommandCam postinstall with manual setup ([5788ec7](https://github.com/AnthonyLzq/node-webcam/commit/5788ec773bc964d67a4fc5426ca22b503543a03c))
* serialize captures by output path and device ([43311ec](https://github.com/AnthonyLzq/node-webcam/commit/43311eca0cbfe0eba98b352f7ca6bb5d824ba2c9))
* serialize captures that share an output path ([abc2fa2](https://github.com/AnthonyLzq/node-webcam/commit/abc2fa25e9a6a61241b9f1eb9e20f9e718eaa5f3))


### Bug Fixes

* add timeout and abort support to webcam listing ([996727a](https://github.com/AnthonyLzq/node-webcam/commit/996727ac1852845e08c80520ea729743fc75835f))
* add typed webcam errors for validation and command failures ([f7d3f88](https://github.com/AnthonyLzq/node-webcam/commit/f7d3f8825459184151c908115b701d9e6362aa04))
* align legacy helpers and backend docs ([7825f88](https://github.com/AnthonyLzq/node-webcam/commit/7825f88c947801640b901e2832088d36560b9068))
* align timeout semantics and device capture locks ([bb60348](https://github.com/AnthonyLzq/node-webcam/commit/bb603486644c7bcf494114d24979cba7cf399492))
* bound timeout values to Node timer limits ([c3cef33](https://github.com/AnthonyLzq/node-webcam/commit/c3cef33db104726119eea3598e2ee36fe848c1f3))
* cache top-level backend selection ([ffc431d](https://github.com/AnthonyLzq/node-webcam/commit/ffc431dd6d8d76b20f18bb6685a483401b063dcb))
* **ci:** disable implicit native rebuild during install ([c1ec236](https://github.com/AnthonyLzq/node-webcam/commit/c1ec236476451ddf3f02b8e8c44cfb0606261d04))
* **ci:** make tests and package validation cross-platform ([1d63fe4](https://github.com/AnthonyLzq/node-webcam/commit/1d63fe4e1adc817e8587fe854045f16cfb0cc30e))
* create private temp dirs for CLI captures ([72d4d98](https://github.com/AnthonyLzq/node-webcam/commit/72d4d984b0b08d0e6a61dacb944104edf853329b))
* enforce Windows fallback contract and list options ([6e311e7](https://github.com/AnthonyLzq/node-webcam/commit/6e311e740f22a5ddc41606ef25583acd2a47dc58))
* execute webcam commands with execFile argument arrays instead of shell strings ([acfb1ea](https://github.com/AnthonyLzq/node-webcam/commit/acfb1ea3473143f1c670f3896b61c3f7390fd9dd))
* filter Linux webcam listing by V4L2 capabilities ([0351cf7](https://github.com/AnthonyLzq/node-webcam/commit/0351cf75f6887ac90c775ea1e77461f333c4650b))
* harden backend selection and native capture safety ([72d637f](https://github.com/AnthonyLzq/node-webcam/commit/72d637ffdd0f9165a85c4550484ae74c836039d6))
* harden CommandCam postinstall download ([3560fd9](https://github.com/AnthonyLzq/node-webcam/commit/3560fd97dee1809c1593b8837a92e3ac9a95ec4b))
* harden ffmpeg backend availability policy ([7b66bcc](https://github.com/AnthonyLzq/node-webcam/commit/7b66bccf488102315ded52501c4bf1984d76ef8e))
* harden listing validation and imagesnap parsing ([3b1d7c5](https://github.com/AnthonyLzq/node-webcam/commit/3b1d7c5f424640190beb7b9bbd529080a38f94c5))
* honor saveShots for captured frame retention ([9ba89a7](https://github.com/AnthonyLzq/node-webcam/commit/9ba89a7c527c7da781f04c17bc6b221317fc2ce6))
* include Node types for TypeScript consumers ([bbd40d6](https://github.com/AnthonyLzq/node-webcam/commit/bbd40d6c9c8b117b48542072a0683a1b5a8784c3))
* keep CommandCam temporary captures within path limit ([01c48d7](https://github.com/AnthonyLzq/node-webcam/commit/01c48d7621f17d8275453bf377145965e0ce9359))
* make camera listing platform-aware through async backend APIs ([36acb4f](https://github.com/AnthonyLzq/node-webcam/commit/36acb4f27b7ed0a89c638eb44aff019b851c86a7))
* make deprecated list APIs use platform-aware listing ([fd66052](https://github.com/AnthonyLzq/node-webcam/commit/fd660527d765ad9140d207a20d4a2b4fa57486a8))
* **native:** enforce absolute V4L2 capture timeout ([5028dc9](https://github.com/AnthonyLzq/node-webcam/commit/5028dc99ae3eada9408b2175a3e6f91ae0f727c4))
* **native:** harden N-API status handling ([61c09d8](https://github.com/AnthonyLzq/node-webcam/commit/61c09d823b92b92defc66c6366bd72b0f1f72624))
* **native:** harden unsupported addon N-API handling ([53a04c5](https://github.com/AnthonyLzq/node-webcam/commit/53a04c5b5171dfd42f8ed9f2062b007afee07d64))
* **native:** probe V4L2 MMAP availability ([a7787d8](https://github.com/AnthonyLzq/node-webcam/commit/a7787d894931583ac633f5fdd41735af005e32a0))
* **native:** require exact V4L2 capture compatibility ([59550fc](https://github.com/AnthonyLzq/node-webcam/commit/59550fc37abbde14e6e852ba221a4d8a5c71ad5a))
* **native:** run V4L2 capture off the event loop ([520e9ba](https://github.com/AnthonyLzq/node-webcam/commit/520e9baddc105f08fd9fa9d95a50d217983d6c33))
* **native:** surface typed Linux V4L2 capture errors ([1cdc185](https://github.com/AnthonyLzq/node-webcam/commit/1cdc185c08f459939949a151526fe67a76aca3c2))
* **native:** tag Linux prebuild libc ([4ab7a87](https://github.com/AnthonyLzq/node-webcam/commit/4ab7a87e13cc9e045dce00654a4c5d75b69d5719))
* normalize Linux capture device locks ([f7122fb](https://github.com/AnthonyLzq/node-webcam/commit/f7122fba3d46a6e63de7b44077743d3b6660d954))
* **package:** prevent implicit native rebuild on install ([cdbbf91](https://github.com/AnthonyLzq/node-webcam/commit/cdbbf910826ea390faa66886b7d6091066850bde))
* parse successful Windows camera listing from stderr ([502574e](https://github.com/AnthonyLzq/node-webcam/commit/502574e35bef276700b8165409e05dd30e3feae9))
* persist long CommandCam paths via temporary capture ([994b4c2](https://github.com/AnthonyLzq/node-webcam/commit/994b4c2c432b05af13a8895fddecae04e031413e))
* preserve list sync API and harden capture queue edge cases ([7ef972a](https://github.com/AnthonyLzq/node-webcam/commit/7ef972a66c15360cd44afb2c84096d45140d7c7f))
* probe ffmpeg capture availability before fallback ([d86226b](https://github.com/AnthonyLzq/node-webcam/commit/d86226b49caa4b844473fbc05c6400ad6323bc3b))
* reject bmp output for fswebcam fallback ([15231d2](https://github.com/AnthonyLzq/node-webcam/commit/15231d28c4cd16b06d82eeccd004790c9b3cca52))
* reject CommandCam output paths beyond native buffer limit ([c20b141](https://github.com/AnthonyLzq/node-webcam/commit/c20b14129214a56cef9c145828624efe453d3b0f))
* reject fractional timeouts and incomplete abort signals ([13db913](https://github.com/AnthonyLzq/node-webcam/commit/13db913deaef1f0c30d04321bbea1ad83013c28d))
* reject option-like capture output paths ([a679ebd](https://github.com/AnthonyLzq/node-webcam/commit/a679ebd4c10ea6995d2f53981ef9c353cd92531f))
* reject output paths that look like command options ([d923704](https://github.com/AnthonyLzq/node-webcam/commit/d92370486c97de332049d1d64110fb1a10635aed))
* reject quoted CommandCam output paths ([6c53bc4](https://github.com/AnthonyLzq/node-webcam/commit/6c53bc467e07feb54466b9d7166a0742880e588a))
* remove stale backend caches and nondestructive ffmpeg probe ([83e424f](https://github.com/AnthonyLzq/node-webcam/commit/83e424f5240a5123d9d40591326dc3ecb10aea97))
* run package validation through Windows-safe shims ([2eab565](https://github.com/AnthonyLzq/node-webcam/commit/2eab5650e2306474bd6cad05fced2308997be388))
* select CommandCam devices by name when needed ([7927efd](https://github.com/AnthonyLzq/node-webcam/commit/7927efd4fbda3e7cd3c852e34165c5ac28a4ab24))
* separate CommandCam logical and execution path validation ([f7ccf5d](https://github.com/AnthonyLzq/node-webcam/commit/f7ccf5dc81b7885044d44b1fea4912f89753cb6d))
* serialize top-level capture selection by device ([daa8b79](https://github.com/AnthonyLzq/node-webcam/commit/daa8b79dd5e729610b49e25c157b585ab1a21259))
* stop publishing legacy CommandCam bindings ([8904de4](https://github.com/AnthonyLzq/node-webcam/commit/8904de4b1dc193a621c1d60fb47f2592b725a253))
* surface CommandCam output format errors ([a84b41a](https://github.com/AnthonyLzq/node-webcam/commit/a84b41a16b8b239e663c2338e1e80bceebc9e4a1))
* tolerate materialized defaults for CommandCam fallback ([4f867f7](https://github.com/AnthonyLzq/node-webcam/commit/4f867f7da68270ac931e35c7d07241e0dd839e91))
* use system temp dir for memory-only CLI captures ([ed4d04c](https://github.com/AnthonyLzq/node-webcam/commit/ed4d04c900ff1849a1b504a0f36b23c3630ff375))
* validate webcam configuration at runtime ([eabc7a6](https://github.com/AnthonyLzq/node-webcam/commit/eabc7a61159e090945b18ea7b81dc11ce113bfd9))
* whitelist published package contents ([2107a04](https://github.com/AnthonyLzq/node-webcam/commit/2107a0424b8e47622364440a5a9bd6efa8cbcc62))

## [2.2.0](https://github.com/AnthonyLzq/node-webcam/compare/v2.1.0...v2.2.0) (2023-03-12)


### Features

* implemented logo ([f070f76](https://github.com/AnthonyLzq/node-webcam/commit/f070f76ff1391fdacc9953f36df8f2295c5ecb7c))

## [2.1.0](https://github.com/AnthonyLzq/node-webcam/compare/v2.0.3...v2.1.0) (2023-01-14)


### Bug Fixes

* making cb optionally executed ([e4bda9d](https://github.com/AnthonyLzq/node-webcam/commit/e4bda9d3035f97daae977f01360b3dadf379d622))

### [2.0.3](https://github.com/AnthonyLzq/node-webcam/compare/v2.0.2...v2.0.3) (2023-01-02)


### Bug Fixes

* issue related with output, all the images were taken as jpeg ([3b67745](https://github.com/AnthonyLzq/node-webcam/commit/3b677453276561d183bf82786c5bd7b1d9067d40))

### [2.0.2](https://github.com/AnthonyLzq/node-webcam/compare/v2.0.1...v2.0.2) (2022-12-31)


### Bug Fixes

* replace prepublish with prepare ([d3d944f](https://github.com/AnthonyLzq/node-webcam/commit/d3d944f4f0526d6dbc6264c82c82dd3805074861))

### [2.0.1](https://github.com/AnthonyLzq/node-webcam/compare/v2.0.0...v2.0.1) (2022-12-31)


### Bug Fixes

* docs styling ([c8c4ba9](https://github.com/AnthonyLzq/node-webcam/commit/c8c4ba9dfdec697be6c05137695138fa9f31cf23))

## [2.0.0](https://github.com/AnthonyLzq/node-webcam/compare/v1.1.7...v2.0.0) (2022-12-31)


### Features

* removed callback support, removed quality attribute, returning image as base64 or Buffer and updated docs ([0e93934](https://github.com/AnthonyLzq/node-webcam/commit/0e93934d796d910d1d64c9b5dce8bb9ff098e9f1))

### [1.1.7](https://github.com/AnthonyLzq/node-webcam/compare/v1.1.6...v1.1.7) (2022-12-30)


### Bug Fixes

* removed unnecesary console.log ([fd8910c](https://github.com/AnthonyLzq/node-webcam/commit/fd8910ce7a6b4fda7ff7c0765aebff4f514fd083))

### [1.1.6](https://github.com/AnthonyLzq/node-webcam/compare/v1.1.5...v1.1.6) (2022-12-30)


### Bug Fixes

* posinstall bindings location ([78fe9f1](https://github.com/AnthonyLzq/node-webcam/commit/78fe9f16e7ea4e3e1bc06e0231e6151db2a37992))

### [1.1.5](https://github.com/AnthonyLzq/node-webcam/compare/v1.1.4...v1.1.5) (2022-12-30)


### Features

* updated npmignore file ([a9adaa9](https://github.com/AnthonyLzq/node-webcam/commit/a9adaa9c62ad69ccbbc0489b4b74aabc4dbbc0a5))


### Bug Fixes

* building issue using tsc-alias, solution got from https://github.com/Microsoft/TypeScript/issues/15479#issuecomment-660226606 ([cfb8a3c](https://github.com/AnthonyLzq/node-webcam/commit/cfb8a3c4c2333c87c77809e29a2cdd9c13f56c49)), closes [/github.com/Microsoft/TypeScript/issues/15479#issuecomment-660226606](https://github.com/AnthonyLzq//github.com/Microsoft/TypeScript/issues/15479/issues/issuecomment-660226606)

### [1.1.4](https://github.com/AnthonyLzq/node-webcam/compare/v1.1.3...v1.1.4) (2022-12-30)


### Bug Fixes

* main file in package.json ([57f94a7](https://github.com/AnthonyLzq/node-webcam/commit/57f94a76bf5f21291c46cf525a4596b99e52a88b))

### [1.1.3](https://github.com/AnthonyLzq/node-webcam/compare/v1.1.2...v1.1.3) (2022-12-30)


### Bug Fixes

* types in package.json ([52e66f8](https://github.com/AnthonyLzq/node-webcam/commit/52e66f88d34825908a9a4d72d3cc4c6ed421c855))

### [1.1.2](https://github.com/AnthonyLzq/node-webcam/compare/v1.1.1...v1.1.2) (2022-12-30)


### Bug Fixes

* postinstall url ([8178c1c](https://github.com/AnthonyLzq/node-webcam/commit/8178c1c1d8e110d6acb3a3cc115d11b37678bdda))

### [1.1.1](https://github.com/AnthonyLzq/node-webcam/compare/v1.1.0...v1.1.1) (2022-12-30)


### Bug Fixes

* postinstall script ([93ed789](https://github.com/AnthonyLzq/node-webcam/commit/93ed789f3ec54f954e06721f15ce838d640783d0))

## [1.1.0](https://github.com/AnthonyLzq/node-webcam/compare/v1.0.0...v1.1.0) (2022-12-30)


### Features

* updated postinstall ([e89d03f](https://github.com/AnthonyLzq/node-webcam/commit/e89d03f7c9052c1560a6a0b45a101f93ede79b8c))

## 1.0.0 (2022-12-30)


### Features

* basic ts config ([23d2f86](https://github.com/AnthonyLzq/node-webcam/commit/23d2f863e4ab2367264d68cf8b94944491a7d2dc))
* finished TS implementation ([220a6ea](https://github.com/AnthonyLzq/node-webcam/commit/220a6ea8be6664108a80b23f018fc359bea75546))
* first approach to rework the Webcam class ([aa4575a](https://github.com/AnthonyLzq/node-webcam/commit/aa4575a0bcfcdc8f6f6f8b42effbab532a11dcee))
* first step into TS, reworked utils folder ([feb7dc1](https://github.com/AnthonyLzq/node-webcam/commit/feb7dc1ef1a19640ce5007cfad231f0003417a9c))
* implemented return in base64 when a capture is taken ([e96d9c4](https://github.com/AnthonyLzq/node-webcam/commit/e96d9c4dd690797105db122cc815fcf2de2ff4a2))
* preparing for release ([2d192e5](https://github.com/AnthonyLzq/node-webcam/commit/2d192e5d440d59a6ccd6ac9ce73a31e860f43f00))
* removing postinstall.js usage for release purposes ([2df45f5](https://github.com/AnthonyLzq/node-webcam/commit/2df45f5c07709c2c88bc7bf67ddcaab5a14ebc2b))
* updated .gitignore ([99b1253](https://github.com/AnthonyLzq/node-webcam/commit/99b1253f44de3e7b28a70c63c68a728aa525a7b2))
* updated dependencies and package.json ([efd26ad](https://github.com/AnthonyLzq/node-webcam/commit/efd26ad136d7ce6c9fb93326a417c66a7c1b34fc))
* updated docs ([ab19040](https://github.com/AnthonyLzq/node-webcam/commit/ab1904028ca73c7212e5ffa2df99f4092a5a26a9))
* updated gitignore ([0775990](https://github.com/AnthonyLzq/node-webcam/commit/07759909fc2f126f3dd85127eedee08602c5f88d))
* updated repository url ([5fdbb5e](https://github.com/AnthonyLzq/node-webcam/commit/5fdbb5ec8beeac3107ebbd7f965eab3c8d734360))


### Bug Fixes

* eslint commands ([ddad214](https://github.com/AnthonyLzq/node-webcam/commit/ddad2140a25e8391a2a4beff7792d27470285a3c))
* packages issues and implemented eslint ([eede2d3](https://github.com/AnthonyLzq/node-webcam/commit/eede2d32b3124401f44eb62b3322127bfcfc8aab))
