/**
 * Internet Archive (archive.org) API Service.
 * Handles public Portuguese books in PDF and EPUB formats.
 */

import { downloadBinary } from './downloadService';

export interface ArchiveBook {
  identifier: string;
  title: string;
  creator: string;
  year?: string;
  downloads?: number;
  coverUrl: string;
  description?: string;
}

export interface ArchiveSearchResult {
  books: ArchiveBook[];
  total: number;
}

export interface ArchiveDownloadFile {
  filename: string;
  size?: number;
  format: 'pdf' | 'epub';
}

export function extractArchiveIdentifier(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const matchDetails = trimmed.match(/archive\.org\/details\/([a-zA-Z0-9_.-]+)/i);
  if (matchDetails?.[1]) return matchDetails[1];

  if (/^[a-zA-Z0-9_.-]{4,}$/.test(trimmed) && !trimmed.startsWith('http')) {
    return trimmed;
  }

  return null;
}

export function getArchiveCoverUrl(identifier: string): string {
  return `https://archive.org/services/img/${identifier}`;
}

export async function searchArchivePortuguese(
  query = '',
  category = 'popular',
  page = 1,
  rows = 24
): Promise<ArchiveSearchResult> {
  let baseQuery = 'mediatype:texts AND (language:por OR language:portuguese) AND (format:pdf OR format:epub)';

  if (category === 'classics') {
    baseQuery += ' AND (creator:"Machado de Assis" OR creator:"Jose de Alencar" OR creator:"Eca de Queiros" OR creator:"Aluisio Azevedo" OR creator:"Castro Alves" OR creator:"Fernando Pessoa" OR creator:"Camoes" OR subject:"Literatura brasileira" OR subject:"Literatura portuguesa")';
  } else if (category === 'history') {
    baseQuery += ' AND (subject:"Historia do Brasil" OR subject:"Historia" OR subject:"Filosofia")';
  }

  if (query.trim()) {
    const cleanQuery = query.replace(/[^\w\s\u00C0-\u017F]/gi, ' ').trim();
    if (cleanQuery) baseQuery += ` AND (${cleanQuery})`;
  }

  const url = new URL('https://archive.org/advancedsearch.php');
  url.searchParams.set('q', baseQuery);
  url.searchParams.set('fl[]', 'identifier,title,creator,year,downloads,description');
  url.searchParams.set('sort[]', 'downloads desc');
  url.searchParams.set('rows', rows.toString());
  url.searchParams.set('page', page.toString());
  url.searchParams.set('output', 'json');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Erro na busca do Archive.org (${response.status})`);
  }

  const data = await response.json();
  const docs = data.response?.docs || [];
  const total = data.response?.numFound || 0;

  const books: ArchiveBook[] = docs.map((doc: any) => {
    let author = 'Autor Desconhecido';
    if (Array.isArray(doc.creator)) {
      author = doc.creator.join(', ');
    } else if (typeof doc.creator === 'string' && doc.creator.trim()) {
      author = doc.creator.trim();
    }

    let title = 'Sem Titulo';
    if (Array.isArray(doc.title)) {
      title = doc.title[0];
    } else if (typeof doc.title === 'string' && doc.title.trim()) {
      title = doc.title.trim();
    }

    let description: string | undefined;
    if (Array.isArray(doc.description)) {
      description = doc.description[0];
    } else if (typeof doc.description === 'string') {
      description = doc.description;
    }

    return {
      identifier: doc.identifier,
      title,
      creator: author,
      year: doc.year ? String(doc.year) : undefined,
      downloads: typeof doc.downloads === 'number' ? doc.downloads : undefined,
      coverUrl: getArchiveCoverUrl(doc.identifier),
      description,
    };
  });

  return { books, total };
}

export async function getArchiveReadableFile(identifier: string): Promise<ArchiveDownloadFile | null> {
  const metadataUrl = `https://archive.org/metadata/${identifier}/files`;
  const resp = await fetch(metadataUrl);
  if (!resp.ok) {
    throw new Error(`Item "${identifier}" nao encontrado no Archive.org`);
  }

  const data = await resp.json();
  const files: any[] = data.result || [];
  const pdfFiles = files.filter(f => String(f.name || '').toLowerCase().endsWith('.pdf'));
  const epubFiles = files.filter(f => String(f.name || '').toLowerCase().endsWith('.epub'));

  if (pdfFiles.length === 0 && epubFiles.length === 0) return null;

  const preferredPdf = pdfFiles.find(f => {
    const name = String(f.name || '').toLowerCase();
    return !name.includes('_text.pdf') && !name.includes('_djvu');
  });
  const selectedFile = preferredPdf || epubFiles[0] || pdfFiles[0];
  const selectedName = String(selectedFile.name);

  return {
    filename: selectedName,
    size: selectedFile.size ? parseInt(selectedFile.size, 10) : undefined,
    format: selectedName.toLowerCase().endsWith('.epub') ? 'epub' : 'pdf',
  };
}

export async function downloadArchiveFile(identifier: string, filename: string): Promise<ArrayBuffer> {
  const encodedName = filename.split('/').map(part => encodeURIComponent(part)).join('/');
  const proxyPath = `/api/archive-download/download/${identifier}/${encodedName}`;
  const directUrl = `https://archive.org/download/${identifier}/${encodedName}`;
  const corsProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`;

  try {
    return await downloadBinary(proxyPath, [directUrl, corsProxyUrl]);
  } catch (err) {
    console.error('All download methods failed for Archive.org item:', err);
  }

  throw new Error(`Nao foi possivel baixar o arquivo "${filename}" do Archive.org. Verifique sua conexao.`);
}

export async function getArchivePdfFileName(identifier: string): Promise<{ filename: string; size?: number } | null> {
  const file = await getArchiveReadableFile(identifier);
  if (!file || file.format !== 'pdf') return null;
  return { filename: file.filename, size: file.size };
}

export async function downloadArchivePdf(identifier: string, filename: string): Promise<ArrayBuffer> {
  return downloadArchiveFile(identifier, filename);
}
