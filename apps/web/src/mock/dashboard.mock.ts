import type { DashboardData, ChartDataPoint } from '@/types/dashboard';

export const dashboardMock: DashboardData = {
  semanaAtual: '16/02/2026 → 22/02/2026',
  status: 'RASCUNHO',
  jogadoresAtivos: 89,
  jogadoresAnterior: 74,
  rakeTotal: 18420.5,
  rakeAnterior: 15300.0,
  despesas: {
    taxaLiga: 1842.05,
    taxaApp: 1473.64,
    ggrRodeio: 0,
    rakeback: 6420.0,
    compras: 350.0,
    security: 0,
    overlay: 200.0,
    outros: 0,
  },
  resultadoFinal: 8134.81,
  resultadoAnterior: 6200.0,
  acertoLiga: -76235.94,
  acertoLigaAnterior: -15300.0,
  resultado: -76286.94,
  totalTaxasSigned: -11343.81,
  totalLancamentos: -968.22,
  ggrRodeio: 119.25,
  ggrRodeioAnterior: 203.5,
  clubes: [
    {
      subclubId: 'mock-3bet',
      nome: '3BET',
      agentes: 6,
      jogadores: 12,
      rake: 2930.7,
      ganhos: -5200.0,
      ggr: 0,
      resultado: -2269.3,       // ganhos + rake + ggr
      acertoLiga: -2796.83,     // resultado - taxas + lancamentos
      taxas: 527.53,
      rakeback: 0,
      lancamentos: 0,
      status: 'Em Aberto',
    },
    {
      subclubId: 'mock-ch',
      nome: 'CH',
      agentes: 6,
      jogadores: 18,
      rake: 4100.2,
      ganhos: -1500.0,
      ggr: 0,
      resultado: 2600.2,        // ganhos + rake + ggr
      acertoLiga: 2072.5,       // resultado - taxas + lancamentos
      taxas: 527.7,
      rakeback: 0,
      lancamentos: 0,
      status: 'Em Aberto',
    },
    {
      subclubId: 'mock-confraria',
      nome: 'CONFRARIA',
      agentes: 5,
      jogadores: 14,
      rake: 2200.0,
      ganhos: -3000.0,
      ggr: 0,
      resultado: -800.0,        // ganhos + rake + ggr
      acertoLiga: -1100.0,      // resultado - taxas + lancamentos
      taxas: 300.0,
      rakeback: 0,
      lancamentos: 0,
      status: 'Em Aberto',
    },
    {
      subclubId: 'mock-imperio',
      nome: 'IMPERIO',
      agentes: 25,
      jogadores: 30,
      rake: 6142.35,
      ganhos: -66000.0,
      ggr: 0,
      resultado: -59857.65,     // ganhos + rake + ggr
      acertoLiga: -62954.3,     // resultado - taxas + lancamentos
      taxas: 3096.65,
      rakeback: 0,
      lancamentos: 0,
      status: 'Em Aberto',
    },
    {
      subclubId: 'mock-tgp',
      nome: 'TGP',
      agentes: 10,
      jogadores: 15,
      rake: 3047.25,
      ganhos: -51000.0,
      ggr: 0,
      resultado: -47952.75,     // ganhos + rake + ggr
      acertoLiga: -49823.2,     // resultado - taxas + lancamentos
      taxas: 1870.45,
      rakeback: 0,
      lancamentos: 0,
      status: 'Em Aberto',
    },
  ],
};

export const chartMock: ChartDataPoint[] = [
  { semana: '09/02', anterior: 74, atual: 74, rake: 15300, rakeAnterior: 14200 },
  { semana: '16/02', anterior: 74, atual: 89, rake: 18420, rakeAnterior: 15300 },
];
