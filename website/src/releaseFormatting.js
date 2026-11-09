export const formatDownloadCount = (downloadCount) => (
  Number.isFinite(downloadCount) ? downloadCount.toLocaleString('zh-CN') : '暂无数据'
)
