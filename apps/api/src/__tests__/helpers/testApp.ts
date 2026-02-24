/**
 * Creates a test Express app with fake auth middleware.
 *
 * Instead of validating JWT tokens via Supabase, this injects
 * req.userId, req.tenantId, req.userRole etc. directly.
 *
 * Usage:
 *   const { app } = createTestApp();
 *   // or with custom auth context:
 *   const { app } = createTestApp({
 *     userId: 'user-123',
 *     tenantId: 'tenant-456',
 *     userRole: 'OWNER',
 *   });
 */
import express, { Request, Response, NextFunction } from 'express';

export interface TestAuthContext {
  userId?: string;
  userEmail?: string;
  accessToken?: string;
  tenantId?: string;
  tenantIds?: string[];
  tenantRoles?: Record<string, string>;
  userRole?: string;
  allowedSubclubIds?: string[] | null;
}

const DEFAULT_AUTH: TestAuthContext = {
  userId: 'test-user-id',
  userEmail: 'test@example.com',
  accessToken: 'fake-token',
  tenantId: 'test-tenant-id',
  tenantIds: ['test-tenant-id'],
  tenantRoles: { 'test-tenant-id': 'OWNER' },
  userRole: 'OWNER',
  allowedSubclubIds: null, // null = full access
};

/**
 * Middleware that injects auth context into req without real JWT validation.
 */
function fakeAuthMiddleware(authContext: TestAuthContext) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.userId = authContext.userId;
    req.userEmail = authContext.userEmail;
    req.accessToken = authContext.accessToken;
    req.tenantId = authContext.tenantId;
    req.tenantIds = authContext.tenantIds;
    req.tenantRoles = authContext.tenantRoles;
    req.userRole = authContext.userRole;
    req.allowedSubclubIds = authContext.allowedSubclubIds;
    next();
  };
}

/**
 * Creates a minimal Express app for testing routes.
 *
 * The returned app has JSON body parsing and fake auth injected.
 * Mount your router on it: app.use('/api/settlements', settlementRouter);
 */
export function createTestApp(authOverrides: Partial<TestAuthContext> = {}) {
  const auth = { ...DEFAULT_AUTH, ...authOverrides };
  const app = express();

  app.use(express.json());
  app.use(fakeAuthMiddleware(auth));

  return { app, auth };
}
