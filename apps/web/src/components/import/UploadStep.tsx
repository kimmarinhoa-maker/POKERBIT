import { useRef, useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Settings } from 'lucide-react';
import Spinner from '@/components/Spinner';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (same as backend)

export type Platform = 'suprema' | 'pppoker' | 'clubgg';

const PLATFORM_LABELS: Record<string, string> = {
  suprema: 'Suprema Poker',
  pppoker: 'PPPoker',
  clubgg: 'ClubGG',
};

interface DetectionResult {
  platform: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

interface UploadStepProps {
  file: File | null;
  setFile: (f: File | null) => void;
  platform: Platform;
  setPlatform: (p: Platform) => void;
  clubs: Array<{ id: string; name: string; metadata?: { platform?: string } }>;
  clubId: string;
  setClubId: (id: string) => void;
  weekStartOverride: string;
  setWeekStartOverride: (v: string) => void;
  showWeekOverride: boolean;
  setShowWeekOverride: (v: boolean) => void;
  loading: boolean;
  error: string;
  onPreview: () => void;
}

const LABEL = 'text-[11px] uppercase tracking-[0.06em] text-dark-500 font-medium mb-2';

function validateFile(f: File): string | null {
  if (!f.name.endsWith('.xlsx')) {
    return 'Apenas arquivos .xlsx sao aceitos.';
  }
  if (f.size === 0) {
    return 'O arquivo esta vazio.';
  }
  if (f.size > MAX_FILE_SIZE) {
    return `O arquivo excede o limite de 10 MB (${(f.size / 1024 / 1024).toFixed(1)} MB).`;
  }
  return null;
}

// ─── Client-side platform detection by sheet names ────────────────
function detectPlatformBySheets(sheetNames: string[]): DetectionResult {
  const lower = sheetNames.map((s) => s.toLowerCase());

  // Suprema — known sheet names
  if (
    sheetNames.includes('Grand Union Member Statistics') ||
    sheetNames.includes('Manager Trade Record') ||
    sheetNames.includes('Grand Union Member Resume') ||
    lower.some((s) => s.includes('grand union'))
  ) {
    return { platform: 'suprema', confidence: 'high', reason: 'Aba da Suprema Poker detectada' };
  }

  // PPPoker — known sheet names
  if (
    sheetNames.includes('Club Summary') ||
    sheetNames.includes('Geral') ||
    lower.some((s) => s.includes('pppoker') || s.includes('club summary'))
  ) {
    return { platform: 'pppoker', confidence: 'high', reason: 'Aba do PPPoker detectada' };
  }

  // Filename hints (medium confidence)
  const fileHints = sheetNames.length === 0 ? [] : sheetNames;
  if (fileHints.length === 0) {
    return { platform: 'unknown', confidence: 'low', reason: 'Nenhuma aba reconhecida' };
  }

  return { platform: 'unknown', confidence: 'low', reason: 'Nenhuma aba reconhecida' };
}

function confidenceBorder(confidence: string) {
  if (confidence === 'high') return 'border-green-500/50';
  if (confidence === 'medium') return 'border-amber-500/50';
  return 'border-dark-600';
}

function confidenceBadge(confidence: string) {
  if (confidence === 'high')
    return 'bg-green-900/30 text-green-400 border-green-700/30';
  if (confidence === 'medium')
    return 'bg-amber-900/30 text-amber-400 border-amber-700/30';
  return 'bg-dark-800 text-dark-400 border-dark-600';
}

export default function UploadStep({
  file,
  setFile,
  platform,
  setPlatform,
  clubs,
  clubId,
  setClubId,
  weekStartOverride,
  setWeekStartOverride,
  showWeekOverride,
  setShowWeekOverride,
  loading,
  error,
  onPreview,
}: UploadStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Detection state
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<DetectionResult | null>(null);
  const [platformSelected, setPlatformSelected] = useState(false);

  function autoSelectClub(detectedPlatform: string) {
    const matching = clubs.filter((c) => c.metadata?.platform === detectedPlatform);
    if (matching.length > 0 && !matching.some((c) => c.id === clubId)) {
      setClubId(matching[0].id);
    }
  }

  // Read sheet names and detect platform (client-side, no API call)
  async function runDetection(f: File) {
    setDetecting(true);
    setDetection(null);
    setPlatformSelected(false);

    let sheetNames: string[] = [];
    try {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { bookSheets: true });
      sheetNames = wb.SheetNames || [];
    } catch {
      // sheet name extraction failed
    }

    const result = detectPlatformBySheets(sheetNames);
    setDetection(result);

    // Auto-select on high confidence
    if (result.confidence === 'high' && (result.platform === 'suprema' || result.platform === 'pppoker')) {
      setPlatform(result.platform as Platform);
      setPlatformSelected(true);
      autoSelectClub(result.platform);
    }

    setDetecting(false);
  }

