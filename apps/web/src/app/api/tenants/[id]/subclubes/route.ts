// ══════════════════════════════════════════════════════════════════════
//  POST /api/tenants/[id]/subclubes — Bulk create subclubes for a tenant
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: tenantId } = await params;

  return withAuth(
    req,
    async (ctx) => {
      try {
        // Verify user is OWNER of this tenant
        if (!ctx.tenantIds.includes(tenantId)) {
          return NextResponse.json(
            { success: false, error: 'Sem acesso a este tenant' },
            { status: 403 },
          );
        }

        const roleForTenant = ctx.tenantRoles[tenantId];
        if (roleForTenant !== 'OWNER') {
          return NextResponse.json(
            { success: false, error: 'Apenas o proprietario pode criar subclubes' },
            { status: 403 },
          );
        }

        const body = await req.json();
        const { names, subclubes } = body || {};

        // Support two formats:
        // Legacy: { names: string[] }
        // New:    { subclubes: [{ name, external_id? }] }
        type SubclubeInput = { name: string; external_id?: string };
        let validItems: SubclubeInput[] = [];

        if (Array.isArray(subclubes) && subclubes.length > 0) {
          // New format
          validItems = subclubes
            .filter((s: any) => s && typeof s.name === 'string' && s.name.trim())
            .map((s: any) => ({
              name: s.name.trim(),
              external_id: s.external_id?.trim() || undefined,
            }));
        } else if (Array.isArray(names) && names.length > 0) {
          // Legacy format
          validItems = names
            .map((n: unknown) => (typeof n === 'string' ? n.trim() : ''))
            .filter((n) => n.length > 0)
            .map((name) => ({ name }));
        }

        if (validItems.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Envie pelo menos 1 nome de subclube' },
            { status: 400 },
          );
        }

        // Find CLUB org for this tenant
        const { data: club, error: clubError } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('type', 'CLUB')
          .limit(1)
          .single();

        if (clubError || !club) {
          return NextResponse.json(
            { success: false, error: 'Clube nao encontrado para este tenant' },
            { status: 404 },
          );
        }

        // Bulk insert subclubes
        const rows = validItems.map((item) => ({
          tenant_id: tenantId,
          parent_id: club.id,
          type: 'SUBCLUB' as const,
          name: item.name,
          ...(item.external_id ? { external_id: item.external_id } : {}),
        }));

        const { data, error } = await supabaseAdmin
          .from('organizations')
          .insert(rows)
          .select('id, name, type, external_id');

        if (error) throw error;

        return NextResponse.json(
          { success: true, data },
          { status: 201 },
        );
      } catch (err: unknown) {
        console.error('[tenants/subclubes] Error:', err instanceof Error ? err.message : err);
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err, 'Erro ao criar subclubes') },
          { status: 500 },
        );
      }
    },
    { skipTenant: true },
  );
}
