// ══════════════════════════════════════════════════════════════════════
//  PATCH  /api/financeiro/caixa/[id] — Update lancamento (status, via, etc)
//  DELETE /api/financeiro/caixa/[id] — Cancel lancamento
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(req, async (ctx) => {
    try {
      const { id } = await params;
      const body = await req.json();

      const update: Record<string, any> = {};

      if (body.status) update.status = body.status;
      if (body.via) update.via = body.via;
      if (body.descricao !== undefined) update.descricao = body.descricao;
      if (body.comprovante_url !== undefined) update.comprovante_url = body.comprovante_url;

      // Auto-set data_confirmacao when confirming
      if (body.status === 'confirmado') {
        update.data_confirmacao = new Date().toISOString();
      }

      if (Object.keys(update).length === 0) {
        return NextResponse.json({ success: false, error: 'Nenhum campo para atualizar' }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from('caixa_lancamentos')
        .update(update)
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .select()
        .single();

      if (error) throw error;
      if (!data) return NextResponse.json({ success: false, error: 'Lancamento nao encontrado' }, { status: 404 });

      return NextResponse.json({ success: true, data });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(req, async (ctx) => {
    try {
      const { id } = await params;

      // Soft-delete: set status to cancelado
      const { error } = await supabaseAdmin
        .from('caixa_lancamentos')
        .update({ status: 'cancelado' })
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId);

      if (error) throw error;

      return NextResponse.json({ success: true });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}
