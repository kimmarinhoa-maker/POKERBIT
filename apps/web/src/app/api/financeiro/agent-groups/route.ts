// ══════════════════════════════════════════════════════════════════════
//  GET /api/financeiro/agent-groups — List groups with members
//  POST /api/financeiro/agent-groups — Create group
// ══════════════════════════════════════════════════════════════════════

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';

export async function GET(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      // 1. Fetch all groups for tenant
      const { data: groups, error: gErr } = await supabaseAdmin
        .from('agent_consolidated_groups')
        .select('id, name, phone, metadata, created_at')
        .eq('tenant_id', ctx.tenantId)
        .order('name');

      if (gErr) throw gErr;

      // 2. Fetch all members with org info
      const groupIds = (groups || []).map((g: any) => g.id);
      let members: any[] = [];
      if (groupIds.length > 0) {
        const { data: mData, error: mErr } = await supabaseAdmin
          .from('agent_consolidated_members')
          .select('id, group_id, organization_id, organizations(name, metadata, parent_id)')
          .in('group_id', groupIds);

        if (mErr) throw mErr;
        members = mData || [];
      }

      // 3. Load ALL orgs for hierarchy resolution (platform lives on CLUB, not AGENT)
      const { data: allOrgs } = await supabaseAdmin
        .from('organizations')
        .select('id, name, type, parent_id, metadata')
        .eq('tenant_id', ctx.tenantId);

      const orgById = new Map<string, any>();
      for (const o of allOrgs || []) orgById.set(o.id, o);

      function findClubAncestor(orgId: string): any | null {
        const visited = new Set<string>();
        let current = orgById.get(orgId);
        while (current) {
          if (visited.has(current.id)) break;
          visited.add(current.id);
          if (current.type === 'CLUB') return current;
          if (!current.parent_id) break;
          current = orgById.get(current.parent_id);
        }
        return null;
      }

      // 4. Assemble result
      const result = (groups || []).map((g: any) => {
        const gMembers = members
          .filter((m: any) => m.group_id === g.id)
          .map((m: any) => {
            const org = m.organizations || {};
            const club = findClubAncestor(m.organization_id);
            return {
              id: m.id,
              organization_id: m.organization_id,
              org_name: org.name || '?',
              platform: (club?.metadata?.platform || 'outro').toLowerCase(),
              club_name: club?.name || '',
            };
          });

        return {
          id: g.id,
          name: g.name,
          phone: g.phone,
          members: gMembers,
        };
      });

      return NextResponse.json({ success: true, data: result });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}

export async function POST(req: NextRequest) {
  return withAuth(req, async (ctx) => {
    try {
      const body = await req.json();
      const name = (body.name || '').trim();
      if (!name) {
        return NextResponse.json({ success: false, error: 'Nome obrigatorio' }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from('agent_consolidated_groups')
        .insert({
          tenant_id: ctx.tenantId,
          name,
          phone: body.phone || null,
          metadata: body.metadata || {},
        })
        .select('id, name, phone')
        .single();

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ success: false, error: 'Ja existe um grupo com esse nome' }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({ success: true, data: { ...data, members: [] } }, { status: 201 });
    } catch (err: unknown) {
      return NextResponse.json({ success: false, error: safeErrorMessage(err) }, { status: 500 });
    }
  });
}
