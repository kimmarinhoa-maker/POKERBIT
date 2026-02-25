import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/testApp';

// ── Mock services ────────────────────────────────────────────────────
const mockImportService = {
  processImport: vi.fn(),
};

const mockPreviewService = {
  preview: vi.fn(),
};

class MockConfirmError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ConfirmError';
  }
}

const mockConfirmService = {
  confirm: vi.fn(),
};

vi.mock('../../services/import.service', () => ({
  importService: mockImportService,
}));

vi.mock('../../services/importPreview.service', () => ({
  importPreviewService: mockPreviewService,
}));

vi.mock('../../services/importConfirm.service', () => ({
  importConfirmService: mockConfirmService,
  ConfirmError: MockConfirmError,
}));

// Mock supabase (used directly in GET /imports and GET /imports/:id)
const mockChain: any = {};
['select', 'insert', 'update', 'delete', 'eq', 'is', 'single', 'order', 'limit', 'range'].forEach((m) => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.then = (resolve: (value: any) => any) => {
  resolve(mockChain._result || { data: [], error: null });
  return mockChain;
};
mockChain._result = { data: [], error: null };

vi.mock('../../config/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => mockChain),
  },
}));

// Mock auth middleware to pass through
vi.mock('../../middleware/auth', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireTenant: (_req: any, _res: any, next: any) => next(),
  requireRole:
    (..._roles: string[]) =>
    (_req: any, _res: any, next: any) =>
      next(),
}));

const importRoutes = (await import('../../routes/import.routes')).default;

