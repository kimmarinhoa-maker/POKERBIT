'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  listCaixaLancamentos,
  getCaixaResumo,
  createCaixaLancamento,
  updateCaixaLancamento,
  deleteCaixaLancamento,
  formatBRL,
  invalidateCache,
} from '@/lib/api';
import { round2 } from '@/lib/formatters';
import { useSortable } from '@/lib/useSortable';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/lib/useAuth';
import EmptyState from '@/components/ui/EmptyState';
import Highlight from '@/components/ui/Highlight';
import SettlementSkeleton from '@/components/ui/SettlementSkeleton';
import { Wallet, Plus, X, Check, AlertTriangle } from 'lucide-react';
import type {
  CaixaLancamento,
  CaixaResumo,
  CaixaCanal,
  CaixaCreatePayload,
  TipoLancamento,
  ViaLancamento,
  StatusLancamento,
  CategoriaLancamento,
} from '@/types/caixa';

// ─── Props ──────────────────────────────────────────────────────────

interface Props {
  settlementId: string;
  clubId: string;
  weekStart: string;
  /** P&L total dos jogadores (ganhos do settlement, valor absoluto) */
  plTotal: number;
  agentCount: number;
  settlementStatus: string;
  onDataChange: () => void;
}

// ─── Channel config ─────────────────────────────────────────────────

const CANAIS: Record<string, { label: string; letter: string; color: string; bg: string; border: string }> = {
  pix:               { label: 'PIX',               letter: '₱', color: '#06b6d4', bg: 'rgba(6,182,212,0.08)',  border: 'rgba(6,182,212,0.25)' },
  chippix:           { label: 'ChipPix',           letter: 'C', color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)' },
  rakeback_deduzido: { label: 'Rakeback Deduzido', letter: 'R', color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
  saldo_anterior:    { label: 'Saldo Anterior',    letter: 'S', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)' },
};

const CATEGORIA_LABELS: Record<CategoriaLancamento, string> = {
  cobranca: 'Cobranca',
  pagamento_jogador: 'Pagamento Jogador',
  rakeback: 'Rakeback',
  despesa_operacional: 'Despesa Operacional',
  ajuste_saldo: 'Ajuste Saldo',
  outros: 'Outros',
};

type FilterTipo = 'all' | TipoLancamento;
type FilterVia = 'all' | ViaLancamento;
type FilterStatus = 'all' | 'pendente' | 'confirmado';

// ─── Helpers ────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return '';
  const parts = d.split('-');
  return `${parts[2]}/${parts[1]}`;
}

// ─── Component ──────────────────────────────────────────────────────

