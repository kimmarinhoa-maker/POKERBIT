// ══════════════════════════════════════════════════════════════════════
//  PUT/DELETE /api/config/transaction-categories/:id
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

// ─── PUT ─────────────────────────────────────────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;
        const body = await req.json();
        const { name, direction, dre_type, dre_group, color, auto_match, icon, sort_order } = body;

        const update: Record<string, unknown> = {};
        if (name !== undefined) update.name = name.trim();
        if (direction !== undefined) update.direction = direction;
        if (dre_type !== undefined) update.dre_type = dre_type || null;
        if (dre_group !== undefined) update.dre_group = dre_group || null;
        if (color !== undefined) update.color = color || '#6B7280';
        if (auto_match !== undefined) update.auto_match = auto_match || null;
        if (icon !== undefined) update.icon = icon || null;
        if (sort_order !== undefined) update.sort_order = sort_order;

        const { data, error } = await supabaseAdmin
          .from('transaction_categories')
          .update(update)
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (error) throw error;
        if (!data) {
          return NextResponse.json(
            { success: false, error: 'Categoria nao encontrada' },
            { status: 404 },
          );
        }
        return NextResponse.json({ success: true, data });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'] },
  );
}

// ─── DELETE ──────────────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id } = await params;

        // Check if is_system
        const { data: existing } = await supabaseAdmin
          .from('transaction_categories')
          .select('is_system')
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();

        if (!existing) {
          return NextResponse.json(
            { success: false, error: 'Categoria nao encontrada' },
            { status: 404 },
          );
        }
        if (existing.is_system) {
          return NextResponse.json(
            { success: false, error: 'Categorias do sistema nao podem ser excluidas' },
            { status: 403 },
          );
        }

        const { error } = await supabaseAdmin
          .from('transaction_categories')
          .delete()
          .eq('id', id)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;
        return NextResponse.json({ success: true, data: { deleted: true } });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'] },
  );
}
