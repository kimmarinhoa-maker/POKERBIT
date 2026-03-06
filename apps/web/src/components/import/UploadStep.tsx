import { useRef, useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Settings, CheckCircle2 } from 'lucide-react';
import Spinner from '@/components/Spinner';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export type Platform = 'suprema' | 'pppoker' | 'clubgg';

const PLATFORM_LABELS: Record<string, string> = {
  suprema: 'Suprema Poker',
  pppoker: 'PPPoker',
  clubgg: 'ClubGG',
};

export interface FilenameMeta {
  leagueId: string | null;
  clubExternalId: string | null;
  weekStart: string | null;
  weekEnd: string | null;
}

/** Extract IDs from filename pattern: LEAGUE-CLUBID-YYYYMMDD-YYYYMMDD.xlsx */
export function parseFilename(name: string): FilenameMeta {
  const match = name.match(/^(\d+)-(\d+)-(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})/);
  if (!match) return { leagueId: null, clubExternalId: null, weekStart: null, weekEnd: null };
  return {
    leagueId: match[1],
    clubExternalId: match[2],
    weekStart: `${match[3]}-${match[4]}-${match[5]}`,
    weekEnd: `${match[6]}-${match[7]}-${match[8]}`,
  };
}

interface UploadStepProps {
  file: File | null;
  setFile: (f: File | null) => void;
  platform: Platform;
  setPlatform: (p: Platform) => void;
  clubName: string;
  setClubName: (v: string) => void;
  weekStartOverride: string;
  setWeekStartOverride: (v: string) => void;
  showWeekOverride: boolean;
  setShowWeekOverride: (v: boolean) => void;
  loading: boolean;
  error: string;
  onPreview: () => void;
  onFilenameMeta?: (meta: FilenameMeta) => void;
  clubFound?: boolean;
}

const LABEL = 'text-[11px] uppercase tracking-[0.06em] text-dark-500 font-medium mb-2';

function validateFile(f: File): string | null {
  if (!f.name.endsWith('.xlsx')) return 'Apenas arquivos .xlsx sao aceitos.';
  if (f.size === 0) return 'O arquivo esta vazio.';
  if (f.size > MAX_FILE_SIZE) return `O arquivo excede o limite de 10 MB (${(f.size / 1024 / 1024).toFixed(1)} MB).`;
  return null;
}

// Detect platform by XLSX sheet names
function detectPlatform(sheetNames: string[]): Platform | null {
  const lower = sheetNames.map((s) => s.toLowerCase());

  // Suprema
  if (
    sheetNames.includes('Grand Union Member Statistics') ||
    sheetNames.includes('Manager Trade Record') ||
    sheetNames.includes('Grand Union Member Resume') ||
    lower.some((s) => s.includes('grand union'))
  ) {
    return 'suprema';
  }

  // PPPoker
  if (
    sheetNames.includes('Club Summary') ||
    sheetNames.includes('Geral') ||
    sheetNames.includes('Detalhado') ||
    sheetNames.includes('Retorno de taxa') ||
    lower.some((s) => s.includes('pppoker') || s.includes('club summary'))
  ) {
    return 'pppoker';
  }

  return null;
}

