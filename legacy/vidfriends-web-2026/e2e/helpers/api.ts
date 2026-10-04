const API_BASE = process.env.E2E_API_URL || 'http://localhost:8080'

interface ApiResponse<T> {
  data: T
  status: number
}

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Request failed: ${res.status} ${res.statusText}`)
  return { data: json as T, status: res.status }
}

export const api = {
  auth: {
    register: (email: string, username: string, password: string, displayName?: string) =>
      request<{ token: string }>('POST', '/api/auth/register', {
        email, username, password, display_name: displayName,
      }),
    login: (email: string, password: string) =>
      request<{ token: string }>('POST', '/api/auth/login', { email, password }),
    me: (token: string) =>
      request<{ user: { id: string; email: string; username: string; role: string } }>('GET', '/api/auth/me', undefined, token),
  },
  videos: {
    createFromLink: (url: string, title: string, token: string) =>
      request<{ id: string }>('POST', '/api/videos/from-link', { url, title }, token),
    getDetail: (id: string, token: string) =>
      request<{ id: string; title: string; file_url: string; user_id: string }>('GET', `/api/videos/${id}`, undefined, token),
    like: (id: string, token: string) =>
      request<{ status: string }>('POST', `/api/videos/${id}/like`, undefined, token),
    unlike: (id: string, token: string) =>
      request<{ status: string }>('DELETE', `/api/videos/${id}/like`, undefined, token),
    getComments: (id: string, token: string) =>
      request<Array<{ id: string; body: string; user_id: string; parent_id: string | null }>>('GET', `/api/videos/${id}/comments`, undefined, token),
    addComment: (id: string, body: string, token: string, parentId?: string) =>
      request<{ id: string; created_at: string }>('POST', `/api/videos/${id}/comment`, { body, parent_id: parentId || null }, token),
    markWatched: (id: string, token: string, progressSeconds = 5) =>
      request<{ status: string }>('POST', `/api/videos/${id}/watched`, { progress_seconds: progressSeconds }, token),
  },
  history: {
    get: (token: string) =>
      request<Array<{ id: string; video_id: string; progress_seconds: number }>>('GET', '/api/history', undefined, token),
  },
  friends: {
    list: (token: string) =>
      request<Array<{ id: string; username: string }>>('GET', '/api/friends', undefined, token),
    send: (recipientId: string, videoId: string, token: string, caption?: string) =>
      request<{ id: string; created_at: string }>('POST', `/api/send/${recipientId}`, { video_id: videoId, caption: caption || null }, token),
  },
  admin: {
    listUsers: (token: string) =>
      request<{ users: Array<{ id: string; email: string; role: string; status: string }> }>('GET', '/api/admin/users', undefined, token),
    updateUser: (id: string, data: { role?: string; status?: string }, token: string) =>
      request<{ user: { id: string; role: string; status: string } }>('PATCH', `/api/admin/users/${id}`, data, token),
    getStats: (token: string) =>
      request<Record<string, unknown>>('GET', '/api/admin/stats', undefined, token),
    getActivityLog: (token: string) =>
      request<{ entries: Array<{ id: string; action: string; created_at: string }> }>('GET', '/api/admin/activity?limit=10', undefined, token),
  },
  health: () =>
    request<{ status: string }>('GET', '/api/health'),
}
