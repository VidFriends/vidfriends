import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import type { Collection, CollectionVideo, Video } from '../lib/types'

export function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [collection, setCollection] = useState<Collection | null>(null)
  const [videos, setVideos] = useState<CollectionVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [showAddModal, setShowAddModal] = useState(false)
  const [userVideos, setUserVideos] = useState<Video[]>([])
  const [loadingUserVideos, setLoadingUserVideos] = useState(false)
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const fetchData = async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const [colRes, videosRes] = await Promise.all([
        api.collections.get(id),
        api.collections.getVideos(id),
      ])
      setCollection(colRes.collection)
      setVideos(videosRes.videos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collection')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const handleRename = async () => {
    if (!id || !renameValue.trim()) return
    try {
      await api.collections.update(id, renameValue.trim())
      setRenaming(false)
      setRenameValue('')
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename collection')
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await api.collections.remove(id)
      navigate('/collections')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete collection')
    }
  }

  const handleRemoveVideo = async (videoId: string) => {
    if (!id) return
    try {
      await api.collections.removeVideo(id, videoId)
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove video')
    }
  }

  const openAddModal = async () => {
    if (!user) return
    setShowAddModal(true)
    setSelectedVideoId(null)
    setLoadingUserVideos(true)
    try {
      const res = await api.users.getVideos(user.id)
      setUserVideos(res)
    } catch {
      setUserVideos([])
    } finally {
      setLoadingUserVideos(false)
    }
  }

  const handleAddVideo = async () => {
    if (!id || !selectedVideoId) return
    setAdding(true)
    try {
      await api.collections.addVideo(id, selectedVideoId)
      setShowAddModal(false)
      setSelectedVideoId(null)
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add video')
    } finally {
      setAdding(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" role="status" />
      </div>
    )
  }

  if (error && !collection) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate('/collections')} className="text-indigo-400 hover:text-indigo-300 text-sm">
          &larr; Back to Collections
        </button>
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg">
          <p className="text-red-300">{error}</p>
        </div>
      </div>
    )
  }

  if (!collection) return null

  return (
    <div className="space-y-8">
      <div>
        <button
          onClick={() => navigate('/collections')}
          className="text-indigo-400 hover:text-indigo-300 text-sm mb-4 inline-block"
        >
          &larr; Back to Collections
        </button>

        {renaming ? (
          <div className="flex gap-3 items-end mb-4">
            <div className="flex-1 max-w-md">
              <label htmlFor="rename" className="block text-sm font-medium text-gray-300 mb-1">Collection name</label>
              <input
                id="rename"
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRename()
                  if (e.key === 'Escape') { setRenaming(false); setRenameValue('') }
                }}
              />
            </div>
            <button onClick={handleRename} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg">
              Save
            </button>
            <button onClick={() => { setRenaming(false); setRenameValue('') }} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white">{collection.name}</h1>
              <p className="text-gray-400 mt-1">{videos.length} {videos.length === 1 ? 'video' : 'videos'}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setRenaming(true); setRenameValue(collection.name) }}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
              >
                Rename
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-2 bg-red-900/50 hover:bg-red-900 text-red-300 text-sm font-medium rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="p-4 bg-gray-900 border border-red-800 rounded-xl">
          <p className="text-red-300 text-sm mb-3">
            Delete "{collection.name}" and remove all its videos from the collection?
          </p>
          <div className="flex gap-2">
            <button onClick={handleDelete} className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded-lg">
              Delete Collection
            </button>
            <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-white">Videos</h2>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Add Video
        </button>
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-16 bg-gray-900 rounded-xl border border-gray-800">
          <p className="text-gray-500">No videos in this collection</p>
          <p className="text-gray-600 text-sm mt-1">Add videos to start building your collection</p>
        </div>
      ) : (
        <div className="space-y-2">
          {videos.map(video => (
            <div
              key={video.id}
              className="flex items-center justify-between bg-gray-900 rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-colors"
            >
              <button
                onClick={() => navigate(`/videos/${video.id}`)}
                className="flex items-center gap-4 flex-1 min-w-0 text-left"
              >
                <div className="w-12 h-12 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-white font-medium truncate">{video.filename}</p>
                  <p className="text-gray-500 text-xs">
                    {video.duration ? `${Math.round(video.duration)}s` : 'Unknown duration'}
                    {' · '}
                    {new Date(video.created_at).toLocaleDateString()}
                  </p>
                </div>
              </button>
              <button
                onClick={() => handleRemoveVideo(video.id)}
                className="p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-800 transition-colors ml-4 flex-shrink-0"
                title="Remove from collection"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowAddModal(false)}>
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">Add Video to Collection</h3>

            {loadingUserVideos ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
              </div>
            ) : userVideos.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No videos available. Upload videos first.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {userVideos.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVideoId(v.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedVideoId === v.id
                        ? 'border-indigo-500 bg-indigo-900/20'
                        : 'border-gray-800 hover:border-gray-700 bg-gray-800/50'
                    }`}
                  >
                    <p className="text-white text-sm font-medium truncate">{v.title || v.id}</p>
                    <p className="text-gray-500 text-xs">{v.duration ? `${Math.round(parseFloat(v.duration))}s` : 'Unknown duration'}</p>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleAddVideo}
                disabled={!selectedVideoId || adding}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
              >
                {adding ? 'Adding...' : 'Add to Collection'}
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
