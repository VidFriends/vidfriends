export interface User {
  id: string
  email: string
  username: string
  display_name?: string
  avatar_url?: string
  created_at: string
  updated_at: string
}

export interface Video {
  id: string
  user_id: string
  title: string
  description?: string
  file_url?: string
  thumbnail_url?: string
  duration?: string
  status: 'processing' | 'ready' | 'failed' | 'deleted'
  created_at: string
  updated_at: string
  user_name: string
  like_count: number
  comment_count: number
  liked?: boolean
}

export interface Comment {
  id: string
  user_id: string
  user_name: string
  parent_id?: string
  body: string
  created_at: string
}

export interface WatchHistoryEntry {
  id: string
  title: string
  thumbnail_url?: string
  user_name: string
  watched_at: string
  progress_seconds: number
}

export interface AdminStats {
  total_videos: number
  total_users: number
  total_likes: number
  total_comments: number
  total_storage_bytes: number
  storage_quota_bytes: number
  storage_usage_pct: number
}

export interface AdminUser {
  id: string
  email: string
  username: string
  role: string
  status?: string
  storage_used: number
  upload_quota_bytes: number | null
  last_active_at?: string | null
  created_at: string
}

export interface AdminUpdateUserData {
  role?: string
  status?: string
  upload_quota_bytes?: number | null
}

export interface StorageBreakdown {
  user_id: string
  username: string
  storage_used: number
}

export interface EvictionResult {
  status: string
  evicted: number
}

export interface ActivityEntry {
  id: string
  actor_id?: string
  actor_email?: string
  action: string
  entity_type: string
  entity_id?: string
  metadata?: unknown
  ip_address?: string
  created_at: string
}

export interface ActivityLogResponse {
  entries: ActivityEntry[]
  total: number
  limit: number
  offset: number
}

export interface ProfileData {
  user: User
  video_count: number
}

export interface ReceivedVideo {
  id: string
  video_id: string
  title: string
  thumbnail_url?: string
  sender_id: string
  sender_name: string
  caption?: string | null
  read_at?: string | null
  created_at: string
}

export interface Friend {
  id: string
  user_id: string
  username: string
  status: string
  created_at: string
}

export interface ApiError {
  error: string
}

export interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string, displayName?: string) => Promise<void>
  logout: () => void
}

export interface AuthState {
  token: string | null
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string, displayName?: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}