  function trySetFile(f: File | null) {
    setFileError(null);
    setDetection(null);
    setPlatformSelected(false);
    if (!f) {
      setFile(null);
      return;
    }
    const err = validateFile(f);
    if (err) {
      setFileError(err);
      setFile(null);
      return;
    }
    setFile(f);
  }

  // Trigger detection when file is set
  useEffect(() => {
    if (file) {
      runDetection(file);
    }
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) trySetFile(dropped);
  }

  function handlePlatformClick(p: Platform) {
    setPlatform(p);
    setPlatformSelected(true);
    autoSelectClub(p);
  }

  // Filter clubs by selected platform
  const filteredClubs = platformSelected
    ? clubs.filter((c) => c.metadata?.platform === platform)
    : clubs;
  const displayClubs = filteredClubs.length > 0 ? filteredClubs : clubs;

  // Auto-select first club when filtered list changes
  useEffect(() => {
    if (platformSelected && displayClubs.length > 0) {
      if (!displayClubs.some((c) => c.id === clubId)) {
        setClubId(displayClubs[0].id);
      }
    }
  }, [platformSelected, platform]); // eslint-disable-line react-hooks/exhaustive-deps

  const canPreview = !!file && platformSelected && !!clubId;

  return (
    <div className="space-y-5">
      {/* ── Drop Zone ──────────────────────────────────────── */}
      <div>
        <label className={LABEL}>Arquivo</label>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Selecionar arquivo XLSX"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
          }}
          className={`bg-dark-900 border-2 border-dashed rounded-xl cursor-pointer text-center py-8 transition-all duration-200 ${
            dragOver
              ? 'border-poker-400 bg-poker-900/20 scale-[1.01]'
              : file
                ? 'border-poker-600/50 bg-poker-900/10'
                : 'border-dark-600 hover:border-poker-500/50 hover:bg-dark-800/30'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            aria-label="Selecionar arquivo XLSX"
            onChange={(e) => trySetFile(e.target.files?.[0] || null)}
          />
          {dragOver ? (
            <div>
              <Upload className="w-8 h-8 text-poker-400 mx-auto mb-2 animate-bounce" />
              <p className="text-poker-400 font-medium text-sm">Solte o arquivo aqui</p>
            </div>
          ) : file ? (
            <div>
              <FileSpreadsheet className="w-8 h-8 text-poker-400 mx-auto mb-2" />
              <p className="text-poker-400 font-medium text-sm">{file.name}</p>
              <p className="text-dark-500 text-xs mt-1">
                {(file.size / 1024).toFixed(0)} KB &middot; Clique para trocar
              </p>
            </div>
          ) : (
            <div>
              <Upload className="w-8 h-8 text-dark-500 mx-auto mb-2" />
              <p className="text-dark-300 font-medium text-sm">Arraste o arquivo .xlsx aqui</p>
              <p className="text-dark-500 text-xs mt-1">ou clique para selecionar</p>
            </div>
          )}
        </div>
      </div>

      {fileError && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">
          {fileError}
        </div>
      )}

      {/* ── Detection / Platform / Club ──────────────────────── */}
      {file && (
        <div className="animate-field-in">
          {detecting ? (
            <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-poker-500 animate-pulse" />
              <span className="text-dark-300 text-sm">Detectando plataforma...</span>
            </div>
          ) : detection && detection.confidence === 'high' && platformSelected ? (
            /* ── Compact auto-detect card (high confidence) ── */
            <div className="bg-dark-900 border border-green-500/50 rounded-xl p-4">
              <label className={LABEL}>Plataforma e Clube</label>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-medium text-white">
                    {PLATFORM_LABELS[platform] || platform}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-green-900/30 text-green-400 border-green-700/30">
                    auto-detectado
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPlatformSelected(false)}
                  className="text-dark-500 text-xs hover:text-dark-300 transition-colors"
                >
                  Alterar
                </button>
              </div>
              {/* Club name or inline dropdown */}
              <div className="mt-2">
                {displayClubs.length > 1 ? (
                  <select
                    value={clubId}
                    onChange={(e) => setClubId(e.target.value)}
                    className="input w-full text-sm"
                    aria-label="Selecionar clube"
                  >
                    {displayClubs.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-dark-400 text-xs">
                    Clube: <span className="text-dark-200 font-medium">{displayClubs[0]?.name || '—'}</span>
                  </p>
                )}
              </div>
            </div>
          ) : detection ? (
            /* ── Manual fallback (low confidence or "Alterar" clicked) ── */
            <div className="space-y-4">
              <div>
                <label className={LABEL}>Deteccao</label>
                <div className={`bg-dark-900 border rounded-xl p-4 ${confidenceBorder(detection.confidence)}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-white">
                      {PLATFORM_LABELS[detection.platform] || 'Desconhecido'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${confidenceBadge(detection.confidence)}`}>
                      {detection.confidence}
                    </span>
                  </div>
                  {detection.reason && (
                    <p className="text-dark-500 text-xs mt-1.5">{detection.reason}</p>
                  )}
                </div>
              </div>

              <div>
                <label className={LABEL}>Plataforma</label>
                <div className="flex gap-2">
                  {(['suprema', 'pppoker'] as Platform[]).map((p) => {
                    const isSelected = platform === p && platformSelected;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePlatformClick(p)}
                        className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 ${
                          isSelected
                            ? 'bg-poker-600/15 border-poker-500 text-poker-400'
                            : 'bg-dark-800/50 border-dark-700 text-dark-300 hover:border-dark-500'
                        }`}
                      >
                        {PLATFORM_LABELS[p]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {platformSelected && (
                <div>
                  <label className={LABEL}>Clube</label>
                  <select
                    value={clubId}
                    onChange={(e) => setClubId(e.target.value)}
                    className="input w-full"
                    aria-label="Selecionar clube"
                  >
                    {displayClubs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                        {c.metadata?.platform
                          ? ` (${PLATFORM_LABELS[c.metadata.platform] || c.metadata.platform})`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ── Week Override ──────────────────────────────────── */}
      {file && (
        <div className="animate-field-in">
          {!showWeekOverride ? (
            <button
              onClick={() => setShowWeekOverride(true)}
              className="text-dark-500 text-sm hover:text-dark-300 transition-colors flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              Definir semana manualmente
            </button>
          ) : (
            <div>
              <label className={LABEL}>Semana</label>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={weekStartOverride}
                  onChange={(e) => setWeekStartOverride(e.target.value)}
                  className="input flex-1"
                />
                <button
                  onClick={() => {
                    setShowWeekOverride(false);
                    setWeekStartOverride('');
                  }}
                  className="text-dark-500 text-xs hover:text-dark-300"
                >
                  Auto-detectar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Pre-analisar Button ──────────────────────────────── */}
      <button
        onClick={onPreview}
        disabled={!canPreview || loading}
        className="btn-primary w-full py-3 text-lg mt-2"
        aria-label="Pre-analisar arquivo"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size="sm" variant="white" />
            Analisando...
          </span>
        ) : (
          'Pre-analisar'
        )}
      </button>

      {/* ── Error Display ──────────────────────────────────── */}
      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
