/* ═══════════════════════════════════════════════════════════════════════════
 *  apiResponse — helpers that build the standard API envelope (success/error)
 *
 *  Controllers should return JSON only through these shapes so every endpoint
 *  looks the same to mobile/web clients.
 * ═══════════════════════════════════════════════════════════════════════════ */

import type { ApiErrorBody, ApiPaginated, ApiSuccess, FieldError } from '../types/api.js'

export function success(data: object, message: string): ApiSuccess {
  return { status: 'success', message, data }
}

export function error(message: string, errors: FieldError[], code?: string): ApiErrorBody {
  const body: ApiErrorBody = { status: 'error', message, errors }
  if (code !== undefined) body.code = code
  return body
}

export function paginated(
  items: object,
  total: number,
  page: number,
  limit: number,
  message: string,
): ApiPaginated {
  const total_pages = limit > 0 ? Math.ceil(total / limit) : 0
  return {
    status: 'success',
    message,
    data: items,
    meta: { page, limit, total, total_pages },
  }
}
