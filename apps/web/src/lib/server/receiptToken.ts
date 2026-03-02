// ══════════════════════════════════════════════════════════════════════
//  Receipt Token — HMAC-SHA256 signed URLs for public comprovante access
//  No database state needed. Token = HMAC(secret, settlementId:agentMetricId:expiry)
// ══════════════════════════════════════════════════════════════════════

import { createHmac, timingSafeEqual } from 'crypto';

const EXPIRY_DAYS = 30;

function getSecret(): string {
  const secret = process.env.RECEIPT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('RECEIPT_TOKEN_SECRET ou SUPABASE_SERVICE_ROLE_KEY deve estar configurado');
  return secret;
}

function sign(settlementId: string, agentMetricId: string, expiry: number): string {
  const payload = `${settlementId}:${agentMetricId}:${expiry}`;
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

/**
 * Generate a signed receipt URL (server-only).
 * Returns the path portion: /comprovante/{sid}/{aid}?e={expiry}&sig={hmac}
 */
export function generateReceiptUrl(settlementId: string, agentMetricId: string): string {
  const expiry = Math.floor(Date.now() / 1000) + EXPIRY_DAYS * 86400;
  const sig = sign(settlementId, agentMetricId, expiry);
  return `/comprovante/${settlementId}/${agentMetricId}?e=${expiry}&sig=${sig}`;
}

/**
 * Validate an HMAC-signed receipt token.
 * Returns true if signature matches and token is not expired.
 */
export function validateReceiptToken(
  settlementId: string,
  agentMetricId: string,
  expiry: string,
  sig: string,
): boolean {
  const expiryNum = parseInt(expiry, 10);
  if (isNaN(expiryNum)) return false;

  // Check expiry
  if (Math.floor(Date.now() / 1000) > expiryNum) return false;

  // Timing-safe comparison
  const expected = sign(settlementId, agentMetricId, expiryNum);
  try {
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
