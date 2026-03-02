// ══════════════════════════════════════════════════════════════════════
//  POST /api/links/agent — Link agent to subclub
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

const agentLinkSchema = z.object({
  agent_name: z.string().min(1),
  subclub_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const parsed = agentLinkSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }

        const { agent_name, subclub_id } = parsed.data;

        const { data, error } = await supabaseAdmin
          .from('agent_manual_links')
          .upsert(
            {
              tenant_id: ctx.tenantId,
              agent_name: agent_name.toUpperCase().trim(),
              subclub_id,
            },
            { onConflict: 'tenant_id,agent_name' },
          )
          .select('*, organizations!inner(name)')
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
