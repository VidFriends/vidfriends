import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import type { Video } from '../lib/types'
import { VideoCard } from '../components/VideoCard'

type FeedTab = 'fyp' | 'discover'

export function FeedPage() {
  const [tab, setTab] = useState<FeedTab>('fyp')
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!refreshing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true)
    }
    setError('')

    const fetcher = tab === 'fyp' ? api.videos.getFypFeed() : api.videos.getFeed()

    fetcher
      .then(data => {
        if (cancelled) return
        if (data.length === 0 && tab === 'fyp') {
          return api.videos.getFeed().then(allVideos => {
            if (cancelled) return
            setVideos(allVideos)
            if (allVideos.length > 0) setTab('discover')
          })
        }
        setVideos(data)
      })
      .catch(() => {
        if (cancelled) return
        if (tab === 'fyp') {
          api.videos.getFeed()
            .then(data => { if (!cancelled) { setVideos(data); setTab('discover') } })
            .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load feed') })
        } else {
          setError('Failed to load feed')
        }
      })
      .finally(() => { if (!cancelled) { setLoading(false); setRefreshing(false) } })
    return () => { cancelled = true }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(() => {
    setRefreshing(true)
    setError('')
    const fetcher = tab === 'fyp' ? api.videos.getFypFeed() : api.videos.getFeed()
    fetcher
      .then(data => {
        if (data.length === 0 && tab === 'fyp') {
          return api.videos.getFeed().then(allVideos => {
            setVideos(allVideos)
            if (allVideos.length > 0) setTab('discover')
          })
        }
        setVideos(data)
      })
      .catch(() => {
        if (tab === 'fyp') {
          api.videos.getFeed()
            .then(data => { setVideos(data); setTab('discover') })
            .catch(err => setError(err instanceof Error ? err.message : 'Failed to load feed'))
        } else {
          setError('Failed to load feed')
        }
      })
      .finally(() => setRefreshing(false))
  }, [tab])

  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin h-10 w-10 border-2 border-indigo-500 border-t-transparent rounded-full" />
          <p className="text-gray-400 text-sm">Loading feed...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="p-6 bg-red-900/50 border border-red-700 rounded-lg text-red-300 max-w-md text-center">
            <p className="font-medium mb-1">Failed to load feed</p>
            <p className="text-sm">{error}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="text-sm text-indigo-400 hover:text-indigo-300 underline"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (videos.length === 0) {
    return (
      <div className="h-dvh flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <svg className="mx-auto h-16 w-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <h2 className="text-xl font-semibold text-white mb-1">No videos yet</h2>
          <p className="text-gray-400">Share a video to get started</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-dvh flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-950 border-b border-gray-800 flex-shrink-0">
        <div className="flex gap-1">
          <button
            onClick={() => setTab('fyp')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === 'fyp' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            For You
          </button>
          <button
            onClick={() => setTab('discover')}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === 'discover' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'
            }`}
          >
            Discover
          </button>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 text-gray-400 hover:text-white transition-colors"
          aria-label="Refresh feed"
        >
          <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-scroll snap-y snap-mandatory scroll-smooth">
        {videos.map(video => (
          <VideoCard key={video.id} video={video} />
        ))}
      </div>
    </div>
  )
}
