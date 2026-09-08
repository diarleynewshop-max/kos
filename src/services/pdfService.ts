import * as pdfjsLib from 'pdfjs-dist';
// Import worker directly as URL for Vite
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import type { PdfOutlineItem, ReflowSection } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderResult {
  width: number;
  height: number;
  cropped: boolean;
}

export async function loadPdf(data: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  // Always clone buffer to avoid web worker detachment
  const safeData = data.slice(0);
  const loadingTask = pdfjsLib.getDocument({
    data: safeData,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
    cMapPacked: true,
  });
  return await loadingTask.promise;
}

export async function extractMetadata(pdfDoc: pdfjsLib.PDFDocumentProxy, filename: string) {
  let title = filename.replace(/\.pdf$/i, '').trim();
  let author = 'Autor Desconhecido';
  const totalPages = pdfDoc.numPages;

  try {
    const meta = await pdfDoc.getMetadata();
    const info = meta?.info as Record<string, any> | undefined;
    if (info?.Title && typeof info.Title === 'string' && info.Title.trim().length > 1) {
      title = info.Title.trim();
    }
    if (info?.Author && typeof info.Author === 'string' && info.Author.trim().length > 1) {
      author = info.Author.trim();
    }
  } catch (e) {
    console.warn('Could not read PDF metadata:', e);
  }

  return { title, author, totalPages };
}

export async function generateThumbnail(pdfDoc: pdfjsLib.PDFDocumentProxy): Promise<string> {
  try {
    const page = await pdfDoc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    
    // Target height ~300px for sharp thumbnail
    const scale = 300 / viewport.height;
    const thumbViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = thumbViewport.width;
    canvas.height = thumbViewport.height;

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: thumbViewport,
    }).promise;

    return canvas.toDataURL('image/jpeg', 0.82);
  } catch (err) {
    console.error('Error generating thumbnail:', err);
    return '';
  }
}

/**
 * Smart Auto-Crop: Finds white/blank borders on rendered page canvas
 * to zoom content into the mobile viewport.
 */
function detectContentBounds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  threshold = 245
): { minX: number; minY: number; maxX: number; maxY: number } {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  // Sample with step to speed up mobile execution
  const step = 4;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // If pixel is darker than threshold (not pure white margin)
      if (r < threshold || g < threshold || b < threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If no content or entire page is dark, return full dimensions
  if (minX >= maxX || minY >= maxY) {
    return { minX: 0, minY: 0, maxX: width, maxY: height };
  }

  // Add a small comfortable margin (1.5% of width/height)
  const padX = Math.round(width * 0.02);
  const padY = Math.round(height * 0.02);

  return {
    minX: Math.max(0, minX - padX),
    minY: Math.max(0, minY - padY),
    maxX: Math.min(width, maxX + padX),
    maxY: Math.min(height, maxY + padY),
  };
}

export async function renderPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number,
  targetCanvas: HTMLCanvasElement,
  containerWidth: number,
  _containerHeight: number,
  options: {
    autoCrop?: boolean;
    contrastBoost?: boolean;
    theme?: string;
  } = {}
): Promise<RenderResult> {
  const page = await pdfDoc.getPage(pageNumber);
  const rawViewport = page.getViewport({ scale: 1 });

  // Mobile retina sharpness (minimum 2x or devicePixelRatio)
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  // Determine initial scale to fit container width
  const baseScale = (containerWidth / rawViewport.width) * dpr;
  const viewport = page.getViewport({ scale: baseScale });

  // Offscreen canvas for crisp rendering and auto-crop analysis
  const offscreen = document.createElement('canvas');
  offscreen.width = viewport.width;
  offscreen.height = viewport.height;
  const offCtx = offscreen.getContext('2d', { alpha: false });

  if (!offCtx) throw new Error('Canvas 2D context not available');

  offCtx.fillStyle = '#ffffff';
  offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

  await page.render({
    canvasContext: offCtx,
    viewport,
  }).promise;

  let sourceX = 0;
  let sourceY = 0;
  let sourceW = offscreen.width;
  let sourceH = offscreen.height;
  let didCrop = false;

  if (options.autoCrop) {
    const bounds = detectContentBounds(offCtx, offscreen.width, offscreen.height);
    const croppedWidth = bounds.maxX - bounds.minX;
    const croppedHeight = bounds.maxY - bounds.minY;

    // Only crop if margins are significant (> 8% trimmed)
    if (croppedWidth < offscreen.width * 0.92 || croppedHeight < offscreen.height * 0.92) {
      sourceX = bounds.minX;
      sourceY = bounds.minY;
      sourceW = croppedWidth;
      sourceH = croppedHeight;
      didCrop = true;
    }
  }

  // Now draw to targetCanvas with the aspect ratio of the content
  const targetScale = (containerWidth * dpr) / sourceW;
  const finalW = containerWidth * dpr;
  const finalH = sourceH * targetScale;

  targetCanvas.width = finalW;
  targetCanvas.height = finalH;
  targetCanvas.style.width = `${containerWidth}px`;
  targetCanvas.style.height = `${finalH / dpr}px`;

  const targetCtx = targetCanvas.getContext('2d', { alpha: false });
  if (!targetCtx) throw new Error('Target canvas context error');

  if (options.contrastBoost) {
    targetCtx.filter = 'contrast(1.15) brightness(0.98)';
  }

  targetCtx.drawImage(
    offscreen,
    sourceX, sourceY, sourceW, sourceH,
    0, 0, finalW, finalH
  );

  return {
    width: finalW / dpr,
    height: finalH / dpr,
    cropped: didCrop,
  };
}

