import type { User, Video, WatchHistoryEntry, AdminStats, AdminUser, AdminUpdateUserData, StorageBreakdown, EvictionResult, ActivityLogResponse, Comment, ReceivedVideo, Friend } from './types'

const BASE = '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }

  return res.json()
}

export const api = {
  auth: {
    register: (body: { email: string; username: string; password: string; display_name?: string }) =>
      request<{ token: string }>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body: { email: string; password: string }) =>
      request<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    refresh: () =>
      request<{ token: string }>('/auth/refresh', { method: 'POST' }),
    me: () =>
      request<{ user: User }>('/auth/me'),
    updateProfile: (body: { display_name?: string; avatar_url?: string }) =>
      request<{ user: User }>('/auth/profile', { method: 'PUT', body: JSON.stringify(body) }),
  },

  videos: {
    create: (body: { url?: string; title?: string; description?: string }) =>
      request<{ id: string }>('/videos/from-link', { method: 'POST', body: JSON.stringify(body) }),
    upload: (file: File, title: string, description: string, onProgress?: (pct: number) => void): Promise<{ id: string }> =>
      new Promise((resolve, reject) => {
        const token = localStorage.getItem('token')
        const form = new FormData()
        form.append('file', file)
        if (title) form.append('title', title)
        if (description) form.append('description', description)

        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/videos/upload')

        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        }

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try {
              const body = JSON.parse(xhr.responseText)
              reject(new Error(body.error || `Upload failed: ${xhr.status}`))
            } catch {
              reject(new Error(`Upload failed: ${xhr.status}`))
            }
          }
        }

        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(form)
      }),
    getFeed: () =>
      request<Video[]>('/feed'),
    getFypFeed: () =>
      request<Video[]>('/feed/fyp'),
    getDetail: (id: string) =>
      request<Video>(`/videos/${id}`),
    like: (id: string) =>
      request<{ status: string }>(`/videos/${id}/like`, { method: 'POST' }),
    unlike: (id: string) =>
      request<{ status: string }>(`/videos/${id}/like`, { method: 'DELETE' }),
    getComments: (id: string) =>
      request<Comment[]>(`/videos/${id}/comments`),
    addComment: (id: string, body: string, parentId?: string) =>
      request<{ id: string; created_at: string }>(`/videos/${id}/comment`, {
        method: 'POST',
        body: JSON.stringify({ body, parent_id: parentId || null }),
      }),
    markWatched: (id: string, progressSeconds?: number) =>
      request<{ status: string }>(`/videos/${id}/watched`, {
        method: 'POST',
        body: JSON.stringify({ progress_seconds: progressSeconds ?? 0 }),
      }),
  },

  history: {
    get: () =>
      request<WatchHistoryEntry[]>('/history'),
  },

  inbox: {
    list: (limit = 20, offset = 0) =>
      request<ReceivedVideo[]>(`/inbox?limit=${limit}&offset=${offset}`),
    markRead: (id: string) =>
      request<{ status: string }>(`/inbox/${id}/read`, { method: 'POST' }),
  },

  friends: {
    list: () =>
      request<Friend[]>('/friends'),
    send: (recipientId: string, videoId: string, caption?: string) =>
      request<{ id: string; created_at: string }>(`/send/${recipientId}`, {
        method: 'POST',
        body: JSON.stringify({ video_id: videoId, caption: caption || null }),
      }),
  },

  users: {
    getProfile: (userId: string) =>
      request<{ user: User; video_count: number }>(`/users/${userId}/profile`),
    getVideos: (userId: string) =>
      request<Video[]>(`/users/${userId}/videos`),
  },

  admin: {
    getStats: () =>
      request<AdminStats>('/admin/stats'),
    listUsers: async () => {
      const res = await request<{ users: AdminUser[] }>('/admin/users')
      return res.users
    },
    evictVideo: (videoId: string) =>
      request<EvictionResult>('/admin/eviction/run', {
        method: 'POST',
        body: JSON.stringify({ strategy: 'manual', video_id: videoId }),
      }),
    runEviction: (strategy?: string, ageDays?: number) =>
      request<EvictionResult>('/admin/eviction/run', {
        method: 'POST',
        body: JSON.stringify({ strategy, age_days: ageDays }),
      }),
    updateUser: async (id: string, data: AdminUpdateUserData) => {
      const res = await request<{ user: AdminUser }>(`/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      })
      return res.user
    },
    deleteUser: (id: string) =>
      request<{ status: string }>(`/admin/users/${id}`, { method: 'DELETE' }),
    getStorageBreakdown: () =>
      request<StorageBreakdown[]>('/admin/storage'),
    getActivityLog: (limit = 50, offset = 0, action?: string) => {
      let path = `/admin/activity?limit=${limit}&offset=${offset}`
      if (action) path += `&action=${encodeURIComponent(action)}`
      return request<ActivityLogResponse>(path)
    },
  },
}
