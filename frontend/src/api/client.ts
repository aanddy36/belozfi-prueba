const API_URL = import.meta.env.VITE_API_URL

export class ApiError extends Error {
  status: number
  code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type ApiEnvelope<T> =
  | { statusCode: number; message: string; data: T }
  | { statusCode: number; message: string; error: { code: string; details?: unknown } }

export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  })
  const body = (await res.json()) as ApiEnvelope<T>

  if (!res.ok || 'error' in body) {
    const code = 'error' in body ? body.error.code : undefined
    throw new ApiError(body.statusCode, body.message, code)
  }

  return body.data
}
