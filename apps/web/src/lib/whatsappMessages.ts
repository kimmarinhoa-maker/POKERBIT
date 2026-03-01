import { formatBRL } from '@/lib/api';

// ─── Helper: format date range DD/MM ─────────────────────────────────
function fmtDateShort(d?: string): string {
  if (!d) return '';
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

function fmtDateFull(d?: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function dateRange(weekStart?: string, weekEnd?: string): string {
  return `${fmtDateShort(weekStart)} a ${fmtDateFull(weekEnd)}`;
}

// ─── Helper: clean phone number ──────────────────────────────────────
export function cleanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

// ─── Helper: open wa.me ──────────────────────────────────────────────
export function openWhatsApp(phone: string, message: string): void {
  const fullPhone = cleanPhone(phone);
  window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(message)}`, '_blank');
}

// ─── Individual billing message (agent) ──────────────────────────────
export function buildCobrancaMessage(opts: {
  agentName: string;
  weekStart?: string;
  weekEnd?: string;
  playersCount: number;
  rake: number;
  ganhos: number;
  resultado: number;
  saldo: number;
  pixKey?: string;
}): string {
  const { agentName, weekStart, weekEnd, playersCount, rake, ganhos, resultado, saldo, pixKey } = opts;
  const range = dateRange(weekStart, weekEnd);

  const lines = [
    `Ola *${agentName}* 👋`,
    ``,
    `Segue o fechamento semanal (*${range}*):`,
    ``,
    `📊 Jogadores: ${playersCount}`,
    `💰 Rake: ${formatBRL(rake)}`,
    `📉 Ganhos/Perdas: ${formatBRL(ganhos)}`,
    `📋 Resultado: ${formatBRL(resultado)}`,
    ``,
    `💸 *Valor a pagar: ${formatBRL(Math.abs(saldo))}*`,
    ``,
  ];

  if (pixKey) {
    lines.push(`Favor realizar o pagamento via PIX:`);
    lines.push(`Chave: ${pixKey}`);
    lines.push(``);
  }

  lines.push(`Qualquer duvida, estou a disposicao!`);
  lines.push(``);
  lines.push(`_Enviado pelo PokerBit_`);

  return lines.join('\n');
}

// ─── Club settlement message (for WhatsApp group) ───────────────────
export function buildClubMessage(opts: {
  clubName: string;
  weekStart?: string;
  weekEnd?: string;
  playersCount: number;
  rake: number;
  profitLoss: number;
  resultado: number;
  fees: {
    taxaApp: number;
    taxaAppPercent: number;
    taxaLiga: number;
    taxaLigaPercent: number;
    taxaRodeoGGR: number;
    taxaRodeoApp: number;
    totalTaxasSigned: number;
  };
  lancamentos: Array<{ nome: string; valor: number }>;
  acertoLiga: number;
}): string {
  const { clubName, weekStart, weekEnd, playersCount, rake, profitLoss, resultado, fees, lancamentos, acertoLiga } = opts;
  const range = dateRange(weekStart, weekEnd);

  const lines = [
    `📊 *FECHAMENTO SEMANAL — ${clubName}*`,
    `📅 ${range}`,
    ``,
    `👥 Jogadores: ${playersCount}`,
    `💰 Rake: ${formatBRL(rake)}`,
    `📉 P/L: ${formatBRL(profitLoss)}`,
    `📊 Resultado: ${formatBRL(resultado)}`,
    ``,
    `*Taxas:*`,
    `├ App (${fees.taxaAppPercent}%): ${formatBRL(fees.taxaApp)}`,
    `├ Liga (${fees.taxaLigaPercent}%): ${formatBRL(fees.taxaLiga)}`,
  ];

  if (fees.taxaRodeoGGR > 0) {
    lines.push(`├ Rodeo GGR: ${formatBRL(fees.taxaRodeoGGR)}`);
  }
  if (fees.taxaRodeoApp > 0) {
    lines.push(`├ Rodeo App: ${formatBRL(fees.taxaRodeoApp)}`);
  }

  lines.push(`└ Total: ${formatBRL(fees.totalTaxasSigned)}`);
  lines.push(``);

  const activeLanc = lancamentos.filter((l) => l.valor !== 0);
  if (activeLanc.length > 0) {
    lines.push(`*Lancamentos:*`);
    activeLanc.forEach((l, i) => {
      const prefix = i === activeLanc.length - 1 ? '└' : '├';
      lines.push(`${prefix} ${l.nome}: ${formatBRL(l.valor)}`);
    });
    lines.push(``);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`*ACERTO LIGA: ${formatBRL(acertoLiga)}*`);

  if (acertoLiga < 0) {
    lines.push(`${clubName} deve pagar a Liga`);
  } else {
    lines.push(`${clubName} recebe da Liga`);
  }

  lines.push(``);
  lines.push(`_Gerado pelo PokerBit em ${new Date().toLocaleString('pt-BR')}_`);

  return lines.join('\n');
}

// ─── Liga consolidated message ──────────────────────────────────────
export function buildLigaMessage(opts: {
  weekStart?: string;
  weekEnd?: string;
  totalPlayers: number;
  totalRake: number;
  totalResult: number;
  totalTaxas: number;
  clubs: Array<{ name: string; acertoLiga: number }>;
  acertoTotal: number;
}): string {
  const { weekStart, weekEnd, totalPlayers, totalRake, totalResult, totalTaxas, clubs, acertoTotal } = opts;
  const range = dateRange(weekStart, weekEnd);

  const lines = [
    `🏆 *ACERTO LIGA — CONSOLIDADO*`,
    `📅 ${range}`,
    ``,
    `👥 Jogadores: ${totalPlayers}`,
    `💰 Rake Total: ${formatBRL(totalRake)}`,
    `📊 Resultado: ${formatBRL(totalResult)}`,
    `💸 Total Taxas: ${formatBRL(totalTaxas)}`,
    ``,
    `*Por Clube:*`,
  ];

  clubs.forEach((club, i) => {
    const prefix = i === clubs.length - 1 ? '└' : '├';
    const emoji = club.acertoLiga >= 0 ? '🟢' : '🔴';
    lines.push(`${prefix} ${emoji} ${club.name}: ${formatBRL(club.acertoLiga)}`);
  });

  lines.push(``);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`*ACERTO TOTAL: ${formatBRL(acertoTotal)}*`);

  if (acertoTotal < 0) {
    lines.push(`Clube deve pagar a Liga`);
  } else {
    lines.push(`Clube recebe da Liga`);
  }

  lines.push(``);
  lines.push(`_Gerado pelo PokerBit em ${new Date().toLocaleString('pt-BR')}_`);

  return lines.join('\n');
}
