// ══════════════════════════════════════════════════════════════════════
//  PUT    /api/organizations/prefix-rules/:id — Update prefix rule
//  DELETE /api/organizations/prefix-rules/:id — Delete prefix rule
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

type Params = { params: Promise<{ id: string }> };

// ─── PUT — Update prefix rule ───────────────────────────────────────
const updatePrefixSchema = z.object({
  prefix: z.string().min(1).max(20).optional(),
  subclub_id: z.string().uuid().optional(),
  priority: z.number().int().optional(),
});

export async function PUT(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: ruleId } = await params;
        const body = await req.json();
        const parsed = updatePrefixSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }

        const updates: any = {};
        if (parsed.data.prefix !== undefined)
          updates.prefix = parsed.data.prefix.trim().toUpperCase();
        if (parsed.data.subclub_id !== undefined) updates.subclub_id = parsed.data.subclub_id;
        if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;

        const { data, error } = await supabaseAdmin
          .from('agent_prefix_map')
          .update(updates)
          .eq('id', ruleId)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return NextResponse.json(
              { success: false, error: 'Prefixo ja existe' },
              { status: 409 },
            );
          }
          throw error;
        }

        if (!data) {
          return NextResponse.json(
            { success: false, error: 'Regra nao encontrada' },
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

// ─── DELETE — Delete prefix rule ────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: ruleId } = await params;

        const { error } = await supabaseAdmin
          .from('agent_prefix_map')
          .delete()
          .eq('id', ruleId)
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
