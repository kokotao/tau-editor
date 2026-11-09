import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchReleaseSnapshot } from '../scripts/releaseSnapshot.js'

test('fetches all release pages with the Actions token and keeps only public fields', async () => {
  const requests = []
  const result = await fetchReleaseSnapshot('test-token', async (url, options) => {
    requests.push({ url, options })
    if (url.includes('note.lizipro.cn')) {
      return {
        ok: true,
        json: async () => ({
          tag: 'v0.6.43',
          version: '0.6.43',
          assets: [{ name: 'Tau.Editor.dmg', size: 100, sha256: 'a'.repeat(64) }],
        }),
      }
    }
    const page = new URL(url).searchParams.get('page')
    const releases = page === '1'
      ? Array.from({ length: 100 }, (_, index) => index === 0 ? {
          tag_name: 'v0.6.43',
          name: 'Tau Editor v0.6.43',
          body: 'Release notes',
          published_at: '2026-11-09T08:34:31Z',
          created_at: '2026-11-09T08:34:31Z',
          html_url: 'https://github.com/kokotao/tau-editor/releases/tag/v0.6.43',
          draft: false,
          prerelease: false,
          assets: [{ name: 'Tau.Editor.dmg', browser_download_url: 'https://example.test/app.dmg', download_count: 3, size: 100, digest: `sha256:${'a'.repeat(64)}`, id: 1 }],
          id: 42,
        } : {
          tag_name: `v0.6.${index}`,
          draft: false,
          prerelease: false,
          assets: [],
        })
      : []
    return { ok: true, json: async () => releases }
  })

  assert.equal(requests.length, 3)
  assert.equal(requests[0].options.headers.Authorization, 'Bearer test-token')
  assert.equal(requests[2].url, 'https://note.lizipro.cn/taueditor/releases/0.6.43/latest.json')
  assert.equal(result.length, 100)
  assert.deepEqual(result[0], {
    tag_name: 'v0.6.43',
    name: 'Tau Editor v0.6.43',
    body: 'Release notes',
    published_at: '2026-11-09T08:34:31Z',
    created_at: '2026-11-09T08:34:31Z',
    html_url: 'https://github.com/kokotao/tau-editor/releases/tag/v0.6.43',
    draft: false,
    prerelease: false,
    assets: [{
      name: 'Tau.Editor.dmg',
      browser_download_url: 'https://example.test/app.dmg',
      download_count: 3,
      size: 100,
      digest: `sha256:${'a'.repeat(64)}`,
      mirror_url: `https://note.lizipro.cn/taueditor/releases/0.6.43/Tau.Editor.dmg`,
    }],
  })
})
