import { useRef, useState } from 'react';
import Spinner from '@/components/Spinner';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (same as backend)

export type Platform = 'suprema' | 'pppoker' | 'clubgg';

const PLATFORM_LABELS: Record<string, string> = {
  suprema: 'Suprema Poker',
  pppoker: 'PPPoker',
  clubgg: 'ClubGG',
};

const PLATFORM_HINTS: Record<string, string> = {
  suprema: 'Arquivo .xlsx com aba "Grand Union Member Resume"',
  pppoker: 'Arquivo .xlsx com aba "Geral" (relatório semanal)',
  clubgg: 'Em breve',
};

interface UploadStepProps {
  file: File | null;
  setFile: (f: File | null) => void;
  platform: Platform;
  setPlatform: (p: Platform) => void;
  clubs: Array<{ id: string; name: string; metadata?: { platform?: string } }>;
  clubId: string;
  setClubId: (id: string) => void;
  subclubs: Array<{ id: string; name: string }>;
  pppokerSubclube: string;
  setPppokerSubclube: (v: string) => void;
  weekStartOverride: string;
  setWeekStartOverride: (v: string) => void;
  showWeekOverride: boolean;
  setShowWeekOverride: (v: boolean) => void;
  hasSubclubs: boolean;
  loading: boolean;
  error: string;
  onPreview: () => void;
}

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

export default function UploadStep({
  file,
  setFile,
  platform,
  setPlatform,
  clubs,
  clubId,
  setClubId,
  subclubs,
  pppokerSubclube,
  setPppokerSubclube,
  weekStartOverride,
  setWeekStartOverride,
  showWeekOverride,
  setShowWeekOverride,
  hasSubclubs,
  loading,
  error,
  onPreview,
}: UploadStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function trySetFile(f: File | null) {
    setFileError(null);
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

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) trySetFile(dropped);
  }

  const selectedClub = clubs.find((c) => c.id === clubId);
  const derivedPlatform = selectedClub?.metadata?.platform || platform;
  const platformLabel = PLATFORM_LABELS[derivedPlatform] || derivedPlatform;
  const platformHint = PLATFORM_HINTS[derivedPlatform] || '';

  return (
    <div>
      {/* Club selector — always visible */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-dark-300 mb-2">Clube</label>
        <select
          value={clubId}
          onChange={(e) => setClubId(e.target.value)}
          className="input w-full"
          aria-label="Selecionar clube"
        >
          {clubs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.metadata?.platform ? ` (${PLATFORM_LABELS[c.metadata.platform] || c.metadata.platform})` : ''}
            </option>
          ))}
        </select>
        {/* Platform badge */}
        {selectedClub?.metadata?.platform ? (
          <p className="text-xs text-dark-500 mt-1.5 flex items-center gap-1.5">
            Parser:
            <span className="bg-poker-900/30 text-poker-400 px-2 py-0.5 rounded text-[10px] font-bold border border-poker-700/30">
              {platformLabel}
            </span>
            <span className="text-dark-600">— detectado automaticamente</span>
          </p>
        ) : (
          <div className="mt-2">
            <p className="text-xs text-amber-400 mb-1.5">Plataforma nao configurada neste clube. Selecione manualmente:</p>
            <div className="flex gap-2">
              {(['suprema', 'pppoker'] as Platform[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ${
                    platform === p
                      ? 'bg-poker-600/15 border-poker-500 text-poker-400'
                      : 'bg-dark-800/50 border-dark-700 text-dark-300 hover:border-dark-500'
                  }`}
                >
                  {PLATFORM_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* PPPoker: subclube destino (only when tenant uses subclubes) */}
      {derivedPlatform === 'pppoker' && hasSubclubs && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-dark-300 mb-1.5">Subclube destino</label>
          <select
            value={pppokerSubclube}
            onChange={(e) => setPppokerSubclube(e.target.value)}
            className="input w-full"
          >
            <option value="">Selecionar subclube...</option>
            {subclubs.map((sc) => (
              <option key={sc.id} value={sc.name}>
                {sc.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-dark-500 mt-1">No PPPoker todos os jogadores pertencem a um unico subclube</p>
        </div>
      )}

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
        className={`card border-2 border-dashed cursor-pointer text-center py-12 transition-all duration-200 ${
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
            <div className="text-4xl mb-3 animate-bounce">{'\u{1F4E5}'}</div>
            <p className="text-poker-400 font-medium">Solte o arquivo aqui</p>
          </div>
        ) : file ? (
          <div>
            <div className="text-4xl mb-3">{'\u{1F4C4}'}</div>
            <p className="text-poker-400 font-medium">{file.name}</p>
            <p className="text-dark-500 text-sm mt-1">{(file.size / 1024).toFixed(0)} KB &middot; Clique para trocar</p>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-3">{'\u{1F4E4}'}</div>
            <p className="text-dark-300 font-medium">Arraste o arquivo .xlsx aqui</p>
            <p className="text-dark-500 text-sm mt-1">ou clique para selecionar</p>
          </div>
        )}
      </div>

      {/* Format hint */}
      <p className="mt-2 text-xs text-dark-500">{platformHint}</p>

      {fileError && (
        <div className="mt-3 bg-red-900/30 border border-red-700/50 rounded-lg p-3 text-red-300 text-sm">
          {fileError}
        </div>
      )}

      {file && (
        <div className="mt-4">
          {!showWeekOverride ? (
            <button
              onClick={() => setShowWeekOverride(true)}
              className="text-dark-500 text-sm hover:text-dark-300 transition-colors"
            >
              {'\u2699\uFE0F'} Definir semana manualmente
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <label className="text-sm text-dark-400">Semana:</label>
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
                {'\u2715'} Auto-detectar
              </button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={onPreview}
        disabled={!file || loading || (derivedPlatform === 'pppoker' && hasSubclubs && !pppokerSubclube)}
        className="btn-primary w-full py-3 text-lg mt-6"
        aria-label="Pre-analisar arquivo"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner size="sm" variant="white" />
            Analisando...
          </span>
        ) : (
          '\u{1F50D} Pre-analisar'
        )}
      </button>

      {error && (
        <div className="mt-4 bg-red-900/30 border border-red-700/50 rounded-lg p-4 text-red-300 text-sm">
          {'\u274C'} {error}
        </div>
      )}
    </div>
  );
}
