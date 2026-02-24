'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listImports, formatDate } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';

interface ImportRecord {
  id: string;
  file_name: string;
  week_start: string;
  status: string;
  player_count?: number;
  agent_count?: number;
  settlement_id?: string;
  created_at: string;
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  DONE:       { label: 'Concluido',  cls: 'bg-green-500/20 text-green-400 border-green-500/40' },
  PROCESSING: { label: 'Processando', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' },
  ERROR:      { label: 'Erro',        cls: 'bg-red-500/20 text-red-400 border-red-500/40' },
  PENDING:    { label: 'Pendente',    cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40' },
};

export default function ImportHistoryPage() {
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadImports();
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
    } catch (err: any) {
      toast(err.message || 'Erro de conexao', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-dark-800 flex items-center justify-center text-3xl">
            {'\u{1F4CB}'}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Historico de Importacoes</h2>
            <p className="text-dark-400 text-sm">
              {imports.length} importacao{imports.length !== 1 ? 'es' : ''} registrada{imports.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Link href="/import" className="btn-primary text-sm px-4 py-2">
          Nova Importacao
        </Link>
      </div>

      {imports.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">{'\u{1F4E4}'}</div>
          <p className="text-dark-400 text-lg mb-2">Nenhuma importacao encontrada</p>
          <p className="text-dark-500 text-sm mb-6">
            Importe sua primeira planilha para comecar.
          </p>
          <Link href="/import" className="btn-primary text-sm px-6 py-2.5">
            Importar Planilha
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-dark-800/50 text-dark-400 text-left text-xs uppercase tracking-wider">
                <th className="p-3">Arquivo</th>
                <th className="p-3">Semana</th>
                <th className="p-3">Data</th>
                <th className="p-3 text-center">Jogadores</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Acao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-700/50">
              {imports.map((imp) => {
                const st = STATUS_STYLES[imp.status] || STATUS_STYLES.PENDING;
                return (
                  <tr key={imp.id} className="hover:bg-dark-800/30 transition-colors">
                    <td className="p-3">
                      <span className="text-dark-200 font-medium">{imp.file_name || '-'}</span>
                    </td>
                    <td className="p-3 text-dark-300 font-mono text-xs">
                      {imp.week_start ? formatDate(imp.week_start) : '-'}
                    </td>
                    <td className="p-3 text-dark-400 text-xs">
                      {new Date(imp.created_at).toLocaleDateString('pt-BR')}{' '}
                      {new Date(imp.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3 text-center text-dark-300 font-mono">
                      {imp.player_count ?? '-'}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.cls}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      {imp.settlement_id ? (
                        <Link
                          href={`/s/${imp.settlement_id}`}
                          className="text-poker-400 hover:text-poker-300 text-xs font-medium transition-colors"
                        >
                          Ver Fechamento {'\u2192'}
                        </Link>
                      ) : (
                        <span className="text-dark-600 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