export default function CaixaLancamentosTab({
  settlementId, clubId, weekStart, plTotal, agentCount, settlementStatus, onDataChange,
}: Props) {
  const { toast } = useToast();
  const { canAccess } = useAuth();
  const canEdit = canAccess('OWNER', 'ADMIN', 'FINANCEIRO');
  const isDraft = settlementStatus === 'DRAFT';
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Data
  const [lancamentos, setLancamentos] = useState<CaixaLancamento[]>([]);
  const [resumo, setResumo] = useState<CaixaResumo | null>(null);
  const [canais, setCanais] = useState<CaixaCanal[]>([]);
  const [cobrancasPendentes, setCobrancasPendentes] = useState<Array<{ nome: string; valor: number }>>([]);
  const [pagamentosPendentes, setPagamentosPendentes] = useState<Array<{ nome: string; valor: number }>>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterTipo, setFilterTipo] = useState<FilterTipo>('all');
  const [filterVia, setFilterVia] = useState<FilterVia>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [lancRes, resumoRes] = await Promise.all([
        listCaixaLancamentos({ settlement_id: settlementId }),
        getCaixaResumo(settlementId),
      ]);
      if (!mountedRef.current) return;

      if (lancRes.success) setLancamentos(lancRes.data || []);
      if (resumoRes.success && resumoRes.data) {
        setResumo(resumoRes.data.resumo);
        setCanais(resumoRes.data.canais || []);
        setCobrancasPendentes(resumoRes.data.cobrancas_pendentes || []);
        setPagamentosPendentes(resumoRes.data.pagamentos_pendentes || []);
      }
    } catch {
      if (mountedRef.current) toast('Erro ao carregar dados do caixa', 'error');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [settlementId, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Computed
  const recebido = resumo?.recebido_confirmado ?? 0;
  const faltaReceber = Math.max(0, plTotal - recebido);
  const pctRecebido = plTotal > 0 ? round2((recebido / plTotal) * 100) : 0;
  const pctFalta = plTotal > 0 ? round2((faltaReceber / plTotal) * 100) : 0;

  // Filter lancamentos
  const filtered = useMemo(() => {
    let result = lancamentos;
    if (filterTipo !== 'all') result = result.filter((l) => l.tipo === filterTipo);
    if (filterVia !== 'all') result = result.filter((l) => l.via === filterVia);
    if (filterStatus !== 'all') result = result.filter((l) => l.status === filterStatus);
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (l) =>
          (l.agente_nome || '').toLowerCase().includes(s) ||
          (l.descricao || '').toLowerCase().includes(s),
      );
    }
    return result;
  }, [lancamentos, filterTipo, filterVia, filterStatus, search]);

  // Sort
  type SortKey = 'data' | 'tipo' | 'agente' | 'via' | 'status' | 'valor';
  const getSortValue = useCallback((l: CaixaLancamento, key: SortKey): string | number => {
    switch (key) {
      case 'data': return l.data_lancamento;
      case 'tipo': return l.tipo;
      case 'agente': return l.agente_nome || l.descricao || '';
      case 'via': return l.via || '';
      case 'status': return l.status;
      case 'valor': return l.valor * (l.tipo === 'saida' ? -1 : 1);
    }
  }, []);

  const { sorted, handleSort, sortIcon, ariaSort } = useSortable<CaixaLancamento, SortKey>({
    data: filtered,
    defaultKey: 'data',
    getValue: getSortValue,
  });

  // Actions
  const handleConfirm = useCallback(async (id: string) => {
    const res = await updateCaixaLancamento(id, { status: 'confirmado' });
    if (res.success) {
      toast('Lancamento confirmado', 'success');
      invalidateCache('/financeiro/caixa');
      loadData();
      onDataChange();
    } else {
      toast(res.error || 'Erro', 'error');
    }
  }, [toast, loadData, onDataChange]);

  const handleCancel = useCallback(async (id: string) => {
    const res = await deleteCaixaLancamento(id);
    if (res.success) {
      toast('Lancamento cancelado', 'success');
      invalidateCache('/financeiro/caixa');
      loadData();
      onDataChange();
    } else {
      toast(res.error || 'Erro', 'error');
    }
  }, [toast, loadData, onDataChange]);

  // Resultado
  const totalEntradas = resumo?.total_entradas ?? 0;
  const totalSaidas = resumo?.total_saidas ?? 0;
  const lucroLiquido = round2(totalEntradas - totalSaidas);

  if (loading) return <SettlementSkeleton kpis={3} />;

  return (
    <div>

      {/* Header + Novo Lancamento */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-bold text-white">Fluxo de Caixa</h3>
          <p className="text-dark-500 text-xs">
            Rastreamento de recebimentos e pagamentos por canal
          </p>
        </div>
        {isDraft && canEdit && (
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 rounded-lg bg-poker-600/20 text-poker-400 border border-poker-700/40 text-xs font-medium hover:bg-poker-600/30 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Lancamento
          </button>
        )}
      </div>

      {/* ─── Hero KPIs ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        {/* P&L Total */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-red-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">P&L Jogadores</p>
            <p className="text-xl font-bold font-mono text-white">{formatBRL(plTotal)}</p>
            <p className="text-[10px] text-dark-500 mt-0.5">Resultado da semana • {agentCount} agentes</p>
          </div>
        </div>

        {/* Ja Recebido */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-poker-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Ja Recebido</p>
            <p className="text-xl font-bold font-mono text-poker-400">{formatBRL(recebido)}</p>
            <p className="text-[10px] text-dark-500 mt-0.5">{pctRecebido}% do total</p>
            <div className="w-full bg-dark-800 rounded-full h-1 mt-1.5">
              <div className="h-1 rounded-full bg-poker-500 transition-all duration-700" style={{ width: `${Math.min(pctRecebido, 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Falta Receber */}
        <div className="bg-dark-900 border border-dark-700 rounded-xl overflow-hidden">
          <div className="h-0.5 bg-yellow-500" />
          <div className="p-4">
            <p className="text-[10px] text-dark-500 uppercase tracking-widest font-bold mb-1">Falta Receber</p>
            <p className="text-xl font-bold font-mono text-yellow-400">{formatBRL(faltaReceber)}</p>
            <p className="text-[10px] text-dark-500 mt-0.5">{pctFalta}% pendente • {resumo?.agentes_pendentes ?? 0} agentes</p>
            <div className="w-full bg-dark-800 rounded-full h-1 mt-1.5">
              <div className="h-1 rounded-full bg-yellow-500 transition-all duration-700" style={{ width: `${Math.min(pctFalta, 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Canal Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {(['pix', 'chippix', 'rakeback_deduzido', 'saldo_anterior'] as ViaLancamento[]).map((via) => {
          const cfg = CANAIS[via];
          const canal = canais.find((c) => c.via === via);
          const total = canal?.total ?? 0;
          const confirmado = canal?.confirmado ?? 0;
          const pendente = canal?.pendente ?? 0;
          const pct = plTotal > 0 ? round2((total / plTotal) * 100) : 0;
          const pctConf = total > 0 ? round2((confirmado / total) * 100) : 0;

          return (
            <div key={via} className="bg-dark-900 border border-dark-700 rounded-xl p-3 hover:border-dark-600 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold"
                    style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}
                  >
                    {cfg.letter}
                  </div>
                  <span className="text-xs font-medium text-white">{cfg.label}</span>
                </div>
                <span className="text-[10px] text-dark-500 font-mono">{pct}%</span>
              </div>
              <p className="text-sm font-bold font-mono text-white mb-1">{formatBRL(total)}</p>
              <div className="text-[10px] text-dark-500 flex items-center gap-1 flex-wrap">
                <span className="text-poker-400">{formatBRL(confirmado)}</span>
                <span>ok</span>
                <span className="text-dark-600">•</span>
                <span className="text-yellow-400">{formatBRL(pendente)}</span>
                <span>pend.</span>
              </div>
              <div className="w-full bg-dark-800 rounded-full h-1 mt-2">
                <div
                  className="h-1 rounded-full transition-all duration-500"
                  style={{ width: `${pctConf}%`, backgroundColor: `${cfg.color}60` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Two Column: Table + Sidebar ────────────────────────── */}
      <div className="flex gap-4">

        {/* Left: Table */}
        <div className="flex-1 min-w-0">
          {/* Filters */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 max-w-[200px] bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-1.5 text-xs text-white placeholder-dark-500 focus:border-poker-500 focus:outline-none"
            />
            <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value as FilterTipo)} className="bg-dark-800 border border-dark-700/50 rounded-lg px-2 py-1.5 text-xs text-dark-200 focus:border-poker-500 focus:outline-none">
              <option value="all">Tipo: Todos</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saidas</option>
              <option value="ajuste">Ajustes</option>
            </select>
            <select value={filterVia} onChange={(e) => setFilterVia(e.target.value as FilterVia)} className="bg-dark-800 border border-dark-700/50 rounded-lg px-2 py-1.5 text-xs text-dark-200 focus:border-poker-500 focus:outline-none">
              <option value="all">Via: Todas</option>
              <option value="pix">PIX</option>
              <option value="chippix">ChipPix</option>
              <option value="rakeback_deduzido">Rakeback</option>
              <option value="saldo_anterior">Saldo Ant.</option>
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)} className="bg-dark-800 border border-dark-700/50 rounded-lg px-2 py-1.5 text-xs text-dark-200 focus:border-poker-500 focus:outline-none">
              <option value="all">Status: Todos</option>
              <option value="pendente">Pendente</option>
              <option value="confirmado">Confirmado</option>
            </select>
          </div>

          {/* Table */}
          {sorted.length === 0 ? (
            <div className="card">
              <EmptyState icon={Wallet} title="Nenhum lancamento" description="Clique em 'Novo Lancamento' para registrar recebimentos e pagamentos." />
            </div>
          ) : (
            <div className="card overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm data-table">
                  <thead>
                    <tr className="bg-dark-800/50">
                      <th className="px-3 py-2.5 text-left font-medium text-[10px] text-dark-400 uppercase cursor-pointer hover:text-dark-200" onClick={() => handleSort('data')} aria-sort={ariaSort('data')}>Data{sortIcon('data')}</th>
                      <th className="px-2 py-2.5 text-center font-medium text-[10px] text-dark-400 uppercase">Tipo</th>
                      <th className="px-3 py-2.5 text-left font-medium text-[10px] text-dark-400 uppercase cursor-pointer hover:text-dark-200" onClick={() => handleSort('agente')} aria-sort={ariaSort('agente')}>Agente{sortIcon('agente')}</th>
                      <th className="px-2 py-2.5 text-center font-medium text-[10px] text-dark-400 uppercase">Via</th>
                      <th className="px-2 py-2.5 text-center font-medium text-[10px] text-dark-400 uppercase">Status</th>
                      <th className="px-3 py-2.5 text-right font-medium text-[10px] text-dark-400 uppercase cursor-pointer hover:text-dark-200" onClick={() => handleSort('valor')} aria-sort={ariaSort('valor')}>Valor{sortIcon('valor')}</th>
                      {isDraft && canEdit && <th className="px-2 py-2.5 text-center font-medium text-[10px] text-dark-400 w-16">Acoes</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800/50">
                    {sorted.map((l) => {
                      const isEntrada = l.tipo === 'entrada';
                      const isSaida = l.tipo === 'saida';
                      const viaCfg = l.via ? CANAIS[l.via] : null;

                      return (
                        <tr key={l.id} className="hover:bg-dark-800/30">
                          <td className="px-3 py-2 text-dark-300 text-xs font-mono">{fmtDate(l.data_lancamento)}</td>
                          <td className="px-2 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                              isEntrada ? 'bg-poker-900/20 text-poker-400 border-poker-700/30' :
                              isSaida ? 'bg-red-900/20 text-red-400 border-red-700/30' :
                              'bg-blue-900/20 text-blue-400 border-blue-700/30'
                            }`}>
                              {isEntrada ? '▲' : isSaida ? '▼' : '↔'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-white text-xs truncate max-w-[180px]">
                            <Highlight text={l.agente_nome || l.descricao || CATEGORIA_LABELS[l.categoria]} query={search} />
                          </td>
                          <td className="px-2 py-2 text-center">
                            {viaCfg ? (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold" style={{ background: viaCfg.bg, color: viaCfg.color, border: `1px solid ${viaCfg.border}` }}>
                                {viaCfg.label}
                              </span>
                            ) : <span className="text-dark-600 text-[10px]">—</span>}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${
                              l.status === 'confirmado' ? 'bg-poker-900/20 text-poker-400 border-poker-700/30' : 'bg-yellow-900/20 text-yellow-400 border-yellow-700/30'
                            }`}>
                              {l.status === 'confirmado' ? 'OK' : 'Pend.'}
                            </span>
                          </td>
                          <td className={`px-3 py-2 text-right font-mono font-medium text-xs ${
                            isEntrada ? 'text-poker-400' : isSaida ? 'text-red-400' : 'text-blue-400'
                          }`}>
                            {isEntrada ? '+' : isSaida ? '\u2212' : ''}{formatBRL(l.valor)}
                          </td>
                          {isDraft && canEdit && (
                            <td className="px-2 py-2 text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                {l.status === 'pendente' && (
                                  <button onClick={() => handleConfirm(l.id)} className="p-0.5 rounded hover:bg-poker-900/30 text-dark-500 hover:text-poker-400 transition-colors" title="Confirmar">
                                    <Check className="w-3 h-3" />
                                  </button>
                                )}
                                <button onClick={() => handleCancel(l.id)} className="p-0.5 rounded hover:bg-red-900/30 text-dark-500 hover:text-red-400 transition-colors" title="Cancelar">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="px-3 py-2 bg-dark-800/30 flex items-center justify-between border-t border-dark-800/50">
                <span className="text-[10px] text-dark-400">{filtered.length} lancamento{filtered.length !== 1 ? 's' : ''}</span>
                <div className="flex items-center gap-4 text-[10px] font-mono">
                  <span className="text-poker-400">IN: {formatBRL(filtered.filter(l => l.tipo === 'entrada').reduce((s, l) => s + l.valor, 0))}</span>
                  <span className="text-red-400">OUT: {formatBRL(filtered.filter(l => l.tipo === 'saida').reduce((s, l) => s + l.valor, 0))}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Sidebar */}
        <div className="w-[280px] flex-shrink-0 space-y-3 hidden xl:block">

          {/* Fluxo Visual */}
          <div className="card p-3">
            <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-3">Fluxo do Dinheiro</h4>
            {(['pix', 'chippix', 'rakeback_deduzido', 'saldo_anterior'] as ViaLancamento[]).map((via) => {
              const cfg = CANAIS[via];
              const canal = canais.find(c => c.via === via);
              const total = canal?.total ?? 0;
              const pct = plTotal > 0 ? round2((total / plTotal) * 100) : 0;
              return (
                <div key={via} className="mb-2.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-dark-400">{cfg.label}</span>
                    <span className="text-[10px] font-mono text-dark-300">{formatBRL(total)}</span>
                  </div>
                  <div className="w-full bg-dark-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cfg.color }} />
                  </div>
                </div>
              );
            })}
            <div className="border-t border-dark-700/50 pt-2 mt-2">
              <div className="text-[9px] text-dark-500 uppercase tracking-wider font-bold text-center mb-1">CAIXA DO CLUBE</div>
              <div className="w-full bg-dark-800 rounded-full h-2">
                <div className="h-2 rounded-full bg-poker-500 transition-all duration-500" style={{ width: `${Math.min(pctRecebido, 100)}%` }} />
              </div>
              <div className="text-center text-[10px] text-dark-400 mt-0.5 font-mono">{pctRecebido}%</div>
            </div>
          </div>

          {/* Cobrancas Pendentes */}
          {cobrancasPendentes.length > 0 && (
            <div className="card p-3">
              <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-yellow-500" />
                Cobrancas Pendentes
              </h4>
              <div className="space-y-1.5">
                {cobrancasPendentes.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-dark-300 truncate max-w-[140px]">{p.nome}</span>
                    <span className="text-xs font-mono text-yellow-400">{formatBRL(p.valor)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dark-700/50 pt-1.5 mt-2 flex items-center justify-between">
                <span className="text-[10px] text-dark-500 font-bold">Total</span>
                <span className="text-xs font-mono font-bold text-yellow-400">
                  {formatBRL(cobrancasPendentes.reduce((s, p) => s + p.valor, 0))}
                </span>
              </div>
            </div>
          )}

          {/* Pagamentos Pendentes */}
          {pagamentosPendentes.length > 0 && (
            <div className="card p-3">
              <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-2">Pagamentos Pendentes</h4>
              <div className="space-y-1.5">
                {pagamentosPendentes.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-dark-300 truncate max-w-[140px]">{p.nome}</span>
                    <span className="text-xs font-mono text-red-400">{formatBRL(p.valor)}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dark-700/50 pt-1.5 mt-2 flex items-center justify-between">
                <span className="text-[10px] text-dark-500 font-bold">Total</span>
                <span className="text-xs font-mono font-bold text-red-400">
                  {formatBRL(pagamentosPendentes.reduce((s, p) => s + p.valor, 0))}
                </span>
              </div>
            </div>
          )}

          {/* Resultado */}
          <div className="card p-3">
            <h4 className="text-[10px] font-bold text-dark-400 uppercase tracking-wider mb-2">Resultado</h4>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-dark-400">Recebimentos</span>
                <span className="font-mono text-poker-400">{formatBRL(totalEntradas)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-400">(-) Pagamentos</span>
                <span className="font-mono text-red-400">{formatBRL(totalSaidas)}</span>
              </div>
            </div>
            <div className="border-t border-dark-700/50 pt-2 mt-2 flex items-center justify-between">
              <span className="text-xs font-bold text-white">Liquido</span>
              <span className={`text-lg font-bold font-mono ${lucroLiquido >= 0 ? 'text-poker-400' : 'text-red-400'}`}>
                {formatBRL(lucroLiquido)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Modal: Novo Lancamento ─────────────────────────────── */}
      {showModal && (
        <NovoLancamentoModal
          clubId={clubId}
          settlementId={settlementId}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            invalidateCache('/financeiro/caixa');
            loadData();
            onDataChange();
          }}
        />
      )}
    </div>
  );
}

// ─── Novo Lancamento Modal ──────────────────────────────────────────

function NovoLancamentoModal({
  clubId, settlementId, onClose, onCreated,
}: {
  clubId: string;
  settlementId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState<TipoLancamento>('entrada');
  const [categoria, setCategoria] = useState<CategoriaLancamento>('cobranca');
  const [via, setVia] = useState<ViaLancamento | ''>('');
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');

  const handleSave = async () => {
    const numVal = Number(valor.replace(',', '.'));
    if (!numVal || numVal <= 0) { toast('Valor invalido', 'error'); return; }

    setSaving(true);
    try {
      const res = await createCaixaLancamento({
        club_id: clubId,
        settlement_id: settlementId,
        tipo,
        categoria,
        valor: numVal,
        descricao: descricao || undefined,
        via: via || undefined,
      });
      if (res.success) { toast('Lancamento criado', 'success'); onCreated(); }
      else toast(res.error || 'Erro', 'error');
    } catch { toast('Erro ao criar lancamento', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-dark-900 border border-dark-700 rounded-xl shadow-modal w-full max-w-md animate-scale-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-700/50">
          <h3 className="text-white font-semibold">Novo Lancamento</h3>
          <button onClick={onClose} className="text-dark-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1">Tipo</label>
            <div className="flex gap-2">
              {(['entrada', 'saida', 'ajuste'] as TipoLancamento[]).map((t) => (
                <button key={t} onClick={() => setTipo(t)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
                    tipo === t
                      ? t === 'entrada' ? 'bg-poker-900/30 text-poker-400 border-poker-700/40'
                      : t === 'saida' ? 'bg-red-900/30 text-red-400 border-red-700/40'
                      : 'bg-blue-900/30 text-blue-400 border-blue-700/40'
                      : 'bg-dark-800 text-dark-400 border-dark-700/50 hover:bg-dark-700/50'
                  }`}>
                  {t === 'entrada' ? '▲ Entrada' : t === 'saida' ? '▼ Saida' : '↔ Ajuste'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1">Categoria</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaLancamento)} className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-poker-500 focus:outline-none">
              {Object.entries(CATEGORIA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1">Via / Canal</label>
            <select value={via} onChange={(e) => setVia(e.target.value as ViaLancamento | '')} className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-poker-500 focus:outline-none">
              <option value="">Selecionar...</option>
              <option value="pix">PIX</option>
              <option value="chippix">ChipPix</option>
              <option value="rakeback_deduzido">Rakeback Deduzido</option>
              <option value="saldo_anterior">Saldo Anterior</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1">Valor (R$)</label>
            <input type="text" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-poker-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-xs text-dark-400 font-medium block mb-1">Descricao</label>
            <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descricao opcional" className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white focus:border-poker-500 focus:outline-none" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-dark-700/50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-dark-800 text-dark-300 text-sm hover:bg-dark-700 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 rounded-lg bg-poker-600/20 text-poker-400 border border-poker-700/40 text-sm font-medium hover:bg-poker-600/30 transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Criar Lancamento'}
          </button>
        </div>
      </div>
    </div>
  );
}
