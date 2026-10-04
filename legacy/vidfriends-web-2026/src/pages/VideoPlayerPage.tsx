import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Video } from '../lib/types'
import { VideoPlayer } from '../components/VideoPlayer'
import { LikeButton } from '../components/LikeButton'
import { ShareButton } from '../components/ShareButton'
import { CommentSection } from '../components/CommentSection'

export function VideoPlayerPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [video, setVideo] = useState<Video | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [likeLoading, setLikeLoading] = useState(false)
  const watchedRef = useRef(false)

  useEffect(() => {
    if (!id) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setError('')
    api.videos.getDetail(id)
      .then(data => {
        setVideo(data)
        setLiked(data.liked ?? false)
        setLikeCount(data.like_count)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load video'))
      .finally(() => setLoading(false))
  }, [id])

  const handleProgress = useCallback((seconds: number) => {
    if (!id || watchedRef.current) return
    if (seconds >= 3) {
      watchedRef.current = true
      api.videos.markWatched(id).catch(() => {})
    }
  }, [id])

  const toggleLike = useCallback(async () => {
    if (!id || likeLoading) return
    setLikeLoading(true)
    try {
      if (liked) {
        await api.videos.unlike(id)
        setLikeCount(c => c - 1)
      } else {
        await api.videos.like(id)
        setLikeCount(c => c + 1)
      }
      setLiked(!liked)
    } catch {
      // silently fail
    } finally {
      setLikeLoading(false)
    }
  }, [id, liked, likeLoading])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin h-10 w-10 border-2 border-indigo-500 border-t-transparent rounded-full" />
          <p className="text-gray-400 text-sm">Loading video...</p>
        </div>
      </div>
    )
  }

  if (error || !video) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="p-6 bg-red-900/30 border border-red-800 rounded-lg">
          <p className="text-red-300 font-medium mb-1">Failed to load video</p>
          <p className="text-sm text-red-400">{error || 'Video not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 underline"
          >
            Go back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <VideoPlayer
        src={video.file_url || ''}
        poster={video.thumbnail_url}
        onProgress={handleProgress}
      />

      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{video.title}</h1>
          <div className="flex items-center gap-2 mt-2 text-gray-400 text-sm">
            <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
              {video.user_name.charAt(0).toUpperCase()}
            </div>
            <span>{video.user_name}</span>
          </div>
        </div>

        {video.description && (
          <p className="text-gray-300 text-sm whitespace-pre-wrap">{video.description}</p>
        )}

        <div className="flex items-center gap-3">
          <LikeButton
            liked={liked}
            count={likeCount}
            onToggle={toggleLike}
            loading={likeLoading}
          />
          <ShareButton videoId={video.id} />
        </div>
      </div>

      <hr className="border-gray-800" />

      <CommentSection videoId={video.id} />
    </div>
  )
}
