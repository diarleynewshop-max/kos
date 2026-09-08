import ePub from 'epubjs';
import type { ReaderSettings, ReflowSection } from '../types';

export type { ReflowSection };

// Safe-guard epubjs against unhandled rejection when book is destroyed or resources unloaded while replacements are pending
try {
  const dummyBook = ePub();
  const bookProto = Object.getPrototypeOf(dummyBook);
  if (bookProto && typeof bookProto.replacements === 'function') {
    bookProto.replacements = function () {
      if (this.spine?.hooks?.serialize && this.resources) {
        this.spine.hooks.serialize.register((output: any, section: any) => {
          if (this.resources?.substitute) {
            section.output = this.resources.substitute(output, section.url);
          }
        });
      }
      if (!this.resources || typeof this.resources.replacements !== 'function') {
        return Promise.resolve();
      }
      return this.resources
        .replacements()
        .then(() => {
          if (this.resources && typeof this.resources.replaceCss === 'function') {
            return this.resources.replaceCss();
          }
          return Promise.resolve();
        })
        .catch((err: unknown) => {
          console.warn('epubjs replacements gracefully handled:', err);
        });
    };
  }
} catch {
  // Ignore prototype patch failures in unusual environments
}

/**
 * Extracts basic metadata and spine count from an EPUB ArrayBuffer.
 */
export async function extractEpubMetadata(
  data: ArrayBuffer,
  filename: string
): Promise<{ title: string; author: string; totalPages: number }> {
  const epubBook = ePub(data.slice(0));

  try {
    await epubBook.ready;
    const metadata = await epubBook.loaded.metadata;
    const spineItems = await epubBook.loaded.spine;
    const creator = metadata.creator;
    const spineCount = Array.isArray(spineItems)
      ? spineItems.length
      : Array.isArray((spineItems as any)?.spineItems)
        ? (spineItems as any).spineItems.length
        : 1;

    return {
      title: metadata.title?.trim() || filename.replace(/\.epub$/i, '').trim() || 'Livro EPUB',
      author: Array.isArray(creator) ? creator.join(', ') : creator || 'Autor Desconhecido',
      totalPages: Math.max(1, spineCount),
    };
  } finally {
    try {
      epubBook.destroy();
    } catch {
      // ignore
    }
  }
}

/**
 * Cleans and normalizes text extracted from EPUB paragraphs
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s([.,!?;:])/g, '$1')
    .trim();
}

/**
 * Resolves an image URL inside an EPUB chapter into a valid Blob/Data URL.
 */
