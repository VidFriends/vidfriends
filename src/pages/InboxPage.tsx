import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { ReceivedVideo } from '../lib/types'

const PAGE_SIZE = 20

export function InboxPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ReceivedVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.inbox.list(PAGE_SIZE, 0)
      .then(data => {
        if (cancelled) return
        setItems(data)
        setHasMore(data.length >= PAGE_SIZE)
        setOffset(data.length)
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load inbox')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const data = await api.inbox.list(PAGE_SIZE, offset)
      setItems(prev => [...prev, ...data])
      setHasMore(data.length >= PAGE_SIZE)
      setOffset(prev => prev + data.length)
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false)
    }
  }, [offset])

  const handleMarkRead = async (item: ReceivedVideo) => {
    if (item.read_at) return
    try {
      await api.inbox.markRead(item.id)
      setItems(prev => prev.map(i =>
        i.id === item.id ? { ...i, read_at: new Date().toISOString() } : i
      ))
    } catch {
      // silently fail
    }
  }

  const handleViewVideo = (item: ReceivedVideo) => {
    if (!item.read_at) handleMarkRead(item)
    navigate(`/videos/${item.video_id}`)
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)

    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300">{error}</div>
    )
  }

  const unreadItems = items.filter(i => !i.read_at)
  const readItems = items.filter(i => i.read_at)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Inbox</h1>
        <p className="text-gray-400 mt-1">
          Videos shared with you
          {unreadItems.length > 0 && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-900/60 text-indigo-300">
              {unreadItems.length} unread
            </span>
          )}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-800 rounded-xl">
          <svg className="mx-auto h-12 w-12 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-lg text-gray-500">No videos yet</p>
          <p className="text-sm text-gray-600 mt-1">When friends send you videos, they'll appear here.</p>
        </div>
      ) : (
        <>
          {unreadItems.length > 0 && (
            <InboxSection title="New" items={unreadItems} onView={handleViewVideo} onMarkRead={handleMarkRead} formatDate={formatDate} />
          )}
          {readItems.length > 0 && (
            <InboxSection title="Watched" items={readItems} onView={handleViewVideo} onMarkRead={handleMarkRead} formatDate={formatDate} />
          )}
        </>
      )}

      {hasMore && !loading && (
        <div className="flex justify-center pt-4">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

function InboxSection({
  title,
  items,
  onView,
  onMarkRead,
  formatDate,
}: {
  title: string
  items: ReceivedVideo[]
  onView: (item: ReceivedVideo) => void
  onMarkRead: (item: ReceivedVideo) => void
  formatDate: (iso: string) => string
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-300 mb-3">{title}</h2>
      <div className="space-y-3">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onView(item)}
            className="w-full text-left group bg-gray-900 rounded-xl border border-gray-800 overflow-hidden hover:border-gray-700 transition-colors flex flex-col sm:flex-row"
          >
            <div className="relative w-full sm:w-48 h-32 sm:h-auto flex-shrink-0 bg-gray-800">
              {item.thumbnail_url ? (
                <img
                  src={item.thumbnail_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  </svg>
                </div>
              )}
              {!item.read_at && (
                <div className="absolute top-2 left-2 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-2 ring-gray-900" />
              )}
            </div>
            <div className="flex-1 min-w-0 p-4 flex flex-col justify-center">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-base truncate ${item.read_at ? 'text-gray-300' : 'text-white font-semibold'}`}>
                    {item.title || 'Untitled Video'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="w-5 h-5 rounded-full bg-indigo-600/40 flex items-center justify-center text-[10px] font-bold text-indigo-300 flex-shrink-0">
                      {item.sender_name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-gray-400">{item.sender_name}</span>
                  </div>
                  {item.caption && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-1">{item.caption}</p>
                  )}
                </div>
                <span className="text-xs text-gray-600 whitespace-nowrap flex-shrink-0">{formatDate(item.created_at)}</span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                {!item.read_at && (
                  <span
                    onClick={e => { e.stopPropagation(); onMarkRead(item) }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline"
                  >
                    Mark as read
                  </span>
                )}
                <span className="text-xs text-gray-600">
                  {item.read_at ? formatDate(item.read_at) : ''}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
