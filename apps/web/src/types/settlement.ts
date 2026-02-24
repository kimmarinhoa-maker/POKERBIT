// ══════════════════════════════════════════════════════════════════════
//  Tipos TypeScript para Settlement data structures
//  Espelham as tabelas player_week_metrics / agent_week_metrics
// ══════════════════════════════════════════════════════════════════════

/** Detalhe de um pagamento individual (do ledger_entries) */
export interface PagamentoDetalhe {
  method: string | null;
  source: string | null;
  amount: number;
  description: string | null;
  created_at: string;
}

/** Row da tabela player_week_metrics (retornada pelo backend no subclub panel) */
export interface PlayerMetric {
  id: string;
  settlement_id?: string;
  player_id: string;
  agent_id: string | null;
  external_player_id: string | null;
  nickname: string | null;
  external_agent_id: string | null;
  agent_name: string | null;
  winnings_brl: number;
  rake_total_brl: number;
  net_profit_brl: number;
  ggr_brl: number;
  rb_rate: number;
  rb_value_brl: number;
  resultado_brl: number;
  games: number;
  hands: number;
  rake_breakdown?: Record<string, number>;
  // ── Carry + Pagamentos (enriched by backend) ──
  saldo_anterior?: number;
  total_pagamentos?: number;
  pagamentos_detalhe?: PagamentoDetalhe[];
  saldo_atual?: number;
  situacao?: 'a_receber' | 'a_pagar' | 'quitado';
}

/** Row da tabela agent_week_metrics */
export interface AgentMetric {
  id: string;
  settlement_id?: string;
  agent_id: string;
  agent_name: string;
  subclub_name?: string;
  player_count: number;
  rake_total_brl: number;
  ganhos_total_brl: number;
  ggr_total_brl: number;
  rb_rate: number;
  commission_brl: number;
  resultado_brl: number;
  external_agent_id?: string | null;
}

/** Subclub panel data retornada pelo GET /api/settlements/:id/full */
export interface SubclubData {
  id: string;
  name: string;
  agents: AgentMetric[];
  players: PlayerMetric[];
  totals: {
    players: number;
    agents: number;
    ganhos: number;
    rake: number;
    netProfit: number;
    ggr: number;
    rbTotal: number;
    resultado: number;
  };
  feesComputed: {
    taxaApp: number;
    taxaLiga: number;
    taxaRodeoGGR: number;
    taxaRodeoApp: number;
    totalTaxasSigned: number;
  };
  adjustments: {
    overlay: number;
    compras: number;
    security: number;
    outros: number;
    obs: string | null;
  };
  totalLancamentos: number;
  acertoLiga: number;
  acertoDirecao: string;
}

export interface SettlementFull {
  id: string;
  week_start: string;
  week_end: string;
  version: number;
  status: 'DRAFT' | 'FINAL' | 'VOID';
  club_id: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  subclubs: SubclubData[];
}
