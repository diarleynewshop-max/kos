import { useState, useEffect } from 'react';
import type { Book, ReaderSettings } from './types';
import { getBooks, getSettings, saveSettings, saveBook } from './services/storage';
import { LibraryView } from './components/LibraryView';
import { ReaderView } from './components/ReaderView';
import { UpdateBanner } from './components/UpdateBanner';
import { createSamplePdf } from './services/sampleBook';
import { loadPdf, extractMetadata, generateThumbnail } from './services/pdfService';
import { checkForUpdate } from './services/updateService';
import type { UpdateInfo } from './services/updateService';

export function App() {
  const [books, setBooks] = useState<Book[]>([]);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [settings, setSettings] = useState<ReaderSettings>({
    theme: 'sepia',
    fontSize: 18,
    fontFamily: 'bookerly',
    lineHeight: 1.6,
    margin: 'normal',
    autoCrop: true,
    einkFlash: true,
    contrastBoost: false,
  });
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  // Load books and settings on mount
  const refreshLibrary = async () => {
    try {
      const savedBooks = await getBooks();
      setBooks(savedBooks);
    } catch (e) {
      console.error('Error refreshing library:', e);
    }
  };

  useEffect(() => {
    async function init() {
      try {
        const [savedSettings, savedBooks] = await Promise.all([
          getSettings(),
          getBooks(),
        ]);
        setSettings(savedSettings);

        if (savedBooks.length > 0) {
          setBooks(savedBooks);
        } else {
          // Pre-populate with the KOS User Guide demo book on first install
          try {
            const sampleBuffer = createSamplePdf();
            const pdfDoc = await loadPdf(sampleBuffer);
            const meta = await extractMetadata(pdfDoc, 'Guia do Usuario KOS.pdf');
            const coverUrl = await generateThumbnail(pdfDoc);

            const initialBook: Book = {
              id: 'kos_sample_guide',
              title: 'Guia do Usuário • KOS',
              author: 'Kindle Open Source',
              totalPages: meta.totalPages,
              currentPage: 1,
              coverUrl,
              addedAt: Date.now(),
              lastReadAt: Date.now(),
              fileSize: sampleBuffer.byteLength,
              bookmarks: [1],
              readingMode: 'reflow',
            };

            await saveBook(initialBook, sampleBuffer);
            setBooks([initialBook]);
          } catch (sampleErr) {
            console.warn('Could not auto-seed sample book:', sampleErr);
            setBooks([]);
          }
        }
      } catch (err) {
        console.error('Init error:', err);
      } finally {
        setIsInitializing(false);
      }
    }

    init();

    checkForUpdate()
      .then(setAvailableUpdate)
      .catch((err) => console.warn('Update check failed:', err));
  }, []);

  const handleUpdateSettings = async (newSettings: Partial<ReaderSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    await saveSettings(updated);
  };

  const handleBookUpdated = (updatedBook: Book) => {
    setCurrentBook(updatedBook);
    setBooks(prev => prev.map(b => b.id === updatedBook.id ? updatedBook : b));
  };

  if (isInitializing) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#fbfbf9] text-[#181818]">
        <img src="/kos-logo.svg" alt="KOS" className="w-20 h-28 object-contain mb-4" />
        <div className="w-12 h-12 border-3 border-[#0c66b8] border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="font-serif text-sm tracking-wide">Iniciando KOS...</p>
      </div>
    );
  }

  return (
    <main className="w-full h-full relative overflow-hidden bg-inherit text-inherit">
      {currentBook ? (
        <ReaderView
          book={currentBook}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onBackToLibrary={() => setCurrentBook(null)}
          onBookUpdated={handleBookUpdated}
        />
      ) : (
        <LibraryView
          books={books}
          onSelectBook={(book) => setCurrentBook(book)}
          onRefreshBooks={refreshLibrary}
          settings={settings}
          onOpenGlobalSettings={() => {}}
        />
      )}
      {availableUpdate && (
        <UpdateBanner update={availableUpdate} onDismiss={() => setAvailableUpdate(null)} />
      )}
    </main>
  );
}

export default App;
