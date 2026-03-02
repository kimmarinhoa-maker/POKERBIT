// ══════════════════════════════════════════════════════════════════════
//  PUT    /api/organizations/:id — Edit SUBCLUB
//  DELETE /api/organizations/:id — Delete SUBCLUB
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

type Params = { params: Promise<{ id: string }> };

// ─── PUT — Edit SUBCLUB ─────────────────────────────────────────────
const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  external_id: z.string().optional(),
  is_active: z.boolean().optional(),
  whatsapp_group_link: z.string().max(255).nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: orgId } = await params;
        const body = await req.json();
        const parsed = updateOrgSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }

        const { data: existing } = await supabaseAdmin
          .from('organizations')
          .select('id, type')
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (!existing) {
          return NextResponse.json(
            { success: false, error: 'Organizacao nao encontrada' },
            { status: 404 },
          );
        }
        if (existing.type !== 'SUBCLUB') {
          return NextResponse.json(
            { success: false, error: 'Apenas subclubes podem ser editados' },
            { status: 400 },
          );
        }

        const updates: any = {};
        if (parsed.data.name !== undefined) updates.name = parsed.data.name.trim();
        if (parsed.data.external_id !== undefined)
          updates.external_id = parsed.data.external_id.trim() || null;
        if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;
        if (parsed.data.whatsapp_group_link !== undefined)
          updates.whatsapp_group_link = parsed.data.whatsapp_group_link || null;

        const { data, error } = await supabaseAdmin
          .from('organizations')
          .update(updates)
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (error) throw error;
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

// ─── DELETE — Delete SUBCLUB ────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: orgId } = await params;

        const { data: existing } = await supabaseAdmin
          .from('organizations')
          .select('id, type')
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (!existing) {
          return NextResponse.json(
            { success: false, error: 'Organizacao nao encontrada' },
            { status: 404 },
          );
        }
        if (existing.type !== 'SUBCLUB') {
          return NextResponse.json(
            { success: false, error: 'Apenas subclubes podem ser deletados' },
            { status: 400 },
          );
        }

        // Check for child agents
        const { count } = await supabaseAdmin
          .from('organizations')
          .select('id', { count: 'exact', head: true })
          .eq('parent_id', orgId)
          .eq('tenant_id', ctx.tenantId);

        if (count && count > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Subclube possui ${count} agente(s) vinculado(s). Desative em vez de deletar.`,
            },
            { status: 409 },
          );
        }

        const { error } = await supabaseAdmin
          .from('organizations')
          .delete()
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId);

        if (error) throw error;
        return NextResponse.json({ success: true });
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
