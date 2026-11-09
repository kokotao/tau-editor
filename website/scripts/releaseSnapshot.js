import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { buildMirrorDownloadUrl, isMirrorAssetVerified } from '../src/releaseDataSource.js'

const repository = process.env.GITHUB_REPOSITORY || 'kokotao/tau-editor'
const apiUrl = `https://api.github.com/repos/${repository}/releases`

export const fetchReleaseSnapshot = async (token, fetchImpl = fetch) => {
  if (!token) throw new Error('GITHUB_TOKEN is required to build the Release snapshot')

  const releases = []
  for (let page = 1; ; page += 1) {
    const response = await fetchImpl(`${apiUrl}?per_page=100&page=${page}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!response.ok) throw new Error(`GitHub Releases 请求失败：${response.status}`)

    const pageItems = await response.json()
    if (!Array.isArray(pageItems)) throw new Error('GitHub Releases 返回数据格式错误')

    releases.push(...pageItems
      .filter((release) => release && !release.draft && !release.prerelease && release.tag_name)
      .map((release) => ({
        tag_name: release.tag_name,
        name: release.name,
        body: release.body,
        published_at: release.published_at,
        created_at: release.created_at,
        html_url: release.html_url,
        draft: false,
        prerelease: false,
        assets: Array.isArray(release.assets) ? release.assets
          .filter((asset) => asset?.name && asset?.browser_download_url)
          .map((asset) => ({
            name: asset.name,
            browser_download_url: asset.browser_download_url,
            download_count: Number.isFinite(asset.download_count) ? asset.download_count : null,
            size: asset.size,
            digest: asset.digest,
          })) : [],
      })))

    if (pageItems.length < 100) break
  }

  await Promise.all(releases.map(async (release) => {
    if (!release.assets.length) return
    const version = release.tag_name.replace(/^v/i, '')
    if (!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(version)) return

    try {
      const response = await fetchImpl(`https://note.lizipro.cn/taueditor/releases/${version}/latest.json`, {
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) return
      const manifest = await response.json()
      if (manifest.version !== version || manifest.tag !== release.tag_name) return
      release.assets = release.assets.map((asset) => ({
        ...asset,
        mirror_url: isMirrorAssetVerified(asset, manifest)
          ? buildMirrorDownloadUrl(release.tag_name, asset.name)
          : '',
      }))
    } catch {
      // Mirror outages should not prevent the GitHub release snapshot from building.
    }
  }))

  return releases
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const outputPath = resolve(process.argv[2] || 'public/releases.json')
  const releases = await fetchReleaseSnapshot(process.env.GITHUB_TOKEN)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(releases)}\n`)
  console.log(`Wrote ${releases.length} public releases to ${outputPath}`)
}
