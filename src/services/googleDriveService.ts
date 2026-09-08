/**
 * Google Drive integration for local, read-only book imports.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';

export type DriveFileFormat = 'pdf' | 'epub';

export interface DriveReadableFile {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  thumbnailLink?: string;
}

const CLIENT_ID_STORAGE_KEY = 'kos_google_drive_client_id';

export function getStoredDriveClientId(): string {
  return localStorage.getItem(CLIENT_ID_STORAGE_KEY) || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
}

export function setStoredDriveClientId(clientId: string): void {
  localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId.trim());
}

export function extractDriveFolderId(input: string): string | null {
  const match = input.trim().match(/\/folders\/([a-zA-Z0-9_-]{20,})/);
  return match?.[1] || null;
}

export function extractDriveFileId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || extractDriveFolderId(trimmed)) return null;

  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (fileMatch?.[1]) return fileMatch[1];

  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (idMatch?.[1]) return idMatch[1];

  return /^[a-zA-Z0-9_-]{25,}$/.test(trimmed) ? trimmed : null;
}

function hasEpubSignature(data: ArrayBuffer): boolean {
  const header = new TextDecoder().decode(new Uint8Array(data, 0, Math.min(data.byteLength, 512)));
  return header.includes('application/epub+zip');
}

export function getDriveFileFormat(name: string, mimeType = '', data?: ArrayBuffer): DriveFileFormat {
  if (mimeType.includes('epub') || /\.epub$/i.test(name) || (data && hasEpubSignature(data))) {
    return 'epub';
  }
  return 'pdf';
}

function filenameFromDisposition(value: string | null, fallback: string): string {
  const match = value?.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]).trim() : fallback;
}

export async function downloadFromDriveLink(inputUrl: string): Promise<{
  data: ArrayBuffer;
  filename: string;
  format: DriveFileFormat;
}> {
  const fileId = extractDriveFileId(inputUrl);
  if (!fileId) {
    if (extractDriveFolderId(inputUrl)) {
      throw new Error('Este e um link de pasta. Use a opcao "Minha Conta Google" para abrir a pasta.');
    }
    throw new Error('Link ou ID de arquivo do Google Drive invalido.');
  }

  const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  const fallbackName = `Drive_${fileId.substring(0, 8)}.pdf`;

  try {
    const response = await fetch(directUrl);
    if (!response.ok) throw new Error(`Erro ao baixar arquivo do Drive (${response.status})`);

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      throw new Error('O Google pediu confirmacao ou login. Use a aba "Minha Conta Google".');
    }

    const filename = filenameFromDisposition(response.headers.get('content-disposition'), fallbackName);
    const data = await response.arrayBuffer();
    return { data, filename, format: getDriveFileFormat(filename, contentType, data) };
  } catch (firstError: unknown) {
    try {
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error(`Erro ao baixar arquivo do Drive (${response.status})`);
      const data = await response.arrayBuffer();
      return { data, filename: fallbackName, format: getDriveFileFormat(fallbackName, '', data) };
    } catch {
      throw firstError instanceof Error ? firstError : new Error('Falha ao baixar o arquivo do Google Drive.');
    }
  }
}

export function requestDriveAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof (window as any).google === 'undefined' || !(window as any).google.accounts?.oauth2) {
      reject(new Error('A biblioteca do Google Identity nao foi carregada. Verifique a conexao.'));
      return;
    }

    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      callback: (response: any) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
        } else if (response.access_token) {
          resolve(response.access_token);
        } else {
          reject(new Error('Nenhum token de acesso foi retornado pelo Google.'));
        }
      },
    });

    client.requestAccessToken({ prompt: 'select_account' });
  });
}

export async function listDriveReadableFiles(accessToken: string, folderId?: string): Promise<DriveReadableFile[]> {
  const conditions = [
    'trashed = false',
    "(mimeType = 'application/pdf' or mimeType = 'application/epub+zip' or name contains '.epub')",
  ];
  if (folderId) conditions.push(`'${folderId.replace(/'/g, "\\'")}' in parents`);

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', conditions.join(' and '));
  url.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime,thumbnailLink)');
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('orderBy', 'modifiedTime desc');

  const response = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Sessao expirada. Conecte-se novamente.');
    throw new Error(`Erro ao buscar arquivos no Google Drive (${response.status})`);
  }

  const result = await response.json();
  return result.files || [];
}

export async function downloadDriveFileWithToken(fileId: string, accessToken: string): Promise<ArrayBuffer> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Erro ao baixar o arquivo (${response.status})`);
  return response.arrayBuffer();
}

export function formatBytes(bytes?: string | number): string {
  if (!bytes) return '';
  const value = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (Number.isNaN(value)) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}


async function fetchFolderHtml(folderUrl: string): Promise<string> {
  // Native (Android/iOS): CapacitorHttp performs the request outside the
  // WebView, so it isn't subject to browser CORS restrictions — no proxy needed.
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url: folderUrl,
      connectTimeout: 15000,
      readTimeout: 20000,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Não foi possível conectar à pasta pública do Google Drive (${response.status}).`);
    }
    return typeof response.data === 'string' ? response.data : '';
  }

  // Web/browser preview: Drive doesn't send CORS headers to arbitrary origins,
  // so a public CORS proxy is required here.
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(folderUrl)}`;
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`Falha ao acessar pasta (${res.status})`);
    return await res.text();
  } catch {
    throw new Error('Não foi possível conectar à pasta pública do Google Drive.');
  }
}

export async function fetchPublicFolderFiles(folderId: string): Promise<DriveReadableFile[]> {
  const folderUrl = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;
  const html = await fetchFolderHtml(folderUrl);

  const sskRegex = /aria-label="([^"]+)"[^>]*ssk=['"][^'"]*?:([a-zA-Z0-9_-]{28,38})-[0-9]+-[0-9]+['"]/g;
  const fileMap = new Map<string, DriveReadableFile>();

  for (const match of html.matchAll(sskRegex)) {
    const rawLabel = match[1];
    const fileId = match[2];

    if (!fileMap.has(fileId)) {
      fileMap.set(fileId, { id: fileId, name: '' });
    }
    const item = fileMap.get(fileId)!;

    if (/\.(epub|pdf)/i.test(rawLabel)) {
      item.name = rawLabel.replace(/\s+(?:Unknown|EPUB|PDF|Shared).*$/i, '').trim();
    } else if (rawLabel.startsWith('Size:')) {
      const sizeMatch = rawLabel.match(/Size:\s*([^\r\n]+)/);
      if (sizeMatch) item.size = sizeMatch[1].trim();
    } else if (rawLabel.startsWith('Modified')) {
      item.modifiedTime = rawLabel.replace('Modified', '').trim();
    }
  }

  return Array.from(fileMap.values()).filter(f => f.name && /\.(epub|pdf)$/i.test(f.name));
}