export type { ReflowSection } from '../types';

/**
 * Extracts structured text from PDF page for Fluid Kindle Reflow reading.
 */
export async function extractReflowText(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number
): Promise<ReflowSection[]> {
  try {
    const page = await pdfDoc.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = textContent.items as any[];

    if (!items || items.length === 0) {
      return [];
    }

    // Sort items by Y descending (top to bottom), then X ascending (left to right)
    // Note: PDF coordinate system has Y=0 at bottom
    const sorted = [...items].sort((a, b) => {
      const yDiff = b.transform[5] - a.transform[5];
      if (Math.abs(yDiff) > 4) return yDiff;
      return a.transform[4] - b.transform[4];
    });

    const lines: { text: string; fontSize: number; y: number }[] = [];
    let currentLine = '';
    let currentFontSize = 0;
    let lastY = -9999;

    for (const item of sorted) {
      const text = item.str || '';
      if (!text.trim() && text !== ' ') continue;

      const y = Math.round(item.transform[5]);
      const fontSize = Math.round(Math.hypot(item.transform[0], item.transform[1]));

      if (lastY !== -9999 && Math.abs(y - lastY) > 5) {
        if (currentLine.trim()) {
          lines.push({ text: currentLine.trim(), fontSize: currentFontSize, y: lastY });
        }
        currentLine = text;
        currentFontSize = fontSize;
      } else {
        // Same line
        if (currentLine && !currentLine.endsWith(' ') && !text.startsWith(' ')) {
          currentLine += ' ' + text;
        } else {
          currentLine += text;
        }
        currentFontSize = Math.max(currentFontSize, fontSize);
      }
      lastY = y;
    }

    if (currentLine.trim()) {
      lines.push({ text: currentLine.trim(), fontSize: currentFontSize, y: lastY });
    }

    // Determine baseline font size to detect headings
    const fontSizes = lines.map(l => l.fontSize).filter(s => s > 0);
    const avgFontSize = fontSizes.length > 0 ? fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length : 12;

    const sections: ReflowSection[] = [];
    let currentParagraph = '';

    for (const line of lines) {
      const isHeading = line.fontSize >= avgFontSize * 1.25 && line.text.length < 80;

      if (isHeading) {
        if (currentParagraph.trim()) {
          sections.push({ type: 'paragraph', text: cleanParagraphText(currentParagraph) });
          currentParagraph = '';
        }
        sections.push({ type: 'heading', text: line.text });
      } else {
        // Check for hyphenation at line end (ex: "com-", "pro-")
        if (currentParagraph.endsWith('-')) {
          currentParagraph = currentParagraph.slice(0, -1) + line.text;
        } else if (currentParagraph) {
          currentParagraph += ' ' + line.text;
        } else {
          currentParagraph = line.text;
        }
      }
    }

    if (currentParagraph.trim()) {
      sections.push({ type: 'paragraph', text: cleanParagraphText(currentParagraph) });
    }

    return sections;
  } catch (err) {
    console.error('Error extracting text for reflow:', err);
    return [{ type: 'paragraph', text: 'Não foi possível extrair o texto desta página.' }];
  }
}

function cleanParagraphText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s([.,!?;:])/g, '$1')
    .trim();
}

export async function getTableOfContents(pdfDoc: pdfjsLib.PDFDocumentProxy): Promise<PdfOutlineItem[]> {
  try {
    const outline = await pdfDoc.getOutline();
    if (!outline || outline.length === 0) return [];

    const items: PdfOutlineItem[] = [];

    for (const item of outline) {
      let pageNumber = 1;
      if (item.dest) {
        let dest: any = item.dest;
        if (typeof dest === 'string') {
          dest = await pdfDoc.getDestination(dest);
        }
        if (Array.isArray(dest) && dest[0]) {
          const pageIndex = await pdfDoc.getPageIndex(dest[0]);
          pageNumber = pageIndex + 1;
        }
      }

      items.push({
        title: item.title || 'Sem título',
        pageNumber,
      });
    }

    return items;
  } catch (err) {
    console.warn('No outline found in PDF:', err);
    return [];
  }
}
