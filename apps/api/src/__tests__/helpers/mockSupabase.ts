/**
 * Mock chainable Supabase client for testing.
 *
 * Usage:
 *   const mock = createMockSupabase();
 *   mock.setResult('settlements', [{ id: '1', status: 'DRAFT' }]);
 *
 * The chain `.from('x').select('*').eq('a','b')` etc. will resolve
 * to the configured data for that table.
 */
import { vi } from 'vitest';

interface MockResult {
  data: any;
  error: any;
}

export function createMockSupabase() {
  const tableResults: Record<string, MockResult> = {};

  function setResult(table: string, data: any, error: any = null) {
    tableResults[table] = { data, error };
  }

  function setError(table: string, message: string) {
    tableResults[table] = { data: null, error: { message } };
  }

  function getResult(table: string): MockResult {
    return tableResults[table] || { data: null, error: null };
  }

  // Create a chainable query builder that resolves to configured data
  function createChain(table: string) {
    const chain: any = {};

    const methods = [
      'select', 'insert', 'update', 'delete', 'upsert',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
      'is', 'in', 'like', 'ilike',
      'order', 'limit', 'range',
      'single', 'maybeSingle',
      'match', 'not', 'or', 'filter',
      'textSearch', 'contains', 'containedBy',
      'overlaps', 'csv',
    ];

    for (const method of methods) {
      chain[method] = vi.fn().mockReturnValue(chain);
    }

    // Make the chain thenable (for await)
    chain.then = (resolve: Function) => {
      const result = getResult(table);
      resolve(result);
      return chain;
    };

    // Override single to also set data as single item
    const originalSingle = chain.single;

    return chain;
  }

  const mockAuth = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token' },
    }),
  };

  const supabase: any = {
    from: vi.fn((table: string) => createChain(table)),
    auth: mockAuth,
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'http://test/file.xlsx' } }),
      }),
    },
    // Test helpers
    _setResult: setResult,
    _setError: setError,
    _getResult: getResult,
    _setAuthUser: (user: any) => {
      mockAuth.getUser.mockResolvedValue({
        data: { user },
        error: null,
      });
    },
    _setAuthError: (message: string) => {
      mockAuth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message },
      });
    },
  };

  return supabase;
}
