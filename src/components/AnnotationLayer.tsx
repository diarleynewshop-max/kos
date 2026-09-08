import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { PageStroke, ThemeMode } from '../types';
import { 
  Highlighter, 
  Pencil, 
  Eraser, 
  RotateCcw, 
  Trash2, 
  Check, 
  Palette
} from 'lucide-react';
import { getPageAnnotations, savePageAnnotations, clearPageAnnotations } from '../services/storage';

interface AnnotationLayerProps {
  bookId: string;
  currentPage: number;
  isDrawingMode: boolean;
  onCloseDrawingMode: () => void;
  theme: ThemeMode;
}

const HIGHLIGHTER_COLORS = [
  { name: 'Amarelo', value: 'rgba(255, 235, 59, 0.42)', border: '#fbc02d' },
  { name: 'Verde', value: 'rgba(102, 187, 106, 0.42)', border: '#43a047' },
  { name: 'Azul', value: 'rgba(66, 165, 245, 0.42)', border: '#1e88e5' },
  { name: 'Laranja', value: 'rgba(255, 167, 38, 0.42)', border: '#fb8c00' },
  { name: 'Rosa', value: 'rgba(240, 98, 146, 0.42)', border: '#d81b60' },
];

const PEN_COLORS = [
  { name: 'Azul', value: '#1a73e8' },
  { name: 'Vermelho', value: '#e53935' },
  { name: 'Verde', value: '#2e7d32' },
  { name: 'Preto', value: '#212121' },
  { name: 'Branco', value: '#ffffff' },
];

