import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import type { Friend } from '../lib/types'

interface FriendPickerProps {
  selectedUserId: string | null
  onSelect: (friend: Friend | null) => void
}

export function FriendPicker({ selectedUserId, onSelect }: FriendPickerProps) {
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.friends.list()
      .then(data => setFriends(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = search.trim()
    ? friends.filter(f =>
        f.username.toLowerCase().includes(search.toLowerCase())
      )
    : friends

  const selected = friends.find(f => f.user_id === selectedUserId)

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-300">Send to</label>

      {selected ? (
        <div className="flex items-center justify-between p-3 bg-gray-800 border border-indigo-600 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600/40 flex items-center justify-center text-sm font-bold text-indigo-300">
              {selected.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white font-medium text-sm">{selected.username}</p>
            </div>
          </div>
          <button
            onClick={() => onSelect(null)}
            className="text-sm text-gray-400 hover:text-red-400 transition-colors"
            aria-label="Remove recipient"
          >
            Change
          </button>
        </div>
      ) : (
        <div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={loading ? 'Loading friends...' : 'Search friends...'}
            disabled={loading}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
            aria-label="Search friends"
          />
          {loading && (
            <p className="text-sm text-gray-500 mt-2">Loading friends...</p>
          )}
          {!loading && search.trim() && filtered.length === 0 && (
            <p className="text-sm text-gray-500 mt-2">
              {friends.length === 0
                ? 'No friends yet. Add friends from the profile page.'
                : 'No friends match your search.'}
            </p>
          )}
          {!loading && search.trim() && filtered.length > 0 && (
            <div className="mt-2 border border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-800 max-h-48 overflow-y-auto">
              {filtered.map(friend => (
                <button
                  key={friend.id}
                  onClick={() => { onSelect(friend); setSearch('') }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-indigo-600/40 flex items-center justify-center text-sm font-bold text-indigo-300 flex-shrink-0">
                    {friend.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{friend.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {!loading && !search.trim() && friends.length > 0 && (
            <p className="text-sm text-gray-500 mt-2">Type to search friends</p>
          )}
        </div>
      )}
    </div>
  )
}
