// ══════════════════════════════════════════════════════════════════════
//  POST /api/links/player — Link individual player to subclub
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

const playerLinkSchema = z.object({
  external_player_id: z.string().min(1),
  subclub_id: z.string().uuid(),
  agent_external_id: z.string().optional(),
  agent_name: z.string().optional(),
});

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const parsed = playerLinkSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }

        const { external_player_id, subclub_id, agent_external_id, agent_name } = parsed.data;

        const { data, error } = await supabaseAdmin
          .from('player_links')
          .upsert(
            {
              tenant_id: ctx.tenantId,
              external_player_id,
              subclub_id,
              agent_external_id: agent_external_id || null,
              agent_name: agent_name || null,
            },
            { onConflict: 'tenant_id,external_player_id' },
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
