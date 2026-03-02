import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';
import { randomBytes } from 'crypto';

const EXPIRY_DAYS = 30;

function generateShortId(): string {
  return randomBytes(6).toString('base64url').slice(0, 8);
}

export async function POST(req: NextRequest) {
  return withAuth(req, async ({ tenantId }) => {
    try {
      const body = await req.json();
      const { settlementId, agentMetricId } = body || {};

      if (!settlementId || !agentMetricId) {
        return NextResponse.json(
          { success: false, error: 'settlementId e agentMetricId obrigatorios' },
          { status: 400 },
        );
      }

      // Check if a link already exists for this settlement+agent
      const { data: existing } = await supabaseAdmin
        .from('receipt_links')
        .select('short_id, expires_at')
        .eq('settlement_id', settlementId)
        .eq('agent_metric_id', agentMetricId)
        .maybeSingle();

      if (existing) {
        // If not expired, reuse it
        const expiresAt = new Date(existing.expires_at);
        if (expiresAt > new Date()) {
          return NextResponse.json({
            success: true,
            data: { url: `/r/${existing.short_id}` },
          });
        }
        // Expired — delete and recreate
        await supabaseAdmin
          .from('receipt_links')
          .delete()
          .eq('settlement_id', settlementId)
          .eq('agent_metric_id', agentMetricId);
      }

      // Create new short link
      const shortId = generateShortId();
      const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400 * 1000).toISOString();

      const { error: insertErr } = await supabaseAdmin
        .from('receipt_links')
        .insert({
          short_id: shortId,
          settlement_id: settlementId,
          agent_metric_id: agentMetricId,
          tenant_id: tenantId,
          expires_at: expiresAt,
        });

      if (insertErr) {
        console.error('[generate] Insert error:', insertErr);
        return NextResponse.json(
          { success: false, error: 'Erro ao criar link' },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        data: { url: `/r/${shortId}` },
      });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
