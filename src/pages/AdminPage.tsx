import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { AdminStats, AdminUser, StorageBreakdown, ActivityEntry } from '../lib/types'

type AdminTab = 'overview' | 'users' | 'eviction' | 'storage' | 'activity'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const n = bytes / Math.pow(1024, i)
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatQuota(bytes: number | null): string {
  if (bytes === null) return 'Unlimited'
  return formatBytes(bytes)
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const ACTION_LABELS: Record<string, string> = {
  admin_update_user: 'Updated user',
  admin_delete_user: 'Deleted user',
  admin_eviction_run: 'Eviction run',
  admin_delete_video: 'Deleted video',
  admin_create_invite: 'Created invite',
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-900/60 text-emerald-300',
  suspended: 'bg-yellow-900/60 text-yellow-300',
  disabled: 'bg-red-900/60 text-red-300',
}

export function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('overview')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [evictVideoId, setEvictVideoId] = useState('')
  const [evictMessage, setEvictMessage] = useState('')

  const [evictionStrategy, setEvictionStrategy] = useState('age')
  const [evictionAgeDays, setEvictionAgeDays] = useState(90)
  const [evictionRunning, setEvictionRunning] = useState(false)
  const [evictionResult, setEvictionResult] = useState<string | null>(null)

  const [editingQuota, setEditingQuota] = useState<string | null>(null)
  const [editQuotaValue, setEditQuotaValue] = useState('')

  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [editingStatus, setEditingStatus] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [storageBreakdown, setStorageBreakdown] = useState<StorageBreakdown[]>([])

  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([])
  const [activityTotal, setActivityTotal] = useState(0)
  const [activityLoading, setActivityLoading] = useState(true)
  const [activityPage, setActivityPage] = useState(0)
  const [activityFilter, setActivityFilter] = useState('')
  const PAGE_SIZE = 50

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.admin.getStats(),
      api.admin.listUsers(),
    ])
      .then(([s, u]) => { if (!cancelled) { setStats(s); setUsers(u) } })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load admin data') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (tab !== 'storage' || storageBreakdown.length > 0) return
    let cancelled = false
    api.admin.getStorageBreakdown()
      .then(data => { if (!cancelled) setStorageBreakdown(data) })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load storage breakdown') })
    return () => { cancelled = true }
  }, [tab, storageBreakdown.length])

  useEffect(() => {
    if (tab !== 'activity') return
    let cancelled = false
    api.admin.getActivityLog(PAGE_SIZE, activityPage * PAGE_SIZE, activityFilter || undefined)
      .then(result => { if (!cancelled) { setActivityEntries(result.entries); setActivityTotal(result.total); setActivityLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err instanceof Error ? err.message : 'Failed to load activity log'); setActivityLoading(false) } })
    return () => { cancelled = true }
  }, [tab, activityPage, activityFilter])

  const handleSingleEvict = async (e: React.FormEvent) => {
    e.preventDefault()
    setEvictMessage('')
    try {
      await api.admin.evictVideo(evictVideoId.trim())
      setEvictMessage(`Video ${evictVideoId} evicted successfully`)
      setEvictVideoId('')
    } catch (err) {
      setEvictMessage(err instanceof Error ? err.message : 'Eviction failed')
    }
  }

  const handleRunEviction = async (e: React.FormEvent) => {
    e.preventDefault()
    setEvictionResult(null)
    setEvictionRunning(true)
    try {
      const result = await api.admin.runEviction(evictionStrategy, evictionAgeDays)
      setEvictionResult(`Eviction complete: ${result.evicted} video(s) evicted`)
    } catch (err) {
      setEvictionResult(err instanceof Error ? err.message : 'Eviction run failed')
    } finally {
      setEvictionRunning(false)
    }
  }

  const handleEditQuota = (user: AdminUser) => {
    setEditingQuota(user.id)
    setEditQuotaValue(user.upload_quota_bytes !== null ? String(user.upload_quota_bytes) : '')
  }

  const handleSaveQuota = async (userId: string) => {
    const value = editQuotaValue.trim()
    let parsed: number | null = null
    if (value !== '') {
      const n = Number(value)
      if (Number.isNaN(n) || n < 0) return
      parsed = n
    }
    try {
      const updated = await api.admin.updateUser(userId, { upload_quota_bytes: parsed })
      setUsers(prev => prev.map(u => u.id === userId ? updated : u))
      setEditingQuota(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quota')
    }
  }

  const handleCancelQuota = () => {
    setEditingQuota(null)
  }

  const handleEditRole = (userId: string) => {
    setEditingRole(userId)
  }

  const handleSaveRole = async (userId: string, role: string) => {
    try {
      const updated = await api.admin.updateUser(userId, { role })
      setUsers(prev => prev.map(u => u.id === userId ? updated : u))
      setEditingRole(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  const handleCancelRole = () => {
    setEditingRole(null)
  }

  const handleEditStatus = (userId: string) => {
    setEditingStatus(userId)
  }

  const handleSaveStatus = async (userId: string, status: string) => {
    try {
      const updated = await api.admin.updateUser(userId, { status })
      setUsers(prev => prev.map(u => u.id === userId ? updated : u))
      setEditingStatus(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    }
  }

  const handleCancelStatus = () => {
    setEditingStatus(null)
  }

  const handleDeleteUser = async (userId: string) => {
    try {
      await api.admin.deleteUser(userId)
      setUsers(prev => prev.filter(u => u.id !== userId))
      setDeleteConfirm(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  const tabClass = (t: AdminTab) =>
    `px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`

  const activityActionBadge = (action: string) => {
    const label = ACTION_LABELS[action] || action
    const colors: Record<string, string> = {
      admin_update_user: 'bg-blue-900/60 text-blue-300',
      admin_delete_user: 'bg-red-900/60 text-red-300',
      admin_eviction_run: 'bg-orange-900/60 text-orange-300',
      admin_delete_video: 'bg-red-900/60 text-red-300',
      admin_create_invite: 'bg-purple-900/60 text-purple-300',
    }
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[action] || 'bg-gray-800 text-gray-400'}`}>
        {label}
      </span>
    )
  }

  const activityTypes = Object.keys(ACTION_LABELS)

  const totalPages = Math.ceil(activityTotal / PAGE_SIZE)

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  if (error && !stats && !users.length) {
    return <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300">{error}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
        <p className="text-gray-400 mt-1">Platform administration and monitoring</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setTab('overview')} className={tabClass('overview')}>Overview</button>
        <button onClick={() => setTab('users')} className={tabClass('users')}>Users</button>
        <button onClick={() => setTab('storage')} className={tabClass('storage')}>Storage</button>
        <button onClick={() => setTab('eviction')} className={tabClass('eviction')}>Eviction Policy</button>
        <button onClick={() => setTab('activity')} className={tabClass('activity')}>Activity Log</button>
      </div>

      {error && (
        <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">{error}</div>
      )}

      {tab === 'overview' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Videos" value={stats.total_videos} />
            <StatCard label="Total Users" value={stats.total_users} />
            <StatCard label="Total Storage" value={stats.total_storage_bytes} formatter={formatBytes} />
            <StatCard label="Storage Usage" value={stats.storage_usage_pct} formatter={v => `${v}%`} />
          </div>

          <div className="p-6 bg-gray-900 rounded-xl border border-gray-800 space-y-2">
            <h3 className="text-lg font-medium text-white mb-4">Storage Usage</h3>
            <p className="text-gray-400">
              {formatBytes(stats.total_storage_bytes)} used
              {stats.storage_quota_bytes > 0
                ? ` of ${formatBytes(stats.storage_quota_bytes)} (${stats.storage_usage_pct}%)`
                : ' (unlimited)'}
            </p>
            {stats.storage_quota_bytes > 0 && (
              <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    stats.storage_usage_pct > 90 ? 'bg-red-500' : stats.storage_usage_pct > 70 ? 'bg-yellow-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(stats.storage_usage_pct, 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-sm">
                <th className="pb-3 font-medium">Username</th>
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">Role</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium">Storage</th>
                <th className="pb-3 font-medium">Upload Quota</th>
                <th className="pb-3 font-medium">Joined</th>
                <th className="pb-3 font-medium w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-gray-900/50">
                  <td className="py-3 pr-4 text-white font-medium">{user.username}</td>
                  <td className="py-3 pr-4 text-gray-400">{user.email}</td>
                  <td className="py-3 pr-4">
                    {editingRole === user.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          defaultValue={user.role}
                          onChange={e => handleSaveRole(user.id, e.target.value)}
                          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          autoFocus
                          onBlur={handleCancelRole}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditRole(user.id)}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                          user.role === 'admin'
                            ? 'bg-indigo-900/60 text-indigo-300 hover:bg-indigo-800/60'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                        aria-label={`Change role for ${user.username}`}
                      >
                        {user.role}
                      </button>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {editingStatus === user.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          defaultValue={user.status ?? 'active'}
                          onChange={e => handleSaveStatus(user.id, e.target.value)}
                          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          autoFocus
                          onBlur={handleCancelStatus}
                        >
                          <option value="active">active</option>
                          <option value="suspended">suspended</option>
                          <option value="disabled">disabled</option>
                        </select>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditStatus(user.id)}
                        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${STATUS_COLORS[user.status ?? ''] || 'bg-gray-800 text-gray-400'} hover:opacity-80`}
                        aria-label={`Change status for ${user.username}`}
                      >
                        {user.status ?? 'active'}
                      </button>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-400">{formatBytes(user.storage_used)}</td>
                  <td className="py-3 pr-4 text-gray-400">
                    {editingQuota === user.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={editQuotaValue}
                          onChange={e => setEditQuotaValue(e.target.value)}
                          placeholder="bytes, empty=unlimited"
                          className="w-28 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveQuota(user.id)}
                          className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded"
                          aria-label="Save quota"
                        >
                          Save
                        </button>
                        <button
                          onClick={handleCancelQuota}
                          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
                          aria-label="Cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleEditQuota(user)}
                        className="hover:text-indigo-400 transition-colors text-left"
                        aria-label={`Edit quota for ${user.username}`}
                      >
                        {formatQuota(user.upload_quota_bytes)}
                      </button>
                    )}
                  </td>
                  <td className="py-3 text-gray-400 whitespace-nowrap">{formatDate(user.created_at)}</td>
                  <td className="py-3">
                    {deleteConfirm === user.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteUser(user.id)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                          aria-label="Confirm delete user"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
                          aria-label="Cancel delete"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(user.id)}
                        className="text-gray-600 hover:text-red-400 transition-colors"
                        aria-label={`Delete user ${user.username}`}
                        title="Delete user"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'eviction' && (
        <div className="max-w-lg space-y-6">
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-lg font-medium text-white mb-2">Eviction Policy</h3>
            <p className="text-gray-400 text-sm">
              Eviction removes a video from the platform. This is a soft-delete — the video data is retained but marked as deleted and no longer served. Use bulk eviction below to apply a strategy across videos.
            </p>
          </div>

          <form onSubmit={handleRunEviction} className="p-4 bg-gray-900 rounded-lg border border-gray-800 space-y-4">
            <h4 className="text-white font-medium">Run Bulk Eviction</h4>

            <div>
              <label htmlFor="evictionStrategy" className="block text-sm font-medium text-gray-300 mb-1">Strategy</label>
              <select
                id="evictionStrategy"
                value={evictionStrategy}
                onChange={e => setEvictionStrategy(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="age">Age (oldest by upload date)</option>
                <option value="least_recently_watched">Least Recently Watched</option>
                <option value="least_liked">Least Liked</option>
                <option value="oldest_watched">Oldest Watched</option>
              </select>
            </div>

            <div>
              <label htmlFor="evictionAgeDays" className="block text-sm font-medium text-gray-300 mb-1">Age Threshold (days)</label>
              <input
                id="evictionAgeDays"
                type="number"
                min="1"
                value={evictionAgeDays}
                onChange={e => setEvictionAgeDays(Number(e.target.value))}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={evictionRunning}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              {evictionRunning ? 'Running...' : 'Run Eviction'}
            </button>
            {evictionResult && (
              <p className={evictionResult.includes('Error') || evictionResult.includes('Failed') ? 'text-red-400 text-sm' : 'text-emerald-400 text-sm'}>
                {evictionResult}
              </p>
            )}
          </form>

          <form onSubmit={handleSingleEvict} className="space-y-4 p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h4 className="text-white font-medium">Single Video Eviction</h4>
            <p className="text-gray-400 text-xs">Permanently deletes a single video by ID from storage and marks it as deleted.</p>
            <div>
              <label htmlFor="evictVideoId" className="block text-sm font-medium text-gray-300 mb-1">Video ID</label>
              <input
                id="evictVideoId"
                type="text"
                required
                value={evictVideoId}
                onChange={e => setEvictVideoId(e.target.value)}
                placeholder="Enter video UUID"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
            >
              Evict Video
            </button>
            {evictMessage && (
              <p className={evictMessage.includes('Error') || evictMessage.includes('Failed') ? 'text-red-400 text-sm' : 'text-emerald-400 text-sm'}>
                {evictMessage}
              </p>
            )}
          </form>
        </div>
      )}

      {tab === 'storage' && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-lg font-medium text-white mb-2">Storage Breakdown</h3>
            <p className="text-gray-400 text-sm">
              Per-user storage usage across the platform. Users without stored data are not listed.
            </p>
          </div>
          {storageBreakdown.length === 0 && !error ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-sm">
                    <th className="pb-3 font-medium">Username</th>
                    <th className="pb-3 font-medium">Storage Used</th>
                    <th className="pb-3 font-medium">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {storageBreakdown.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-gray-500">No data available</td>
                    </tr>
                  )}
                  {storageBreakdown.map(entry => {
                    const sharePct = stats && stats.total_storage_bytes > 0
                      ? (entry.storage_used / stats.total_storage_bytes) * 100
                      : 0
                    return (
                      <tr key={entry.user_id} className="hover:bg-gray-900/50">
                        <td className="py-3 pr-4 text-white font-medium">{entry.username}</td>
                        <td className="py-3 pr-4 text-gray-400">{formatBytes(entry.storage_used)}</td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-gray-800 rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{ width: `${Math.min(sharePct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{sharePct.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="space-y-4">
          <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
            <h3 className="text-lg font-medium text-white mb-2">Activity Log</h3>
            <p className="text-gray-400 text-sm">
              Track administrative actions across the platform.
            </p>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-sm text-gray-400">Filter:</span>
            <button
              onClick={() => { setActivityLoading(true); setActivityFilter(''); setActivityPage(0) }}
              className={`px-3 py-1 rounded text-xs font-medium ${activityFilter === '' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              All
            </button>
            {activityTypes.map(type => (
              <button
                key={type}
                onClick={() => { setActivityLoading(true); setActivityFilter(type); setActivityPage(0) }}
                className={`px-3 py-1 rounded text-xs font-medium ${activityFilter === type ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
              >
                {ACTION_LABELS[type]}
              </button>
            ))}
          </div>

          {activityLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : activityEntries.length === 0 ? (
            <div className="p-8 text-center text-gray-500 border-2 border-dashed border-gray-800 rounded-xl">
              <svg className="mx-auto h-10 w-10 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg">No activity entries found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 text-sm">
                    <th className="pb-3 font-medium">Time</th>
                    <th className="pb-3 font-medium">Action</th>
                    <th className="pb-3 font-medium">Actor</th>
                    <th className="pb-3 font-medium">Entity</th>
                    <th className="pb-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {activityEntries.map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-900/50">
                      <td className="py-3 pr-4 text-gray-400 whitespace-nowrap text-sm">{formatDateTime(entry.created_at)}</td>
                      <td className="py-3 pr-4">{activityActionBadge(entry.action)}</td>
                      <td className="py-3 pr-4 text-gray-300 text-sm">{entry.actor_email || entry.actor_id || 'System'}</td>
                      <td className="py-3 pr-4">
                        <span className="text-xs text-gray-500">{entry.entity_type}</span>
                        {entry.entity_id && <span className="text-xs text-gray-600 ml-1">/{entry.entity_id.substring(0, 8)}...</span>}
                      </td>
                      <td className="py-3 text-gray-400 text-sm">
                        {entry.metadata ? JSON.stringify(entry.metadata).substring(0, 80) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => { setActivityLoading(true); setActivityPage(p => Math.max(0, p - 1)) }}
                disabled={activityPage === 0}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded"
              >
                Previous
              </button>
              <span className="text-sm text-gray-400">
                Page {activityPage + 1} of {totalPages} ({activityTotal} entries)
              </span>
              <button
                onClick={() => { setActivityLoading(true); setActivityPage(p => Math.min(totalPages - 1, p + 1)) }}
                disabled={activityPage >= totalPages - 1}
                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, formatter }: { label: string; value: number; formatter?: (v: number) => string }) {
  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-3xl font-bold text-white mt-1">{formatter ? formatter(value) : value.toLocaleString()}</p>
    </div>
  )
}
