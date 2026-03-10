// ══════════════════════════════════════════════════════════════════════
//  Types — Caixa (Fluxo de Caixa) module
// ══════════════════════════════════════════════════════════════════════

export type TipoLancamento = 'entrada' | 'saida' | 'ajuste';

export type CategoriaLancamento =
  | 'cobranca'
  | 'pagamento_jogador'
  | 'rakeback'
  | 'despesa_operacional'
  | 'ajuste_saldo'
  | 'outros';

export type ViaLancamento = 'pix' | 'chippix' | 'rakeback_deduzido' | 'saldo_anterior' | 'outro';

export type StatusLancamento = 'pendente' | 'confirmado' | 'cancelado';

export interface CaixaLancamento {
  id: string;
  tenant_id: string;
  club_id: string;
  settlement_id: string | null;
  tipo: TipoLancamento;
  categoria: CategoriaLancamento;
  via: ViaLancamento | null;
  valor: number;
  agente_id: string | null;
  agente_nome?: string; // join
  jogador_id: string | null;
  descricao: string | null;
  status: StatusLancamento;
  data_lancamento: string;
  data_confirmacao: string | null;
  comprovante_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaixaResumo {
  total_entradas: number;
  total_saidas: number;
  saldo_liquido: number;
  total_pix: number;
  total_chippix: number;
  total_rakeback: number;
  total_saldo_anterior: number;
  recebido_confirmado: number;
  recebido_pendente: number;
  pago_confirmado: number;
  pago_pendente: number;
  qtd_pendentes: number;
  agentes_pendentes: number;
}

export interface CaixaCanal {
  via: ViaLancamento;
  total: number;
  confirmado: number;
  pendente: number;
  pct_confirmado: number;
}

export interface CaixaCreatePayload {
  club_id: string;
  settlement_id?: string;
  tipo: TipoLancamento;
  categoria: CategoriaLancamento;
  via?: ViaLancamento;
  valor: number;
  agente_id?: string;
  jogador_id?: string;
  descricao?: string;
  status?: StatusLancamento;
  data_lancamento?: string;
}

export interface CaixaUpdatePayload {
  via?: ViaLancamento;
  status?: StatusLancamento;
  descricao?: string;
  data_confirmacao?: string;
  comprovante_url?: string;
}
