export interface DespesasData {
  taxaLiga: number;
  taxaApp: number;
  ggrRodeio: number;
  rakeback: number;
  compras: number;
  security: number;
  overlay: number;
  outros: number;
}

export interface ClubeData {
  subclubId: string;
  nome: string;
  agentes: number;
  jogadores: number;
  rake: number;
  ganhos: number;
  ggr: number;
  resultado: number;
  acertoLiga: number;
  taxas: number;
  rakeback: number;
  lancamentos: number;
  status: 'Em Aberto' | 'Quitado';
  logoUrl?: string | null;
}

export interface ChartDataPoint {
  semana: string;
  anterior: number;
  atual: number;
  rake: number;
  rakeAnterior: number;
}

export interface DashboardData {
  semanaAtual: string;
  status: 'RASCUNHO' | 'FECHADO';
  jogadoresAtivos: number;
  jogadoresAnterior: number;
  rakeTotal: number;
  rakeAnterior: number;
  despesas: DespesasData;
  resultadoFinal: number;
  resultadoAnterior: number;
  acertoLiga?: number;
  acertoLigaAnterior?: number;
  resultado?: number;
  totalTaxasSigned?: number;
  totalLancamentos?: number;
  ggrRodeio?: number;
  ggrRodeioAnterior?: number;
  clubes: ClubeData[];
}
