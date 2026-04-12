/* ═══════════════════════════════════════════════════════════════════════════
 *  errors — AppError = “known problem” with HTTP status + machine-readable code
 *
 *  Throw these from services; the error middleware turns them into JSON.
 * ═══════════════════════════════════════════════════════════════════════════ */

export class AppError extends Error {
  constructor(
    public code: string,
    public httpStatus: number,
    message?: string,
  ) {
    super(message ?? code)
    this.name = 'AppError'
  }
}
