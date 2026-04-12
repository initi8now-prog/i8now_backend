/* ═══════════════════════════════════════════════════════════════════════════
 *  api — TypeScript shapes for the JSON envelope every HTTP handler returns
 *
 *  Matches the GigWork / i8now “success | error | paginated” contract.
 * ═══════════════════════════════════════════════════════════════════════════ */

export type FieldError = {
  field: string
  message: string
}

export type ApiSuccess = {
  status: 'success'
  message: string
  data: object
}

export type ApiErrorBody = {
  status: 'error'
  message: string
  code?: string
  errors: FieldError[]
}

export type ApiPaginated = {
  status: 'success'
  message: string
  data: object
  meta: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}
