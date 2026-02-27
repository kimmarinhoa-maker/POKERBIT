'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { listImports, deleteImport, formatDate } from '@/lib/api';
import { useSortable } from '@/lib/useSortable';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import TableSkeleton from '@/components/ui/TableSkeleton';
import EmptyState from '@/components/ui/EmptyState';
import { FileSpreadsheet } from 'lucide-react';

interface ImportRecord {
  id: string;
  file_name: string;
  week_start: string;
  status: string;
  player_count?: number;
  agent_count?: number;
  settlement_id?: string;
  settlement_version?: number;
  created_at: string;
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  DONE: { label: 'Concluido', cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  PROCESSING: { label: 'Processando', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  ERROR: { label: 'Erro', cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  PENDING: { label: 'Pendente', cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
};

type ImportSortKey = 'file_name' | 'week_start' | 'created_at' | 'player_count' | 'status';

export default function ImportHistoryPage() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();
  const { confirm, ConfirmDialogElement } = useConfirmDialog();

  const getImportSortValue = useCallback((imp: ImportRecord, key: ImportSortKey): string | number => {
    switch (key) {
      case 'file_name': return imp.file_name || '';
      case 'week_start': return imp.week_start || '';
      case 'created_at': return imp.created_at || '';
      case 'player_count': return imp.player_count ?? 0;
      case 'status': return imp.status || '';
    }
  }, []);

  const { sorted: sortedImports, handleSort, sortIcon, ariaSort } = useSortable<ImportRecord, ImportSortKey>({
    data: imports,
    defaultKey: 'created_at',
    getValue: getImportSortValue,
  });

  useEffect(() => {
    loadImports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadImports() {
    setLoading(true);
    try {
      const res = await listImports();
      if (res.success) {
        setImports(res.data || []);
      } else {
        toast(res.error || 'Erro ao carregar historico', 'error');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro de conexao', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(imp: ImportRecord) {
    const ok = await confirm({ title: 'Remover Importacao', message: `Remover importacao "${imp.file_name}"?\nIsso nao remove o fechamento associado.`, variant: 'danger' });
    if (!ok) return;
    setDeleting(imp.id);
    try {
      const res = await deleteImport(imp.id);
      if (res.success) {
        setImports((prev) => prev.filter((i) => i.id !== imp.id));
        toast('Importacao removida', 'success');
      } else {
        toast(res.error || 'Erro ao remover', 'error');
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Erro de conexao', 'error');
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <div>
        <div className="h-4 skeleton-shimmer rounded w-48 mb-4" />
        <TableSkeleton columns={7} rows={5} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-dark-400 text-sm">
          {imports.length} importacao{imports.length !== 1 ? 'es' : ''} registrada{imports.length !== 1 ? 's' : ''}
        </p>
      </div>

      {imports.length === 0 ? (
        <div className="card">
          <EmptyState icon={FileSpreadsheet} title="Nenhuma importacao encontrada" description="Importe sua primeira planilha na aba Nova Importacao." />
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm data-table">
            <thead>
              <tr className="bg-dark-800/50 text-dark-400 text-left text-xs uppercase tracking-wider">
                <th scope="col" className="p-3 cursor-pointer hover:text-dark-200" onClick={() => handleSort('file_name')} role="columnheader" aria-sort={ariaSort('file_name')}>Arquivo{sortIcon('file_name')}</th>
                <th scope="col" className="p-3 cursor-pointer hover:text-dark-200" onClick={() => handleSort('week_start')} role="columnheader" aria-sort={ariaSort('week_start')}>Semana{sortIcon('week_start')}</th>
                <th scope="col" className="p-3 cursor-pointer hover:text-dark-200" onClick={() => handleSort('created_at')} role="columnheader" aria-sort={ariaSort('created_at')}>Data{sortIcon('created_at')}</th>
                <th scope="col" className="p-3 text-center cursor-pointer hover:text-dark-200" onClick={() => handleSort('player_count')} role="columnheader" aria-sort={ariaSort('player_count')}>Jogadores{sortIcon('player_count')}</th>
                <th scope="col" className="p-3 text-center">Agentes</th>
                <th scope="col" className="p-3 text-center cursor-pointer hover:text-dark-200" onClick={() => handleSort('status')} role="columnheader" aria-sort={ariaSort('status')}>Status{sortIcon('status')}</th>
                <th scope="col" className="p-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50">
              {sortedImports.map((imp) => {
                const st = STATUS_STYLES[imp.status] || STATUS_STYLES.PENDING;
                return (
                  <tr key={imp.id}>
                    <td className="p-3">
                      <span className="text-dark-200 font-medium">{imp.file_name || '-'}</span>
                      {imp.settlement_version && imp.settlement_version > 1 && (
                        <span className="ml-1.5 px-1.5 py-0.5 bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 rounded text-[9px] font-bold">
                          v{imp.settlement_version}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-dark-300 font-mono text-xs">
                      {imp.week_start ? formatDate(imp.week_start) : '-'}
                    </td>
                    <td className="p-3 text-dark-400 text-xs">
                      {new Date(imp.created_at).toLocaleDateString('pt-BR')}{' '}
                      {new Date(imp.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 text-center text-dark-300 font-mono">{imp.player_count ?? '-'}</td>
                    <td className="p-3 text-center text-dark-300 font-mono">{imp.agent_count ?? '-'}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {imp.settlement_id && (
                          <Link
                            href={`/s/${imp.settlement_id}`}
                            className="text-poker-400 hover:text-poker-300 text-xs font-medium transition-colors"
                          >
                            Ver {'\u2192'}
                          </Link>
                        )}
                        <button
                          onClick={() => handleDelete(imp)}
                          disabled={deleting === imp.id}
                          className="text-dark-500 hover:text-red-400 text-xs transition-colors disabled:opacity-50"
                          title="Remover importacao"
                        >
                          {deleting === imp.id ? '\u23F3' : '\u{1F5D1}'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {ConfirmDialogElement}
    </div>
  );
}
