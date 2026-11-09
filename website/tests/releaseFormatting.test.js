import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDownloadCount } from '../src/releaseFormatting.js'

test('formats finite download counts and treats missing counts as unavailable', () => {
  assert.equal(formatDownloadCount(1234), '1,234')
  assert.equal(formatDownloadCount(null), '暂无数据')
  assert.equal(formatDownloadCount(undefined), '暂无数据')
  assert.equal(formatDownloadCount(Number.NaN), '暂无数据')
})
