import { useRef, useState } from 'react';
import Spinner from '@/components/Spinner';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB (same as backend)

interface UploadStepProps {
  file: File | null;
  setFile: (f: File | null) => void;
  clubs: Array<{ id: string; name: string }>;
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
  file, setFile, clubs, clubId, setClubId,
  weekStartOverride, setWeekStartOverride,
  showWeekOverride, setShowWeekOverride,
  loading, error, onPreview,
}: UploadStepProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function trySetFile(f: File | null) {
    setFileError(null);
    if (!f) { setFile(null); return; }
    const err = validateFile(f);
    if (err) { setFileError(err); setFile(null); return; }
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) trySetFile(dropped);
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Importar XLSX</h2>
      <p className="text-dark-400 mb-6">A semana sera detectada automaticamente a partir da planilha</p>

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onDragEnter={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Selecionar arquivo XLSX"
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
        className={`card border-2 border-dashed cursor-pointer text-center py-12 transition-all duration-200 ${
          file
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
        {file ? (
          <div>
            <div className="text-4xl mb-3">{'\u{1F4C4}'}</div>
            <p className="text-poker-400 font-medium">{file.name}</p>
            <p className="text-dark-500 text-sm mt-1">
              {(file.size / 1024).toFixed(0)} KB &middot; Clique para trocar
            </p>
          </div>
        ) : (
          <div>
            <div className="text-4xl mb-3">{'\u{1F4E4}'}</div>
            <p className="text-dark-300 font-medium">Arraste o arquivo .xlsx aqui</p>
            <p className="text-dark-500 text-sm mt-1">ou clique para selecionar</p>
          </div>
        )}
      </div>

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
                onClick={() => { setShowWeekOverride(false); setWeekStartOverride(''); }}
                className="text-dark-500 text-xs hover:text-dark-300"
              >
                {'\u2715'} Auto-detectar
              </button>
            </div>
          )}
        </div>
      )}

      {clubs.length > 1 && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-dark-300 mb-1.5">Clube</label>
          <select
            value={clubId}
            onChange={(e) => setClubId(e.target.value)}
            className="input w-full"
          >
            {clubs.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={onPreview}
        disabled={!file || loading}
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
