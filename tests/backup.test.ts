import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { clear, get, set } from 'idb-keyval';
import type { Book } from '../src/types';

// The backup service pulls in Capacitor plugins for saving/sharing the file on
// a device; the export path under test here is the browser one, so stub them.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: vi.fn(), getUri: vi.fn() },
  Directory: { Documents: 'DOCUMENTS' },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));

const { exportLibrary, importLibrary } = await import('../src/services/backupService');

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    title: 'A Revolução dos Bichos',
    author: 'George Orwell',
    totalPages: 402,
    currentPage: 11,
    coverUrl: '',
    addedAt: 1_000,
    lastReadAt: 2_000,
    fileSize: 4,
    bookmarks: [7],
    readingMode: 'reflow',
    format: 'epub',
    ...overrides,
  };
}

/** Captures the zip the browser export path hands to the download link. */
function captureDownloadedZip(): { read: () => Promise<JSZip> } {
  let href = '';
  const anchor = { href: '', download: '', click: () => { href = anchor.href; } };
  vi.spyOn(document, 'createElement').mockReturnValue(anchor as unknown as HTMLAnchorElement);

  return {
    read: async () => {
      const base64 = href.replace(/^data:application\/zip;base64,/, '');
      return JSZip.loadAsync(base64, { base64: true });
    },
  };
}

beforeEach(async () => {
  await clear();
  vi.restoreAllMocks();
});

describe('exportLibrary', () => {
  it('refuses to produce an empty backup', async () => {
    await expect(exportLibrary()).rejects.toThrow(/Não há livros/);
  });

  it('packs metadata, the book file and its annotations', async () => {
    await set('kos_books_metadata', [makeBook()]);
    await set('kos_file_book-1', new Uint8Array([1, 2, 3, 4]).buffer);
    await set('kos_annot_book-1_7', { strokes: [{ id: 's1', tool: 'pen', color: '#000', size: 2, points: [] }] });

    const captured = captureDownloadedZip();
    const summary = await exportLibrary();
    expect(summary.books).toBe(1);

    const zip = await captured.read();
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));

    expect(manifest.books).toHaveLength(1);
    expect(manifest.books[0].currentPage).toBe(11);
    expect(manifest.books[0].bookmarks).toEqual([7]);
    expect(manifest.annotations['book-1|7'].strokes).toHaveLength(1);

    const file = await zip.file('files/book-1')!.async('uint8array');
    expect(Array.from(file)).toEqual([1, 2, 3, 4]);
  });

  it('falls back to the legacy pdf key for books saved by older versions', async () => {
    await set('kos_books_metadata', [makeBook({ id: 'old-1', format: 'pdf' })]);
    await set('kos_pdf_old-1', new Uint8Array([9, 9]).buffer);

    const captured = captureDownloadedZip();
    await exportLibrary();

    const zip = await captured.read();
    expect(Array.from(await zip.file('files/old-1')!.async('uint8array'))).toEqual([9, 9]);
  });
});

describe('importLibrary', () => {
  async function buildBackup(books: Book[], extras: Record<string, unknown> = {}): Promise<Blob> {
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({
      format: 1,
      exportedAt: Date.now(),
      settings: { theme: 'dark', fontSize: 24 },
      books,
      annotations: { 'book-1|7': { strokes: [] } },
      ...extras,
    }));
    for (const book of books) {
      zip.file(`files/${book.id}`, new Uint8Array([1, 2, 3, 4]).buffer);
    }
    return zip.generateAsync({ type: 'blob' });
  }

  it('restores books and their files onto an empty device', async () => {
    const summary = await importLibrary(await buildBackup([makeBook()]));

    expect(summary.books).toBe(1);
    const restored = await get<Book[]>('kos_books_metadata');
    expect(restored).toHaveLength(1);
    expect(restored![0].title).toBe('A Revolução dos Bichos');
    expect(await get('kos_file_book-1')).toBeTruthy();
    expect(await get('kos_annot_book-1_7')).toBeTruthy();
  });

  it('keeps books already on the device that are not in the backup', async () => {
    await set('kos_books_metadata', [makeBook({ id: 'local-only', title: 'Só no aparelho' })]);

    await importLibrary(await buildBackup([makeBook({ id: 'from-backup' })]));

    const merged = await get<Book[]>('kos_books_metadata');
    expect(merged!.map(b => b.id).sort()).toEqual(['from-backup', 'local-only']);
  });

  it('does not rewind live progress when restoring an older backup', async () => {
    await set('kos_books_metadata', [makeBook({ currentPage: 300, lastReadAt: 9_000 })]);

    await importLibrary(await buildBackup([makeBook({ currentPage: 11, lastReadAt: 2_000 })]));

    const merged = await get<Book[]>('kos_books_metadata');
    expect(merged![0].currentPage).toBe(300);
  });

  it('takes the backup copy when it was read more recently', async () => {
    await set('kos_books_metadata', [makeBook({ currentPage: 11, lastReadAt: 2_000 })]);

    await importLibrary(await buildBackup([makeBook({ currentPage: 300, lastReadAt: 9_000 })]));

    const merged = await get<Book[]>('kos_books_metadata');
    expect(merged![0].currentPage).toBe(300);
  });

  it('does not overwrite the settings of a device already in use', async () => {
    await set('kos_books_metadata', [makeBook({ id: 'existing' })]);
    await set('kos_reader_settings', { theme: 'sepia', fontSize: 18 });

    await importLibrary(await buildBackup([makeBook()]));

    expect(await get<{ theme: string }>('kos_reader_settings')).toMatchObject({ theme: 'sepia' });
  });

  it('adopts the backup settings on a fresh device', async () => {
    await importLibrary(await buildBackup([makeBook()]));

    expect(await get<{ theme: string }>('kos_reader_settings')).toMatchObject({ theme: 'dark' });
  });

  it('rejects a file that is not a zip', async () => {
    await expect(importLibrary(new Blob(['not a zip']))).rejects.toThrow(/não é um backup/i);
  });

  it('rejects a zip without a manifest', async () => {
    const zip = new JSZip();
    zip.file('random.txt', 'hello');
    await expect(importLibrary(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/sem manifesto/i);
  });

  it('rejects a backup from a newer app version instead of importing it wrong', async () => {
    await expect(importLibrary(await buildBackup([makeBook()], { format: 99 })))
      .rejects.toThrow(/versão mais recente/i);
  });
});
