// ══════════════════════════════════════════════════════════════════════
//  POST   /api/organizations/:id/logo — Upload logo
//  DELETE /api/organizations/:id/logo — Remove logo
// ══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/server/auth';
import { safeErrorMessage } from '@/lib/server/apiError';
import { supabaseAdmin } from '@/lib/server/supabase';
import { parseFileUpload } from '@/lib/server/parseFormData';

type Params = { params: Promise<{ id: string }> };

const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const EXT_MAP: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

// ─── POST — Upload logo ─────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: orgId } = await params;

        const { file } = await parseFileUpload(req, 'logo', {
          maxSize: 2 * 1024 * 1024,
        });

        if (!file) {
          return NextResponse.json(
            { success: false, error: 'Nenhum arquivo enviado' },
            { status: 400 },
          );
        }

        if (!ALLOWED_MIMES.includes(file.mimetype)) {
          return NextResponse.json(
            { success: false, error: 'Tipo de arquivo nao permitido. Use PNG, JPEG, WebP ou SVG.' },
            { status: 400 },
          );
        }

        // Validate org belongs to tenant
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id, type, metadata')
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (!org) {
          return NextResponse.json(
            { success: false, error: 'Organizacao nao encontrada' },
            { status: 404 },
          );
        }

        const ext = EXT_MAP[file.mimetype] || '.png';
        const storagePath = `${ctx.tenantId}/${orgId}${ext}`;

        // Upload to Supabase Storage (upsert)
        const { error: uploadError } = await supabaseAdmin.storage
          .from('club-logos')
          .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });

        if (uploadError) throw uploadError;

        // Generate public URL with cache-buster
        const { data: urlData } = supabaseAdmin.storage
          .from('club-logos')
          .getPublicUrl(storagePath);

        const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`;

        // Update org metadata
        const newMetadata = { ...(org.metadata || {}), logo_url: logoUrl };
        const { data: updated, error: updateError } = await supabaseAdmin
          .from('organizations')
          .update({ metadata: newMetadata })
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId)
          .select()
          .single();

        if (updateError) throw updateError;

        return NextResponse.json({ success: true, logo_url: logoUrl, data: updated });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { permissions: ['page:clubs'] },
  );
}

// ─── DELETE — Remove logo ───────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  return withAuth(
    req,
    async (ctx) => {
      try {
        const { id: orgId } = await params;

        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id, metadata')
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId)
          .single();

        if (!org) {
          return NextResponse.json(
            { success: false, error: 'Organizacao nao encontrada' },
            { status: 404 },
          );
        }

        // Remove all possible extensions from storage
        const extensions = ['.png', '.jpg', '.webp', '.svg'];
        const paths = extensions.map((ext) => `${ctx.tenantId}/${orgId}${ext}`);
        await supabaseAdmin.storage.from('club-logos').remove(paths);

        // Remove logo_url from metadata
        const newMetadata = { ...(org.metadata || {}) };
        delete newMetadata.logo_url;

        const { error: updateError } = await supabaseAdmin
          .from('organizations')
          .update({ metadata: newMetadata })
          .eq('id', orgId)
          .eq('tenant_id', ctx.tenantId);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        return NextResponse.json(
          { success: false, error: safeErrorMessage(err) },
          { status: 500 },
        );
      }
    },
    { permissions: ['page:clubs'] },
  );
}
