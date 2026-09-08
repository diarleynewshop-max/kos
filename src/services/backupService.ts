/**
 * Library backup: exports every book, its file, progress, bookmarks and
 * annotations into a single .zip, and restores it later.
 *
 * Everything the app knows lives in IndexedDB, which Android wipes on
 * uninstall or "clear data" — this is the only way out of the device.
 */
import JSZip from 'jszip';
import { get, set, keys } from 'idb-keyval';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { Book, ReaderSettings, PageAnnotations } from '../types';
import { getBooks, getSettings } from './storage';

const BOOKS_KEY = 'kos_books_metadata';
const SETTINGS_KEY = 'kos_reader_settings';
const ANNOTATION_PREFIX = 'kos_annot_';
const MANIFEST_NAME = 'manifest.json';
const BACKUP_FORMAT = 1;

export interface BackupManifest {
  format: number;
  exportedAt: number;
  settings: ReaderSettings;
  books: Book[];
  /** Keyed by `<bookId>|<pageNumber>`, mirroring the IndexedDB annotation keys. */
  annotations: Record<string, PageAnnotations>;
}

export interface BackupSummary {
  books: number;
  /** Present when the backup was written to the device. */
  path?: string;
}

type ProgressFn = (message: string) => void;

function annotationKey(bookId: string, pageNumber: string | number): string {
  return `${ANNOTATION_PREFIX}${bookId}_${pageNumber}`;
}

async function collectAnnotations(bookIds: Set<string>): Promise<Record<string, PageAnnotations>> {
  const allKeys = await keys();
  const collected: Record<string, PageAnnotations> = {};

  for (const key of allKeys) {
    if (typeof key !== 'string' || !key.startsWith(ANNOTATION_PREFIX)) continue;

    const rest = key.slice(ANNOTATION_PREFIX.length);
    const separator = rest.lastIndexOf('_');
    if (separator <= 0) continue;

    const bookId = rest.slice(0, separator);
    const pageNumber = rest.slice(separator + 1);
    if (!bookIds.has(bookId)) continue;

    const value = await get<PageAnnotations>(key);
    if (value) collected[`${bookId}|${pageNumber}`] = value;
  }

  return collected;
}

export async function exportLibrary(onProgress?: ProgressFn): Promise<BackupSummary> {
  const books = await getBooks();
  if (books.length === 0) {
    throw new Error('Não há livros na biblioteca para exportar.');
  }

  const settings = await getSettings();
  const bookIds = new Set(books.map(b => b.id));

  onProgress?.('Reunindo anotações...');
  const annotations = await collectAnnotations(bookIds);

  const zip = new JSZip();
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    exportedAt: Date.now(),
    settings,
    books,
    annotations,
  };
  zip.file(MANIFEST_NAME, JSON.stringify(manifest));

  for (let i = 0; i < books.length; i += 1) {
    const book = books[i];
    onProgress?.(`Empacotando livro ${i + 1} de ${books.length}...`);

    const fileData = await get<ArrayBuffer>(`kos_file_${book.id}`)
      || await get<ArrayBuffer>(`kos_pdf_${book.id}`);
    if (fileData) {
      // Wrap in a view rather than passing the raw buffer: JSZip identifies
      // types with `instanceof`, which fails for a buffer that crossed a
      // realm boundary on its way out of IndexedDB.
      zip.file(`files/${book.id}`, new Uint8Array(fileData));
    }

    const images = await get<string[]>(`kos_images_${book.id}`);
    if (images) {
      zip.file(`images/${book.id}.json`, JSON.stringify(images));
    }
  }

  onProgress?.('Gerando arquivo de backup...');
  // Books are already compressed formats (PDF/EPUB), so skip compression:
  // it costs time and memory on a phone for almost no size gain.
  const base64 = await zip.generateAsync({ type: 'base64', compression: 'STORE' });

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `kos-backup-${stamp}.zip`;

  if (!Capacitor.isNativePlatform()) {
    // Browser preview: hand the file over as a normal download.
    const link = document.createElement('a');
    link.href = `data:application/zip;base64,${base64}`;
    link.download = fileName;
    link.click();
    return { books: books.length };
  }

  onProgress?.('Salvando no aparelho...');
  await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Documents,
  });
  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Documents });

  try {
    await Share.share({
      title: 'Backup da biblioteca KOS',
      text: `Backup com ${books.length} livro(s) do KOS.`,
      files: [uri],
    });
  } catch {
    // The user dismissing the share sheet is not a failure — the file is
    // already saved on the device either way.
  }

  return { books: books.length, path: `Documentos/${fileName}` };
}

function isBackupManifest(value: unknown): value is BackupManifest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BackupManifest>;
  return typeof candidate.format === 'number' && Array.isArray(candidate.books);
}

export async function importLibrary(file: File | Blob, onProgress?: ProgressFn): Promise<BackupSummary> {
  onProgress?.('Abrindo arquivo de backup...');

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('Arquivo inválido: não é um backup do KOS.');
  }

  const manifestEntry = zip.file(MANIFEST_NAME);
  if (!manifestEntry) {
    throw new Error('Arquivo inválido: backup sem manifesto.');
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(await manifestEntry.async('string'));
  } catch {
    throw new Error('Arquivo inválido: manifesto corrompido.');
  }

  if (!isBackupManifest(manifest) || manifest.format > BACKUP_FORMAT) {
    throw new Error('Backup criado por uma versão mais recente do KOS.');
  }

  const existing = await getBooks();
  const merged = [...existing];

  for (let i = 0; i < manifest.books.length; i += 1) {
    const book = manifest.books[i];
    onProgress?.(`Restaurando livro ${i + 1} de ${manifest.books.length}...`);

    const fileEntry = zip.file(`files/${book.id}`);
    if (fileEntry) {
      await set(`kos_file_${book.id}`, await fileEntry.async('arraybuffer'));
    }

    const imagesEntry = zip.file(`images/${book.id}.json`);
    if (imagesEntry) {
      await set(`kos_images_${book.id}`, JSON.parse(await imagesEntry.async('string')));
    }

    // Never drop what's already on the device: keep whichever copy was read
    // more recently, so restoring an old backup can't rewind live progress.
    const index = merged.findIndex(b => b.id === book.id);
    if (index === -1) {
      merged.push(book);
    } else if ((book.lastReadAt || 0) > (merged[index].lastReadAt || 0)) {
      merged[index] = book;
    }
  }

  for (const [key, value] of Object.entries(manifest.annotations || {})) {
    const [bookId, pageNumber] = key.split('|');
    if (!bookId || !pageNumber) continue;
    await set(annotationKey(bookId, pageNumber), value);
  }

  await set(BOOKS_KEY, merged);

  if (manifest.settings && existing.length === 0) {
    // Only adopt the backup's settings on a fresh device, so restoring on a
    // device already in use doesn't silently change how it looks.
    await set(SETTINGS_KEY, manifest.settings);
  }

  return { books: manifest.books.length };
}
