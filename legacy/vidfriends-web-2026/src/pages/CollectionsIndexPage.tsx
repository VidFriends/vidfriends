import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Collection } from '../lib/types'

export function CollectionsIndexPage() {
  const navigate = useNavigate()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const fetchCollections = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.collections.list()
      setCollections(res.collections)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCollections()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await api.collections.create(newName.trim())
      setNewName('')
      setCreating(false)
      await fetchCollections()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create collection')
    }
  }

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return
    try {
      await api.collections.update(id, renameValue.trim())
      setRenamingId(null)
      setRenameValue('')
      await fetchCollections()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename collection')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.collections.remove(id)
      setDeleteConfirmId(null)
      await fetchCollections()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete collection')
    }
  }

  const startRename = (col: Collection) => {
    setRenamingId(col.id)
    setRenameValue(col.name)
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Collections</h1>
          <p className="text-gray-400 mt-1">Manage your video collections</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/collections/import')}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm"
          >
            Import
          </button>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors text-sm"
          >
            New Collection
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {creating && (
        <form onSubmit={handleCreate} className="flex gap-3 items-end max-w-md">
          <div className="flex-1">
            <label htmlFor="new-name" className="block text-sm font-medium text-gray-300 mb-1">
              Collection name
            </label>
            <input
              id="new-name"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="My collection"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!newName.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors text-sm"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => { setCreating(false); setNewName('') }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" role="status" />
        </div>
      ) : collections.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-500 text-lg">No collections yet</p>
          <p className="text-gray-600 text-sm mt-1">Create your first collection to start organizing videos</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map(col => (
            <div key={col.id} className="bg-gray-900 rounded-xl border border-gray-800 p-5 hover:border-gray-700 transition-colors">
              {renamingId === col.id ? (
                <div className="flex gap-2 items-center mb-3">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(col.id)
                      if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
                    }}
                  />
                  <button onClick={() => handleRename(col.id)} className="text-indigo-400 hover:text-indigo-300 text-sm">Save</button>
                  <button onClick={() => { setRenamingId(null); setRenameValue('') }} className="text-gray-400 hover:text-gray-300 text-sm">Cancel</button>
                </div>
              ) : (
                <div className="flex items-start justify-between mb-3">
                  <button
                    onClick={() => navigate(`/collections/${col.id}`)}
                    className="text-left flex-1"
                  >
                    <h3 className="text-lg font-semibold text-white hover:text-indigo-400 transition-colors">
                      {col.name}
                    </h3>
                  </button>
                  <div className="flex gap-1 ml-2">
                    <button
                      onClick={() => startRename(col)}
                      className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
                      title="Rename"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(col.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-800 transition-colors"
                      title="Delete"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => navigate(`/collections/${col.id}`)}
                className="text-left w-full"
              >
                <p className="text-sm text-gray-400">
                  {col.video_count} {col.video_count === 1 ? 'video' : 'videos'}
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  Created {new Date(col.created_at).toLocaleDateString()}
                </p>
              </button>

              {deleteConfirmId === col.id && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-sm text-red-300 mb-3">Delete "{col.name}" and all its videos?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(col.id)}
                      className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
