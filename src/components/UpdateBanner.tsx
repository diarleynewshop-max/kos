import { useState } from 'react';
import { Download, X, AlertTriangle } from 'lucide-react';
import type { UpdateInfo } from '../services/updateService';
import { downloadAndInstallUpdate } from '../services/updateService';

interface UpdateBannerProps {
  update: UpdateInfo;
  onDismiss: () => void;
}

export function UpdateBanner({ update, onDismiss }: UpdateBannerProps) {
  const [status, setStatus] = useState<'idle' | 'downloading' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const handleInstall = async () => {
    setStatus('downloading');
    setError('');
    try {
      await downloadAndInstallUpdate(update, setProgress);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Falha ao baixar atualização.');
      return;
    }
    setStatus('idle');
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-40 bg-[#181818] text-white rounded-xl shadow-2xl p-4 animate-slideUp">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Nova versão do KOS disponível</p>
          <p className="text-xs text-white/60 mt-0.5">Versão {update.version.replace(/^v/i, '')}</p>
        </div>
        {status !== 'downloading' && (
          <button onClick={onDismiss} className="text-white/50 hover:text-white shrink-0" aria-label="Fechar">
            <X size={18} />
          </button>
        )}
      </div>

      {status === 'error' && (
        <div className="flex items-start gap-2 mt-2 text-xs text-red-300">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {status === 'downloading' ? (
        <div className="mt-3">
          <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#0c66b8] transition-all duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-white/60 mt-1.5">
            {progress < 95 ? 'Baixando atualização...' : 'Abrindo instalador...'}
          </p>
        </div>
      ) : (
        <button
          onClick={handleInstall}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-[#0c66b8] hover:bg-[#0a559a] text-white text-sm font-medium py-2 rounded-lg transition-colors"
        >
          <Download size={16} />
          Baixar e instalar
        </button>
      )}
    </div>
  );
}
