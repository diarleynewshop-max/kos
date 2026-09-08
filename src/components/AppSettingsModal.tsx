import React, { useEffect, useRef, useState } from 'react';
import { X, Check, Info, Upload, Download, AlertTriangle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { ReaderSettings, ThemeMode, FontFamily } from '../types';
import { exportLibrary, importLibrary } from '../services/backupService';

interface AppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  onLibraryRestored: () => void;
}

const themes: { id: ThemeMode; name: string; bg: string; text: string; border: string }[] = [
  { id: 'light', name: 'Claro', bg: 'bg-[#fbfbf9]', text: 'text-[#181818]', border: 'border-black/10' },
  { id: 'dark', name: 'Noturno', bg: 'bg-[#141414]', text: 'text-[#e3e3e3]', border: 'border-[#333]' },
  { id: 'sepia', name: 'Sépia', bg: 'bg-[#f6eedb]', text: 'text-[#382f24]', border: 'border-[#dfd3b9]' },
  { id: 'eink', name: 'E-Ink', bg: 'bg-[#eae8e3]', text: 'text-[#111111]', border: 'border-[#c5c2b9]' },
];

const fonts: { id: FontFamily; label: string; fontClass: string }[] = [
  { id: 'bookerly', label: 'Bookerly', fontClass: 'font-bookerly' },
  { id: 'baskerville', label: 'Baskerville', fontClass: 'font-baskerville' },
  { id: 'ember', label: 'Amazon Ember', fontClass: 'font-ember' },
  { id: 'dyslexic', label: 'OpenDyslexic', fontClass: 'font-dyslexic' },
];

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onLibraryRestored,
}) => {
  const [appVersion, setAppVersion] = useState<string>('');
  const [backupBusy, setBackupBusy] = useState<boolean>(false);
  const [backupStatus, setBackupStatus] = useState<string>('');
  const [backupError, setBackupError] = useState<string>('');
  const backupInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (Capacitor.isNativePlatform()) {
      App.getInfo()
        .then((info) => setAppVersion(`${info.version} (build ${info.build})`))
        .catch(() => setAppVersion('Desconhecida'));
    } else {
      setAppVersion('Web (modo de desenvolvimento)');
    }
  }, [isOpen]);

  const handleExport = async () => {
    setBackupBusy(true);
    setBackupError('');
    setBackupStatus('Preparando backup...');
    try {
      const summary = await exportLibrary(setBackupStatus);
      setBackupStatus(
        summary.path
          ? `Backup de ${summary.books} livro(s) salvo em ${summary.path}.`
          : `Backup de ${summary.books} livro(s) gerado.`
      );
    } catch (e) {
      setBackupStatus('');
      setBackupError(e instanceof Error ? e.message : 'Falha ao exportar a biblioteca.');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setBackupBusy(true);
    setBackupError('');
    setBackupStatus('Lendo backup...');
    try {
      const summary = await importLibrary(file, setBackupStatus);
      setBackupStatus(`${summary.books} livro(s) restaurado(s).`);
      onLibraryRestored();
    } catch (e) {
      setBackupStatus('');
      setBackupError(e instanceof Error ? e.message : 'Falha ao restaurar a biblioteca.');
    } finally {
      setBackupBusy(false);
    }
  };

  if (!isOpen) return null;

  const isDark = settings.theme === 'dark';
  const isSepia = settings.theme === 'sepia';
  const isEink = settings.theme === 'eink';
  const modalBg = isDark ? '#1c1c1c' : isSepia ? '#f4ecd8' : isEink ? '#eae8e3' : '#ffffff';
  const modalText = isDark ? '#f0f0f0' : isSepia ? '#382f24' : '#181818';
  const modalBorder = isDark ? '#333' : '#e5e3dc';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 border animate-slideUp"
        style={{ backgroundColor: modalBg, color: modalText, borderColor: modalBorder }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-3 mb-4 border-b" style={{ borderColor: modalBorder }}>
          <h2 className="text-base font-bold tracking-tight">Configurações</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/10 active:scale-95 transition"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Theme */}
        <div className="mb-5">
          <label className="text-xs font-semibold uppercase tracking-wider block opacity-70 mb-2">Tema</label>
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

        {/* Font Family */}
        <div className="mb-5">
          <label className="text-xs font-semibold uppercase tracking-wider block opacity-70 mb-2">Forma do Texto</label>
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

        {/* Font Size */}
        <div className="mb-5">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Tamanho do Texto</span>
            <span className="text-xs font-mono font-bold">{settings.fontSize}px</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onUpdateSettings({ fontSize: Math.max(14, settings.fontSize - 2) })}
              className="w-10 h-10 rounded-lg border flex items-center justify-center font-serif text-sm active:scale-90 transition"
              style={{ borderColor: isDark ? '#444' : '#ccc' }}
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
              style={{ borderColor: isDark ? '#444' : '#ccc' }}
            >
              A+
            </button>
          </div>
        </div>

        {/* Library Backup */}
        <div className="mb-5 pt-3 border-t" style={{ borderColor: modalBorder }}>
          <label className="text-xs font-semibold uppercase tracking-wider block opacity-70 mb-1">
            Backup da Biblioteca
          </label>
          <p className="text-[11px] opacity-60 mb-2.5">
            Seus livros, progresso, marcadores e anotações ficam apenas neste aparelho.
            Desinstalar o app ou limpar os dados apaga tudo.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleExport}
              disabled={backupBusy}
              className="py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 hover:bg-black/5 active:scale-95 transition"
              style={{ borderColor: modalBorder }}
            >
              <Download size={14} />
              Exportar
            </button>
            <button
              onClick={() => backupInputRef.current?.click()}
              disabled={backupBusy}
              className="py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 hover:bg-black/5 active:scale-95 transition"
              style={{ borderColor: modalBorder }}
            >
              <Upload size={14} />
              Restaurar
            </button>
          </div>

          <input
            ref={backupInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={handleImport}
          />

          {backupStatus && (
            <p className="text-[11px] opacity-70 mt-2 flex items-center gap-1.5">
              {backupBusy && (
                <span className="w-3 h-3 border-2 border-[#0c66b8] border-t-transparent rounded-full animate-spin shrink-0" />
              )}
              {backupStatus}
            </p>
          )}

          {backupError && (
            <p className="text-[11px] text-red-500 mt-2 flex items-start gap-1.5">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {backupError}
            </p>
          )}
        </div>

        {/* App Version */}
        <div className="flex items-center justify-between pt-3 border-t" style={{ borderColor: modalBorder }}>
          <div className="flex items-center gap-1.5 text-xs opacity-70">
            <Info size={13} />
            <span>Versão do KOS</span>
          </div>
          <span className="text-xs font-mono font-semibold">{appVersion || '...'}</span>
        </div>
      </div>
    </div>
  );
};
