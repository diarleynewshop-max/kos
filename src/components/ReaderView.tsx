import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import ePub from 'epubjs';
import type { Book, ReaderSettings, PdfOutlineItem, ReflowSection } from '../types';
import {
  ArrowLeft,
  Bookmark,
  ListTree,
  ChevronLeft,
  ChevronRight,
  Crop,
  Type,
  Lock,
  Highlighter
} from 'lucide-react';
import {
  loadPdf,
  renderPage,
  extractReflowText,
  getTableOfContents
} from '../services/pdfService';
import {
  extractEpubChapterSections,
  getEpubReaderStyles
} from '../services/epubService';
import {
  getPdfData,
  getEpubData,
  getBookImages,
  updateBookProgress,
  toggleBookmark,
  saveBook
} from '../services/storage';
import { SettingsModal } from './SettingsModal';
import { ContentsModal } from './ContentsModal';
import { AnnotationLayer } from './AnnotationLayer';
import type { PDFDocumentProxy } from 'pdfjs-dist';

// Gap (px) between virtual reflow pages, acting as the page's horizontal margin.
const REFLOW_COLUMN_GAP = 48;

interface ReaderViewProps {
  book: Book;
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  onBackToLibrary: () => void;
  onBookUpdated: (updatedBook: Book) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  settings,
  onUpdateSettings,
  onBackToLibrary,
  onBookUpdated,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(book.currentPage || 1);
  const [readingMode, setReadingMode] = useState<'original' | 'reflow'>(book.readingMode || 'original');
  const [showChrome, setShowChrome] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showContents, setShowContents] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [outline, setOutline] = useState<PdfOutlineItem[]>([]);
  const [reflowSections, setReflowSections] = useState<ReflowSection[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);
  const [imagePages, setImagePages] = useState<string[]>([]);
  const [subPageIndex, setSubPageIndex] = useState<number>(0);
  const [subPageCount, setSubPageCount] = useState<number>(1);
  const [isBookmarked, setIsBookmarked] = useState<boolean>(false);
  const [einkFlashing, setEinkFlashing] = useState<boolean>(false);
  const [isPageLocked, setIsPageLocked] = useState<boolean>(false);
  const [isDrawingMode, setIsDrawingMode] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

  // EPUB rendering (epubjs)
  const epubBookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const epubLocationsRef = useRef<string[]>([]);
  const epubSpineCountRef = useRef<number>(1);
  const currentSpineIndexRef = useRef<number>(0);
  const epubContainerRef = useRef<HTMLDivElement | null>(null);
  const reflowContainerRef = useRef<HTMLDivElement | null>(null);
  const reflowColumnsRef = useRef<HTMLDivElement | null>(null);
  const landOnLastSubPageRef = useRef<boolean>(false);
  const resetSubPageRef = useRef<boolean>(false);
  const prevSubPageCountRef = useRef<number>(1);
  const reflowColWidthRef = useRef<number>(0);

  // Theme styling helpers
  const themeClass = `theme-${settings.theme}`;
  const isDark = settings.theme === 'dark';
  const isSepia = settings.theme === 'sepia';
  const isEink = settings.theme === 'eink';

  const readerBg = isDark ? '#121212' : isSepia ? '#f6eedb' : isEink ? '#eae8e3' : '#fbfbf9';
  const readerText = isDark ? '#e3e3e3' : isSepia ? '#382a17' : isEink ? '#111111' : '#181818';
  const chromeBg = isDark ? '#1a1a1a' : isSepia ? '#f4ecd8' : isEink ? '#dedcd5' : '#ffffff';
  const chromeBorder = isDark ? '#2e2e2e' : isSepia ? '#dfd3b9' : isEink ? '#c5c2b9' : '#e5e3dc';

  const marginPaddingClass = 
    settings.margin === 'compact' ? 'px-4' : 
    settings.margin === 'wide' ? 'px-10' : 'px-6';

  const fontClass = 
    settings.fontFamily === 'bookerly' ? 'font-bookerly' :
    settings.fontFamily === 'ember' ? 'font-ember' :
    settings.fontFamily === 'baskerville' ? 'font-baskerville' : 'font-dyslexic';

  const percentRead = Math.round((currentPage / book.totalPages) * 100);
  const estMinutesRemaining = Math.max(1, Math.round((book.totalPages - currentPage) * 1.5));

  // Sync bookmark state
  useEffect(() => {
    setIsBookmarked(book.bookmarks?.includes(currentPage) || false);
  }, [currentPage, book.bookmarks]);

  // Load Book (PDF, EPUB or Images)
  useEffect(() => {
    let isMounted = true;
    async function initBook() {
      try {
        setLoading(true);

        // 1. Image-based book
        if (book.format === 'images') {
          const images = await getBookImages(book.id);
          if (isMounted) {
            setImagePages(images || []);
            setLoading(false);
          }
          return;
        }

        // 2. EPUB book
        if (book.format === 'epub') {
          const data = await getEpubData(book.id);
          if (!data) {
            alert('Erro ao carregar os dados do arquivo EPUB.');
            onBackToLibrary();
            return;
          }

          const epubBook = ePub(data.slice(0));
          epubBookRef.current = epubBook;
          await epubBook.ready;

          const spine = await epubBook.loaded.spine;
          const spineCount = Array.isArray(spine)
            ? spine.length
            : (spine as any)?.spineItems?.length || 1;
          epubSpineCountRef.current = Math.max(1, spineCount);
          if (!isMounted) return;

          // Load EPUB navigation (TOC) — independent of page counting, can run in the background
          void epubBook.loaded.navigation.then((nav: any) => {
            if (!isMounted || !nav?.toc) return;
            const mapNav = (items: any[]): PdfOutlineItem[] => {
              return items.map((item: any, idx: number) => ({
                title: item.label?.trim() || `Capítulo ${idx + 1}`,
                pageNumber: idx + 1,
                children: item.subitems?.length ? mapNav(item.subitems) : undefined,
              }));
            };
            setOutline(mapNav(nav.toc));
          }).catch(() => {});

          // Generate the location index BEFORE the reader becomes interactive.
          // Page numbers are derived from this index; computing it in the
          // background (after the user starts reading) meant the "current
          // page" basis flipped mid-session — first from spine-chapter index,
          // then to this index once it resolved — causing the number to jump
          // around non-monotonically as pages were turned.
          try {
            const locations = await epubBook.locations.generate(1000);
            if (!isMounted) return;
            epubLocationsRef.current = locations;
          } catch (locationError) {
            console.warn('Could not generate EPUB locations:', locationError);
          }

          const totalLocations = epubLocationsRef.current.length || epubSpineCountRef.current;
          if (totalLocations !== book.totalPages) {
            const correctedBook: Book = {
              ...book,
              totalPages: totalLocations,
              currentPage: Math.min(book.currentPage || 1, totalLocations),
            };
            await saveBook(correctedBook);
            if (isMounted) onBookUpdated(correctedBook);
          }

          setLoading(false);
          return;
        }

        // 3. PDF based book
        const data = await getPdfData(book.id);
        if (!data) {
          alert('Erro ao carregar os dados do arquivo PDF.');
          onBackToLibrary();
          return;
        }

        const doc = await loadPdf(data);
        if (!isMounted) return;
        pdfDocRef.current = doc;

        // Load TOC outline
        const toc = await getTableOfContents(doc);
        if (isMounted) setOutline(toc);

        setLoading(false);
      } catch (err) {
        console.error('Failed to load book doc:', err);
        if (isMounted) {
          alert('Não foi possível abrir o arquivo.');
          onBackToLibrary();
        }
      }
    }

    initBook();

    return () => {
      isMounted = false;
      if (renditionRef.current) {
        try { renditionRef.current.destroy(); } catch { /* ignore */ }
        renditionRef.current = null;
      }
      if (epubBookRef.current) {
        try { epubBookRef.current.destroy(); } catch { /* ignore */ }
        epubBookRef.current = null;
      }
      epubLocationsRef.current = [];
      epubSpineCountRef.current = 1;
    };
  }, [book.id, book.format]);

  // Create the EPUB rendition once the container is mounted
  useEffect(() => {
    if (book.format !== 'epub' || loading) return;
    if (!epubContainerRef.current || !epubBookRef.current || renditionRef.current) return;

    const epubBook = epubBookRef.current;
    const rendition = epubBook.renderTo(epubContainerRef.current, {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'none',
    });
    renditionRef.current = rendition;

    // Register content hook for clean normalizing Kindle CSS
    rendition.hooks.content.register((contents: any) => {
      const doc = contents.document;
      if (!doc || !doc.head) return;

      const styleId = 'kos-injected-epub-styles';
      let styleEl = doc.getElementById(styleId);
      if (!styleEl) {
        styleEl = doc.createElement('style');
        styleEl.id = styleId;
        doc.head.appendChild(styleEl);
      }
      styleEl.innerHTML = getEpubReaderStyles(settings, readerBg, readerText);
    });

    rendition.on('relocated', (location: any) => {
      const cfi = location?.start?.cfi;
      const spineIdx = location?.start?.index ?? 0;
      currentSpineIndexRef.current = spineIdx;

      if (!cfi) return;
      const total = epubLocationsRef.current.length;
      const percentage = total > 1 ? epubBook.locations.percentageFromCfi(cfi) : 0;
      const locationPage = total > 1
        ? Math.min(total - 1, Math.max(0, Math.round(percentage * (total - 1)))) + 1
        : Math.min(epubSpineCountRef.current, Math.max(1, spineIdx + 1));
      const newPage = locationPage;
      setCurrentPage(prevPage => (prevPage === newPage ? prevPage : newPage));
      updateBookProgress(book.id, newPage, readingMode);
      onBookUpdated({ ...book, currentPage: newPage, readingMode });
    });

    // EPUB content lives in an iframe, handle page turns & center click
    rendition.on('click', (event: MouseEvent) => {
      const x = event.clientX;
      const screenWidth = window.innerWidth;
      if (x < screenWidth * 0.22) {
        triggerEinkFlash();
        void rendition.prev();
      } else if (x > screenWidth * 0.78) {
        triggerEinkFlash();
        void rendition.next();
      } else {
        setShowChrome(prev => !prev);
      }
    });

    const startIdx = Math.max(0, Math.min((book.currentPage || 1) - 1, epubLocationsRef.current.length - 1));
    rendition.display(epubLocationsRef.current[startIdx] || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.format, loading]);

  // Apply live style updates to EPUB rendition whenever settings change
  useEffect(() => {
    if (book.format !== 'epub' || !renditionRef.current) return;

    try {
      renditionRef.current.themes.fontSize(`${settings.fontSize}px`);
    } catch { /* ignore */ }

    try {
      const contents = renditionRef.current.getContents?.() || [];
      contents.forEach((c: any) => {
        const doc = c.document;
        if (doc) {
          const styleEl = doc.getElementById('kos-injected-epub-styles');
          if (styleEl) {
            styleEl.innerHTML = getEpubReaderStyles(settings, readerBg, readerText);
          }
        }
      });
    } catch { /* ignore */ }
  }, [book.format, settings, readerBg, readerText]);

  // Trigger e-ink flash animation if enabled
  const triggerEinkFlash = useCallback(() => {
    if (settings.einkFlash) {
      setEinkFlashing(true);
      setTimeout(() => setEinkFlashing(false), 150);
    }
  }, [settings.einkFlash]);

  // Page Navigation Handlers
  const goToPage = useCallback(async (newPage: number) => {
    const clamped = Math.max(1, Math.min(newPage, book.totalPages));

    if (book.format === 'epub') {
      triggerEinkFlash();
      setCurrentPage(clamped);
      await updateBookProgress(book.id, clamped, readingMode);
      onBookUpdated({ ...book, currentPage: clamped, readingMode });

      if (readingMode === 'original' && renditionRef.current) {
        if (epubLocationsRef.current.length > 0) {
          const idx = Math.max(0, Math.min(clamped - 1, epubLocationsRef.current.length - 1));
          await renditionRef.current.display(epubLocationsRef.current[idx]);
        }
      }
      return;
    }

    if (!pdfDocRef.current && book.format !== 'images') return;
    if (clamped === currentPage) return;

    triggerEinkFlash();
    setCurrentPage(clamped);
    await updateBookProgress(book.id, clamped, readingMode);
    onBookUpdated({ ...book, currentPage: clamped, readingMode });
  }, [book, currentPage, readingMode, onBookUpdated, triggerEinkFlash]);

  // EPUB Chapter-by-chapter navigation (powers Reflow & Transcrição Limpa)
  const goToSpineChapter = useCallback(async (targetSpineIdx: number) => {
    if (!epubBookRef.current) return;
    const spineCount = epubSpineCountRef.current;
    const clampedSpine = Math.max(0, Math.min(targetSpineIdx, spineCount - 1));
    currentSpineIndexRef.current = clampedSpine;
    setCurrentChapterIndex(clampedSpine);

    if (epubLocationsRef.current.length > 0) {
      const locIdx = epubLocationsRef.current.findIndex(cfi => {
        try {
          const sec = epubBookRef.current?.spine?.get(cfi);
          return sec && sec.index === clampedSpine;
        } catch {
          return false;
        }
      });
      if (locIdx !== -1) {
        await goToPage(locIdx + 1);
        return;
      }
    }

    const approxPage = Math.max(
      1,
      Math.min(book.totalPages, Math.round((clampedSpine / spineCount) * (book.totalPages - 1)) + 1)
    );
    await goToPage(approxPage);
  }, [book.totalPages, goToPage]);

  // Reflow pagination: advance/retreat one on-screen "slice" of the current
  // page/chapter's text before falling back to the real page/chapter change.
  const reflowNext = useCallback(() => {
    if (subPageIndex < subPageCount - 1) {
      triggerEinkFlash();
      setSubPageIndex(i => i + 1);
      return;
    }
    if (book.format === 'epub') {
      const nextIdx = currentSpineIndexRef.current + 1;
      if (nextIdx < epubSpineCountRef.current) {
        triggerEinkFlash();
        void goToSpineChapter(nextIdx);
      }
      return;
    }
    if (currentPage < book.totalPages) {
      triggerEinkFlash();
      goToPage(currentPage + 1);
    }
  }, [subPageIndex, subPageCount, book.format, currentPage, book.totalPages, goToPage, goToSpineChapter, triggerEinkFlash]);

  const reflowPrev = useCallback(() => {
    if (subPageIndex > 0) {
      triggerEinkFlash();
      setSubPageIndex(i => i - 1);
      return;
    }
    if (book.format === 'epub') {
      const prevIdx = currentSpineIndexRef.current - 1;
      if (prevIdx >= 0) {
        triggerEinkFlash();
        landOnLastSubPageRef.current = true;
        void goToSpineChapter(prevIdx);
      }
      return;
    }
    if (currentPage > 1) {
      triggerEinkFlash();
      landOnLastSubPageRef.current = true;
      goToPage(currentPage - 1);
    }
  }, [subPageIndex, book.format, currentPage, goToPage, goToSpineChapter, triggerEinkFlash]);

  const nextPage = useCallback(() => {
    if (readingMode === 'reflow' && book.format !== 'images') {
      reflowNext();
      return;
    }
    if (book.format === 'epub' && renditionRef.current) {
      triggerEinkFlash();
      void renditionRef.current.next();
      return;
    }
    if (currentPage < book.totalPages) {
      goToPage(currentPage + 1);
    }
  }, [readingMode, book.format, reflowNext, currentPage, book.totalPages, goToPage, triggerEinkFlash]);

  const prevPage = useCallback(() => {
    if (readingMode === 'reflow' && book.format !== 'images') {
      reflowPrev();
      return;
    }
    if (book.format === 'epub' && renditionRef.current) {
      triggerEinkFlash();
      void renditionRef.current.prev();
      return;
    }
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [readingMode, book.format, reflowPrev, currentPage, goToPage, triggerEinkFlash]);

  const nextChapter = useCallback(() => {
    if (book.format === 'epub' && epubBookRef.current) {
      const nextIdx = (currentSpineIndexRef.current ?? currentChapterIndex) + 1;
      if (nextIdx < epubSpineCountRef.current) {
        void goToSpineChapter(nextIdx);
        return;
      }
    }
    nextPage();
  }, [book.format, currentChapterIndex, goToSpineChapter, nextPage]);

  const prevChapter = useCallback(() => {
    if (book.format === 'epub' && epubBookRef.current) {
      const prevIdx = (currentSpineIndexRef.current ?? currentChapterIndex) - 1;
      if (prevIdx >= 0) {
        void goToSpineChapter(prevIdx);
        return;
      }
    }
    prevPage();
  }, [book.format, currentChapterIndex, goToSpineChapter, prevPage]);

  // Render current page (Original or Reflow)
  useEffect(() => {
    if (book.format === 'images' || loading) return;

    let isCurrent = true;

    async function render() {
      // 1. EPUB Reflow Mode: Extract clean transcribed sections from chapter
      if (book.format === 'epub') {
        if (readingMode === 'reflow' && epubBookRef.current) {
          try {
            const totalLocs = epubLocationsRef.current.length;
            const spineCount = epubSpineCountRef.current;
            let spineIdx = currentSpineIndexRef.current || 0;

            // Resolve exact spine item from current location CFI if available
            if (totalLocs > 0 && currentPage >= 1 && currentPage <= totalLocs) {
              const cfi = epubLocationsRef.current[currentPage - 1];
              if (cfi) {
                try {
                  const sec = epubBookRef.current.spine?.get(cfi);
                  if (sec && typeof sec.index === 'number') {
                    spineIdx = sec.index;
                  }
                } catch { /* ignore */ }
              }
            } else if (spineCount > 1 && totalLocs === 0) {
              spineIdx = Math.max(0, Math.min(currentPage - 1, spineCount - 1));
            }

            currentSpineIndexRef.current = spineIdx;
            setCurrentChapterIndex(spineIdx);

            const sections = await extractEpubChapterSections(epubBookRef.current, spineIdx);
            if (isCurrent) {
              resetSubPageRef.current = !landOnLastSubPageRef.current;
              setReflowSections(sections);
            }
          } catch (err) {
            console.error('Error extracting EPUB reflow sections:', err);
          }
        }
        return;
      }

      // 2. PDF rendering
      if (!pdfDocRef.current) return;

      if (readingMode === 'original' && canvasRef.current && containerRef.current) {
        try {
          const containerWidth = containerRef.current.clientWidth || window.innerWidth;
          const containerHeight = containerRef.current.clientHeight || window.innerHeight;

          await renderPage(
            pdfDocRef.current,
            currentPage,
            canvasRef.current,
            containerWidth,
            containerHeight,
            {
              autoCrop: settings.autoCrop,
              contrastBoost: settings.contrastBoost,
              theme: settings.theme,
            }
          );
        } catch (err) {
          console.error('Render error:', err);
        }
      } else if (readingMode === 'reflow') {
        try {
          const sections = await extractReflowText(pdfDocRef.current, currentPage);
          if (isCurrent) {
            resetSubPageRef.current = !landOnLastSubPageRef.current;
            setReflowSections(sections);
          }
        } catch (err) {
          console.error('Text extraction error:', err);
        }
      }
    }

    render();

    return () => {
      isCurrent = false;
    };
  }, [currentPage, readingMode, loading, settings.autoCrop, settings.contrastBoost, settings.theme, book.format]);

  // Paginate reflow text via CSS columns: slices the extracted text/sections into
  // discrete on-screen "pages" the exact size of the viewport, so reading never
  // requires vertical scrolling — only horizontal page turns.
  useLayoutEffect(() => {
    if (readingMode !== 'reflow' || book.format === 'images') return;

    const columnsEl = reflowColumnsRef.current;
    if (!columnsEl) return;

    const recompute = () => {
      const width = columnsEl.clientWidth;
      const height = columnsEl.clientHeight;
      if (!width || !height) return;

      reflowColWidthRef.current = width;
      columnsEl.style.columnWidth = `${width}px`;
      columnsEl.style.columnGap = `${REFLOW_COLUMN_GAP}px`;
      columnsEl.style.height = `${height}px`;

      const step = width + REFLOW_COLUMN_GAP;
      const count = Math.max(1, Math.round((columnsEl.scrollWidth + REFLOW_COLUMN_GAP) / step));

      let nextIndex: number;
      if (landOnLastSubPageRef.current) {
        landOnLastSubPageRef.current = false;
        nextIndex = count - 1;
      } else if (resetSubPageRef.current) {
        resetSubPageRef.current = false;
        nextIndex = 0;
      } else {
        const prevCount = prevSubPageCountRef.current || 1;
        const ratio = prevCount > 1 ? subPageIndex / (prevCount - 1) : 0;
        nextIndex = Math.min(Math.max(Math.round(ratio * (count - 1)), 0), count - 1);
      }

      prevSubPageCountRef.current = count;
      columnsEl.style.transform = `translateX(-${nextIndex * step}px)`;
      setSubPageCount(count);
      setSubPageIndex(nextIndex);
    };

    recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(columnsEl);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingMode, book.format, reflowSections, settings.fontSize, settings.lineHeight, settings.margin, fontClass]);

  // Slide to the current sub-page whenever it changes (tap/swipe/keyboard navigation).
  useLayoutEffect(() => {
    const columnsEl = reflowColumnsRef.current;
    if (!columnsEl || readingMode !== 'reflow') return;
    const step = reflowColWidthRef.current + REFLOW_COLUMN_GAP;
    columnsEl.style.transform = `translateX(-${subPageIndex * step}px)`;
  }, [subPageIndex, readingMode]);

  // Resize listener to re-render original canvas on orientation change
  useEffect(() => {
    const handleResize = () => {
      if (book.format === 'epub') {
        if (renditionRef.current && containerRef.current) {
          try {
            renditionRef.current.resize(
              containerRef.current.clientWidth || window.innerWidth,
              containerRef.current.clientHeight || window.innerHeight
            );
          } catch { /* ignore */ }
        }
        return;
      }

      if (readingMode === 'original' && pdfDocRef.current && canvasRef.current && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth || window.innerWidth;
        const containerHeight = containerRef.current.clientHeight || window.innerHeight;
        renderPage(
          pdfDocRef.current,
          currentPage,
          canvasRef.current,
          containerWidth,
          containerHeight,
          {
            autoCrop: settings.autoCrop,
            contrastBoost: settings.contrastBoost,
            theme: settings.theme,
          }
        );
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [book.format, currentPage, readingMode, settings]);

  // Keyboard navigation for desktop / tablets
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        if (!isPageLocked) nextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        if (!isPageLocked) prevPage();
      } else if (e.key === 'Escape') {
        setShowChrome(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextPage, prevPage, isPageLocked]);

  // Touch handlers for Kindle touch-zones (Left = Back, Right = Next, Center = Menu)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isDrawingMode) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartXRef.current;
    const diffY = touchEndY - touchStartYRef.current;

    // Horizontal Swipe
    if (Math.abs(diffX) > 45 && Math.abs(diffY) < 35) {
      if (isPageLocked) {
        showToast('🔒 Página Travada');
        return;
      }
      if (diffX > 0) {
        prevPage();
      } else {
        nextPage();
      }
    } else if (Math.abs(diffX) < 15 && Math.abs(diffY) < 15) {
      // Tap navigation zones
      const screenWidth = window.innerWidth;
      const clickX = touchEndX;

      if (clickX < screenWidth * 0.22) {
        if (isPageLocked) {
          showToast('🔒 Página Travada');
        } else {
          prevPage();
        }
      } else if (clickX > screenWidth * 0.78) {
        if (isPageLocked) {
          showToast('🔒 Página Travada');
        } else {
          nextPage();
        }
      } else {
        setShowChrome(prev => !prev);
      }
    }
  };

  // Mouse click handler for desktop browser
  const handleScreenClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDrawingMode) return;
    if ((e.target as HTMLElement).closest('.kindle-chrome') || (e.target as HTMLElement).closest('.kindle-floating-control')) return;

    const clickX = e.clientX;
    const screenWidth = window.innerWidth;

    if (clickX < screenWidth * 0.22) {
      if (isPageLocked) {
        showToast('🔒 Página Travada');
      } else {
        prevPage();
      }
    } else if (clickX > screenWidth * 0.78) {
      if (isPageLocked) {
        showToast('🔒 Página Travada');
      } else {
        nextPage();
      }
    } else {
      setShowChrome(prev => !prev);
    }
  };

  const handleBookmarkToggle = async () => {
    const isNowBookmarked = await toggleBookmark(book.id, currentPage);
    setIsBookmarked(isNowBookmarked);
    const updatedBookmarks = isNowBookmarked 
      ? [...(book.bookmarks || []), currentPage]
      : (book.bookmarks || []).filter(p => p !== currentPage);
    onBookUpdated({ ...book, bookmarks: updatedBookmarks });

    if (isNowBookmarked) {
      showToast('🔖 Marcador Adicionado');
    } else {
      showToast('Marcador Removido');
    }
  };

  const handleToggleReadingMode = (mode: 'original' | 'reflow') => {
    setReadingMode(mode);
    updateBookProgress(book.id, currentPage, mode);
    onBookUpdated({ ...book, readingMode: mode });

    if (book.format === 'epub' && mode === 'original') {
      window.setTimeout(() => {
        if (renditionRef.current) {
          if (epubLocationsRef.current.length > 0) {
            const idx = Math.max(0, Math.min(currentPage - 1, epubLocationsRef.current.length - 1));
            void renditionRef.current.display(epubLocationsRef.current[idx]);
          } else {
            void renditionRef.current.display();
          }
        }
      }, 50);
    }
  };

  return (
    <div 
      className={`fixed inset-0 w-full h-full select-none overflow-hidden flex flex-col ${themeClass} ${einkFlashing ? 'eink-refresh' : ''}`}
      style={{ backgroundColor: readerBg, color: readerText }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={handleScreenClick}
    >
      {/* Top Chrome Toolbar (Kindle Header) */}
      <div 
        className={`kindle-chrome absolute top-0 left-0 right-0 z-40 transition-all duration-200 border-b shadow-md pt-safe ${
          showChrome ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: chromeBg, borderColor: chromeBorder }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2.5">
          {/* Back Button */}
          <button 
            onClick={onBackToLibrary}
            className="p-2 rounded-full hover:bg-black/10 active:scale-95 transition flex items-center gap-1"
            title="Voltar à Biblioteca"
          >
            <ArrowLeft size={20} />
          </button>

          {/* Book Title */}
          <div className="flex-1 px-3 text-center truncate">
            <h1 className="text-sm font-semibold truncate tracking-tight">{book.title}</h1>
            <p className="text-[11px] opacity-60 truncate">{book.author}</p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            {/* Quick Switch Reading Mode Button (Original/Diagramado vs Reflow/Transcrito) */}
            {book.format !== 'images' && (
              <button
                onClick={() => handleToggleReadingMode(readingMode === 'original' ? 'reflow' : 'original')}
                className="px-2.5 py-1 text-xs font-semibold rounded-full border border-black/15 flex items-center gap-1 hover:bg-black/5 active:scale-95 transition"
                title={readingMode === 'original' ? 'Mudar para Modo Transcrito / Reflow' : 'Mudar para Modo Diagramado'}
              >
                {readingMode === 'original' ? (
                  <>
                    <Crop size={13} className="text-[#0c66b8]" />
                    <span>{book.format === 'epub' ? 'Diagramado' : 'Original'}</span>
                  </>
                ) : (
                  <>
                    <Type size={13} className="text-[#0c66b8]" />
                    <span>{book.format === 'epub' ? 'Transcrito' : 'Reflow'}</span>
                  </>
                )}
              </button>
            )}

            {/* Table of Contents / Bookmarks Modal */}
            <button
              onClick={() => setShowContents(true)}
              className="p-2 rounded-full hover:bg-black/10 active:scale-95 transition"
              title="Índice e Marcadores"
            >
              <ListTree size={20} />
            </button>

            {/* Aa Settings Modal */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-full hover:bg-black/10 active:scale-95 transition flex items-center justify-center font-serif font-bold text-base"
              title="Configurações de Leitura (Aa)"
            >
              Aa
            </button>

            {/* Study / Annotation Mode Button (PDF and EPUB in Reflow Mode) */}
            {(!book.format || book.format === 'pdf' || (book.format === 'epub' && readingMode === 'reflow')) && (
              <button
                onClick={() => {
                  const next = !isDrawingMode;
                  setIsDrawingMode(next);
                  if (next) {
                    setShowChrome(false);
                    showToast('✏️ Modo Estudo Ativado: Sublinhe e Anote');
                  } else {
                    showToast('Leitura retomada');
                  }
                }}
                className={`p-2 rounded-full active:scale-95 transition ${
                  isDrawingMode ? 'bg-amber-500 text-white shadow-md' : 'hover:bg-black/10'
                }`}
                title={isDrawingMode ? 'Sair do Modo Estudo' : 'Ativar Modo Estudo (Anotações)'}
              >
                <Highlighter size={18} />
              </button>
            )}

            {/* Bookmark Toggle */}
            <button
              onClick={handleBookmarkToggle}
              className={`p-2 rounded-full active:scale-95 transition ${
                isBookmarked ? 'text-amber-500' : 'hover:bg-black/10'
              }`}
              title={isBookmarked ? 'Remover Marcador' : 'Adicionar Marcador'}
            >
              <Bookmark size={20} fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div 
        ref={containerRef}
        className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center"
      >
        {loading ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-[#0c66b8] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-mono tracking-wider opacity-70">Carregando livro...</p>
          </div>
        ) : (
          <>
            {/* EPUB Paginated Rendition (permanently mounted to retain iframe and navigation state) */}
            {book.format === 'epub' && (
              <div
                ref={epubContainerRef}
                className={`w-full h-full ${readingMode === 'original' ? 'block' : 'hidden'}`}
                style={{ backgroundColor: readerBg }}
              />
            )}

            {/* Mode 0: Direct Image Books (HQs, mangÃ¡s, fotos) */}
            {book.format === 'images' && (
              <div className="w-full h-full flex items-center justify-center p-2 overflow-auto no-scrollbar">
                {imagePages[currentPage - 1] ? (
                  <img 
                    src={imagePages[currentPage - 1]} 
                    alt={`Página ${currentPage}`} 
                    className="max-w-full max-h-full object-contain select-none shadow-sm rounded transition-all duration-150"
                    style={{
                      filter: 
                        settings.theme === 'sepia' ? 'sepia(0.25) contrast(1.05)' :
                        settings.theme === 'eink' ? 'grayscale(1) contrast(1.15)' :
                        settings.contrastBoost ? 'contrast(1.2)' : 'none'
                    }}
                  />
                ) : (
                  <div className="text-xs opacity-60">Imagem da página não encontrada</div>
                )}
              </div>
            )}

            {/* Mode 1: Crisp Original Canvas with Smart Auto-Crop (PDF) */}
            {readingMode === 'original' && book.format !== 'epub' && book.format !== 'images' && (
              <div className="w-full h-full flex items-center justify-center overflow-auto no-scrollbar">
                <canvas 
                  ref={canvasRef} 
                  className="max-w-full max-h-full object-contain transition-transform duration-100"
                />
              </div>
            )}

            {/* Mode 2: Paginated Kindle Reflow Text (PDF Reflow & Transcrição Limpa EPUB).
                Text is sliced into screen-sized "pages" via CSS columns — reading
                never scrolls vertically, only horizontal page turns. */}
            {readingMode === 'reflow' && book.format !== 'images' && (
              <div
                ref={reflowContainerRef}
                className={`w-full h-full max-w-xl mx-auto relative overflow-hidden box-border py-10 ${marginPaddingClass}`}
              >
                {reflowSections.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 px-4">
                    <p className="opacity-70 text-sm">
                      {book.format === 'epub'
                        ? 'Esta página/capítulo não contém blocos de texto contínuo (pode ser capa ou imagem).'
                        : 'Nenhum texto detectado nesta página.'}
                    </p>
                    <button
                      onClick={nextChapter}
                      className="px-5 py-2.5 bg-[#0c66b8] text-white rounded-lg text-xs font-semibold shadow-md hover:bg-[#09559c] transition active:scale-95"
                    >
                      Avançar para o Próximo Capítulo →
                    </button>
                  </div>
                ) : (
                  <div ref={reflowColumnsRef} className="space-y-4">
                    {reflowSections.map((sec, idx) => {
                      if (sec.type === 'image') {
                        return (
                          <div key={idx} className="my-6 flex justify-center break-inside-avoid">
                            <img
                              src={sec.text}
                              alt={sec.alt || 'Ilustração'}
                              className="max-w-full max-h-[75vh] rounded shadow-md object-contain select-none"
                              style={{
                                filter:
                                  settings.theme === 'sepia' ? 'sepia(0.25) contrast(1.05)' :
                                  settings.theme === 'eink' ? 'grayscale(1) contrast(1.15)' :
                                  settings.contrastBoost ? 'contrast(1.2)' : 'none'
                              }}
                            />
                          </div>
                        );
                      }

                      if (sec.type === 'heading') {
                        return (
                          <h2
                            key={idx}
                            className={`font-bold mt-8 mb-3 tracking-tight break-inside-avoid ${fontClass}`}
                            style={{
                              fontSize: `${settings.fontSize * 1.3}px`,
                              lineHeight: settings.lineHeight,
                            }}
                          >
                            {sec.text}
                          </h2>
                        );
                      }

                      return (
                        <p
                          key={idx}
                          className={`text-justify leading-relaxed tracking-normal break-inside-avoid ${fontClass}`}
                          style={{
                            fontSize: `${settings.fontSize}px`,
                            lineHeight: settings.lineHeight,
                          }}
                        >
                          {sec.text}
                        </p>
                      );
                    })}

                    {/* Chapter footer navigation for EPUB in Reflow Mode */}
                    {book.format === 'epub' && epubSpineCountRef.current > 1 && (
                      <div className="pt-10 pb-6 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-3 mt-10 break-inside-avoid">
                        <button
                          onClick={prevChapter}
                          disabled={currentChapterIndex <= 0}
                          className="px-3.5 py-2 rounded-lg text-xs font-semibold border border-current/20 disabled:opacity-25 hover:bg-black/5 dark:hover:bg-white/5 transition flex items-center gap-1.5"
                        >
                          <ChevronLeft size={16} /> Capítulo Anterior
                        </button>
                        <span className="text-[11px] opacity-60 font-mono">
                          Capítulo {currentChapterIndex + 1} de {epubSpineCountRef.current}
                        </span>
                        <button
                          onClick={nextChapter}
                          disabled={currentChapterIndex >= epubSpineCountRef.current - 1}
                          className="px-3.5 py-2 bg-[#0c66b8] text-white rounded-lg text-xs font-semibold shadow hover:bg-[#09559c] disabled:opacity-25 transition flex items-center gap-1.5"
                        >
                          Próximo Capítulo <ChevronRight size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Discreet Floating Controls for EPUB Diagramado (Safe Area Guaranteed) */}
        {book.format === 'epub' && !showChrome && readingMode === 'original' && (
          <div className="kindle-floating-control absolute top-3 left-3 z-30 flex items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBackToLibrary();
              }}
              className="p-2.5 rounded-full bg-black/40 text-white backdrop-blur-md shadow-md active:scale-95 transition"
              title="Voltar à biblioteca"
            >
              <ArrowLeft size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSettings(true);
              }}
              className="p-2.5 rounded-full bg-black/40 text-white backdrop-blur-md shadow-md active:scale-95 transition font-serif font-bold text-xs"
              title="Configurações de leitura (Aa)"
            >
              Aa
            </button>
          </div>
        )}

        {/* Minimalist Kindle Folded Corner Bookmark Ribbon */}
        <div 
          onClick={(e) => {
            e.stopPropagation();
            handleBookmarkToggle();
          }}
          className={`kindle-floating-control absolute top-0 right-3 z-30 cursor-pointer transition-all duration-200 ${
            isBookmarked ? 'opacity-100 translate-y-0' : 'opacity-20 hover:opacity-80'
          }`}
          title={isBookmarked ? 'Remover Marcador' : 'Marcar onde parei'}
        >
          <div className="w-7 h-10 bg-[#0c66b8] shadow-md flex items-end justify-center pb-1 rounded-b-sm">
            <Bookmark size={14} className="text-white" fill="currentColor" />
          </div>
        </div>

        {/* Freeform Annotation & Drawing Overlay (Kindle Scribe Engine) */}
        {isDrawingMode && (!book.format || book.format === 'pdf' || (book.format === 'epub' && readingMode === 'reflow')) && (
          <AnnotationLayer
            bookId={book.id}
            currentPage={currentPage}
            isDrawingMode={isDrawingMode}
            onCloseDrawingMode={() => setIsDrawingMode(false)}
            theme={settings.theme}
          />
        )}

        {/* Floating Quick Lock / Unlock Pill Button */}
        {isPageLocked && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsPageLocked(false);
              showToast('🔒 Página Destravada');
            }}
            className="kindle-floating-control absolute bottom-10 right-4 z-30 bg-amber-500 text-black font-semibold text-xs px-3.5 py-2 rounded-full shadow-xl flex items-center gap-1.5 active:scale-95 transition"
            title="Toque para destravar a Página"
          >
            <Lock size={14} />
            <span>Página Travada</span>
          </button>
        )}

        {/* Toast Notification Banner */}
        {toastMessage && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/90 text-white text-xs px-4 py-2 rounded-full shadow-2xl backdrop-blur-md pointer-events-none transition-all duration-200 flex items-center gap-1.5 border border-white/10 animate-in fade-in zoom-in-95">
            <span>{toastMessage}</span>
          </div>
        )}
      </div>

      {/* Subtle Kindle Minimalist Footer (Always visible when chrome is hidden) */}
      {!showChrome && (
        <div 
          className="h-7 w-full flex items-center justify-between px-4 pb-safe text-[11px] font-mono tracking-wide opacity-50 z-30 pointer-events-none"
          style={{ backgroundColor: 'transparent' }}
        >
          <span>Página {currentPage} de {book.totalPages}</span>
          <span>{percentRead}%</span>
          <span>~{estMinutesRemaining} min restantes</span>
        </div>
      )}

      {/* Bottom Chrome Toolbar (Kindle Navigation Scrubber) */}
      <div 
        className={`kindle-chrome absolute bottom-0 left-0 right-0 z-40 transition-all duration-200 border-t shadow-lg px-4 pt-3 pb-safe ${
          showChrome ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: chromeBg, borderColor: chromeBorder }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-md mx-auto space-y-2">
          {/* Scrubber slider */}
          <div className="flex items-center gap-3">
            <button
              onClick={prevPage}
              disabled={readingMode === 'reflow' ? subPageIndex <= 0 && currentPage <= 1 : book.format !== 'epub' && currentPage <= 1}
              className="p-2 rounded-full hover:bg-black/10 active:scale-95 disabled:opacity-30 transition"
              title="Página Anterior"
            >
              <ChevronLeft size={20} />
            </button>

            <input
              type="range"
              min={1}
              max={book.totalPages}
              value={currentPage}
              onChange={(e) => goToPage(Number(e.target.value))}
              className="flex-1 accent-[#0c66b8] cursor-pointer h-2 bg-black/10 rounded-lg"
            />

            <button
              onClick={nextPage}
              disabled={readingMode === 'reflow' ? subPageIndex >= subPageCount - 1 && currentPage >= book.totalPages : book.format !== 'epub' && currentPage >= book.totalPages}
              className="p-2 rounded-full hover:bg-black/10 active:scale-95 disabled:opacity-30 transition"
              title="Próxima Página"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Bottom Info Bar */}
          <div className="flex justify-between items-center text-xs opacity-75 font-mono px-2 pb-1">
            <span>Página {currentPage} de {book.totalPages}</span>
            <span className="font-semibold">{percentRead}% lido</span>
            <span>{estMinutesRemaining} min restantes</span>
          </div>
        </div>
      </div>

      {/* Aa Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onUpdateSettings={onUpdateSettings}
        readingMode={readingMode}
        onToggleReadingMode={handleToggleReadingMode}
        isEpub={book.format === 'epub'}
      />

      {/* Table of Contents & Bookmarks Modal */}
      <ContentsModal
        isOpen={showContents}
        onClose={() => setShowContents(false)}
        outline={outline}
        bookmarks={book.bookmarks || []}
        currentPage={currentPage}
        totalPages={book.totalPages}
        onSelectPage={goToPage}
        theme={settings.theme}
      />
    </div>
  );
};

