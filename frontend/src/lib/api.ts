const BASE_URL = '/api'

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | undefined>
}

interface ErrorDetail {
  code?: string
  message?: string
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

let unauthorizedHandler: (() => void) | undefined

export function setUnauthorizedHandler(handler?: () => void) {
  unauthorizedHandler = handler
}

async function request<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { params, ...init } = options

  // 拼接查询参数
  let url = `${BASE_URL}${path}`
  if (params) {
    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        searchParams.set(key, String(value))
      }
    }
    const qs = searchParams.toString()
    if (qs) url += `?${qs}`
  }

  const isFormData = init.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers as Record<string, string>),
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ApiError(0, 'network_error', '无法连接服务器，请检查网络后重试')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: undefined }))
    const detail = error.detail as ErrorDetail | string | undefined
    const code = typeof detail === 'object' && detail?.code
      ? detail.code
      : response.status === 401 ? 'not_authenticated' : 'request_failed'
    const message = typeof detail === 'object' && detail?.message
      ? detail.message
      : typeof detail === 'string' ? detail : `请求失败（${response.status}）`
    if (response.status === 401) unauthorizedHandler?.()
    throw new ApiError(response.status, code, message)
  }

  if (response.status === 204) return undefined as T
  return response.json()
}

export const api = {
  get: <T = unknown>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'GET' }),

  post: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, {
      ...opts,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),

  put: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'PUT', body: JSON.stringify(body) }),

  patch: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'PATCH', body: JSON.stringify(body) }),

  delete: <T = unknown>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'DELETE' }),
}
