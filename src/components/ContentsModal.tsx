import React, { useState } from 'react';
import type { PdfOutlineItem, ThemeMode } from '../types';
import { X, Bookmark, ListTree, BookOpen } from 'lucide-react';

interface ContentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  outline: PdfOutlineItem[];
  bookmarks: number[];
  currentPage: number;
  totalPages: number;
  onSelectPage: (pageNumber: number) => void;
  theme: ThemeMode;
}

export const ContentsModal: React.FC<ContentsModalProps> = ({
  isOpen,
  onClose,
  outline,
  bookmarks,
  currentPage,
  totalPages,
  onSelectPage,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<'toc' | 'bookmarks'>('toc');

  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const bgColor = isDark ? '#1c1c1c' : theme === 'sepia' ? '#f5ebd5' : theme === 'eink' ? '#e2dfd7' : '#ffffff';
  const textColor = isDark ? '#e5e5e5' : '#222222';
  const borderColor = isDark ? '#333333' : '#e5e3dc';

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-4 transition-opacity duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md h-[75vh] max-h-[600px] rounded-2xl shadow-2xl flex flex-col overflow-hidden border"
        style={{ backgroundColor: bgColor, color: textColor, borderColor }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor }}>
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-[#0c66b8]" />
            <h3 className="font-bold text-base tracking-tight">Conteúdo & Marcadores</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-black/10 active:scale-95 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor }}>
          <button
            onClick={() => setActiveTab('toc')}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'toc'
                ? 'border-[#0c66b8] text-[#0c66b8]'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <ListTree size={14} />
            Índice ({outline.length})
          </button>
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'bookmarks'
                ? 'border-[#0c66b8] text-[#0c66b8]'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <Bookmark size={14} />
            Marcadores ({bookmarks.length})
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4 divide-y no-scrollbar" style={{ borderColor }}>
          {activeTab === 'toc' && (
            <>
              {outline.length === 0 ? (
                <div className="py-12 text-center opacity-60 text-sm">
                  <p>Este PDF não possui um sumário embutido.</p>
                  <p className="text-xs mt-1">Você pode navegar pelas páginas usando a barra inferior.</p>
                </div>
              ) : (
                outline.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      onSelectPage(item.pageNumber);
                      onClose();
                    }}
                    className={`w-full text-left py-3 px-2 flex justify-between items-center hover:bg-black/5 rounded-lg transition ${
                      currentPage === item.pageNumber ? 'font-bold text-[#0c66b8]' : ''
                    }`}
                  >
                    <span className="text-sm truncate pr-2">{item.title}</span>
                    <span className="text-xs opacity-60 font-mono">Pág. {item.pageNumber}</span>
                  </button>
                ))
              )}
            </>
          )}

          {activeTab === 'bookmarks' && (
            <>
              {bookmarks.length === 0 ? (
                <div className="py-12 text-center opacity-60 text-sm">
                  <Bookmark size={32} className="mx-auto mb-2 opacity-40" />
                  <p>Nenhum marcador adicionado ainda.</p>
                  <p className="text-xs mt-1">Toque no ícone de fita no canto superior direito para marcar páginas favoritas.</p>
                </div>
              ) : (
                bookmarks.map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => {
                      onSelectPage(pageNum);
                      onClose();
                    }}
                    className={`w-full text-left py-3 px-2 flex justify-between items-center hover:bg-black/5 rounded-lg transition ${
                      currentPage === pageNum ? 'font-bold text-[#0c66b8]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Bookmark size={14} className="text-amber-500 fill-amber-500" />
                      <span className="text-sm">Página {pageNum}</span>
                    </div>
                    <span className="text-xs opacity-60 font-mono">
                      {Math.round((pageNum / totalPages) * 100)}%
                    </span>
                  </button>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
