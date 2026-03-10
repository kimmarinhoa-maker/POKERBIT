// ══════════════════════════════════════════════════════════════════════
//  GET  /api/financeiro/caixa — List lancamentos (filtros: settlement_id, tipo, via, status)
//  POST /api/financeiro/caixa — Create lancamento
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

const VALID_TIPOS = ['entrada', 'saida', 'ajuste'];
const VALID_CATEGORIAS = ['cobranca', 'pagamento_jogador', 'rakeback', 'despesa_operacional', 'ajuste_saldo', 'outros'];
const VALID_VIAS = ['pix', 'chippix', 'rakeback_deduzido', 'saldo_anterior', 'outro'];
const VALID_STATUS = ['pendente', 'confirmado', 'cancelado'];

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const url = new URL(req.url);
      const settlementId = url.searchParams.get('settlement_id');
      const clubId = url.searchParams.get('club_id');
      const tipo = url.searchParams.get('tipo');
      const via = url.searchParams.get('via');
      const status = url.searchParams.get('status');

      let query = supabaseAdmin
        .from('caixa_lancamentos')
        .select('*, agente:organizations!caixa_lancamentos_agente_id_fkey(name)')
        .eq('tenant_id', ctx.tenantId)
        .neq('status', 'cancelado')
        .order('data_lancamento', { ascending: false })
        .order('created_at', { ascending: false });

      if (settlementId) query = query.eq('settlement_id', settlementId);
      if (clubId) query = query.eq('club_id', clubId);
      if (tipo && VALID_TIPOS.includes(tipo)) query = query.eq('tipo', tipo);
      if (via && VALID_VIAS.includes(via)) query = query.eq('via', via);
      if (status && VALID_STATUS.includes(status)) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;

      // Flatten agent name
      const result = (data || []).map((row: any) => ({
        ...row,
        agente_nome: row.agente?.name || null,
        agente: undefined,
      }));

      return NextResponse.json({ success: true, data: result });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const body = await req.json();

      // Validate required fields
      if (!body.club_id) return NextResponse.json({ success: false, error: 'club_id obrigatorio' }, { status: 400 });
      if (!body.tipo || !VALID_TIPOS.includes(body.tipo)) return NextResponse.json({ success: false, error: 'tipo invalido' }, { status: 400 });
      if (!body.categoria || !VALID_CATEGORIAS.includes(body.categoria)) return NextResponse.json({ success: false, error: 'categoria invalida' }, { status: 400 });
      if (body.valor === undefined || body.valor === null || Number(body.valor) < 0) return NextResponse.json({ success: false, error: 'valor invalido' }, { status: 400 });
      if (body.via && !VALID_VIAS.includes(body.via)) return NextResponse.json({ success: false, error: 'via invalida' }, { status: 400 });

      const insert = {
        tenant_id: ctx.tenantId,
        club_id: body.club_id,
        settlement_id: body.settlement_id || null,
        tipo: body.tipo,
        categoria: body.categoria,
        via: body.via || null,
        valor: Number(body.valor),
        agente_id: body.agente_id || null,
        jogador_id: body.jogador_id || null,
        descricao: body.descricao || null,
        status: body.status || 'pendente',
        data_lancamento: body.data_lancamento || new Date().toISOString().split('T')[0],
        created_by: ctx.userId,
      };

      const { data, error } = await supabaseAdmin
        .from('caixa_lancamentos')
        .insert(insert)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({ success: true, data }, { status: 201 });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}
