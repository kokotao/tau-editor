import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMirrorDownloadUrl, fetchPublishedReleases, isMirrorAssetVerified } from '../src/releaseDataSource.js'

test('loads the published same-origin release snapshot', async () => {
  const requests = []
  const releases = [{ tag_name: 'v0.6.43' }]
  const result = await fetchPublishedReleases(async (url, options) => {
    requests.push({ url, options })
    return { ok: true, json: async () => releases }
  }, '/tau-editor/')

  assert.deepEqual(result, releases)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/tau-editor/releases.json')
  assert.equal(new URL(requests[0].url, 'https://kokotao.github.io').origin, 'https://kokotao.github.io')
})

test('rejects an invalid release snapshot so the caller can keep built-in releases', async () => {
  await assert.rejects(
    fetchPublishedReleases(async () => ({ ok: true, json: async () => ({ message: 'rate limited' }) }), '/tau-editor/'),
    /数据格式错误/,
  )
})

test('builds the versioned Lizi mirror URL and safely encodes installer names', () => {
  assert.equal(
    buildMirrorDownloadUrl('v0.6.43', 'Tau Editor_0.6.43_x64 zh-CN.msi'),
    'https://note.lizipro.cn/taueditor/releases/0.6.43/Tau%20Editor_0.6.43_x64%20zh-CN.msi',
  )
  assert.equal(buildMirrorDownloadUrl('latest', 'app.dmg'), '')
})

test('only enables mirror downloads when the published manifest matches the asset', () => {
  const asset = { name: 'Tau.Editor.dmg', size: 100, digest: `sha256:${'a'.repeat(64)}` }
  const manifest = { assets: [{ name: asset.name, size: 100, sha256: 'a'.repeat(64) }] }

  assert.equal(isMirrorAssetVerified(asset, manifest), true)
  assert.equal(isMirrorAssetVerified(asset, { assets: [{ ...manifest.assets[0], size: 99 }] }), false)
  assert.equal(isMirrorAssetVerified(asset, { assets: [{ ...manifest.assets[0], sha256: 'b'.repeat(64) }] }), false)
})
