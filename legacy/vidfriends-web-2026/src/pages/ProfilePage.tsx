import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { Video } from '../lib/types'
import { useAuth } from '../context/AuthContext'
import { EmptyState, ProfileEmptyIcon } from '../components/EmptyState'

export function ProfilePage() {
  const { user } = useAuth()
  const [videos, setVideos] = useState<Video[]>([])
  const [videosLoading, setVideosLoading] = useState(true)
  const [videosError, setVideosError] = useState('')

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVideosLoading(true)
    api.users.getVideos(user.id)
      .then(data => setVideos(data))
      .catch(err => setVideosError(err instanceof Error ? err.message : 'Failed to load videos'))
      .finally(() => setVideosLoading(false))
  }, [user])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const initials = (name: string) =>
    name.slice(0, 2).toUpperCase()

  if (!user) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  const displayName = user.display_name || user.username
  const joinedDate = formatDate(user.created_at)

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 p-6 bg-gray-900 rounded-xl border border-gray-800">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={displayName}
            className="w-20 h-20 rounded-full object-cover bg-gray-800 ring-2 ring-indigo-500/50"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center ring-2 ring-indigo-500/50">
            <span className="text-2xl font-bold text-white">{initials(displayName)}</span>
          </div>
        )}
        <div className="text-center sm:text-left flex-1">
          <h1 className="text-2xl font-bold text-white">{displayName}</h1>
          <p className="text-gray-400">@{user.username}</p>
          <p className="text-gray-500 text-sm mt-1">{user.email}</p>
          <p className="text-gray-600 text-xs mt-2">Member since {joinedDate}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Videos" value={videos.length} />
        <StatCard label="Likes" value={videos.reduce((sum, v) => sum + (v.like_count || 0), 0)} />
        <StatCard label="Comments" value={videos.reduce((sum, v) => sum + (v.comment_count || 0), 0)} />
      </div>

      <div>
        <h2 className="text-xl font-bold text-white mb-4">Videos</h2>
        {videosLoading ? (
          <div className="flex justify-center py-8"><div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>
        ) : videosError ? (
          <div className="p-8 text-center border-2 border-dashed border-gray-800 rounded-xl">
            <svg className="mx-auto h-10 w-10 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500">Could not load videos</p>
            <p className="text-sm text-gray-600 mt-1">{videosError}</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-gray-800 rounded-xl">
            <EmptyState
              icon={<ProfileEmptyIcon />}
              title="Welcome!"
              description="You haven't uploaded any videos yet. Share your first video with friends!"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map(video => (
              <div key={video.id} className="group bg-gray-900 rounded-xl border border-gray-800 overflow-hidden hover:border-gray-700 transition-colors">
                {video.thumbnail_url ? (
                  <img src={video.thumbnail_url} alt={video.title || ''} className="w-full aspect-video object-cover bg-gray-800" />
                ) : (
                  <div className="w-full aspect-video bg-gray-800 flex items-center justify-center">
                    <svg className="w-12 h-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                )}
                <div className="p-3">
                  <p className="text-white font-medium truncate">{video.title || 'Untitled'}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>{video.like_count || 0} likes</span>
                    <span>{video.comment_count || 0} comments</span>
                    <span>{formatDate(video.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-5 bg-gray-900 rounded-xl border border-gray-800 text-center sm:text-left">
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value.toLocaleString()}</p>
    </div>
  )
}
