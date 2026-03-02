// ══════════════════════════════════════════════════════════════════════
//  GET/POST /api/config/transaction-categories — Transaction Categories
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

// ─── Default categories (lazy-seed) ─────────────────────────────────

const DEFAULT_CATEGORIES = [
  { name: 'Rake', direction: 'in', dre_type: 'revenue', dre_group: 'receita_operacional', is_system: true, sort_order: 1 },
  { name: 'Jackpot', direction: 'in', dre_type: 'revenue', dre_group: 'receita_operacional', is_system: false, sort_order: 2 },
  { name: 'Rakeback Agente', direction: 'out', dre_type: 'expense', dre_group: 'custos_operacionais', is_system: true, sort_order: 1 },
  { name: 'Rakeback Jogador', direction: 'out', dre_type: 'expense', dre_group: 'custos_operacionais', is_system: true, sort_order: 2 },
  { name: 'Taxa App', direction: 'out', dre_type: 'expense', dre_group: 'taxas_plataforma', is_system: true, sort_order: 3 },
  { name: 'Taxa Liga', direction: 'out', dre_type: 'expense', dre_group: 'taxas_plataforma', is_system: true, sort_order: 4 },
  { name: 'Overlay', direction: 'out', dre_type: 'expense', dre_group: 'custos_operacionais', is_system: false, sort_order: 5 },
  { name: 'Compras', direction: 'out', dre_type: null, dre_group: null, is_system: false, sort_order: 6 },
  { name: 'Security', direction: 'out', dre_type: 'expense', dre_group: 'custos_operacionais', is_system: false, sort_order: 7 },
  { name: 'Pagamento Jogador', direction: 'out', dre_type: null, dre_group: null, is_system: false, sort_order: 8 },
  { name: 'Pagamento Socio', direction: 'out', dre_type: null, dre_group: null, is_system: false, sort_order: 9 },
];

async function lazySeedCategories(tenantId: string) {
  const { count } = await supabaseAdmin
    .from('transaction_categories')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  if ((count ?? 0) > 0) return;

  const rows = DEFAULT_CATEGORIES.map((c) => ({
    tenant_id: tenantId,
    ...c,
    color: '#6B7280',
  }));

  await supabaseAdmin.from('transaction_categories').insert(rows);
}

// ─── GET ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      await lazySeedCategories(ctx.tenantId);

      const { data, error } = await supabaseAdmin
        .from('transaction_categories')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .order('direction')
        .order('sort_order');

      if (error) throw error;
      return NextResponse.json({ success: true, data });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}

// ─── POST ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { name, direction, dre_type, dre_group, color, auto_match, icon } = body;

        if (!name || typeof name !== 'string') {
          return NextResponse.json(
            { success: false, error: 'Campo "name" obrigatorio' },
            { status: 400 },
          );
        }
        if (!direction || !['in', 'out'].includes(direction)) {
          return NextResponse.json(
            { success: false, error: 'Campo "direction" deve ser "in" ou "out"' },
            { status: 400 },
          );
        }

        // Get max sort_order
        const { data: maxRow } = await supabaseAdmin
          .from('transaction_categories')
          .select('sort_order')
          .eq('tenant_id', ctx.tenantId)
          .eq('direction', direction)
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle();

        const nextOrder = (maxRow?.sort_order ?? 0) + 1;

        const { data, error } = await supabaseAdmin
          .from('transaction_categories')
          .insert({
            tenant_id: ctx.tenantId,
            name: name.trim(),
            direction,
            dre_type: dre_type || null,
            dre_group: dre_group || null,
            color: color || '#6B7280',
            icon: icon || null,
            auto_match: auto_match || null,
            sort_order: nextOrder,
          })
          .select()
          .single();

        if (error) throw error;
        return NextResponse.json({ success: true, data }, { status: 201 });
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
