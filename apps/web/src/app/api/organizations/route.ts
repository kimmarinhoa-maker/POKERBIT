// ══════════════════════════════════════════════════════════════════════
//  GET  /api/organizations — List orgs (filter by ?type=)
//  POST /api/organizations — Create SUBCLUB
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

// ─── GET ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const type = req.nextUrl.searchParams.get('type');

      let query = supabaseAdmin
        .from('organizations')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('is_active', true)
        .order('type', { ascending: true })
        .order('name', { ascending: true });

      if (type) {
        const validTypes = ['CLUB', 'SUBCLUB', 'AGENT'];
        const normalizedType = type.toUpperCase();
        if (!validTypes.includes(normalizedType)) {
          return NextResponse.json(
            { success: false, error: `Tipo invalido. Use: ${validTypes.join(', ')}` },
            { status: 400 },
          );
        }
        query = query.eq('type', normalizedType);
      }

      const { data, error } = await query;
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

// ─── POST — Create SUBCLUB ──────────────────────────────────────────
const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  parent_id: z.string().uuid(),
  type: z.literal('SUBCLUB'),
  external_id: z.string().optional(),
});

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const parsed = createOrgSchema.safeParse(body);
        if (!parsed.success) {
          return NextResponse.json(
            { success: false, error: 'Dados invalidos', details: parsed.error.flatten().fieldErrors },
            { status: 400 },
          );
        }

        // Validate parent is CLUB
        const { data: parent } = await supabaseAdmin
          .from('organizations')
          .select('id, type')
          .eq('id', parsed.data.parent_id)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (!parent || parent.type !== 'CLUB') {
          return NextResponse.json(
            { success: false, error: 'Parent deve ser um CLUB valido' },
            { status: 400 },
          );
        }

        const { data, error } = await supabaseAdmin
          .from('organizations')
          .insert({
            tenant_id: ctx.tenantId,
            parent_id: parsed.data.parent_id,
            type: 'SUBCLUB',
            name: parsed.data.name.trim(),
            external_id: parsed.data.external_id?.trim() || null,
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return NextResponse.json(
              { success: false, error: 'Subclube com este nome ja existe' },
              { status: 409 },
            );
          }
          throw error;
        }

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
