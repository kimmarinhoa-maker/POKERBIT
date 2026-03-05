// ══════════════════════════════════════════════════════════════════════
//  GET /api/ledger/categorized-totals — Totais por categoria (DRE)
//  Agrupa ledger entries por transaction_category e retorna totais
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const weekStart = req.nextUrl.searchParams.get('week_start');

      if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        return NextResponse.json(
          { success: false, error: 'Query param week_start obrigatorio (YYYY-MM-DD)' },
          { status: 400 },
        );
      }

      // Buscar categorias do tenant
      const { data: categories } = await supabaseAdmin
        .from('transaction_categories')
        .select('id, name, dre_type, dre_group, color')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true);

      // Buscar ledger entries da semana que tem category_id
      const { data: entries } = await supabaseAdmin
        .from('ledger_entries')
        .select('category_id, dir, amount')
        .eq('tenant_id', ctx.tenantId)
        .eq('week_start', weekStart)
        .not('category_id', 'is', null);

      // Agrupar totais por categoria
      const totalsMap: Record<string, number> = {};
      for (const entry of entries || []) {
        if (!entry.category_id) continue;
        const amount = Number(entry.amount) || 0;
        const signed = entry.dir === 'IN' ? amount : -amount;
        totalsMap[entry.category_id] = (totalsMap[entry.category_id] || 0) + signed;
      }

      // Montar resultado com dados da categoria
      const result = (categories || [])
        .map((cat) => ({
          category_id: cat.id,
          name: cat.name,
          dre_type: cat.dre_type || null,
          dre_group: cat.dre_group || null,
          color: cat.color || '#6b7280',
          total: Math.round(((totalsMap[cat.id] || 0) + Number.EPSILON) * 100) / 100,
        }))
        .filter((c) => c.total !== 0);

      return NextResponse.json({ success: true, data: result });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
