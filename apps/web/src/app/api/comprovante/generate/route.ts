import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

const EXPIRY_DAYS = 30;

function generateShortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

export async function POST(req: NextRequest) {
  return withAuth(req, async () => {
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
      const { data: existing, error: selectErr } = await supabaseAdmin
        .from('receipt_links')
        .select('id, expires_at')
        .eq('settlement_id', settlementId)
        .eq('agent_metric_id', agentMetricId)
        .maybeSingle();

      if (selectErr) {
        console.error('[generate] Select error:', selectErr);
        return NextResponse.json(
          { success: false, error: `DB select: ${selectErr.message} (code: ${selectErr.code})` },
          { status: 500 },
        );
      }

      if (existing) {
        // If not expired, reuse it
        const expiresAt = new Date(existing.expires_at);
        if (expiresAt > new Date()) {
          return NextResponse.json({
            success: true,
            data: { url: `/r/${existing.id}` },
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
          id: shortId,
          settlement_id: settlementId,
          agent_metric_id: agentMetricId,
          expires_at: expiresAt,
        });

      if (insertErr) {
        console.error('[generate] Insert error:', insertErr);

        // If unique constraint violation, try to fetch the existing row
        if (insertErr.code === '23505') {
          const { data: retry } = await supabaseAdmin
            .from('receipt_links')
            .select('id')
            .eq('settlement_id', settlementId)
            .eq('agent_metric_id', agentMetricId)
            .maybeSingle();
          if (retry?.id) {
            return NextResponse.json({
              success: true,
              data: { url: `/r/${retry.id}` },
            });
          }
        }

        return NextResponse.json(
          { success: false, error: `DB insert: ${insertErr.message} (code: ${insertErr.code})` },
          { status: 500 },
        );
      }

      return NextResponse.json({
        success: true,
        data: { url: `/r/${shortId}` },
      });
    } catch (err: unknown) {
      console.error('[generate] Exception:', err);
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
