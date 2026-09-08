import React, { useState, useEffect } from 'react';
import { 
  X, 
  Search, 
  Download, 
  BookOpen, 
  Link as LinkIcon, 
  Check, 
  AlertCircle,
  FileText,
  Globe
} from 'lucide-react';
import { 
  searchArchivePortuguese, 
  getArchiveReadableFile,
  downloadArchiveFile,
  extractArchiveIdentifier,
  getArchiveCoverUrl,
} from '../services/archiveOrgService';
import type { ArchiveBook } from '../services/archiveOrgService';
import { loadPdf, extractMetadata, generateThumbnail } from '../services/pdfService';
import { extractEpubMetadata } from '../services/epubService';
import { saveBook } from '../services/storage';
import type { Book, ThemeMode } from '../types';

interface ArchiveOrgModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookImported: () => void;
  theme: ThemeMode;
}

export const ArchiveOrgModal: React.FC<ArchiveOrgModalProps> = ({
  isOpen,
  onClose,
  onBookImported,
  theme,
}) => {
  const [activeCategory, setActiveCategory] = useState<'popular' | 'classics' | 'history' | 'direct_link'>('popular');
  const [searchQuery, setSearchQuery] = useState('');
  const [directLink, setDirectLink] = useState('');
  const [books, setBooks] = useState<ArchiveBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [downloadedIds, setDownloadedIds] = useState<string[]>([]);

  // Fetch books on category or search query change
  useEffect(() => {
    if (!isOpen || activeCategory === 'direct_link') return;

    let isMounted = true;
    async function loadBooks() {
      try {
        setLoading(true);
        setErrorMessage('');
        const result = await searchArchivePortuguese(searchQuery, activeCategory, 1, 24);
        if (isMounted) {
          setBooks(result.books);
        }
      } catch (err: any) {
        console.error('Archive.org search error:', err);
        if (isMounted) {
          setErrorMessage('Não foi possível conectar ao Internet Archive. Verifique sua conexão.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    const timer = setTimeout(() => {
      loadBooks();
    }, 350);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [isOpen, activeCategory, searchQuery]);

  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const isSepia = theme === 'sepia';
  const isEink = theme === 'eink';

  const modalBg = isDark ? '#1a1a1a' : isSepia ? '#f5ebd5' : isEink ? '#e2dfd7' : '#ffffff';
  const textColor = isDark ? '#e5e5e5' : '#222222';
  const borderColor = isDark ? '#333333' : '#e0ded6';
  const cardBg = isDark ? '#242424' : isSepia ? '#ede0c4' : isEink ? '#d6d3cb' : '#f8f8f6';

  // Build a Book record from downloaded PDF or EPUB binary data
  const buildImportedBook = async (
    identifier: string,
    filename: string,
    format: 'pdf' | 'epub',
    data: ArrayBuffer,
    fallbackTitle: string,
    fallbackAuthor: string,
    fallbackCoverUrl: string
  ): Promise<Book> => {
    const id = 'archive_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    if (format === 'epub') {
      const meta = await extractEpubMetadata(data, filename);
      return {
        id,
        title: meta.title || fallbackTitle,
        author: fallbackAuthor !== 'Autor Desconhecido' ? fallbackAuthor : meta.author,
        totalPages: meta.totalPages,
        currentPage: 1,
        coverUrl: fallbackCoverUrl,
        addedAt: Date.now(),
        lastReadAt: Date.now(),
        fileSize: data.byteLength,
        bookmarks: [],
        readingMode: 'reflow',
        format: 'epub',
        source: 'archive_org',
        archiveId: identifier,
      };
    }

    const pdfDoc = await loadPdf(data);
    const meta = await extractMetadata(pdfDoc, filename);
    const coverUrl = await generateThumbnail(pdfDoc);
    return {
      id,
      title: meta.title || fallbackTitle,
      author: fallbackAuthor !== 'Autor Desconhecido' ? fallbackAuthor : meta.author,
      totalPages: meta.totalPages,
      currentPage: 1,
      coverUrl: coverUrl || fallbackCoverUrl,
      addedAt: Date.now(),
      lastReadAt: Date.now(),
      fileSize: data.byteLength,
      bookmarks: [],
      readingMode: 'reflow',
      format: 'pdf',
      source: 'archive_org',
      archiveId: identifier,
    };
  };

  // Download and import book into KOS
  const handleDownloadBook = async (bookItem: ArchiveBook) => {
    try {
      setDownloadingId(bookItem.identifier);
      setErrorMessage('');
      setDownloadProgress('Localizando arquivo...');

      const fileInfo = await getArchiveReadableFile(bookItem.identifier);
      if (!fileInfo) {
        throw new Error('Nenhum arquivo PDF ou EPUB encontrado para esta obra.');
      }

      setDownloadProgress(`Baixando ${fileInfo.format.toUpperCase()} do Archive.org...`);
      const data = await downloadArchiveFile(bookItem.identifier, fileInfo.filename);

      setDownloadProgress(fileInfo.format === 'epub' ? 'Lendo metadados do EPUB...' : 'Processando páginas e capa...');
      const newBook = await buildImportedBook(
        bookItem.identifier,
        fileInfo.filename,
        fileInfo.format,
        data,
        bookItem.title,
        bookItem.creator,
        bookItem.coverUrl
      );

      setDownloadProgress('Salvando na estante...');
      await saveBook(newBook, data);

      setDownloadedIds(prev => [...prev, bookItem.identifier]);
      onBookImported();
      setDownloadProgress('');
    } catch (err: any) {
      console.error('Error downloading Archive book:', err);
      setErrorMessage(err.message || 'Erro ao baixar o e-book.');
    } finally {
      setDownloadingId(null);
      setDownloadProgress('');
    }
  };

  // Handle direct Archive.org link
  const handleDirectLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = extractArchiveIdentifier(directLink);
    if (!id) {
      setErrorMessage('Link inválido. Cole uma URL como "https://archive.org/details/nome_do_livro".');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setDownloadProgress('Buscando obra no Archive.org...');

      const fileInfo = await getArchiveReadableFile(id);
      if (!fileInfo) {
        throw new Error('Nenhum arquivo PDF ou EPUB encontrado neste link do Archive.org.');
      }

      setDownloadProgress(`Baixando ${fileInfo.format.toUpperCase()}...`);
      const data = await downloadArchiveFile(id, fileInfo.filename);

      setDownloadProgress('Gerando capa e metadados...');
      const newBook = await buildImportedBook(
        id,
        fileInfo.filename,
        fileInfo.format,
        data,
        '',
        'Autor Desconhecido',
        getArchiveCoverUrl(id)
      );

      setDownloadProgress('Salvando no seu KOS...');
      await saveBook(newBook, data);

      setDirectLink('');
      onBookImported();
      setDownloadProgress('E-book importado com sucesso!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Error downloading direct link:', err);
      setErrorMessage(err.message || 'Falha ao baixar o livro.');
    } finally {
      setLoading(false);
      setDownloadProgress('');
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl max-h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border"
        style={{ backgroundColor: modalBg, color: textColor, borderColor }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor }}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Globe size={20} />
            </div>
            <div>
              <h2 className="font-serif font-bold text-base tracking-tight flex items-center gap-1.5">
                <span>Internet Archive</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold uppercase">
                  PT-BR Grátis
                </span>
              </h2>
              <p className="text-[11px] opacity-60">Milhares de e-books em português de domínio público</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/10 active:scale-95 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search & Category Tabs */}
        <div className="p-4 border-b space-y-3" style={{ borderColor }}>
          {/* Search bar */}
          <div 
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border transition focus-within:ring-2 focus-within:ring-[#0c66b8]/40"
            style={{ backgroundColor: cardBg, borderColor }}
          >
            <Search size={16} className="opacity-50" />
            <input
              type="text"
              placeholder="Buscar título ou autor (ex: Machado de Assis, Dom Casmurro)..."
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

          {/* Quick categories */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar text-xs font-semibold">
            {[
              { id: 'popular', label: '🔥 Mais Baixados' },
              { id: 'classics', label: '🏛️ Clássicos da Literatura' },
              { id: 'history', label: '📜 História & Filosofia' },
              { id: 'direct_link', label: '🔗 Colar Link' },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id as any);
                  setErrorMessage('');
                }}
                className={`px-3 py-1.5 rounded-full whitespace-nowrap transition ${
                  activeCategory === cat.id
                    ? 'bg-[#0c66b8] text-white shadow-sm font-bold'
                    : 'bg-black/5 hover:bg-black/10 opacity-70'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feedback message */}
        {errorMessage && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {downloadProgress && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <span>{downloadProgress}</span>
          </div>
        )}

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          {activeCategory === 'direct_link' ? (
            /* Direct link tab */
            <form onSubmit={handleDirectLinkSubmit} className="space-y-4 py-4 max-w-md mx-auto">
              <div className="text-center space-y-1 mb-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center mx-auto">
                  <LinkIcon size={24} />
                </div>
                <h3 className="font-serif font-bold text-sm">Baixar por Link Direto do Archive.org</h3>
                <p className="text-[11px] opacity-70">
                  Encontrou um livro no site archive.org? Cole o link abaixo para baixá-lo diretamente no seu celular.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Ex: https://archive.org/details/domcasmurro0000mach"
                  value={directLink}
                  onChange={(e) => setDirectLink(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none focus:ring-2 focus:ring-[#0c66b8]/40"
                  style={{ backgroundColor: cardBg, borderColor }}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !directLink.trim()}
                className="w-full py-2.5 px-4 rounded-xl bg-[#0c66b8] hover:bg-[#09559c] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition"
              >
                <Download size={15} />
                Baixar Livro para o KOS
              </button>
            </form>
          ) : loading ? (
            /* Loading State */
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-[#0c66b8] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-mono opacity-70">Buscando acervo no Internet Archive...</p>
            </div>
          ) : books.length === 0 ? (
            /* Empty State */
            <div className="py-16 text-center opacity-60 text-xs space-y-2">
              <BookOpen size={36} className="mx-auto opacity-40" />
              <p>Nenhum livro em português encontrado para esta busca.</p>
              <p className="text-[11px]">Tente outros termos como "Machado de Assis", "Romance" ou "Poesia".</p>
            </div>
          ) : (
            /* Book Grid */
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 pb-6">
              {books.map((b) => {
                const isDownloading = downloadingId === b.identifier;
                const isDownloaded = downloadedIds.includes(b.identifier);

                return (
                  <div
                    key={b.identifier}
                    className="p-2.5 rounded-xl border flex flex-col justify-between hover:shadow-md transition"
                    style={{ backgroundColor: cardBg, borderColor }}
                  >
                    <div>
                      {/* Book Cover */}
                      <div className="relative aspect-[1/1.4] w-full rounded-lg overflow-hidden bg-black/10 shadow-sm mb-2">
                        <img 
                          src={b.coverUrl} 
                          alt={b.title} 
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={(e) => {
                            // Fallback if cover image not found on archive.org
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center -z-10 text-center p-2">
                          <FileText size={24} className="opacity-30 mx-auto" />
                        </div>

                        {/* Year tag */}
                        {b.year && (
                          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-sm text-white text-[9px] font-mono">
                            {b.year}
                          </div>
                        )}
                      </div>

                      {/* Title & Author */}
                      <h4 className="font-serif font-bold text-xs line-clamp-2 leading-tight tracking-tight mb-1" title={b.title}>
                        {b.title}
                      </h4>
                      <p className="text-[10px] opacity-60 line-clamp-1 mb-2">
                        {b.creator}
                      </p>
                    </div>

                    {/* Download Button */}
                    <button
                      onClick={() => handleDownloadBook(b)}
                      disabled={isDownloading || isDownloaded}
                      className={`w-full py-1.5 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 ${
                        isDownloaded
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-[#0c66b8] hover:bg-[#09559c] text-white shadow-sm'
                      }`}
                    >
                      {isDownloading ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-[11px]">Baixando...</span>
                        </>
                      ) : isDownloaded ? (
                        <>
                          <Check size={13} />
                          <span className="text-[11px]">Na Estante</span>
                        </>
                      ) : (
                        <>
                          <Download size={13} />
                          <span className="text-[11px]">Baixar</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
