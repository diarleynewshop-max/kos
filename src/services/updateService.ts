import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { downloadBinary } from './downloadService';

interface ApkUpdaterPlugin {
  installApk(options: { path: string }): Promise<{ started: boolean }>;
}

const ApkUpdater = registerPlugin<ApkUpdaterPlugin>('ApkUpdater');

const GITHUB_REPO = 'diarleynewshop-max/kos';
const UPDATE_FILE_NAME = 'kos-update.apk';

export interface UpdateInfo {
  version: string;
  downloadUrl: string;
  notes?: string;
}

function parseVersion(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function isNewer(remote: string, local: string): boolean {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  const len = Math.max(r.length, l.length);

  for (let i = 0; i < len; i += 1) {
    const rv = r[i] || 0;
    const lv = l[i] || 0;
    if (rv !== lv) return rv > lv;
  }

  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const info = await App.getInfo();

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
  if (!res.ok) return null;

  const release = await res.json();
  const remoteVersion = String(release.tag_name || '');
  const asset = (release.assets || []).find((a: { name?: string }) => a.name?.endsWith('.apk'));

  if (!remoteVersion || !asset) return null;
  if (!isNewer(remoteVersion, info.version)) return null;

  return {
    version: remoteVersion,
    downloadUrl: asset.browser_download_url,
    notes: release.body,
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

export async function downloadAndInstallUpdate(
  update: UpdateInfo,
  onProgress?: (pct: number) => void,
): Promise<void> {
  onProgress?.(0);
  const buffer = await downloadBinary(update.downloadUrl);
  onProgress?.(85);

  const base64 = arrayBufferToBase64(buffer);
  await Filesystem.writeFile({
    path: UPDATE_FILE_NAME,
    data: base64,
    directory: Directory.Cache,
  });
  onProgress?.(95);

  const { uri } = await Filesystem.getUri({ path: UPDATE_FILE_NAME, directory: Directory.Cache });
  onProgress?.(100);

  await ApkUpdater.installApk({ path: uri });
}