export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({
  bookId,
  currentPage,
  isDrawingMode,
  onCloseDrawingMode,
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [tool, setTool] = useState<'highlighter' | 'pen' | 'eraser'>('highlighter');
  const [highlighterColor, setHighlighterColor] = useState<string>(HIGHLIGHTER_COLORS[0].value);
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0].value);
  const [strokes, setStrokes] = useState<PageStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<PageStroke | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<boolean>(false);

  // Load annotations from IndexedDB when book or page changes
  useEffect(() => {
    let isMounted = true;
    async function load() {
      const data = await getPageAnnotations(bookId, currentPage);
      if (isMounted) {
        setStrokes(data?.strokes || []);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [bookId, currentPage]);

  // Save annotations whenever strokes change
  const saveStrokes = useCallback(async (newStrokes: PageStroke[]) => {
    await savePageAnnotations(bookId, currentPage, { strokes: newStrokes });
  }, [bookId, currentPage]);

  // Redraw all strokes on canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const allStrokes = currentStroke ? [...strokes, currentStroke] : strokes;

    for (const stroke of allStrokes) {
      if (stroke.points.length < 2) continue;

      ctx.save();
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'highlighter') {
        // Use multiply blend mode for natural highlighting over text
        ctx.globalCompositeOperation = theme === 'dark' ? 'screen' : 'multiply';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size * (canvas.width / 400); // Scale with resolution
      } else if (stroke.tool === 'pen') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size * (canvas.width / 400);
      }

      const p0 = stroke.points[0];
      ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);

      for (let i = 1; i < stroke.points.length; i++) {
        const pt = stroke.points[i];
        ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
      }

      ctx.stroke();
      ctx.restore();
    }
  }, [strokes, currentStroke, theme]);

  // Sync canvas size with container
  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      redraw();
    }
  }, [redraw]);

  useEffect(() => {
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [updateCanvasSize]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Handle pointer drawing events
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!isDrawingMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (tool === 'eraser') {
      // Find and delete stroke near clicked point
      const threshold = 0.04;
      const filtered = strokes.filter(s => {
        return !s.points.some(p => Math.hypot(p.x - x, p.y - y) < threshold);
      });
      if (filtered.length !== strokes.length) {
        setStrokes(filtered);
        saveStrokes(filtered);
      }
      return;
    }

    const strokeColor = tool === 'highlighter' ? highlighterColor : penColor;
    const strokeSize = tool === 'highlighter' ? 18 : 3;

    const newStroke: PageStroke = {
      id: Math.random().toString(36).substring(2, 9),
      tool,
      color: strokeColor,
      size: strokeSize,
      points: [{ x, y }],
    };

    setCurrentStroke(newStroke);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    if (tool === 'eraser') {
      if (e.buttons === 1) {
        const threshold = 0.035;
        const filtered = strokes.filter(s => {
          return !s.points.some(p => Math.hypot(p.x - x, p.y - y) < threshold);
        });
        if (filtered.length !== strokes.length) {
          setStrokes(filtered);
          saveStrokes(filtered);
        }
      }
      return;
    }

    if (!currentStroke) return;

    setCurrentStroke(prev => {
      if (!prev) return null;
      return {
        ...prev,
        points: [...prev.points, { x, y }],
      };
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawingMode || !currentStroke) return;

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if not captured
    }

    if (currentStroke.points.length > 1) {
      const updated = [...strokes, currentStroke];
      setStrokes(updated);
      saveStrokes(updated);
    }

    setCurrentStroke(null);
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const updated = strokes.slice(0, -1);
    setStrokes(updated);
    saveStrokes(updated);
  };

  const handleClearAll = async () => {
    if (strokes.length === 0) return;
    if (window.confirm('Deseja apagar todas as anotações desta página?')) {
      setStrokes([]);
      await clearPageAnnotations(bookId, currentPage);
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`absolute inset-0 w-full h-full z-10 ${
        isDrawingMode ? 'pointer-events-auto touch-none' : 'pointer-events-none'
      }`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />

      {/* Floating Study Tools Palette (when Study Mode is active) */}
      {isDrawingMode && (
        <div 
          className="pointer-events-auto fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-2 max-w-[95vw] animate-in fade-in slide-in-from-bottom-4 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sub-palette for Colors */}
          {showColorPicker && (
            <div className="bg-white/95 dark:bg-[#202020]/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-xl border border-black/10 dark:border-white/10 flex items-center gap-2">
              {tool === 'highlighter' ? (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium opacity-60 mr-1">Marca-texto:</span>
                  {HIGHLIGHTER_COLORS.map(c => (
                    <button
                      key={c.name}
                      onClick={() => {
                        setHighlighterColor(c.value);
                        setShowColorPicker(false);
                      }}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        highlighterColor === c.value ? 'scale-110 border-blue-500 shadow-md' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c.border }}
                      title={c.name}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium opacity-60 mr-1">Caneta:</span>
                  {PEN_COLORS.map(c => (
                    <button
                      key={c.name}
                      onClick={() => {
                        setPenColor(c.value);
                        setShowColorPicker(false);
                      }}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        penColor === c.value ? 'scale-110 border-blue-500 shadow-md' : 'border-black/20'
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Main Study Mode Toolbar */}
          <div className="bg-neutral-900/95 text-white backdrop-blur-md px-3 py-2 rounded-2xl shadow-2xl border border-white/15 flex items-center gap-1.5 sm:gap-2">
            {/* Highlighter button */}
            <button
              onClick={() => {
                setTool('highlighter');
                setShowColorPicker(false);
              }}
              className={`p-2.5 rounded-xl transition flex items-center gap-1.5 ${
                tool === 'highlighter' ? 'bg-amber-500 text-black font-semibold shadow-md scale-105' : 'hover:bg-white/10 text-white/80'
              }`}
              title="Marca-texto (Sublinhar)"
            >
              <Highlighter size={18} />
              <span className="text-xs hidden sm:inline">Marca-texto</span>
            </button>

            {/* Pen button */}
            <button
              onClick={() => {
                setTool('pen');
                setShowColorPicker(false);
              }}
              className={`p-2.5 rounded-xl transition flex items-center gap-1.5 ${
                tool === 'pen' ? 'bg-blue-600 text-white font-semibold shadow-md scale-105' : 'hover:bg-white/10 text-white/80'
              }`}
              title="Caneta (Anotar/Desenhar)"
            >
              <Pencil size={18} />
              <span className="text-xs hidden sm:inline">Caneta</span>
            </button>

            {/* Color toggle button */}
            {tool !== 'eraser' && (
              <button
                onClick={() => setShowColorPicker(prev => !prev)}
                className="p-2.5 rounded-xl hover:bg-white/10 text-white/80 transition flex items-center justify-center relative"
                title="Escolher Cor"
              >
                <Palette size={18} />
                <span 
                  className="w-2.5 h-2.5 rounded-full absolute bottom-1 right-1 border border-black/50" 
                  style={{ backgroundColor: tool === 'highlighter' ? highlighterColor.replace('0.42', '1') : penColor }}
                />
              </button>
            )}

            {/* Eraser button */}
            <button
              onClick={() => {
                setTool('eraser');
                setShowColorPicker(false);
              }}
              className={`p-2.5 rounded-xl transition flex items-center gap-1.5 ${
                tool === 'eraser' ? 'bg-rose-600 text-white font-semibold shadow-md scale-105' : 'hover:bg-white/10 text-white/80'
              }`}
              title="Borracha"
            >
              <Eraser size={18} />
              <span className="text-xs hidden sm:inline">Borracha</span>
            </button>

            <div className="w-[1px] h-6 bg-white/20 mx-0.5" />

            {/* Undo button */}
            <button
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className="p-2.5 rounded-xl hover:bg-white/10 disabled:opacity-30 text-white/80 transition active:scale-95"
              title="Desfazer último traço"
            >
              <RotateCcw size={17} />
            </button>

            {/* Clear All button */}
            <button
              onClick={handleClearAll}
              disabled={strokes.length === 0}
              className="p-2.5 rounded-xl hover:bg-rose-500/20 text-rose-300 disabled:opacity-30 transition active:scale-95"
              title="Limpar anotações da página"
            >
              <Trash2 size={17} />
            </button>

            <div className="w-[1px] h-6 bg-white/20 mx-0.5" />

            {/* Done button */}
            <button
              onClick={onCloseDrawingMode}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-md transition flex items-center gap-1 active:scale-95"
              title="Concluir e voltar à leitura"
            >
              <Check size={16} />
              <span>Pronto</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
