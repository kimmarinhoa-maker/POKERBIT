// ══════════════════════════════════════════════════════════════════════
//  GET  /api/organizations/prefix-rules — List prefix rules
//  POST /api/organizations/prefix-rules — Create prefix rule
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';
import { logAudit } from '@/lib/server/audit';

// ─── GET ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('agent_prefix_map')
        .select(
          `
          id, prefix, priority, is_active,
          organizations!inner(id, name)
        `,
        )
        .eq('tenant_id', ctx.tenantId)
        .order('priority', { ascending: false });

      if (error) throw error;

      return NextResponse.json({ success: true, data: data || [] });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}

// ─── POST — Create prefix rule ──────────────────────────────────────
const prefixRuleSchema = z.object({
  prefix: z.string().min(1).max(20),
  subclub_id: z.string().uuid(),
  priority: z.number().int().default(0),
});

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const parsed = prefixRuleSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }

        const { data, error } = await supabaseAdmin
          .from('agent_prefix_map')
          .insert({
            tenant_id: ctx.tenantId,
            prefix: parsed.data.prefix.toUpperCase(),
            subclub_id: parsed.data.subclub_id,
            priority: parsed.data.priority,
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return NextResponse.json(
              { success: false, error: 'Prefixo ja existe para este tenant' },
              { status: 409 },
            );
          }
          throw error;
        }

        logAudit(req, ctx, 'CREATE', 'prefix_rule', data.id, undefined, parsed.data);
        return NextResponse.json({ success: true, data }, { status: 201 });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN'], permissions: ['page:clubs'] },
  );
}
