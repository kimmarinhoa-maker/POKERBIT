// ══════════════════════════════════════════════════════════════════════
//  GET /api/financeiro/caixa/resumo — Summary + channel breakdown
//  Query params: settlement_id (required)
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const settlementId = url.searchParams.get('settlement_id');

      if (!settlementId) {
        return NextResponse.json({ success: false, error: 'settlement_id obrigatorio' }, { status: 400 });
      }

      // Fetch resumo
      const { data: resumoRows, error: rErr } = await supabaseAdmin
        .from('v_caixa_resumo')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('settlement_id', settlementId);

      if (rErr) throw rErr;

      const resumo = resumoRows?.[0] || {
        total_entradas: 0, total_saidas: 0, saldo_liquido: 0,
        total_pix: 0, total_chippix: 0, total_rakeback: 0, total_saldo_anterior: 0,
        recebido_confirmado: 0, recebido_pendente: 0,
        pago_confirmado: 0, pago_pendente: 0,
        qtd_pendentes: 0, agentes_pendentes: 0,
      };

      // Fetch canais
      const { data: canais, error: cErr } = await supabaseAdmin
        .from('v_caixa_por_canal')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('settlement_id', settlementId);

      if (cErr) throw cErr;

      // Fetch pendentes agrupados por agente
      const { data: pendentes, error: pErr } = await supabaseAdmin
        .from('caixa_lancamentos')
        .select('agente_id, tipo, valor, organizations!caixa_lancamentos_agente_id_fkey(name)')
        .eq('tenant_id', ctx.tenantId)
        .eq('settlement_id', settlementId)
        .eq('status', 'pendente')
        .neq('tipo', 'ajuste');

      if (pErr) throw pErr;

      // Group pendentes by agente
      const cobrancasPendentes: Record<string, { nome: string; valor: number }> = {};
      const pagamentosPendentes: Record<string, { nome: string; valor: number }> = {};

      for (const p of pendentes || []) {
        const key = p.agente_id || '_sem_agente';
        const nome = (p as any).organizations?.name || 'Sem agente';
        const target = p.tipo === 'entrada' ? cobrancasPendentes : pagamentosPendentes;
        if (!target[key]) target[key] = { nome, valor: 0 };
        target[key].valor += Number(p.valor);
      }

      return NextResponse.json({
        success: true,
        data: {
          resumo: {
            total_entradas: Number(resumo.total_entradas),
            total_saidas: Number(resumo.total_saidas),
            saldo_liquido: Number(resumo.saldo_liquido),
            total_pix: Number(resumo.total_pix),
            total_chippix: Number(resumo.total_chippix),
            total_rakeback: Number(resumo.total_rakeback),
            total_saldo_anterior: Number(resumo.total_saldo_anterior),
            recebido_confirmado: Number(resumo.recebido_confirmado),
            recebido_pendente: Number(resumo.recebido_pendente),
            pago_confirmado: Number(resumo.pago_confirmado),
            pago_pendente: Number(resumo.pago_pendente),
            qtd_pendentes: Number(resumo.qtd_pendentes),
            agentes_pendentes: Number(resumo.agentes_pendentes),
          },
          canais: (canais || []).map((c: any) => ({
            via: c.via,
            total: Number(c.total),
            confirmado: Number(c.confirmado),
            pendente: Number(c.pendente),
            pct_confirmado: Number(c.pct_confirmado),
          })),
          cobrancas_pendentes: Object.values(cobrancasPendentes).sort((a, b) => b.valor - a.valor),
          pagamentos_pendentes: Object.values(pagamentosPendentes).sort((a, b) => b.valor - a.valor),
        },
      });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}
