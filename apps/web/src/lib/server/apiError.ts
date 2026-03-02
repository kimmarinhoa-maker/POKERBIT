export function safeErrorMessage(err: unknown, fallback = 'Erro interno'): string {
  if (err instanceof Error) {
    // Always return the error message (without stack) for better debugging
    return err.message || fallback;
  }
  return fallback;
}

export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
  }
}
