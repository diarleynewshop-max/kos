import React from 'react';
import { X, Crop, Type, Check, Sparkles } from 'lucide-react';
import type { ReaderSettings, ThemeMode, FontFamily, MarginSize } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  readingMode: 'original' | 'reflow';
  onToggleReadingMode: (mode: 'original' | 'reflow') => void;
  isEpub?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  readingMode,
  onToggleReadingMode,
  isEpub = false,
}) => {
  if (!isOpen) return null;

  const themes: { id: ThemeMode; name: string; bg: string; text: string; border: string }[] = [
    { id: 'light', name: 'Claro', bg: 'bg-[#fbfbf9]', text: 'text-[#181818]', border: 'border-black/10' },
    { id: 'sepia', name: 'Sépia', bg: 'bg-[#f6eedb]', text: 'text-[#382f24]', border: 'border-[#dfd3b9]' },
    { id: 'dark', name: 'Noturno', bg: 'bg-[#141414]', text: 'text-[#e3e3e3]', border: 'border-[#333]' },
    { id: 'eink', name: 'E-Ink', bg: 'bg-[#eae8e3]', text: 'text-[#111111]', border: 'border-[#c5c2b9]' },
  ];

  const fonts: { id: FontFamily; label: string; fontClass: string }[] = [
    { id: 'bookerly', label: 'Bookerly', fontClass: 'font-bookerly' },
    { id: 'baskerville', label: 'Baskerville', fontClass: 'font-baskerville' },
    { id: 'ember', label: 'Amazon Ember', fontClass: 'font-ember' },
    { id: 'dyslexic', label: 'OpenDyslexic', fontClass: 'font-dyslexic' },
  ];

  const margins: { id: MarginSize; label: string }[] = [
    { id: 'compact', label: 'Compacta' },
    { id: 'normal', label: 'Padrão' },
    { id: 'wide', label: 'Ampla' },
  ];

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 border overflow-hidden animate-slideUp text-slate-900"
        style={{
          backgroundColor: settings.theme === 'dark' ? '#1c1c1c' : settings.theme === 'sepia' ? '#f4ecd8' : settings.theme === 'eink' ? '#eae8e3' : '#ffffff',
          color: settings.theme === 'dark' ? '#f0f0f0' : settings.theme === 'sepia' ? '#382f24' : '#181818',
          borderColor: settings.theme === 'dark' ? '#333' : '#e5e3dc',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-3 mb-4 border-b" style={{ borderColor: settings.theme === 'dark' ? '#333' : '#e5e3dc' }}>
          <h2 className="text-base font-bold tracking-tight">Configurações de Leitura (Aa)</h2>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/10 active:scale-95 transition"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Selector Tab */}
        <div className="mb-5">
          <label className="text-xs font-semibold uppercase tracking-wider block opacity-70 mb-2">
            {isEpub ? 'Modo de Leitura do EPUB' : 'Modo de Exibição do PDF'}
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-black/5 rounded-xl">
            <button
              onClick={() => onToggleReadingMode('original')}
              className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                readingMode === 'original' 
                  ? 'bg-white text-black shadow-sm font-semibold' 
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              <Crop size={14} />
              {isEpub ? 'Diagramado (Original)' : 'Original (Auto-Crop)'}
            </button>
            <button
              onClick={() => onToggleReadingMode('reflow')}
              className={`py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition ${
                readingMode === 'reflow' 
                  ? 'bg-white text-black shadow-sm font-semibold' 
                  : 'opacity-75 hover:opacity-100'
              }`}
            >
              <Type size={14} />
              {isEpub ? 'Transcrito (Reflow Limpo)' : 'Reflow (Kindle Fluido)'}
            </button>
          </div>
        </div>

        {/* Themes Grid */}
        <div className="mb-5">
          <label className="text-xs font-semibold uppercase tracking-wider block opacity-70 mb-2">Tema de Papel</label>
          <div className="grid grid-cols-4 gap-2">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => onUpdateSettings({ theme: t.id })}
                className={`flex flex-col items-center justify-center py-2.5 px-1 rounded-xl border-2 transition active:scale-95 ${t.bg} ${t.text} ${
                  settings.theme === t.id ? 'border-[#0c66b8] ring-2 ring-[#0c66b8]/20 shadow-sm' : t.border
                }`}
              >
                <span className="text-xs font-semibold">{t.name}</span>
                {settings.theme === t.id && <Check size={12} className="text-[#0c66b8] mt-1" />}
              </button>
            ))}
          </div>
        </div>

        {/* Typography & Font Size Options (shown in reflow mode or when reading EPUB) */}
        {(readingMode === 'reflow' || isEpub) && (
          <div className="space-y-4 mb-5 animate-fadeIn">
            {/* Font Selector */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block opacity-70 mb-2">Família da Fonte</label>
              <div className="grid grid-cols-2 gap-2">
                {fonts.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => onUpdateSettings({ fontFamily: f.id })}
                    className={`py-2 px-3 rounded-lg border text-sm text-left transition ${f.fontClass} ${
                      settings.fontFamily === f.id
                        ? 'border-[#0c66b8] bg-[#0c66b8]/10 font-bold'
                        : 'border-black/10 hover:border-black/20'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size Slider */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Tamanho da Fonte</span>
                <span className="text-xs font-mono font-bold">{settings.fontSize}px</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onUpdateSettings({ fontSize: Math.max(14, settings.fontSize - 2) })}
                  className="w-10 h-10 rounded-lg border flex items-center justify-center font-serif text-sm active:scale-90 transition"
                  style={{ borderColor: settings.theme === 'dark' ? '#444' : '#ccc' }}
                >
                  A-
                </button>
                <input
                  type="range"
                  min={14}
                  max={32}
                  step={2}
                  value={settings.fontSize}
                  onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
                  className="flex-1 accent-[#0c66b8] cursor-pointer"
                />
                <button
                  onClick={() => onUpdateSettings({ fontSize: Math.min(32, settings.fontSize + 2) })}
                  className="w-10 h-10 rounded-lg border flex items-center justify-center font-serif text-lg font-bold active:scale-90 transition"
                  style={{ borderColor: settings.theme === 'dark' ? '#444' : '#ccc' }}
                >
                  A+
                </button>
              </div>
            </div>

            {/* Margins */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block opacity-70 mb-1.5">Margens Laterais</label>
              <div className="grid grid-cols-3 gap-2">
                {margins.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => onUpdateSettings({ margin: m.id })}
                    className={`py-1.5 rounded-lg border text-xs font-medium transition ${
                      settings.margin === m.id
                        ? 'border-[#0c66b8] bg-[#0c66b8]/10 font-bold'
                        : 'border-black/10 hover:border-black/20'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PDF Original Mode Options */}
        {!isEpub && readingMode === 'original' && (
          <div className="space-y-3 mb-5 animate-fadeIn">
            {/* Auto Crop Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/5">
              <div>
                <p className="text-xs font-semibold">Auto-Crop de Margens Brancas</p>
                <p className="text-[11px] opacity-70">Remove bordas vazias do PDF para ampliar o texto na tela do celular</p>
              </div>
              <input
                type="checkbox"
                checked={settings.autoCrop}
                onChange={(e) => onUpdateSettings({ autoCrop: e.target.checked })}
                className="w-5 h-5 accent-[#0c66b8] rounded cursor-pointer"
              />
            </div>

            {/* Contrast Boost */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/5">
              <div>
                <p className="text-xs font-semibold">Reforço de Contraste</p>
                <p className="text-[11px] opacity-70">Torna o texto mais escuro e nítido para PDFs escaneados</p>
              </div>
              <input
                type="checkbox"
                checked={settings.contrastBoost}
                onChange={(e) => onUpdateSettings({ contrastBoost: e.target.checked })}
                className="w-5 h-5 accent-[#0c66b8] rounded cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* E-Ink Page Turn Flash Effect */}
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: settings.theme === 'dark' ? '#333' : '#e5e3dc' }}>
          <div>
            <p className="text-xs font-semibold flex items-center gap-1">
              <Sparkles size={13} className="text-amber-500" /> Efeito E-Ink ao Virar Página
            </p>
            <p className="text-[11px] opacity-70">Flash sutil de atualização de tinta eletrônica</p>
          </div>
          <input
            type="checkbox"
            checked={settings.einkFlash}
            onChange={(e) => onUpdateSettings({ einkFlash: e.target.checked })}
            className="w-5 h-5 accent-[#0c66b8] rounded cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
