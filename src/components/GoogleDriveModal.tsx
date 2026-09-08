import React, { useState, useEffect } from 'react';
import { 
  X, 
  Cloud, 
  Link as LinkIcon, 
  Download, 
  Search, 
  ShieldCheck, 
  Key, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Folder,
  Info,
  ExternalLink,
  BookMarked
} from 'lucide-react';
import { 
  downloadFromDriveLink, 
  downloadDriveFileWithToken,
  extractDriveFolderId,
  extractDriveFileId,
  fetchPublicFolderFiles,
  getDriveFileFormat,
  requestDriveAccessToken, 
  listDriveReadableFiles, 
  getStoredDriveClientId, 
  setStoredDriveClientId,
  formatBytes
} from '../services/googleDriveService';
import type { DriveFileFormat, DriveReadableFile } from '../services/googleDriveService';
import { loadPdf, extractMetadata, generateThumbnail } from '../services/pdfService';
import { extractEpubMetadata } from '../services/epubService';
import { saveBook } from '../services/storage';
import type { Book, ThemeMode } from '../types';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookImported: () => void;
  theme: ThemeMode;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  onBookImported,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<'link' | 'account'>('link');
  const [driveLink, setDriveLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Public Folder Exploration State
  const [publicFolderFiles, setPublicFolderFiles] = useState<DriveReadableFile[]>([]);
  const [loadingPublicFolder, setLoadingPublicFolder] = useState(false);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  // OAuth Account State
  const [clientId, setClientId] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveReadableFile[]>([]);
  const [selectedFolderId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    setClientId(getStoredDriveClientId());
  }, []);

  if (!isOpen) return null;

  const isDark = theme === 'dark';
  const isSepia = theme === 'sepia';
  const isEink = theme === 'eink';

  const modalBg = isDark ? '#1a1a1a' : isSepia ? '#f5ebd5' : isEink ? '#e2dfd7' : '#ffffff';
  const textColor = isDark ? '#e5e5e5' : '#222222';
  const borderColor = isDark ? '#333333' : '#e0ded6';
  const cardBg = isDark ? '#242424' : isSepia ? '#ede0c4' : isEink ? '#d6d3cb' : '#f8f8f6';

  const detectedFolderId = extractDriveFolderId(driveLink);
  const detectedFileId = extractDriveFileId(driveLink);

  const buildImportedBook = async (
    data: ArrayBuffer,
    filename: string,
    format: DriveFileFormat,
    driveFileId?: string
  ): Promise<Book> => {
    const baseBook = {
      id: 'gdrive_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      addedAt: Date.now(),
      lastReadAt: Date.now(),
      fileSize: data.byteLength,
      bookmarks: [],
      readingMode: 'reflow' as const,
      format,
      source: 'google_drive' as const,
      driveFileId,
    };

    if (format === 'epub') {
      const meta = await extractEpubMetadata(data, filename);
      return { ...baseBook, title: meta.title, author: meta.author, totalPages: meta.totalPages, currentPage: 1, coverUrl: '' };
    }

    const pdfDoc = await loadPdf(data);
    const meta = await extractMetadata(pdfDoc, filename);
    const coverUrl = await generateThumbnail(pdfDoc);
    return { ...baseBook, title: meta.title, author: meta.author, totalPages: meta.totalPages, currentPage: 1, coverUrl };
  };

  const loadDriveFiles = async (token: string, folderId = selectedFolderId) => {
    setStatusMessage(folderId ? 'Buscando PDF e EPUB na pasta selecionada...' : 'Buscando PDF e EPUB no Google Drive...');
    const files = await listDriveReadableFiles(token, folderId || undefined);
    setDriveFiles(files);
    setStatusMessage('');
  };

  // Explore public folder without OAuth login
  const handleExploreFolder = async (folderId: string) => {
    try {
      setLoadingPublicFolder(true);
      setErrorMessage('');
      setStatusMessage('Buscando livros na pasta do Google Drive...');
      
      const files = await fetchPublicFolderFiles(folderId);
      setPublicFolderFiles(files);

      if (files.length === 0) {
        setErrorMessage('Nenhum PDF ou EPUB encontrado nesta pasta pública. Verifique se o compartilhamento está como "Qualquer pessoa com o link".');
      } else {
        setStatusMessage(`Encontrado(s) ${files.length} livro(s) na pasta!`);
        setTimeout(() => setStatusMessage(''), 2500);
      }
    } catch (err: any) {
      console.error('Error exploring public folder:', err);
      setErrorMessage(err.message || 'Não foi possível ler os arquivos da pasta pública.');
    } finally {
      setLoadingPublicFolder(false);
    }
  };

  // Download a single file discovered in the public folder
  const handleDownloadPublicFile = async (file: DriveReadableFile) => {
    try {
      setDownloadingId(file.id);
      setErrorMessage('');
      setStatusMessage(`Baixando "${file.name}"...`);

      const directUrl = `https://drive.google.com/uc?export=download&id=${file.id}`;
      const { data, filename, format } = await downloadFromDriveLink(directUrl);

      setStatusMessage('Processando livro e capa...');
      const newBook = await buildImportedBook(data, file.name || filename, format, file.id);

      setStatusMessage('Salvando na estante...');
      await saveBook(newBook, data);

      setDownloadedIds(prev => new Set(prev).add(file.id));
      setStatusMessage(`"${newBook.title}" importado com sucesso!`);
      onBookImported();
      setTimeout(() => setStatusMessage(''), 2500);
    } catch (err: any) {
      console.error('Error downloading public file:', err);
      setErrorMessage(`Erro ao baixar "${file.name}": ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // 1. Handle Import from Direct Drive Link
  const handleImportByLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveLink.trim()) return;

    const folderId = extractDriveFolderId(driveLink);
    if (folderId) {
      await handleExploreFolder(folderId);
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setStatusMessage('Baixando arquivo do Google Drive...');

      const { data, filename, format } = await downloadFromDriveLink(driveLink);

      setStatusMessage('Analisando páginas e metadados...');
      const newBook = await buildImportedBook(data, filename, format);

      setStatusMessage('Salvando na memória local do KOS...');
      await saveBook(newBook, data);

      setStatusMessage('Livro importado com sucesso!');
      setTimeout(() => {
        onBookImported();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Error importing from Drive link:', err);
      setErrorMessage(err.message || 'Erro ao importar do Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  // 2. Connect Google Account via OAuth
  const handleConnectGoogle = async () => {
    const targetClientId = clientId.trim();
    if (!targetClientId) {
      setShowConfig(true);
      setErrorMessage('Para conectar sua conta diretamente, informe o Google Client ID gratuito abaixo.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      setStatusMessage('Autenticando com Google...');

      setStoredDriveClientId(targetClientId);
      const token = await requestDriveAccessToken(targetClientId);
      setAccessToken(token);

      await loadDriveFiles(token);
    } catch (err: any) {
      console.error('Google Auth Error:', err);
      setErrorMessage(err.message || 'Falha ao autenticar com o Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  // 3. Download a specific file from Google Drive List (OAuth)
  const handleDownloadDriveFile = async (file: DriveReadableFile) => {
    if (!accessToken) return;

    try {
      setDownloadingId(file.id);
      setErrorMessage('');

      const data = await downloadDriveFileWithToken(file.id, accessToken);
      const format = getDriveFileFormat(file.name, file.mimeType, data);
      const newBook = await buildImportedBook(data, file.name, format, file.id);

      await saveBook(newBook, data);
      onBookImported();
    } catch (err: any) {
      console.error('Error downloading drive file:', err);
      setErrorMessage(`Erro ao baixar "${file.name}": ${err.message}`);
    } finally {
      setDownloadingId(null);
    }
  };

  // Filtered Drive Files
  const filteredFiles = driveFiles.filter(f => 
    f.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3 animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg max-h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border"
        style={{ backgroundColor: modalBg, color: textColor, borderColor }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor }}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600">
              <Cloud size={20} />
            </div>
            <div>
              <h2 className="font-serif font-bold text-base tracking-tight">Google Drive</h2>
              <p className="text-[11px] opacity-60">Baixar e ler PDFs e EPUBs da nuvem no KOS</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-black/10 active:scale-95 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Safe Deletion Guarantee Banner */}
        <div className="px-5 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <ShieldCheck size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>
            <strong>100% Seguro & Privado:</strong> O KOS salva os livros localmente no seu aparelho. Nada é alterado ou excluído do seu Google Drive.
          </span>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor }}>
          <button
            onClick={() => { setActiveTab('link'); setErrorMessage(''); }}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'link'
                ? 'border-[#0c66b8] text-[#0c66b8]'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <LinkIcon size={14} />
            Importar por Link ou Pasta
          </button>
          <button
            onClick={() => { setActiveTab('account'); setErrorMessage(''); }}
            className={`flex-1 py-3 flex items-center justify-center gap-1.5 border-b-2 transition ${
              activeTab === 'account'
                ? 'border-[#0c66b8] text-[#0c66b8]'
                : 'border-transparent opacity-60 hover:opacity-100'
            }`}
          >
            <Cloud size={14} />
            Minha Conta Google
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 no-scrollbar space-y-4">
          {/* Error feedback */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-start gap-2 animate-fadeIn">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          {/* Status feedback */}
          {statusMessage && (
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs flex items-center gap-2 animate-fadeIn">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span>{statusMessage}</span>
            </div>
          )}

          {/* TAB 1: Direct Link & Public Folder Import */}
          {activeTab === 'link' && (
            <div className="space-y-4">
              <form onSubmit={handleImportByLink} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider opacity-70 mb-1.5">
                    Link de arquivo ou pasta do Google Drive
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: https://drive.google.com/drive/folders/... ou /file/d/..."
                    value={driveLink}
                    onChange={(e) => {
                      setDriveLink(e.target.value);
                      if (errorMessage) setErrorMessage('');
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border text-xs outline-none transition focus:ring-2 focus:ring-[#0c66b8]/40"
                    style={{ backgroundColor: cardBg, borderColor }}
                  />
                </div>

                {/* Feedback for File Link */}
                {detectedFileId && (
                  <div className="p-2.5 px-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
                    <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                    <span>Link de livro individual detectado! Pronto para importar.</span>
                  </div>
                )}

                {/* Feedback for Folder Link */}
                {detectedFolderId && (
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-900 dark:text-blue-200 text-xs space-y-2 animate-fadeIn">
                    <div className="font-semibold flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                      <Folder size={16} className="shrink-0" />
                      <span>Link de pasta do Google Drive detectado!</span>
                    </div>
                    <p className="text-[11px] opacity-90 leading-relaxed">
                      Toque no botão abaixo para explorar os livros compartilhados nesta pasta sem precisar de login ou configuração de conta.
                    </p>
                  </div>
                )}

                {/* Helper guide when empty */}
                {!detectedFolderId && !detectedFileId && (
                  <div className="p-3 rounded-xl border text-xs opacity-80 space-y-1.5" style={{ borderColor }}>
                    <p className="font-semibold flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                      <CheckCircle2 size={14} /> Dica de compartilhamento no Google Drive:
                    </p>
                    <ol className="list-decimal list-inside space-y-1 text-[11px] opacity-90">
                      <li>No Google Drive, abra a pasta ou o livro (PDF/EPUB) desejado.</li>
                      <li>Toque em <strong>"Compartilhar"</strong> e selecione <em>"Qualquer pessoa com o link"</em>.</li>
                      <li>Copie o link, cole no campo acima e pronto!</li>
                    </ol>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || loadingPublicFolder || !driveLink.trim()}
                  className="w-full py-3 px-4 rounded-xl bg-[#0c66b8] hover:bg-[#09559c] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-[0.99] disabled:opacity-50 transition"
                >
                  {loading || loadingPublicFolder ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>{detectedFolderId ? 'Buscando livros na pasta...' : 'Baixando livro...'}</span>
                    </>
                  ) : detectedFolderId ? (
                    <>
                      <Folder size={16} />
                      <span>Listar livros desta pasta</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      <span>Importar livro para a estante</span>
                    </>
                  )}
                </button>
              </form>

              {/* Public Folder Discovered Files List */}
              {publicFolderFiles.length > 0 && (
                <div className="pt-2 border-t space-y-3 animate-fadeIn" style={{ borderColor }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold flex items-center gap-1.5">
                      <BookMarked size={14} className="text-[#0c66b8]" />
                      Livros encontrados nesta pasta ({publicFolderFiles.length})
                    </span>
                    <span className="text-[10px] opacity-60">Toque em baixar</span>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto no-scrollbar">
                    {publicFolderFiles.map((file) => {
                      const isDownloaded = downloadedIds.has(file.id);
                      const isDownloading = downloadingId === file.id;

                      return (
                        <div
                          key={file.id}
                          className="p-3 rounded-xl border flex items-center justify-between gap-3 hover:shadow-sm transition"
                          style={{ backgroundColor: cardBg, borderColor }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText size={18} className="text-[#0c66b8] shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate" title={file.name}>{file.name}</p>
                              <p className="text-[10px] opacity-50 font-mono mt-0.5">
                                {file.size ? file.size : ''} {file.modifiedTime ? `• ${file.modifiedTime}` : ''}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDownloadPublicFile(file)}
                            disabled={isDownloading || isDownloaded}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 flex items-center gap-1 active:scale-95 transition ${
                              isDownloaded
                                ? 'bg-emerald-600 text-white opacity-90'
                                : 'bg-[#0c66b8] hover:bg-[#09559c] text-white disabled:opacity-50'
                            }`}
                          >
                            {isDownloading ? (
                              <>
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Baixando...</span>
                              </>
                            ) : isDownloaded ? (
                              <>
                                <CheckCircle2 size={13} />
                                <span>Adicionado!</span>
                              </>
                            ) : (
                              <>
                                <Download size={13} />
                                <span>Baixar</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Google Account Browser (OAuth) */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              {!accessToken ? (
                /* Not connected state */
                <div className="text-center py-4 space-y-4">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600">
                    <Cloud size={28} />
                  </div>
                  <div>
                    <h3 className="font-serif font-bold text-base">Conectar seu Google Drive</h3>
                    <p className="text-xs opacity-70 max-w-xs mx-auto mt-1">
                      Navegue e importe PDFs e EPUBs salvos na sua conta diretamente para a estante do KOS.
                    </p>
                  </div>

                  {/* Why Client ID Explanation Box */}
                  <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs space-y-2 text-left" style={{ borderColor }}>
                    <div className="flex items-center gap-1.5 font-semibold text-blue-700 dark:text-blue-300">
                      <Info size={15} />
                      <span>Por que o Google pede um Client ID?</span>
                    </div>
                    <p className="text-[11px] opacity-80 leading-relaxed">
                      O KOS é um aplicativo <strong>100% privado e local</strong> (sem servidores intermediários coletando seus dados). Para acessar arquivos privados da sua conta sem um servidor central, o Google exige que você utilize um <em>Client ID</em> gratuito de identificação.
                    </p>
                    <div className="pt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      💡 <strong>Não quer configurar?</strong> Você não precisa! Basta usar a aba <strong>"Importar por Link ou Pasta"</strong> (que lê pastas públicas direto) ou o botão <strong>"+ Adicionar Livro"</strong> na estante.
                    </div>
                  </div>

                  <button
                    onClick={handleConnectGoogle}
                    disabled={loading}
                    className="py-2.5 px-6 rounded-xl bg-[#0c66b8] hover:bg-[#09559c] text-white font-semibold text-xs inline-flex items-center gap-2 shadow-sm active:scale-95 transition"
                  >
                    <Cloud size={16} />
                    Conectar Conta Google
                  </button>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowConfig(!showConfig)}
                      className="text-[11px] opacity-60 hover:opacity-100 flex items-center gap-1 mx-auto"
                    >
                      <Key size={12} />
                      {showConfig ? 'Ocultar configuração de Client ID' : 'Configurar Google Client ID (2 min)'}
                    </button>
                  </div>

                  {/* Client ID Configuration Field */}
                  {showConfig && (
                    <div className="p-4 rounded-xl border text-left space-y-3 animate-fadeIn text-xs" style={{ backgroundColor: cardBg, borderColor }}>
                      <div>
                        <label className="block text-xs font-semibold mb-1">Google OAuth Client ID:</label>
                        <input
                          type="text"
                          placeholder="ex: 123456789-xyz.apps.googleusercontent.com"
                          value={clientId}
                          onChange={(e) => {
                            setClientId(e.target.value);
                            setStoredDriveClientId(e.target.value);
                          }}
                          className="w-full px-3 py-2 rounded-lg border text-xs outline-none bg-white dark:bg-black/30"
                          style={{ borderColor }}
                        />
                      </div>

                      <div className="text-[11px] space-y-1.5 opacity-80 border-t pt-2" style={{ borderColor }}>
                        <p className="font-semibold text-blue-600 dark:text-blue-400">Como criar seu Client ID gratuito:</p>
                        <ol className="list-decimal list-inside space-y-1 pl-1">
                          <li>Acesse o <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="underline text-blue-500 inline-flex items-center gap-0.5">Google Cloud Console <ExternalLink size={10} /></a>.</li>
                          <li>Crie um projeto e vá em <strong>Credenciais</strong> ➔ <strong>Criar Credenciais</strong> ➔ <strong>ID do cliente OAuth</strong>.</li>
                          <li>Escolha <strong>Aplicativo da Web</strong> e adicione <code>http://localhost:5173</code> nas Origens JavaScript autorizadas.</li>
                          <li>Copie o Client ID gerado e cole no campo acima!</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Connected - Drive Files List */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold opacity-70">
                      {selectedFolderId ? 'Arquivos da pasta' : 'Arquivos no Drive'} ({filteredFiles.length})
                    </span>
                    <button
                      onClick={() => setAccessToken(null)}
                      className="text-[11px] text-red-500 hover:underline"
                    >
                      Desconectar
                    </button>
                  </div>

                  {/* Search Filter */}
                  <div 
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs"
                    style={{ backgroundColor: cardBg, borderColor }}
                  >
                    <Search size={14} className="opacity-50" />
                    <input
                      type="text"
                      placeholder="Filtrar arquivos no Drive..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="flex-1 bg-transparent outline-none"
                    />
                  </div>

                  {/* Files List */}
                  <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
                    {filteredFiles.length === 0 ? (
                      <div className="py-8 text-center text-xs opacity-60">
                        Nenhum PDF ou EPUB encontrado neste local do Google Drive.
                      </div>
                    ) : (
                      filteredFiles.map((file) => (
                        <div
                          key={file.id}
                          className="p-2.5 rounded-xl border flex items-center justify-between gap-3 hover:shadow-sm transition"
                          style={{ backgroundColor: cardBg, borderColor }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <FileText size={18} className="text-[#0c66b8] shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{file.name}</p>
                              <p className="text-[10px] opacity-50 font-mono">
                                {formatBytes(file.size)} • {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : ''}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDownloadDriveFile(file)}
                            disabled={downloadingId === file.id}
                            className="px-3 py-1.5 rounded-lg bg-[#0c66b8] hover:bg-[#09559c] text-white text-xs font-semibold shrink-0 flex items-center gap-1 active:scale-95 disabled:opacity-50 transition"
                          >
                            {downloadingId === file.id ? (
                              <>
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Baixando...</span>
                              </>
                            ) : (
                              <>
                                <Download size={13} />
                                <span>Baixar</span>
                              </>
                            )}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
