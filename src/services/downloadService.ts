import { Capacitor, CapacitorHttp } from '@capacitor/core';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.includes(',') ? base64.split(',').pop() || '' : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

function responseDataToArrayBuffer(data: unknown): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Blob) {
    throw new Error('Blob precisa ser lido pelo navegador.');
  }
  if (typeof data === 'string') return base64ToArrayBuffer(data);
  if (Array.isArray(data)) return new Uint8Array(data).buffer;

  throw new Error('Resposta binária inválida.');
}

export async function downloadBinary(url: string, fallbackUrls: string[] = []): Promise<ArrayBuffer> {
  const urls = [url, ...fallbackUrls];
  let lastError: unknown = null;

  for (const currentUrl of urls) {
    if (Capacitor.isNativePlatform()) {
      try {
        const response = await CapacitorHttp.get({
          url: currentUrl,
          responseType: 'arraybuffer',
          readTimeout: 120000,
          connectTimeout: 30000,
        });

        if (response.status >= 200 && response.status < 300) {
          return responseDataToArrayBuffer(response.data);
        }

        lastError = new Error(`HTTP ${response.status}`);
      } catch (err) {
        lastError = err;
      }
    }

    try {
      const response = await fetch(currentUrl);
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      return await response.arrayBuffer();
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Falha no download.');
}
