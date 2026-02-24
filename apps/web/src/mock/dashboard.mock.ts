import type { DashboardData, ChartDataPoint } from '@/types/dashboard';

export const dashboardMock: DashboardData = {
  semanaAtual: '16/02/2026 → 22/02/2026',
  status: 'RASCUNHO',
  jogadoresAtivos: 89,
  jogadoresAnterior: 74,
  rakeTotal: 18420.50,
  rakeAnterior: 15300.00,
  despesas: {
    taxaLiga: 1842.05,
    taxaApp: 1473.64,
    ggrRodeio: 0,
    rakeback: 6420.00,
    compras: 350.00,
    security: 0,
    overlay: 200.00,
    outros: 0,
  },
  resultadoFinal: 8134.81,
  resultadoAnterior: 6200.00,
  clubes: [
    { nome: '3BET', agentes: 6, jogadores: 12, rake: 2930.70, ganhos: -5200.00, ggr: 0, resultado: -4106.55, acertoLiga: -4634.08, taxas: 527.53, rakeback: 0, lancamentos: 0, status: 'Em Aberto' },
    { nome: 'CH', agentes: 6, jogadores: 18, rake: 4100.20, ganhos: -1500.00, ggr: 0, resultado: 3196.70, acertoLiga: 2669.00, taxas: 527.70, rakeback: 0, lancamentos: 0, status: 'Em Aberto' },
    { nome: 'CONFRARIA', agentes: 5, jogadores: 14, rake: 2200.00, ganhos: -3000.00, ggr: 0, resultado: -1800.00, acertoLiga: -2100.00, taxas: 300.00, rakeback: 0, lancamentos: 0, status: 'Em Aberto' },
    { nome: 'IMPERIO', agentes: 25, jogadores: 30, rake: 6142.35, ganhos: -66000.00, ggr: 0, resultado: -63045.70, acertoLiga: -66142.35, taxas: 3096.65, rakeback: 0, lancamentos: 0, status: 'Em Aberto' },
    { nome: 'TGP', agentes: 10, jogadores: 15, rake: 3047.25, ganhos: -51000.00, ggr: 0, resultado: -49383.60, acertoLiga: -51254.05, taxas: 1870.45, rakeback: 0, lancamentos: 0, status: 'Em Aberto' },
  ],
};

export const chartMock: ChartDataPoint[] = [
  { semana: '09/02', anterior: 74, atual: 74, rake: 15300 },
  { semana: '16/02', anterior: 74, atual: 89, rake: 18420 },
];
