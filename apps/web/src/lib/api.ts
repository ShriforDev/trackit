/**
 * Thin fetch wrapper for the trackit API. Always sends the Better Auth
 * session cookie (credentials: "include") and surfaces a structured error
 * on non-2xx responses so callers can branch on `error.status`.
 *
 * Defaults to "/api" relative — the Vite dev server proxies /api → backend.
 * In production, set VITE_API_URL to the API origin (e.g.
 * https://api.example.com/api) if the API lives on a different host.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api"

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`)
    this.status = status
    this.body = body
    this.name = "ApiError"
  }
}

interface RequestInitNoBody extends Omit<RequestInit, "body"> {
  /** Object body — JSON-stringified automatically. */
  json?: unknown
}

async function request<T>(
  path: string,
  init?: RequestInitNoBody
): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.json !== undefined) {
    headers.set("content-type", "application/json")
  }
  if (!headers.has("accept")) headers.set("accept", "application/json")

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
  })

  const text = await res.text()
  const body =
    text.length > 0 ? safeJsonParse(text) : (undefined as unknown)

  if (!res.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with status ${res.status}`
    throw new ApiError(res.status, body, message)
  }

  return body as T
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const api = {
  get: <T>(path: string, init?: RequestInitNoBody) =>
    request<T>(path, { ...init, method: "GET" }),
  post: <T>(path: string, json?: unknown, init?: RequestInitNoBody) =>
    request<T>(path, { ...init, method: "POST", json }),
  patch: <T>(path: string, json?: unknown, init?: RequestInitNoBody) =>
    request<T>(path, { ...init, method: "PATCH", json }),
  delete: <T>(path: string, init?: RequestInitNoBody) =>
    request<T>(path, { ...init, method: "DELETE" }),
}
