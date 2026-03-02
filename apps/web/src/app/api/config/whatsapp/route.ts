// ══════════════════════════════════════════════════════════════════════
//  GET/PUT /api/config/whatsapp — WhatsApp Evolution API config
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

export async function GET(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { data, error } = await supabaseAdmin
          .from('whatsapp_config')
          .select('*')
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();

        if (error) throw error;

        return NextResponse.json({
          success: true,
          data: data || { api_url: '', api_key: '', instance_name: '', is_active: false },
        });
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

export async function PUT(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const body = await req.json();
        const { api_url, api_key, instance_name, is_active } = body;

        const { data, error } = await supabaseAdmin
          .from('whatsapp_config')
          .upsert(
            {
              tenant_id: ctx.tenantId,
              api_url: api_url || '',
              api_key: api_key || '',
              instance_name: instance_name || '',
              is_active: is_active ?? false,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'tenant_id' },
          )
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
