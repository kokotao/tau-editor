#!/usr/bin/env node
/**
 * @description 校验 Tau Editor 语言服务器发行清单，拒绝未锁定 URL、SHA-256 或启动参数。
 * @author Albert_Luo
 * @email 480199976@qq.com
 * @date 2026-10-03 23:18
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import https from 'node:https';
import http from 'node:http';

const DEFAULT_MANIFEST = resolve(import.meta.dirname, 'lsp-assets.manifest.template.json');
const SHA256 = /^[0-9a-f]{64}$/i;
const ARCHES = new Set(['arm64', 'x64']);
const FORMATS = new Set(['binary', 'zip', 'gzip', 'tarGz', 'npmTarball']);

function parseArgs(argv) {
  const args = { manifest: DEFAULT_MANIFEST, verifyNetwork: false, downloadDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--manifest') args.manifest = resolve(argv[++i]);
    else if (token === '--verify-network') args.verifyNetwork = true;
    else if (token === '--download-dir') args.downloadDir = resolve(argv[++i]);
    else if (token === '--help' || token === '-h') {
      console.log('Usage: node verify-manifest-assets.mjs [--manifest FILE] [--verify-network] [--download-dir DIR]');
      process.exit(0);
    } else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function fail(message) {
  throw new Error(message);
}

function validateEntry(entry, index) {
  const prefix = `assets[${index}]`;
  for (const key of ['serverId', 'language', 'version', 'platform', 'arch', 'url', 'sha256', 'archiveFormat', 'executablePath', 'launchCommand', 'launchArgs', 'launchEnv', 'source', 'license']) {
    if (!(key in entry)) fail(`${prefix}: missing ${key}`);
  }
  if (!entry.serverId || !entry.version || entry.platform !== 'darwin' || !ARCHES.has(entry.arch)) {
    fail(`${prefix}: serverId/version/platform/darwin/arch are invalid`);
  }
  if (typeof entry.url !== 'string' || !entry.url.startsWith('https://') || /\/latest(?:\/|$)/i.test(entry.url)) {
    fail(`${prefix}: URL must be immutable HTTPS (latest URLs are forbidden)`);
  }
  if (!SHA256.test(entry.sha256 ?? '')) fail(`${prefix}: sha256 must be a verified 64-character hexadecimal digest`);
  if (!FORMATS.has(entry.archiveFormat)) fail(`${prefix}: unsupported archiveFormat ${entry.archiveFormat}`);
  if (!entry.executablePath || !entry.launchCommand || !Array.isArray(entry.launchArgs) || typeof entry.launchEnv !== 'object') {
    fail(`${prefix}: launch command, args, env, and executablePath are required`);
  }
  if (!entry.source || !entry.license) fail(`${prefix}: source and license are required`);
}

function get(url, redirects = 0, attempt = 0) {
  if (redirects > 5) return Promise.reject(new Error(`too many redirects: ${url}`));
  const client = url.startsWith('https:') ? https : http;
  return new Promise((resolveResponse, reject) => {
    const request = client.get(url, { headers: { 'user-agent': 'tau-editor-lsp-manifest-verifier' } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        get(new URL(response.headers.location, url).toString(), redirects + 1, attempt).then(resolveResponse, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        if (response.statusCode >= 500 && attempt < 2) {
          setTimeout(() => get(url, redirects, attempt + 1).then(resolveResponse, reject), 1_000 * (attempt + 1));
        } else {
          reject(new Error(`${url}: HTTP ${response.statusCode}`));
        }
        return;
      }
      response.setTimeout(120_000, () => response.destroy(new Error(`response timeout: ${url}`)));
      resolveResponse(response);
    });
    request.setTimeout(120_000, () => request.destroy(new Error(`timeout: ${url}`)));
    request.on('error', (error) => {
      if (attempt < 2) setTimeout(() => get(url, redirects, attempt + 1).then(resolveResponse, reject), 1_000 * (attempt + 1));
      else reject(error);
    });
  });
}

async function verifyNetwork(entry, destination) {
  const response = await get(entry.url);
  const hash = createHash('sha256');
  let output;
  if (destination) {
    await mkdir(dirname(destination), { recursive: true });
    output = createWriteStream(destination, { flags: 'wx' });
  }
  response.on('data', (chunk) => hash.update(chunk));
  if (output) await pipeline(response, output);
  else await new Promise((resolvePromise, reject) => {
    response.on('end', resolvePromise);
    response.on('error', reject);
  });
  const actual = hash.digest('hex');
  if (actual !== entry.sha256.toLowerCase()) fail(`${entry.serverId}/${entry.arch}: SHA-256 mismatch; expected ${entry.sha256}, got ${actual}`);
  return actual;
}

const options = parseArgs(process.argv.slice(2));
const manifest = JSON.parse(await readFile(options.manifest, 'utf8'));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets) || manifest.assets.length === 0) fail('manifest must contain schemaVersion=1 and a non-empty assets array');
manifest.assets.forEach(validateEntry);

if (options.verifyNetwork) {
  for (const entry of manifest.assets) {
    const safeName = `${entry.serverId}-${entry.version}-${entry.arch}`.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const destination = options.downloadDir ? resolve(options.downloadDir, `${safeName}.download`) : null;
    const digest = await verifyNetwork(entry, destination);
    console.log(`${entry.serverId}\t${entry.arch}\t${digest}${destination ? `\t${destination}` : ''}`);
  }
}

console.log(`Validated ${manifest.assets.length} immutable LSP assets.`);
