export function safeErrorMessage(err: unknown, fallback = 'Erro interno'): string {
  if (err instanceof Error) {
    if (process.env.NODE_ENV === 'production') return fallback;
    return err.message;
  }
  return fallback;
}
