import { get, set, del } from 'idb-keyval';
import type { Book, ReaderSettings, PageAnnotations } from '../types';

const BOOKS_KEY = 'kos_books_metadata';
const SETTINGS_KEY = 'kos_reader_settings';

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'sepia',
  fontSize: 18,
  fontFamily: 'bookerly',
  lineHeight: 1.6,
  margin: 'normal',
  autoCrop: true,
  einkFlash: true,
  contrastBoost: false,
};

export async function getBooks(): Promise<Book[]> {
  try {
    const books = await get<Book[]>(BOOKS_KEY);
    return books || [];
  } catch (err) {
    console.error('Error fetching books from IndexedDB:', err);
    return [];
  }
}

export async function saveBook(book: Book, fileData?: ArrayBuffer): Promise<void> {
  try {
    const books = await getBooks();
    const existingIndex = books.findIndex(b => b.id === book.id);
    
    if (existingIndex >= 0) {
      books[existingIndex] = book;
    } else {
      books.unshift(book);
    }

    await set(BOOKS_KEY, books);

    if (fileData) {
      await set(`kos_file_${book.id}`, fileData.slice(0));
      if (!book.format || book.format === 'pdf') {
        await set(`kos_pdf_${book.id}`, fileData.slice(0));
      }
    }
  } catch (err) {
    console.error('Error saving book:', err);
    throw err;
  }
}

export async function updateBookProgress(
  bookId: string, 
  currentPage: number, 
  readingMode?: 'original' | 'reflow'
): Promise<void> {
  const books = await getBooks();
  const book = books.find(b => b.id === bookId);
  if (book) {
    book.currentPage = currentPage;
    book.lastReadAt = Date.now();
    if (readingMode) {
      book.readingMode = readingMode;
    }
    await set(BOOKS_KEY, books);
  }
}

export async function toggleBookmark(bookId: string, pageNumber: number): Promise<boolean> {
  const books = await getBooks();
  const book = books.find(b => b.id === bookId);
  if (!book) return false;

  const exists = book.bookmarks.includes(pageNumber);
  if (exists) {
    book.bookmarks = book.bookmarks.filter(p => p !== pageNumber);
  } else {
    book.bookmarks.push(pageNumber);
    book.bookmarks.sort((a, b) => a - b);
  }

  await set(BOOKS_KEY, books);
  return !exists;
}

export async function getPdfData(bookId: string): Promise<ArrayBuffer | null> {
  try {
    const data = await get<ArrayBuffer>(`kos_file_${bookId}`) || await get<ArrayBuffer>(`kos_pdf_${bookId}`);
    return data || null;
  } catch (err) {
    console.error('Error getting PDF data for book:', bookId, err);
    return null;
  }
}

export async function getEpubData(bookId: string): Promise<ArrayBuffer | null> {
  try {
    const data = await get<ArrayBuffer>(`kos_file_${bookId}`);
    return data || null;
  } catch (err) {
    console.error('Error getting EPUB data for book:', bookId, err);
    return null;
  }
}

export async function saveBookImages(bookId: string, images: string[]): Promise<void> {
  try {
    await set(`kos_images_${bookId}`, images);
  } catch (err) {
    console.error('Error saving book images:', err);
    throw err;
  }
}

export async function getBookImages(bookId: string): Promise<string[] | null> {
  try {
    const images = await get<string[]>(`kos_images_${bookId}`);
    return images || null;
  } catch (err) {
    console.error('Error getting images for book:', bookId, err);
    return null;
  }
}

export async function deleteBook(bookId: string): Promise<void> {
  try {
    const books = await getBooks();
    const updated = books.filter(b => b.id !== bookId);
    await set(BOOKS_KEY, updated);
    await del(`kos_file_${bookId}`);
    await del(`kos_pdf_${bookId}`);
    await del(`kos_images_${bookId}`);
  } catch (err) {
    console.error('Error deleting book:', err);
    throw err;
  }
}

export async function getSettings(): Promise<ReaderSettings> {
  try {
    const saved = await get<ReaderSettings>(SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch (err) {
    console.error('Error getting settings:', err);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: ReaderSettings): Promise<void> {
  try {
    await set(SETTINGS_KEY, settings);
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

// Annotation persistence (IndexedDB)
export async function getPageAnnotations(bookId: string, pageNumber: number): Promise<PageAnnotations | null> {
  try {
    const annotations = await get<PageAnnotations>(`kos_annot_${bookId}_${pageNumber}`);
    return annotations || null;
  } catch (err) {
    console.error('Error fetching annotations:', err);
    return null;
  }
}

export async function savePageAnnotations(
  bookId: string, 
  pageNumber: number, 
  annotations: PageAnnotations
): Promise<void> {
  try {
    if (!annotations.strokes || annotations.strokes.length === 0) {
      await del(`kos_annot_${bookId}_${pageNumber}`);
    } else {
      await set(`kos_annot_${bookId}_${pageNumber}`, annotations);
    }
  } catch (err) {
    console.error('Error saving page annotations:', err);
  }
}

export async function clearPageAnnotations(bookId: string, pageNumber: number): Promise<void> {
  try {
    await del(`kos_annot_${bookId}_${pageNumber}`);
  } catch (err) {
    console.error('Error clearing page annotations:', err);
  }
}
