import { useState, useEffect, useMemo } from 'react'
import { api } from '../lib/api'
import type { WatchHistoryEntry } from '../lib/types'

const ITEMS_PER_PAGE = 10

export function HistoryPage() {
  const [entries, setEntries] = useState<WatchHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const handleSearch = (val: string) => { setSearch(val); setPage(1) }
  const handleDateFrom = (val: string) => { setDateFrom(val); setPage(1) }
  const handleDateTo = (val: string) => { setDateTo(val); setPage(1) }

  useEffect(() => {
    api.history.get()
      .then(data => setEntries(data))
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load history'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let result = entries
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(e =>
        e.title.toLowerCase().includes(q) ||
        e.user_name.toLowerCase().includes(q)
      )
    }
    if (dateFrom) {
      const from = new Date(dateFrom)
      result = result.filter(e => new Date(e.watched_at) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter(e => new Date(e.watched_at) <= to)
    }
    return result
  }, [entries, search, dateFrom, dateTo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)



  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" /></div>
  }

  if (error) {
    return <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300">{error}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Watch History</h1>
        <p className="text-gray-400 mt-1">Videos you've watched</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search by title or friend..."
          className="w-full sm:flex-1 min-w-0 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          aria-label="Search history"
        />
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400 whitespace-nowrap">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => handleDateFrom(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400 whitespace-nowrap">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => handleDateTo(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No watch history found</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-sm">
                  <th className="pb-3 font-medium">Video</th>
                  <th className="pb-3 font-medium">From</th>
                  <th className="pb-3 font-medium">Watched</th>
                  <th className="pb-3 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {paginated.map(entry => (
                  <tr key={`${entry.id}-${entry.watched_at}`} className="hover:bg-gray-900/50">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        {entry.thumbnail_url ? (
                          <img src={entry.thumbnail_url} alt="" className="w-12 h-8 rounded object-cover bg-gray-800" />
                        ) : (
                          <div className="w-12 h-8 rounded bg-gray-800 flex items-center justify-center">
                            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                          </div>
                        )}
                        <span className="text-white font-medium truncate max-w-[300px]">{entry.title}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-gray-400">{entry.user_name}</td>
                    <td className="py-3 pr-4 text-gray-400 whitespace-nowrap">{formatDate(entry.watched_at)}</td>
                    <td className="py-3 text-gray-400">{formatDuration(entry.progress_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <p className="text-sm text-gray-400 order-2 sm:order-1">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
            <div className="flex gap-2 order-1 sm:order-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm rounded-lg transition-colors"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-sm rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
