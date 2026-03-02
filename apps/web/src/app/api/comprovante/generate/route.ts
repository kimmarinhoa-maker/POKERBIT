import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { generateReceiptUrl } from '@/lib/server/receiptToken';
import { safeErrorMessage } from '@/lib/server/apiError';

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

      const url = generateReceiptUrl(settlementId, agentMetricId);
      return NextResponse.json({ success: true, data: { url } });
    } catch (err: unknown) {
      return NextResponse.json(
        { success: false, error: safeErrorMessage(err) },
        { status: 500 },
      );
    }
  });
}
