export const fetchPublishedReleases = async (fetchImpl, baseUrl) => {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const response = await fetchImpl(`${normalizedBase}releases.json`, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`本地 Release 快照请求失败：${response.status}`)
  const releases = await response.json()
  if (!Array.isArray(releases)) throw new Error('本地 Release 快照数据格式错误')
  return releases
}

export const inferAssetPlatform = (assetName) => {
  const name = String(assetName ?? '').toLowerCase()
  if (/\.(?:exe|msi)$/i.test(name) || /(?:windows|win32|win64|x64-setup|x64_zh)/i.test(name)) return 'Windows'
  if (/\.(?:dmg|pkg)$/i.test(name) || /(?:macos|darwin|universal|apple|(?:aarch64|arm64)\.(?:dmg|zip)|amd64\.dmg)/i.test(name)) return 'macOS'
  if (/\.(?:deb|rpm|appimage)$/i.test(name) || /(?:linux|ubuntu|debian|fedora|appimage)/i.test(name)) return 'Linux'
  return null
}

export const buildMirrorDownloadUrl = (version, assetName) => {
  const normalizedVersion = String(version ?? '').replace(/^v/i, '')
  if (!/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.-]+)?$/.test(normalizedVersion)) return ''
  return `https://note.lizipro.cn/taueditor/releases/${normalizedVersion}/${encodeURIComponent(assetName)}`
}

export const resolveMirrorDownloadUrl = (mirrorUrl, hostname) => {
  if (!mirrorUrl) return ''
  try {
    const url = new URL(mirrorUrl)
    if (!/^https?:$/.test(url.protocol)) return ''
    if (url.hostname === 'note.lizipro.cn' && ['10.123.1.2', 'taueditor.lizipro.cn'].includes(hostname)) {
      return `${url.pathname}${url.search}${url.hash}`
    }
    return url.href
  } catch {
    return ''
  }
}

export const isMirrorAssetVerified = (asset, mirrorManifest) => {
  if (!asset?.name || !Number.isFinite(asset.size) || !Array.isArray(mirrorManifest?.assets)) return false
  const mirroredAsset = mirrorManifest.assets.find((item) => item?.name === asset.name)
  if (!mirroredAsset || mirroredAsset.size !== asset.size || !/^[a-f0-9]{64}$/i.test(mirroredAsset.sha256 || '')) return false
  if (asset.digest?.startsWith('sha256:')) {
    return mirroredAsset.sha256.toLowerCase() === asset.digest.slice('sha256:'.length).toLowerCase()
  }
  return true
}
