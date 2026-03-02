// ══════════════════════════════════════════════════════════════════════
//  DELETE /api/tenants/[id] — Delete tenant and ALL related data
//  Only OWNER of the tenant can delete it
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/server/supabase';
import { safeErrorMessage } from '@/lib/server/apiError';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id: tenantId } = await params;

    // Validate auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'Token ausente' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authData.user) {
      return NextResponse.json({ success: false, error: 'Token invalido' }, { status: 401 });
    }

    // Verify user is OWNER of this tenant
    const { data: membership } = await supabaseAdmin
      .from('user_tenants')
      .select('role')
      .eq('user_id', authData.user.id)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (!membership || membership.role !== 'OWNER') {
      return NextResponse.json(
        { success: false, error: 'Apenas o dono pode deletar a operacao' },
        { status: 403 },
      );
    }

    // Delete ALL data for this tenant (order matters for FK constraints)
    // 1. bank_transactions
    await supabaseAdmin.from('bank_transactions').delete().eq('tenant_id', tenantId);
    // 2. ledger_entries
    await supabaseAdmin.from('ledger_entries').delete().eq('tenant_id', tenantId);
    // 3. agent_week_metrics
    await supabaseAdmin.from('agent_week_metrics').delete().eq('tenant_id', tenantId);
    // 4. player_rb_rates
    await supabaseAdmin.from('player_rb_rates').delete().eq('tenant_id', tenantId);
    // 5. agent_rb_rates
    await supabaseAdmin.from('agent_rb_rates').delete().eq('tenant_id', tenantId);
    // 6. weekly_imports
    await supabaseAdmin.from('weekly_imports').delete().eq('tenant_id', tenantId);
    // 7. settlements
    await supabaseAdmin.from('settlements').delete().eq('tenant_id', tenantId);
    // 8. player_links
    await supabaseAdmin.from('player_links').delete().eq('tenant_id', tenantId);
    // 9. players
    await supabaseAdmin.from('players').delete().eq('tenant_id', tenantId);
    // 10. user_org_access (references organizations)
    await supabaseAdmin.from('user_org_access').delete().eq('tenant_id', tenantId);
    // 11. organizations
    await supabaseAdmin.from('organizations').delete().eq('tenant_id', tenantId);
    // 12. payment_methods
    await supabaseAdmin.from('payment_methods').delete().eq('tenant_id', tenantId);
    // 13. role_permissions
    await supabaseAdmin.from('role_permissions').delete().eq('tenant_id', tenantId);
    // 14. user_tenants
    await supabaseAdmin.from('user_tenants').delete().eq('tenant_id', tenantId);
    // 15. tenant itself
    await supabaseAdmin.from('tenants').delete().eq('id', tenantId);

    // Clean up storage (logo files)
    const { data: files } = await supabaseAdmin.storage
      .from('club-logos')
      .list(tenantId);
    if (files && files.length > 0) {
      const paths = files.map((f) => `${tenantId}/${f.name}`);
      await supabaseAdmin.storage.from('club-logos').remove(paths);
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[tenants/delete] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(err, 'Erro ao deletar operacao') },
      { status: 500 },
    );
  }
}
