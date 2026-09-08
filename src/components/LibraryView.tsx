import React, { useState, useRef } from 'react';
import type { Book, ReaderSettings } from '../types';
import { 
  Search, 
  Plus, 
  BookOpen, 
  Trash2, 
  MoreVertical, 
  Grid, 
  List, 
  Bookmark, 
  Sparkles,
  Wifi,
  BatteryCharging,
  FileText,
  Cloud,
  Globe,
  Settings
} from 'lucide-react';
import { loadPdf, extractMetadata, generateThumbnail } from '../services/pdfService';
import { extractEpubMetadata } from '../services/epubService';
import { saveBook, deleteBook, saveBookImages } from '../services/storage';
import { createSamplePdf } from '../services/sampleBook';
import { GoogleDriveModal } from './GoogleDriveModal';
import { ArchiveOrgModal } from './ArchiveOrgModal';

interface LibraryViewProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  onRefreshBooks: () => void;
  settings: ReaderSettings;
  onOpenGlobalSettings: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  onSelectBook,
  onRefreshBooks,
  settings,
  onOpenGlobalSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'reading' | 'done' | 'bookmarked' | 'gdrive' | 'archive'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<string>('');
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filter books based on search & tab
  const filteredBooks = books.filter((book) => {
    const matchesSearch = 
      book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      book.author.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === 'reading') {
      return book.currentPage > 1 && book.currentPage < book.totalPages;
    }
    if (filterTab === 'done') {
      return book.currentPage >= book.totalPages;
    }
    if (filterTab === 'bookmarked') {
      return (book.bookmarks && book.bookmarks.length > 0);
    }
    if (filterTab === 'gdrive') {
      return book.source === 'google_drive';
    }
    if (filterTab === 'archive') {
      return book.source === 'archive_org';
    }
    return true;
  });

  // Helper to read File as Data URL
  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error('O arquivo nao retornou dados binarios.'));
      };
      reader.onerror = () => reject(reader.error || new Error('Nao foi possivel ler o arquivo.'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Handle PDF or Image Files Import
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const isImageUpload = fileList.every(f => 
      f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name)
    );

    // 1. IMPORTING IMAGES (Single or Multiple e.g. Comic/Manga/Photos)
    if (isImageUpload) {
      try {
        setIsImporting(true);
        // Sort files naturally by filename so page numbers align
        const sortedImages = fileList.sort((a, b) => 
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
        );

        setImportProgress(`Carregando ${sortedImages.length} imagem(ns)...`);
        const dataUrls: string[] = [];
        for (let i = 0; i < sortedImages.length; i++) {
          setImportProgress(`Processando página ${i + 1} de ${sortedImages.length}...`);
          const url = await readFileAsDataUrl(sortedImages[i]);
          dataUrls.push(url);
        }

        const firstTitle = sortedImages[0].name.replace(/\.[^/.]+$/, "").trim();
        const title = sortedImages.length === 1 
          ? firstTitle 
          : `${firstTitle} (${sortedImages.length} págs)`;

        const newBook: Book = {
          id: 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          title,
          author: 'Álbum / Imagens',
          totalPages: sortedImages.length,
          currentPage: 1,
          coverUrl: dataUrls[0],
          addedAt: Date.now(),
          lastReadAt: Date.now(),
          fileSize: sortedImages.reduce((acc, f) => acc + f.size, 0),
          bookmarks: [],
          readingMode: 'original',
          format: 'images',
        };

        setImportProgress('Salvando na biblioteca...');
        await saveBookImages(newBook.id, dataUrls);
        await saveBook(newBook);

        onRefreshBooks();
        setIsImporting(false);
        setImportProgress('');
        return;
      } catch (err) {
        console.error('Error importing images:', err);
        alert('Erro ao importar imagens.');
        setIsImporting(false);
        setImportProgress('');
        return;
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }

    // 2. IMPORTING EPUB
    const file = fileList[0];
    const isEpubUpload = file.name.toLowerCase().endsWith('.epub') || file.type === 'application/epub+zip';
    if (isEpubUpload) {
      try {
        setIsImporting(true);
        setImportProgress('Lendo arquivo EPUB...');
        const arrayBuffer = await readFileAsArrayBuffer(file);

        setImportProgress('Analisando metadados do livro...');
        const meta = await extractEpubMetadata(arrayBuffer, file.name);

        const newBook: Book = {
          id: 'book_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
          title: meta.title,
          author: meta.author,
          totalPages: meta.totalPages,
          currentPage: 1,
          coverUrl: '',
          addedAt: Date.now(),
          lastReadAt: Date.now(),
          fileSize: file.size,
          bookmarks: [],
          readingMode: 'reflow',
          format: 'epub',
        };

        setImportProgress('Salvando na memória permanente...');
        await saveBook(newBook, arrayBuffer);
        onRefreshBooks();
        setIsImporting(false);
        setImportProgress('');
      } catch (err) {
        console.error('Error importing EPUB:', err);
        alert('Ocorreu um erro ao importar o EPUB. Verifique se o arquivo não está corrompido.');
        setIsImporting(false);
        setImportProgress('');
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
      return;
    }

    // 3. IMPORTING PDF
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Por favor, selecione um arquivo PDF, EPUB ou imagens (JPG, PNG, WebP).');
      return;
    }

    try {
      setIsImporting(true);
      setImportProgress('Lendo arquivo PDF...');
      const arrayBuffer = await readFileAsArrayBuffer(file);

      setImportProgress('Analisando páginas e metadados...');
      const pdfDoc = await loadPdf(arrayBuffer);
      const meta = await extractMetadata(pdfDoc, file.name);

      setImportProgress('Gerando capa do livro...');
      const coverUrl = await generateThumbnail(pdfDoc);

      const newBook: Book = {
        id: 'book_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        title: meta.title,
        author: meta.author,
        totalPages: meta.totalPages,
        currentPage: 1,
        coverUrl,
        addedAt: Date.now(),
        lastReadAt: Date.now(),
        fileSize: file.size,
        bookmarks: [],
        readingMode: 'reflow',
        format: 'pdf',
      };

      setImportProgress('Salvando na memória permanente...');
      await saveBook(newBook, arrayBuffer);
      onRefreshBooks();
      setIsImporting(false);
      setImportProgress('');
    } catch (err) {
      console.error('Error importing book:', err);
      alert('Ocorreu um erro ao importar o PDF. Verifique se o arquivo não está corrompido.');
      setIsImporting(false);
      setImportProgress('');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Load the built-in KOS Guide Demo
  const handleLoadSampleBook = async () => {
    try {
      setIsImporting(true);
      setImportProgress('Gerando Livro Guia do KOS...');
      const sampleBuffer = createSamplePdf();

      setImportProgress('Carregando páginas...');
      const pdfDoc = await loadPdf(sampleBuffer);
      const meta = await extractMetadata(pdfDoc, 'Guia do Usuario KOS.pdf');
      const coverUrl = await generateThumbnail(pdfDoc);

      const sampleBook: Book = {
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

      await saveBook(sampleBook, sampleBuffer);
      onRefreshBooks();
      setIsImporting(false);
      setImportProgress('');
    } catch (err) {
      console.error('Error creating sample guide:', err);
      setIsImporting(false);
      setImportProgress('');
    }
  };

  const handleDelete = async (book: Book, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmMessage = book.source === 'google_drive'
      ? `Deseja remover "${book.title}" do KOS?\n\nEste livro será excluído APENAS da memória do celular. O arquivo original no seu Google Drive NÃO será afetado e continuará intacto!`
      : `Deseja realmente remover "${book.title}" da sua biblioteca?`;

    if (confirm(confirmMessage)) {
      await deleteBook(book.id);
      setActiveMenuId(null);
      onRefreshBooks();
    }
  };

  const isDark = settings.theme === 'dark';
  const isSepia = settings.theme === 'sepia';
  const isEink = settings.theme === 'eink';

  const bgColor = isDark ? '#121212' : isSepia ? '#f6eedb' : isEink ? '#eae8e3' : '#fbfbf9';
  const cardBg = isDark ? '#1a1a1a' : isSepia ? '#ebdcb9' : isEink ? '#dedcd5' : '#ffffff';
  const textColor = isDark ? '#f0f0f0' : isSepia ? '#382a17' : isEink ? '#111111' : '#181818';
  const borderColor = isDark ? '#2e2e2e' : isSepia ? '#ded0b4' : isEink ? '#c5c2b9' : '#e5e3dc';

  return (
    <div 
      className="w-full h-full flex flex-col select-none overflow-hidden"
      style={{ backgroundColor: bgColor, color: textColor }}
      onClick={() => setActiveMenuId(null)}
    >
      {/* Kindle Status Bar */}
      <div 
        className="w-full pt-safe px-5 py-2 flex items-center justify-between text-[11px] font-mono opacity-60 border-b"
        style={{ borderColor }}
      >
        <img src="/kos-logo.svg" alt="KOS" className="h-7 w-5 object-cover object-top" />
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><Wifi size={12} /> Offline</span>
          <span className="flex items-center gap-1"><BatteryCharging size={13} /> 100%</span>
          <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Main Header with Search & View Toggle */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-xl font-serif font-bold tracking-tight whitespace-nowrap shrink-0">Sua Biblioteca</h1>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar min-w-0">
            <button
              onClick={onOpenGlobalSettings}
              className="p-2 rounded-xl border hover:bg-black/5 active:scale-95 transition shrink-0"
              style={{ borderColor }}
              title="Configurações do App"
            >
              <Settings size={16} />
            </button>
            <div className="flex items-center gap-1 border rounded-lg p-0.5 shrink-0" style={{ borderColor }}>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded transition ${viewMode === 'grid' ? 'bg-black/10' : 'opacity-50'}`}
                title="Visualização em Grade"
              >
                <Grid size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded transition ${viewMode === 'list' ? 'bg-black/10' : 'opacity-50'}`}
                title="Visualização em Lista"
              >
                <List size={16} />
              </button>
            </div>
            <button
              onClick={() => setShowArchiveModal(true)}
              className="px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 active:scale-95 transition shrink-0"
              title="Biblioteca Pública Internet Archive (E-books em Português)"
            >
              <Globe size={14} />
              <span>Archive.org</span>
            </button>
            <button
              onClick={() => setShowDriveModal(true)}
              className="px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 active:scale-95 transition shrink-0"
              title="Importar do Google Drive"
            >
              <Cloud size={14} />
              <span>Drive</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div 
          className="flex items-center gap-2 px-3 py-2 rounded-xl border transition focus-within:ring-2 focus-within:ring-[#0c66b8]/30"
          style={{ backgroundColor: cardBg, borderColor }}
        >
          <Search size={16} className="opacity-50" />
          <input
            type="text"
            placeholder="Pesquisar título ou autor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none placeholder:opacity-50"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="text-xs opacity-60 hover:opacity-100 font-mono"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pt-3 pb-1 text-xs font-semibold">
          {[
            { id: 'all', label: `Todos (${books.length})` },
            { id: 'reading', label: 'Lendo' },
            { id: 'done', label: 'Concluídos' },
            { id: 'bookmarked', label: 'Marcados' },
            ...(books.some(b => b.source === 'google_drive') ? [{ id: 'gdrive', label: 'Google Drive' }] : []),
            ...(books.some(b => b.source === 'archive_org') ? [{ id: 'archive', label: 'Archive.org' }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-full whitespace-nowrap transition ${
                filterTab === tab.id
                  ? 'bg-[#0c66b8] text-white shadow-sm font-bold'
                  : 'bg-black/5 hover:bg-black/10 opacity-70'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Book Shelf Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 no-scrollbar">
        {books.length === 0 ? (
          /* Empty State */
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-20 h-20 rounded-2xl bg-black/5 flex items-center justify-center border" style={{ borderColor }}>
              <BookOpen size={40} className="text-[#0c66b8] opacity-80" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold">Nenhum livro ainda</h2>
              <p className="text-xs opacity-70 max-w-xs mt-1">
                Adicione arquivos PDF do seu smartphone ou teste agora com o livro de introdução do KOS.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs pt-2">
              <button
                onClick={handleLoadSampleBook}
                disabled={isImporting}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0c66b8] text-white font-medium text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition"
              >
                <Sparkles size={15} />
                Carregar Guia do KOS (Exemplo)
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="w-full py-2.5 px-4 rounded-xl border font-medium text-xs flex items-center justify-center gap-2 active:scale-95 transition"
                style={{ borderColor }}
              >
                <Plus size={15} />
                Importar PDF / EPUB / Imagens
              </button>
              <button
                onClick={() => setShowDriveModal(true)}
                disabled={isImporting}
                className="w-full py-2.5 px-4 rounded-xl border border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium text-xs flex items-center justify-center gap-2 active:scale-95 transition"
              >
                <Cloud size={15} />
                Importar do Google Drive
              </button>
              <button
                onClick={() => setShowArchiveModal(true)}
                disabled={isImporting}
                className="w-full py-2.5 px-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 font-medium text-xs flex items-center justify-center gap-2 active:scale-95 transition"
              >
                <Globe size={15} />
                Explorar E-books no Internet Archive (PT-BR)
              </button>
            </div>
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="py-16 text-center opacity-60 text-xs">
            Nenhum livro encontrado para este filtro.
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-20">
            {filteredBooks.map((book) => {
              const progress = Math.round((book.currentPage / book.totalPages) * 100);
              const isCompleted = book.currentPage >= book.totalPages;

              return (
                <div
                  key={book.id}
                  onClick={() => onSelectBook(book)}
                  className="group relative flex flex-col cursor-pointer active:scale-[0.98] transition-transform"
                >
                  {/* Book Cover with 3D Kindle Book styling */}
                  <div 
                    className="relative aspect-[1/1.42] w-full rounded-lg overflow-hidden shadow-book-cover border flex items-center justify-center transition-shadow group-hover:shadow-lg"
                    style={{ backgroundColor: cardBg, borderColor }}
                  >
                    {book.coverUrl ? (
                      <img 
                        src={book.coverUrl} 
                        alt={book.title} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full p-4 flex flex-col justify-between text-center bg-gradient-to-b from-black/5 to-black/10">
                        <FileText size={32} className="mx-auto opacity-40 mt-6" />
                        <div>
                          <p className="font-serif font-bold text-xs line-clamp-3">{book.title}</p>
                          <p className="text-[10px] opacity-60 mt-1 truncate">{book.author}</p>
                        </div>
                        <div className="text-[9px] font-mono opacity-40 pb-2">KOS E-READER</div>
                      </div>
                    )}

                    {/* Google Drive Source Badge */}
                    {book.source === 'google_drive' && (
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white text-[9px] font-bold flex items-center gap-1 shadow-sm">
                        <Cloud size={10} className="text-blue-400" />
                        <span>Drive</span>
                      </div>
                    )}

                    {/* Archive.org Source Badge */}
                    {book.source === 'archive_org' && (
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white text-[9px] font-bold flex items-center gap-1 shadow-sm">
                        <Globe size={10} className="text-amber-400" />
                        <span>Archive</span>
                      </div>
                    )}

                    {/* Bookmark Indicator */}
                    {book.bookmarks && book.bookmarks.length > 0 && (
                      <div className="absolute top-0 right-2">
                        <div className="w-4 h-6 bg-amber-500 shadow-sm flex items-center justify-center">
                          <Bookmark size={10} className="text-white fill-white" />
                        </div>
                      </div>
                    )}

                    {/* Progress Bar Ribbon on Cover */}
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/30">
                      <div 
                        className={`h-full ${isCompleted ? 'bg-emerald-500' : 'bg-[#0c66b8]'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Title & Info */}
                  <div className="mt-2 px-0.5">
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="text-xs font-semibold line-clamp-1 leading-snug tracking-tight">
                        {book.title}
                      </h3>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === book.id ? null : book.id);
                        }}
                        className="p-1 rounded opacity-50 hover:opacity-100 hover:bg-black/10"
                      >
                        <MoreVertical size={13} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[10px] opacity-60 mt-0.5 font-mono">
                      <span>{book.author}</span>
                      <span>{isCompleted ? 'Lido' : `${progress}%`}</span>
                    </div>
                  </div>

                  {/* Context Menu Modal */}
                  {activeMenuId === book.id && (
                    <div 
                      className="absolute right-0 bottom-12 z-50 w-44 rounded-xl shadow-xl border p-1.5 text-xs animate-fadeIn"
                      style={{ backgroundColor: cardBg, borderColor }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setActiveMenuId(null);
                          onSelectBook(book);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-black/5 flex items-center gap-2"
                      >
                        <BookOpen size={14} /> Continuar Leitura
                      </button>
                      <button
                        onClick={(e) => handleDelete(book, e)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-600 flex items-center gap-2"
                      >
                        <Trash2 size={14} /> Excluir Livro
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2 pb-20">
            {filteredBooks.map((book) => {
              const progress = Math.round((book.currentPage / book.totalPages) * 100);
              const isCompleted = book.currentPage >= book.totalPages;

              return (
                <div
                  key={book.id}
                  onClick={() => onSelectBook(book)}
                  className="flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer hover:shadow-sm active:scale-[0.99] transition"
                  style={{ backgroundColor: cardBg, borderColor }}
                >
                  <div className="w-12 h-16 rounded overflow-hidden shadow-sm flex-shrink-0 bg-black/10">
                    {book.coverUrl ? (
                      <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <FileText size={18} className="opacity-40" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-semibold truncate">{book.title}</h3>
                    <p className="text-[11px] opacity-60 truncate flex items-center gap-1.5">
                      <span>{book.author}</span>
                      {book.source === 'google_drive' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 font-semibold flex items-center gap-0.5">
                          <Cloud size={10} /> Drive
                        </span>
                      )}
                      {book.source === 'archive_org' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-0.5">
                          <Globe size={10} /> Archive
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex-1 max-w-[120px] h-1.5 bg-black/10 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${isCompleted ? 'bg-emerald-500' : 'bg-[#0c66b8]'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono opacity-60">
                        {isCompleted ? 'Concluído' : `${progress}% (${book.currentPage}/${book.totalPages})`}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDelete(book, e)}
                    className="p-2 opacity-50 hover:opacity-100 hover:text-red-500"
                    title="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Import Status Toast */}
      {isImporting && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div 
            className="p-6 rounded-2xl shadow-2xl border flex flex-col items-center gap-3 max-w-xs text-center"
            style={{ backgroundColor: cardBg, borderColor }}
          >
            <div className="w-8 h-8 border-2 border-[#0c66b8] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs font-semibold">{importProgress}</p>
            <p className="text-[11px] opacity-60">Preparando para a melhor experiência de leitura no celular...</p>
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      <input 
        ref={fileInputRef}
        type="file" 
        accept=".pdf,application/pdf,.epub,application/epub+zip,image/*,.jpg,.jpeg,.png,.webp"
        multiple
        className="hidden" 
        onChange={handleFileUpload}
      />

      {/* Floating Action Button (+) */}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="fixed right-5 bottom-6 z-30 p-4 rounded-full bg-[#0c66b8] text-white shadow-xl hover:bg-[#09559c] active:scale-95 transition flex items-center gap-2 font-medium text-xs"
        title="Adicionar PDF, EPUB ou imagens"
      >
        <Plus size={20} />
        <span className="hidden sm:inline">Adicionar Livro / Imagens</span>
      </button>

      {/* Google Drive Modal */}
      <GoogleDriveModal
        isOpen={showDriveModal}
        onClose={() => setShowDriveModal(false)}
        onBookImported={onRefreshBooks}
        theme={settings.theme}
      />

      {/* Internet Archive Modal */}
      <ArchiveOrgModal
        isOpen={showArchiveModal}
        onClose={() => setShowArchiveModal(false)}
        onBookImported={onRefreshBooks}
        theme={settings.theme}
      />
    </div>
  );
};
