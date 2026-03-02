// ══════════════════════════════════════════════════════════════════════
//  POST /api/whatsapp/send — Send image via Evolution API
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
        const body = await req.json();
        const { phone, imageBase64, caption, fileName } = body;

        if (!phone) {
          return NextResponse.json(
            { success: false, error: 'Telefone obrigatorio' },
            { status: 400 },
          );
        }
        if (!imageBase64) {
          return NextResponse.json(
            { success: false, error: 'Imagem obrigatoria' },
            { status: 400 },
          );
        }

        // Fetch WhatsApp config
        const { data: config, error: cfgErr } = await supabaseAdmin
          .from('whatsapp_config')
          .select('*')
          .eq('tenant_id', ctx.tenantId)
          .maybeSingle();

        if (cfgErr) throw cfgErr;

        if (!config || !config.is_active) {
          return NextResponse.json(
            { success: false, error: 'WhatsApp nao configurado. Configure em Configuracoes.' },
            { status: 400 },
          );
        }

        if (!config.api_url || !config.api_key || !config.instance_name) {
          return NextResponse.json(
            { success: false, error: 'Configuracao incompleta. Verifique URL, API Key e Instance.' },
            { status: 400 },
          );
        }

        const cleanPhone = String(phone).replace(/\D/g, '');
        const baseUrl = config.api_url.replace(/\/+$/, '');
        const url = `${baseUrl}/message/sendMedia/${config.instance_name}`;

        const sendController = new AbortController();
        const sendTimeout = setTimeout(() => sendController.abort(), 15000);
        let response: Response;
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: config.api_key,
            },
            body: JSON.stringify({
              number: cleanPhone,
              mediatype: 'image',
              media: imageBase64,
              caption: caption || '',
              fileName: fileName || 'comprovante.png',
            }),
            signal: sendController.signal,
          });
        } finally {
          clearTimeout(sendTimeout);
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Evolution API error ${response.status}: ${errText}`);
        }

        const result = await response.json();
        return NextResponse.json({ success: true, data: result });
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