export default function UploadStep({
  file, setFile, platform, setPlatform, clubName, setClubName,
  weekStartOverride, setWeekStartOverride, showWeekOverride, setShowWeekOverride,
  loading, error, onPreview, onFilenameMeta, clubFound,
}: UploadStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [detected, setDetected] = useState(false);
  const [platformDetected, setPlatformDetected] = useState(false);
  const [showPlatformOverride, setShowPlatformOverride] = useState(false);
  const [filenameMeta, setFilenameMeta] = useState<FilenameMeta | null>(null);

  // Detect platform when file is set
  const runDetection = useCallback(async (f: File) => {
    setDetected(false);
    const fMeta = parseFilename(f.name);
    setFilenameMeta(fMeta);
    onFilenameMeta?.(fMeta);

    let sheetNames: string[] = [];
    try {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { bookSheets: true });
      sheetNames = wb.SheetNames || [];
    } catch {
      // failed
    }

    const plat = detectPlatform(sheetNames);
    if (plat) {
      setPlatform(plat);
      setPlatformDetected(true);
    } else {
      setPlatformDetected(false);
    }
    setShowPlatformOverride(false);
    setDetected(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPlatform]);

  useEffect(() => {
    if (file) runDetection(file);
  }, [file, runDetection]);

  function trySetFile(f: File | null) {
    setFileError(null);
    setDetected(false);
    setPlatformDetected(false);
    setShowPlatformOverride(false);
    setFilenameMeta(null);
    if (!f) { setFile(null); return; }
    const err = validateFile(f);
    if (err) { setFileError(err); setFile(null); return; }
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) trySetFile(dropped);
  }

  const canPreview = !!file && detected && clubName.trim().length >= 2;

  return (
    <div className="space-y-5">
      {/* ── Drop Zone ── */}
      <div>
        <label className={LABEL}>Arquivo</label>
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Selecionar arquivo XLSX"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
          className={`bg-dark-900 border-2 border-dashed rounded-xl cursor-pointer text-center py-8 transition-all duration-200 ${
            dragOver
              ? 'border-poker-400 bg-poker-900/20 scale-[1.01]'
              : file
                ? 'border-poker-600/50 bg-poker-900/10'
                : 'border-dark-600 hover:border-poker-500/50 hover:bg-dark-800/30'
          }`}
        >
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => trySetFile(e.target.files?.[0] || null)} />
          {dragOver ? (
            <div>
              <Upload className="w-8 h-8 text-poker-400 mx-auto mb-2 animate-bounce" />
              <p className="text-poker-400 font-medium text-sm">Solte o arquivo aqui</p>
            </div>
          ) : file ? (
            <div>
              <FileSpreadsheet className="w-8 h-8 text-poker-400 mx-auto mb-2" />
              <p className="text-poker-400 font-medium text-sm">{file.name}</p>
              <p className="text-dark-500 text-xs mt-1">{(file.size / 1024).toFixed(0)} KB &middot; Clique para trocar</p>
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
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">{fileError}</div>
      )}

      {/* ── Platform + Club Name + IDs ── */}
      {file && detected && (
        <div className="animate-field-in space-y-4">
          {/* Platform — auto-detected */}
          <div>
            <label className={LABEL}>Plataforma</label>
            {!showPlatformOverride ? (
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border ${
                  platformDetected
                    ? 'bg-poker-600/15 border-poker-500 text-poker-400'
                    : 'bg-amber-900/20 border-amber-600/50 text-amber-400'
                }`}>
                  {platformDetected && <CheckCircle2 className="w-4 h-4" />}
                  {PLATFORM_LABELS[platform]}
                  {!platformDetected && <span className="text-[10px] opacity-70 ml-1">(não detectado)</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setShowPlatformOverride(true)}
                  className="text-dark-500 text-xs hover:text-dark-300 transition-colors"
                >
                  Corrigir
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                {(['suprema', 'pppoker'] as Platform[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setPlatform(p); setShowPlatformOverride(false); }}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 ${
                      platform === p
                        ? 'bg-poker-600/15 border-poker-500 text-poker-400'
                        : 'bg-dark-800/50 border-dark-700 text-dark-300 hover:border-dark-500'
                    }`}
                  >
                    {PLATFORM_LABELS[p]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Club Name */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-[11px] uppercase tracking-[0.06em] text-dark-500 font-medium">Nome do Clube</label>
              {clubFound && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/30 text-green-400 border border-green-700/50">
                  Clube encontrado
                </span>
              )}
            </div>
            <input
              type="text"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              placeholder="Ex: Grupo Imperio, VIP Poker..."
              className="input w-full text-sm"
              autoFocus
            />
          </div>

          {/* Filename IDs (read-only info) */}
          {filenameMeta?.clubExternalId && (
            <div className="bg-dark-900 border border-dark-700 rounded-lg px-3 py-2">
              <p className="text-dark-400 text-xs">
                ID do Clube: <span className="text-white font-mono font-medium">{filenameMeta.clubExternalId}</span>
                {filenameMeta.leagueId && (
                  <> {' · '} Liga: <span className="text-white font-mono font-medium">{filenameMeta.leagueId}</span></>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Week Override ── */}
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
                <input type="date" value={weekStartOverride} onChange={(e) => setWeekStartOverride(e.target.value)} className="input flex-1" />
                <button onClick={() => { setShowWeekOverride(false); setWeekStartOverride(''); }} className="text-dark-500 text-xs hover:text-dark-300">
                  Auto-detectar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Pre-analisar ── */}
      <button
        onClick={onPreview}
        disabled={!canPreview || loading}
        className="btn-primary w-full py-3 text-lg mt-2"
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

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4 text-red-300 text-sm">{error}</div>
      )}
    </div>
  );
}
