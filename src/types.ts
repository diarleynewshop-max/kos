export interface Book {
  id: string;
  title: string;
  author: string;
  totalPages: number;
  currentPage: number;
  coverUrl: string;
  addedAt: number;
  lastReadAt: number;
  fileSize: number;
  bookmarks: number[];
  readingMode: 'original' | 'reflow';
  format?: 'pdf' | 'epub' | 'images';
  imagePages?: string[];
  source?: 'local' | 'google_drive' | 'archive_org';
  driveFileId?: string;
  archiveId?: string;
}

export type ThemeMode = 'light' | 'sepia' | 'dark' | 'eink';
export type FontFamily = 'bookerly' | 'ember' | 'baskerville' | 'dyslexic';
export type MarginSize = 'compact' | 'normal' | 'wide';

export interface ReaderSettings {
  theme: ThemeMode;
  fontSize: number; // 14 to 32
  fontFamily: FontFamily;
  lineHeight: number; // 1.4 to 2.2
  margin: MarginSize;
  autoCrop: boolean; // Auto-crop blank PDF margins in original mode
  einkFlash: boolean; // Subtle e-ink flash when changing pages
  contrastBoost: boolean; // Enhance contrast for thin text
}

export interface PdfBookmark {
  pageNumber: number;
  timestamp: number;
  snippet?: string;
}

export interface PdfOutlineItem {
  title: string;
  pageNumber: number;
  children?: PdfOutlineItem[];
}

export interface AnnotationPoint {
  x: number; // Normalized 0..1 to be responsive across different screen sizes
  y: number; // Normalized 0..1
}

export interface PageStroke {
  id: string;
  tool: 'highlighter' | 'pen' | 'eraser';
  color: string;
  size: number;
  points: AnnotationPoint[];
}

export interface PageAnnotations {
  strokes: PageStroke[];
}

export interface ReflowSection {
  type: 'heading' | 'paragraph' | 'image';
  text: string;
  alt?: string;
}

