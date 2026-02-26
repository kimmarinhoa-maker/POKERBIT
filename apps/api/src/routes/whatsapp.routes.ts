// ══════════════════════════════════════════════════════════════════════
//  Rotas de WhatsApp — Envio via Evolution API
// ══════════════════════════════════════════════════════════════════════

import { Router, Request, Response } from 'express';
import { requireAuth, requireTenant, requireRole } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import { safeErrorMessage } from '../utils/apiError';

const router = Router();

// ─── POST /api/whatsapp/send — Enviar imagem via Evolution API ──────
router.post('/send', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;
    const { phone, imageBase64, caption, fileName } = req.body;

    if (!phone) {
      res.status(400).json({ success: false, error: 'Telefone obrigatorio' });
      return;
    }
    if (!imageBase64) {
      res.status(400).json({ success: false, error: 'Imagem obrigatoria' });
      return;
    }

    // Fetch WhatsApp config for tenant
    const { data: config, error: cfgErr } = await supabaseAdmin
      .from('whatsapp_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (cfgErr) throw cfgErr;

    if (!config || !config.is_active) {
      res.status(400).json({ success: false, error: 'WhatsApp nao configurado. Configure em Configuracoes.' });
      return;
    }

    if (!config.api_url || !config.api_key || !config.instance_name) {
      res.status(400).json({ success: false, error: 'Configuracao incompleta. Verifique URL, API Key e Instance.' });
      return;
    }

    // Clean phone number
    const cleanPhone = String(phone).replace(/\D/g, '');

    // Build Evolution API URL
    const baseUrl = config.api_url.replace(/\/+$/, '');
    const url = `${baseUrl}/message/sendMedia/${config.instance_name}`;

    // Send via Evolution API (with 15s timeout)
    const sendController = new AbortController();
    const sendTimeout = setTimeout(() => sendController.abort(), 15000);
    let response: globalThis.Response;
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

    res.json({ success: true, data: result });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

// ─── POST /api/whatsapp/test — Testar conexao com Evolution API ─────
router.post('/test', requireAuth, requireTenant, requireRole('OWNER', 'ADMIN', 'FINANCEIRO'), async (req: Request, res: Response) => {
  try {
    const tenantId = req.tenantId!;

    const { data: config, error: cfgErr } = await supabaseAdmin
      .from('whatsapp_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (cfgErr) throw cfgErr;

    if (!config || !config.api_url || !config.api_key || !config.instance_name) {
      res.status(400).json({ success: false, error: 'Configuracao incompleta' });
      return;
    }

    const baseUrl = config.api_url.replace(/\/+$/, '');
    const url = `${baseUrl}/instance/connectionState/${config.instance_name}`;

    const testController = new AbortController();
    const testTimeout = setTimeout(() => testController.abort(), 15000);
    let response: globalThis.Response;
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

    const result = await response.json() as Record<string, any>;

    res.json({
      success: true,
      data: {
        connected: result?.instance?.state === 'open' || result?.state === 'open',
        state: result?.instance?.state || result?.state || 'unknown',
        raw: result,
      },
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: safeErrorMessage(err) });
  }
});

export default router;
