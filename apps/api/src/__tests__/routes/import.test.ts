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
['select', 'insert', 'update', 'delete', 'eq', 'is', 'single', 'order', 'limit'].forEach(m => {
  mockChain[m] = vi.fn().mockReturnValue(mockChain);
});
mockChain.then = (resolve: Function) => {
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
  requireRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
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

      const res = await request(app)
        .post('/api/imports/preview')
        .attach('file', Buffer.from('fake xlsx'), {
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
      mockChain._result = { data: [{ id: 'imp-1' }, { id: 'imp-2' }], error: null };
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
      mockChain.then = (resolve: Function) => {
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
      mockChain.then = (resolve: Function) => {
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
      mockChain.then = (resolve: Function) => {
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
});