async function resolveEpubImageUrl(epubBook: any, item: any, rawSrc: string): Promise<string | null> {
  if (!rawSrc) return null;
  if (rawSrc.startsWith('data:') || rawSrc.startsWith('blob:') || rawSrc.startsWith('http')) {
    return rawSrc;
  }

  try {
    // 1. Check if resource is already substituted by epubjs
    if (epubBook.resources?.get) {
      const res = epubBook.resources.get(rawSrc);
      if (res) return res;
    }

    // 2. Resolve relative path against chapter path in archive
    if (epubBook.archive?.createUrl) {
      const baseDir = (item.url || item.href || '')
        .replace(/\\/g, '/')
        .replace(/^\//, '')
        .split('/')
        .slice(0, -1)
        .join('/');

      const parts = (baseDir ? baseDir + '/' + rawSrc : rawSrc).split('/');
      const resolved: string[] = [];
      for (const p of parts) {
        if (p === '.' || !p) continue;
        if (p === '..') {
          resolved.pop();
        } else {
          resolved.push(p);
        }
      }
      const fullPath = resolved.join('/');

      try {
        const url = await epubBook.archive.createUrl(fullPath);
        if (url) return url;
      } catch {
        // Fallback: search zip for matching filename
        const filename = rawSrc.split('/').pop()?.split('#')[0];
        if (filename && epubBook.archive.zip?.files) {
          const match = Object.keys(epubBook.archive.zip.files).find(
            k => k.endsWith('/' + filename) || k === filename
          );
          if (match) {
            return await epubBook.archive.createUrl(match);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Could not resolve EPUB image url:', rawSrc, err);
  }
  return null;
}

/**
 * Extracts clean, semantic sections (headings, paragraphs, and illustrations) from an EPUB spine chapter.
 * This powers the high-fidelity Kindle Reflow / Transcrição Limpa reading mode.
 */
export async function extractEpubChapterSections(
  epubBook: any,
  spineIndex: number
): Promise<ReflowSection[]> {
  if (!epubBook) return [];

  try {
    await epubBook.ready;
    const spine = await epubBook.loaded.spine;
    const spineItems: any[] = Array.isArray(spine)
      ? spine
      : Array.isArray(spine?.spineItems)
        ? spine.spineItems
        : epubBook.spine?.items || [];

    if (spineItems.length === 0) return [];

    const clampedIdx = Math.max(0, Math.min(spineIndex, spineItems.length - 1));
    const item = spineItems[clampedIdx];
    if (!item) return [];

    // Load chapter DOM root (epubjs returns HTMLHtmlElement or Document)
    const root: any = await item.load(epubBook.load.bind(epubBook));
    if (!root) return [];

    const body: HTMLElement | null =
      root.body ||
      (root.querySelector ? root.querySelector('body') : null) ||
      (root instanceof HTMLElement ? root : null);

    if (!body) return [];

    // Clean out non-content elements
    const scripts = body.querySelectorAll('script, style, noscript');
    scripts.forEach(s => s.remove());

    const sections: ReflowSection[] = [];
    const elements = body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote, li, div.paragrafo, img, image');

    if (elements.length > 0) {
      for (const el of Array.from(elements)) {
        const tagName = el.tagName.toLowerCase();

        // Handle illustrations & book covers
        if (tagName === 'img' || tagName === 'image') {
          const rawSrc = el.getAttribute('src') || el.getAttribute('xlink:href') || el.getAttribute('href');
          if (rawSrc) {
            const imgUrl = await resolveEpubImageUrl(epubBook, item, rawSrc);
            if (imgUrl) {
              sections.push({
                type: 'image',
                text: imgUrl,
                alt: el.getAttribute('alt') || 'Ilustração do capítulo',
              });
            }
          }
          continue;
        }

        // Prevent duplicate text when elements are nested (e.g. <p> inside <li> or <blockquote>)
        if (
          el.parentElement &&
          ['p', 'blockquote', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(
            el.parentElement.tagName.toLowerCase()
          )
        ) {
          continue;
        }

        const rawText = el.textContent || '';
        const cleaned = cleanText(rawText);
        if (!cleaned) continue;

        // Skip empty publisher spacers
        if (
          el.classList.contains('chapter-separator') ||
          el.classList.contains('chapter-separator1') ||
          cleaned === ''
        ) {
          continue;
        }

        const isHeading =
          tagName.startsWith('h') ||
          el.classList.contains('chapter-title') ||
          el.classList.contains('titulo') ||
          el.classList.contains('p10') ||
          el.classList.contains('p14') ||
          (cleaned.length < 80 && cleaned === cleaned.toUpperCase() && cleaned.length > 3 && !cleaned.includes('. '));

        sections.push({
          type: isHeading ? 'heading' : 'paragraph',
          text: cleaned,
        });
      }
    }

    // Fallback: If no paragraph/heading tags were found, split raw text content into paragraphs
    if (sections.length === 0) {
      const rawText = body.innerText || body.textContent || '';
      const blocks = rawText.split(/\n\s*\n/);
      blocks.forEach(block => {
        const cleaned = cleanText(block);
        if (cleaned && cleaned.length > 1) {
          const isHeading = cleaned.length < 80 && (cleaned === cleaned.toUpperCase() || !cleaned.includes('. '));
          sections.push({
            type: isHeading ? 'heading' : 'paragraph',
            text: cleaned,
          });
        }
      });
    }

    // Fallback 2: If still no text sections found, check if there's any image/cover
    if (sections.length === 0) {
      const anyImg = body.querySelector('img, image');
      if (anyImg) {
        const rawSrc = anyImg.getAttribute('src') || anyImg.getAttribute('xlink:href') || anyImg.getAttribute('href');
        if (rawSrc) {
          const imgUrl = await resolveEpubImageUrl(epubBook, item, rawSrc);
          if (imgUrl) {
            sections.push({
              type: 'image',
              text: imgUrl,
              alt: anyImg.getAttribute('alt') || 'Capa do Livro',
            });
          }
        }
      }
    }

    return sections;
  } catch (err) {
    console.error(`Error extracting chapter sections at spine index ${spineIndex}:`, err);
    return [];
  }
}

/**
 * Normalizing Kindle CSS styles to be injected into the EPUB iframe rendition.
 * Overrides hardcoded Calibre/Publisher margins, font-sizes, and colors.
 */
export function getEpubReaderStyles(
  settings: ReaderSettings,
  readerBg: string,
  readerText: string
): string {
  const fontFamilies: Record<string, string> = {
    bookerly: "'Amazon Bookerly', Georgia, 'Times New Roman', serif",
    baskerville: "'Libre Baskerville', Baskerville, serif",
    ember: "'Amazon Ember', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    dyslexic: "'OpenDyslexic', Arial, sans-serif",
  };

  const selectedFont = fontFamilies[settings.fontFamily] || fontFamilies.bookerly;
  const paddingX = settings.margin === 'compact' ? '24px' : settings.margin === 'wide' ? '64px' : '40px';

  return `
    /* Reset book hardcoded margins & font overrides */
    html {
      background-color: ${readerBg} !important;
      color: ${readerText} !important;
      font-family: ${selectedFont} !important;
      font-size: ${settings.fontSize}px !important;
      line-height: ${settings.lineHeight || 1.6} !important;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      background-color: transparent !important;
      color: ${readerText} !important;
      font-family: ${selectedFont} !important;
      font-size: ${settings.fontSize}px !important;
      line-height: ${settings.lineHeight || 1.6} !important;
      padding-top: 64px !important;
      padding-bottom: 50px !important;
      padding-left: ${paddingX} !important;
      padding-right: ${paddingX} !important;
      margin: 0 auto !important;
      box-sizing: border-box !important;
      max-width: 720px !important;
    }

    /* Paragraphs and typography formatting */
    p, div.calibre_ {
      text-align: justify !important;
      text-justify: inter-word !important;
      hyphens: auto !important;
      -webkit-hyphens: auto !important;
      margin-top: 0.5em !important;
      margin-bottom: 0.5em !important;
      text-indent: 1.25em !important;
      color: inherit !important;
      background: transparent !important;
    }

    /* First paragraph after headings shouldn't be indented (Kindle Standard) */
    h1 + p, h2 + p, h3 + p, h4 + p, .chapter-title + p {
      text-indent: 0 !important;
    }

    /* Headings */
    h1, h2, h3, h4, h5, h6 {
      font-family: ${selectedFont} !important;
      color: ${readerText} !important;
      font-weight: 700 !important;
      line-height: 1.25 !important;
      margin-top: 1.5em !important;
      margin-bottom: 0.75em !important;
      text-align: left !important;
      page-break-after: avoid !important;
      break-after: avoid !important;
    }

    /* Fix image overflow or distortion from publishers */
    img, svg {
      max-width: 100% !important;
      height: auto !important;
      display: block !important;
      margin: 1.5em auto !important;
      object-fit: contain !important;
    }

    /* Links shouldn't be bright blue underlines */
    a {
      color: inherit !important;
      text-decoration: none !important;
      border-bottom: 1px dotted currentColor !important;
    }

    /* Prevent publisher fixed widths or negative margins */
    div, section, article, main {
      width: auto !important;
      max-width: 100% !important;
      margin-left: 0 !important;
      margin-right: 0 !important;
      background-color: transparent !important;
      color: inherit !important;
    }
  `;
}
