import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

type Logger = {
  info: (message: string) => void
  warn: (message: string) => void
}

type DownloadOptions = {
  timeoutMs: number
  url: string
}

const setup = require('../bin/setup') as {
  COMMAND_CAM_RELEASE_TAG: string
  getCommandCamPath: (options?: {
    env?: Record<string, string | undefined>
    homedir?: string
  }) => string
  getCommandCamDownloadUrl: (options?: {
    env?: Record<string, string | undefined>
  }) => string
  installCommandCam: (options?: {
    download?: (options: DownloadOptions) => Promise<Buffer>
    env?: Record<string, string | undefined>
    logger?: Logger
    platform?: string
    targetFiles?: string[]
  }) => Promise<{ reason?: string; status: string; targetFiles?: string[] }>
  resolveRedirectUrl: (url: string, location: string) => string
  verifyCommandCamBuffer: (options: {
    buffer: Buffer
    expectedSha256: string
    minBytes?: number
  }) => void
}

const sha256 = (buffer: Buffer) =>
  createHash('sha256').update(buffer).digest('hex')

describe('CommandCam setup', () => {
  it('uses a pinned CommandCam release tag by default', () => {
    assert.equal(setup.COMMAND_CAM_RELEASE_TAG, 'v2.1.0')
    assert.match(
      setup.getCommandCamDownloadUrl({ env: {} }),
      /\/releases\/download\/v2\.1\.0\/CommandCam\.exe$/
    )
  })

  it('allows overriding the CommandCam release URL', () => {
    assert.equal(
      setup.getCommandCamDownloadUrl({
        env: { NODE_WEBCAM_COMMANDCAM_RELEASE_TAG: 'commandcam-v1' }
      }),
      'https://github.com/AnthonyLzq/node-webcam/releases/download/commandcam-v1/CommandCam.exe'
    )

    assert.equal(
      setup.getCommandCamDownloadUrl({
        env: {
          NODE_WEBCAM_COMMANDCAM_URL: 'https://example.com/CommandCam.exe'
        }
      }),
      'https://example.com/CommandCam.exe'
    )
  })

  it('stores CommandCam in a user-local cache path', () => {
    assert.equal(
      setup.getCommandCamPath({
        env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' },
        homedir: 'C:\\Users\\me'
      }),
      'C:\\Users\\me\\AppData\\Local/node-webcam/CommandCam/CommandCam.exe'
    )

    assert.equal(
      setup.getCommandCamPath({
        env: { NODE_WEBCAM_COMMANDCAM_DIR: 'D:\\node-webcam' }
      }),
      'D:\\node-webcam/CommandCam.exe'
    )
  })

  it('skips non-Windows platforms without downloading', async () => {
    const result = await setup.installCommandCam({
      download: async () => {
        throw new Error('download should not be called')
      },
      platform: 'linux'
    })

    assert.deepEqual(result, { reason: 'platform', status: 'skipped' })
  })

  it('writes verified CommandCam downloads to all build targets', async () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'node-webcam-commandcam-setup-')
    )
    const buffer = Buffer.alloc(1_024, 1)
    const targetFiles = [
      join(directory, 'dist/cjs/bindings/CommandCam/CommandCam.exe'),
      join(directory, 'dist/esm/bindings/CommandCam/CommandCam.exe')
    ]

    try {
      const result = await setup.installCommandCam({
        download: async ({ timeoutMs, url }) => {
          assert.equal(timeoutMs, 15_000)
          assert.match(url, /CommandCam\.exe$/)

          return buffer
        },
        env: {
          NODE_WEBCAM_COMMANDCAM_SHA256: sha256(buffer)
        },
        logger: { info: () => undefined, warn: () => undefined },
        platform: 'win32',
        targetFiles
      })

      assert.equal(result.status, 'installed')
      assert.deepEqual(readFileSync(targetFiles[0]), buffer)
      assert.deepEqual(readFileSync(targetFiles[1]), buffer)
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it('rejects checksum mismatches in strict mode', async () => {
    await assert.rejects(
      () =>
        setup.installCommandCam({
          download: async () => Buffer.alloc(1_024, 1),
          env: {
            NODE_WEBCAM_COMMANDCAM_SHA256: sha256(Buffer.alloc(1_024, 2)),
            NODE_WEBCAM_COMMANDCAM_STRICT: '1'
          },
          logger: { info: () => undefined, warn: () => undefined },
          platform: 'win32',
          targetFiles: [join(tmpdir(), 'missing', 'CommandCam.exe')]
        }),
      /checksum mismatch/
    )
  })

  it('keeps installation non-fatal by default', async () => {
    const warnings: string[] = []
    const result = await setup.installCommandCam({
      download: async () => {
        throw new Error('offline')
      },
      logger: {
        info: () => undefined,
        warn: message => warnings.push(message)
      },
      platform: 'win32',
      targetFiles: [join(tmpdir(), 'missing', 'CommandCam.exe')]
    })

    assert.equal(result.status, 'failed')
    assert.match(warnings.join('\n'), /offline/)
  })

  it('resolves relative redirect locations', () => {
    assert.equal(
      setup.resolveRedirectUrl(
        'https://github.com/owner/repo/releases/download/v1/CommandCam.exe',
        '/assets/CommandCam.exe'
      ),
      'https://github.com/assets/CommandCam.exe'
    )
  })

  it('rejects downloads that are too small', () => {
    const buffer = Buffer.from('small')

    assert.throws(
      () =>
        setup.verifyCommandCamBuffer({
          buffer,
          expectedSha256: sha256(buffer)
        }),
      /too small/
    )
  })
})
