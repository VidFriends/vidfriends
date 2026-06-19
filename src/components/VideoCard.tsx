import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Video } from '../lib/types'
import { LazyImage } from './LazyImage'

interface VideoCardProps {
  video: Video
  style?: React.CSSProperties
  isActive?: boolean
}

export function VideoCard({ video, style, isActive = false }: VideoCardProps) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const watchedRef = useRef(false)
  const [isVisible, setIsVisible] = useState(false)
  const [liked, setLiked] = useState(video.liked ?? false)
  const [likeCount, setLikeCount] = useState(video.like_count)

  const toggleLike = useCallback(async () => {
    try {
      if (liked) {
        await api.videos.unlike(video.id)
        setLikeCount(c => c - 1)
      } else {
        await api.videos.like(video.id)
        setLikeCount(c => c + 1)
      }
      setLiked(!liked)
    } catch {
      // silently fail
    }
  }, [liked, video.id])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting
        setIsVisible(visible)

        if (visible && videoRef.current && isActive) {
          videoRef.current.currentTime = 0
          videoRef.current.play().catch(() => {})
        } else if (!visible && videoRef.current) {
          videoRef.current.pause()
        }

        if (visible && !watchedRef.current) {
          watchedRef.current = true
          api.videos.markWatched(video.id).catch(() => {})
        }
      },
      { threshold: 0.6 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [video.id, isActive])

  const renderVideoOrPlaceholder = () => {
    if (isActive && video.file_url) {
      return (
        <video
          ref={videoRef}
          src={video.file_url}
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 w-full h-full object-contain"
        />
      )
    }

    if (video.thumbnail_url) {
      return (
        <LazyImage
          src={video.thumbnail_url}
          alt={video.title}
          className="absolute inset-0 w-full h-full"
          rootMargin="100px"
        />
      )
    }

    if (video.file_url) {
      return (
        <video
          ref={videoRef}
          src={video.file_url}
          muted
          loop
          playsInline
          preload="none"
          className="absolute inset-0 w-full h-full object-contain"
        />
      )
    }

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
        <svg className="w-16 h-16 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        </svg>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={style}
      className="relative w-full h-full bg-black overflow-hidden"
    >
      {renderVideoOrPlaceholder()}

      {isVisible && !video.file_url && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-black/60 rounded-full p-4">
            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-6 pt-16">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                {video.user_name.charAt(0).toUpperCase()}
              </div>
              <span className="text-white font-medium text-sm truncate">{video.user_name}</span>
            </div>
            {video.title && (
              <h2 className="text-white font-semibold text-lg leading-tight mt-1">{video.title}</h2>
            )}
            {video.description && (
              <p className="text-gray-300 text-sm mt-1 line-clamp-2">{video.description}</p>
            )}
          </div>

          <div className="flex flex-col items-center gap-4 ml-4 flex-shrink-0">
            <button
              onClick={toggleLike}
              className="flex flex-col items-center gap-1"
              aria-label={liked ? 'Unlike' : 'Like'}
            >
              <div className={`p-2.5 rounded-full transition-colors ${liked ? 'bg-red-500/20' : 'bg-white/10 hover:bg-white/20'}`}>
                {liked ? (
                  <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                )}
              </div>
              <span className={`text-xs font-medium ${liked ? 'text-red-400' : 'text-gray-300'}`}>
                {likeCount}
              </span>
            </button>

            <button
              onClick={() => navigate(`/videos/${video.id}`)}
              className="flex flex-col items-center gap-1"
              aria-label="View comments"
            >
              <div className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <span className="text-xs font-medium text-gray-300">{video.comment_count}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
