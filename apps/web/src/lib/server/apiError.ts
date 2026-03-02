export function safeErrorMessage(err: unknown, fallback = 'Erro interno'): string {
  if (err instanceof Error) {
    if (process.env.NODE_ENV === 'production') return fallback;
    return err.message;
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
