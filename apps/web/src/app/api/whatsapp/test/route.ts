// ══════════════════════════════════════════════════════════════════════
//  POST /api/whatsapp/test — Test Evolution API connection
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function POST(req: NextRequest) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { data: config, error: cfgErr } = await supabaseAdmin
          .from('whatsapp_config')
          .select('*')
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();

        if (cfgErr) throw cfgErr;

        if (!config || !config.api_url || !config.api_key || !config.instance_name) {
          return NextResponse.json(
            { success: false, error: 'Configuracao incompleta' },
            { status: 400 },
          );
        }

        const baseUrl = config.api_url.replace(/\/+$/, '');
        const url = `${baseUrl}/instance/connectionState/${config.instance_name}`;

        const testController = new AbortController();
        const testTimeout = setTimeout(() => testController.abort(), 15000);
        let response: Response;
        try {
          response = await fetch(url, {
            method: 'GET',
            headers: { apikey: config.api_key },
            signal: testController.signal,
          });
        } finally {
          clearTimeout(testTimeout);
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Evolution API error ${response.status}: ${errText}`);
        }

        const result = (await response.json()) as Record<string, any>;

        return NextResponse.json({
          success: true,
          data: {
            connected:
              result?.instance?.state === 'open' || result?.state === 'open',
            state: result?.instance?.state || result?.state || 'unknown',
            raw: result,
          },
        });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { roles: ['OWNER', 'ADMIN', 'FINANCEIRO'] },
  );
}
