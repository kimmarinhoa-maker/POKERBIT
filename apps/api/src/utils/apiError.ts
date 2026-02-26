export function safeErrorMessage(err: unknown, fallback = 'Erro interno'): string {
  if (err instanceof Error) {
    if (process.env.NODE_ENV === 'production') return fallback;
    return err.message;
  }
  return fallback;
}

/**
 * Custom error with HTTP status code for domain-level validation errors.
 * Throw this in services to communicate the correct status to the route handler.
 */
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}