// ── Tests ────────────────────────────────────────────────────────────
describe('Import Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChain._result = { data: [], error: null };
  });

  // ─── POST /api/imports/preview ────────────────────────────────────
  describe('POST /api/imports/preview', () => {
    it('sem arquivo → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).post('/api/imports/preview');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('XLSX');
    });

    it('com arquivo valido → preview shape', async () => {
      mockPreviewService.preview.mockResolvedValue({
        summary: { total: 10, ok: 8, missing: 2 },
        blockers: [],
        weekStart: '2024-01-01',
      });
      mockChain._result = { data: [{ id: 'sub1', name: 'IMPERIO' }], error: null };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).post('/api/imports/preview').attach('file', Buffer.from('fake xlsx'), {
        filename: 'test.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toBeDefined();
    });
  });

  // ─── POST /api/imports/confirm ────────────────────────────────────
  describe('POST /api/imports/confirm', () => {
    it('sem arquivo → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).post('/api/imports/confirm');
      expect(res.status).toBe(400);
    });

    it('blockers → status definido por ConfirmError', async () => {
      mockConfirmService.confirm.mockRejectedValue(new MockConfirmError('Há blockers pendentes', 409));

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports/confirm')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-01-01')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
      expect(res.status).toBe(409);
    });

    it('sucesso → 201 com settlement_id', async () => {
      mockConfirmService.confirm.mockResolvedValue({
        settlement_id: 'set-1',
        import_id: 'imp-1',
      });

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports/confirm')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-01-01')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
      expect(res.status).toBe(201);
      expect(res.body.data.settlement_id).toBe('set-1');
    });
  });

  // ─── GET /api/imports ─────────────────────────────────────────────
  describe('GET /api/imports', () => {
    it('lista importacoes', async () => {
      mockChain._result = { data: [{ id: 'imp-1' }, { id: 'imp-2' }], error: null, count: 2 };
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('erro do banco → 500', async () => {
      mockChain._result = { data: null, error: { message: 'DB error' } };
      // Override then to simulate throw
      const originalThen = mockChain.then;
      mockChain.then = (resolve: (value: any) => any) => {
        resolve({ data: null, error: { message: 'DB error' } });
        return mockChain;
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports');
      // The route throws on error
      expect(res.status).toBe(500);

      mockChain.then = originalThen;
    });
  });

  // ─── DELETE /api/imports/:id ────────────────────────────────────
  describe('DELETE /api/imports/:id', () => {
    it('import existente → 200', async () => {
      // First call: select (find import) → returns found
      // Second call: delete → returns success
      let callCount = 0;
      const originalThen = mockChain.then;
      mockChain.then = (resolve: (value: any) => any) => {
        callCount++;
        if (callCount <= 1) {
          // select/single → found
          resolve({ data: { id: 'imp-1', settlement_id: 's-1' }, error: null });
        } else {
          // delete → ok
          resolve({ data: null, error: null });
        }
        return mockChain;
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).delete('/api/imports/imp-1');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      mockChain.then = originalThen;
    });

    it('import nao encontrado → 404', async () => {
      const originalThen = mockChain.then;
      mockChain.then = (resolve: (value: any) => any) => {
        resolve({ data: null, error: { code: 'PGRST116', message: 'not found' } });
        return mockChain;
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).delete('/api/imports/not-found');
      expect(res.status).toBe(404);

      mockChain.then = originalThen;
    });
  });

  // ════════════════════════════════════════════════════════════════════
  //  COMPREHENSIVE E2E-STYLE TESTS — Import Wizard Flow
  // ════════════════════════════════════════════════════════════════════

  // ─── POST /api/imports/preview — Extended ──────────────────────────
  describe('POST /api/imports/preview — extended', () => {
    it('retorna available_subclubs do tenant na resposta', async () => {
      mockPreviewService.preview.mockResolvedValue({
        summary: { total: 5, ok: 5, missing: 0 },
        blockers: [],
        weekStart: '2024-03-04',
      });
      mockChain._result = {
        data: [
          { id: 'sub1', name: 'IMPERIO' },
          { id: 'sub2', name: 'FENIX' },
        ],
        error: null,
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).post('/api/imports/preview').attach('file', Buffer.from('fake xlsx'), {
        filename: 'report.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.available_subclubs).toHaveLength(2);
      expect(res.body.data.available_subclubs[0].name).toBe('IMPERIO');
      expect(res.body.data.available_subclubs[1].name).toBe('FENIX');
    });

    it('passa week_start override para o service', async () => {
      mockPreviewService.preview.mockResolvedValue({
        summary: { total: 3, ok: 3, missing: 0 },
        blockers: [],
        weekStart: '2024-06-10',
      });
      mockChain._result = { data: [], error: null };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports/preview')
        .field('week_start', '2024-06-10')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(200);
      expect(mockPreviewService.preview).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant-id',
          weekStartOverride: '2024-06-10',
        }),
      );
    });

    it('preview retorna blockers → 200 com blockers array', async () => {
      mockPreviewService.preview.mockResolvedValue({
        summary: { total: 10, ok: 6, missing: 4 },
        blockers: ['Jogador "XPTO" sem subclube vinculado', 'Agente "ABC" nao cadastrado'],
        weekStart: '2024-01-01',
      });
      mockChain._result = { data: [], error: null };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).post('/api/imports/preview').attach('file', Buffer.from('fake xlsx'), {
        filename: 'test.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.blockers).toHaveLength(2);
      expect(res.body.data.summary.missing).toBe(4);
    });

    it('service lanca erro → 500', async () => {
      mockPreviewService.preview.mockRejectedValue(new Error('Planilha corrompida'));
      mockChain._result = { data: [], error: null };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).post('/api/imports/preview').attach('file', Buffer.from('fake xlsx'), {
        filename: 'bad.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Planilha corrompida');
    });

    it('sem campo file no multipart → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      // Send multipart without a file field
      const res = await request(app).post('/api/imports/preview').field('week_start', '2024-01-01');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('XLSX');
    });
  });

  // ─── POST /api/imports/confirm — Extended ──────────────────────────
  describe('POST /api/imports/confirm — extended', () => {
    it('sem club_id → 400 com detalhes de validacao', async () => {
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports/confirm')
        .field('week_start', '2024-01-01')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('club_id');
    });

    it('sem week_start → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports/confirm')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('week_start');
    });

    it('club_id nao-uuid → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports/confirm')
        .field('club_id', 'not-a-uuid')
        .field('week_start', '2024-01-01')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.details).toBeDefined();
    });

    it('week_start formato invalido → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports/confirm')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '01-01-2024') // wrong format
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('sucesso → retorna import_id e settlement_id', async () => {
      mockConfirmService.confirm.mockResolvedValue({
        settlement_id: 'set-abc',
        import_id: 'imp-xyz',
        players_created: 12,
        agents_synced: 3,
      });

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports/confirm')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-03-04')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'week_report.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settlement_id).toBe('set-abc');
      expect(res.body.data.import_id).toBe('imp-xyz');
      expect(res.body.data.players_created).toBe(12);
    });

    it('service lanca erro generico → 500', async () => {
      mockConfirmService.confirm.mockRejectedValue(new Error('Timeout ao gravar'));

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports/confirm')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-01-01')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Timeout ao gravar');
    });

    it('ConfirmError com status 422 → 422', async () => {
      mockConfirmService.confirm.mockRejectedValue(new MockConfirmError('Dados inconsistentes', 422));

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports/confirm')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-01-01')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(422);
      expect(res.body.error).toBe('Dados inconsistentes');
    });

    it('confirm passa parametros corretos ao service', async () => {
      mockConfirmService.confirm.mockResolvedValue({
        settlement_id: 'set-1',
        import_id: 'imp-1',
      });

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      await request(app)
        .post('/api/imports/confirm')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-07-15')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'myfile.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(mockConfirmService.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant-id',
          clubId: '550e8400-e29b-41d4-a716-446655440000',
          weekStart: '2024-07-15',
          fileName: 'myfile.xlsx',
          uploadedBy: 'test-user-id',
        }),
      );
    });
  });

  // ─── GET /api/imports — Extended (Pagination) ──────────────────────
  describe('GET /api/imports — pagination', () => {
    it('retorna meta com paginacao', async () => {
      mockChain._result = { data: [{ id: 'imp-1' }], error: null, count: 5 };
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports?page=1&limit=2');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.total).toBe(5);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(2);
      expect(res.body.meta.pages).toBe(3); // ceil(5/2) = 3
    });

    it('page=2 com limit=1 → calcula offset correto', async () => {
      mockChain._result = { data: [{ id: 'imp-2' }], error: null, count: 3 };
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports?page=2&limit=1');

      expect(res.status).toBe(200);
      expect(res.body.meta.page).toBe(2);
      expect(res.body.meta.limit).toBe(1);
      expect(res.body.meta.pages).toBe(3);
      // Verify range was called with correct offset (page-1)*limit = 1, and 1+1-1 = 1
      expect(mockChain.range).toHaveBeenCalledWith(1, 1);
    });

    it('sem query params → defaults page=1 limit=50', async () => {
      mockChain._result = { data: [], error: null, count: 0 };
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports');

      expect(res.status).toBe(200);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.limit).toBe(50);
      expect(res.body.meta.pages).toBe(0);
      expect(mockChain.range).toHaveBeenCalledWith(0, 49);
    });

    it('limit > 100 → capped a 100', async () => {
      mockChain._result = { data: [], error: null, count: 0 };
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      await request(app).get('/api/imports?limit=500');

      expect(mockChain.range).toHaveBeenCalledWith(0, 99);
    });

    it('page negativo → forced a 1', async () => {
      mockChain._result = { data: [], error: null, count: 0 };
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports?page=-5');

      expect(res.status).toBe(200);
      expect(res.body.meta.page).toBe(1);
    });

    it('lista vazia → 200 com array vazio e total 0', async () => {
      mockChain._result = { data: [], error: null, count: 0 };
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    it('data null do supabase → retorna array vazio', async () => {
      mockChain._result = { data: null, error: null, count: null };
      // Need to not throw — route handles null data with `data || []`
      const originalThen = mockChain.then;
      mockChain.then = (resolve: (value: any) => any) => {
        resolve({ data: null, error: null, count: null });
        return mockChain;
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports');

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);

      mockChain.then = originalThen;
    });
  });

  // ─── GET /api/imports/:id — Detalhe de um import ──────────────────
  describe('GET /api/imports/:id', () => {
    it('import encontrado → 200 com dados', async () => {
      const originalThen = mockChain.then;
      mockChain.then = (resolve: (value: any) => any) => {
        resolve({
          data: {
            id: 'imp-1',
            tenant_id: 'test-tenant-id',
            file_name: 'report.xlsx',
            settlement_id: 'set-1',
            created_at: '2024-01-01T12:00:00Z',
            status: 'completed',
          },
          error: null,
        });
        return mockChain;
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports/imp-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('imp-1');
      expect(res.body.data.file_name).toBe('report.xlsx');
      expect(res.body.data.settlement_id).toBe('set-1');

      mockChain.then = originalThen;
    });

    it('import nao encontrado → 404', async () => {
      const originalThen = mockChain.then;
      mockChain.then = (resolve: (value: any) => any) => {
        resolve({ data: null, error: { code: 'PGRST116', message: 'not found' } });
        return mockChain;
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports/nonexistent-id');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('não encontrado');

      mockChain.then = originalThen;
    });

    it('data null sem error → 404', async () => {
      const originalThen = mockChain.then;
      mockChain.then = (resolve: (value: any) => any) => {
        resolve({ data: null, error: null });
        return mockChain;
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports/imp-gone');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);

      mockChain.then = originalThen;
    });

    it('erro do banco → 500', async () => {
      const originalThen = mockChain.then;
      mockChain.then = (_resolve: any, _reject: any) => {
        // Simulate an unhandled throw by making .single() throw
        throw new Error('connection refused');
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).get('/api/imports/imp-1');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);

      mockChain.then = originalThen;
    });
  });

  // ─── DELETE /api/imports/:id — Extended ────────────────────────────
  describe('DELETE /api/imports/:id — extended', () => {
    it('delete com erro no banco na etapa de exclusao → 500', async () => {
      let callCount = 0;
      const originalThen = mockChain.then;
      mockChain.then = (resolve: (value: any) => any) => {
        callCount++;
        if (callCount <= 1) {
          // select/single → found
          resolve({ data: { id: 'imp-1', settlement_id: 's-1' }, error: null });
        } else {
          // delete → error
          resolve({ data: null, error: { message: 'FK constraint violation' } });
        }
        return mockChain;
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).delete('/api/imports/imp-1');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('FK constraint');

      mockChain.then = originalThen;
    });

    it('resposta de sucesso inclui success: true', async () => {
      let callCount = 0;
      const originalThen = mockChain.then;
      mockChain.then = (resolve: (value: any) => any) => {
        callCount++;
        if (callCount <= 1) {
          resolve({ data: { id: 'imp-2', settlement_id: 's-2' }, error: null });
        } else {
          resolve({ data: null, error: null });
        }
        return mockChain;
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).delete('/api/imports/imp-2');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });

      mockChain.then = originalThen;
    });

    it('import nao encontrado retorna mensagem adequada', async () => {
      const originalThen = mockChain.then;
      mockChain.then = (resolve: (value: any) => any) => {
        resolve({ data: null, error: null });
        return mockChain;
      };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).delete('/api/imports/ghost-id');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('não encontrado');

      mockChain.then = originalThen;
    });
  });

  // ─── POST /api/imports — Legacy Upload ─────────────────────────────
  describe('POST /api/imports — legacy upload', () => {
    it('sem arquivo → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).post('/api/imports');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('XLSX');
    });

    it('sem club_id e week_start → 400', async () => {
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app).post('/api/imports').attach('file', Buffer.from('fake xlsx'), {
        filename: 'test.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('inválidos');
    });

    it('club_id invalido → 400 com details', async () => {
      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports')
        .field('club_id', 'bad')
        .field('week_start', '2024-01-01')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(400);
      expect(res.body.details).toBeDefined();
    });

    it('sucesso → 200 com result data', async () => {
      mockImportService.processImport.mockResolvedValue({
        status: 'success',
        settlement_id: 'set-legacy-1',
        rows_processed: 25,
      });

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-01-01')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.settlement_id).toBe('set-legacy-1');
      expect(res.body.data.rows_processed).toBe(25);
    });

    it('service retorna status error → 422', async () => {
      mockImportService.processImport.mockResolvedValue({
        status: 'error',
        message: 'Formato invalido na linha 5',
      });

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-01-01')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('service lanca excecao → 500', async () => {
      mockImportService.processImport.mockRejectedValue(new Error('Erro interno'));

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const res = await request(app)
        .post('/api/imports')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-01-01')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'test.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Erro interno');
    });

    it('passa parametros corretos ao processImport', async () => {
      mockImportService.processImport.mockResolvedValue({ status: 'success' });

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      await request(app)
        .post('/api/imports')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-02-12')
        .attach('file', Buffer.from('data'), {
          filename: 'upload.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(mockImportService.processImport).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'test-tenant-id',
          clubId: '550e8400-e29b-41d4-a716-446655440000',
          weekStart: '2024-02-12',
          fileName: 'upload.xlsx',
          uploadedBy: 'test-user-id',
        }),
      );
    });
  });

  // ─── E2E Flow — Preview then Confirm ───────────────────────────────
  describe('E2E Flow — preview → confirm', () => {
    it('preview sem blockers → confirm com sucesso', async () => {
      // Step 1: Preview
      mockPreviewService.preview.mockResolvedValue({
        summary: { total: 15, ok: 15, missing: 0 },
        blockers: [],
        weekStart: '2024-05-06',
      });
      mockChain._result = { data: [{ id: 'sub1', name: 'IMPERIO' }], error: null };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const previewRes = await request(app).post('/api/imports/preview').attach('file', Buffer.from('fake xlsx'), {
        filename: 'semana.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.blockers).toHaveLength(0);
      expect(previewRes.body.data.summary.ok).toBe(15);

      // Step 2: Confirm (using info from preview)
      vi.clearAllMocks();
      mockConfirmService.confirm.mockResolvedValue({
        settlement_id: 'set-e2e',
        import_id: 'imp-e2e',
      });

      const confirmRes = await request(app)
        .post('/api/imports/confirm')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-05-06')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'semana.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(confirmRes.status).toBe(201);
      expect(confirmRes.body.data.settlement_id).toBe('set-e2e');
    });

    it('preview com blockers → confirm retorna 409', async () => {
      // Step 1: Preview reports blockers
      mockPreviewService.preview.mockResolvedValue({
        summary: { total: 10, ok: 7, missing: 3 },
        blockers: ['Jogador sem vinculo'],
        weekStart: '2024-05-06',
      });
      mockChain._result = { data: [], error: null };

      const { app } = createTestApp();
      app.use('/api/imports', importRoutes);

      const previewRes = await request(app).post('/api/imports/preview').attach('file', Buffer.from('fake xlsx'), {
        filename: 'semana.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.data.blockers.length).toBeGreaterThan(0);

      // Step 2: Confirm anyway → service rejects with 409
      vi.clearAllMocks();
      mockConfirmService.confirm.mockRejectedValue(new MockConfirmError('Há blockers pendentes', 409));

      const confirmRes = await request(app)
        .post('/api/imports/confirm')
        .field('club_id', '550e8400-e29b-41d4-a716-446655440000')
        .field('week_start', '2024-05-06')
        .attach('file', Buffer.from('fake xlsx'), {
          filename: 'semana.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });

      expect(confirmRes.status).toBe(409);
      expect(confirmRes.body.error).toContain('blockers');
    });
  });
});
