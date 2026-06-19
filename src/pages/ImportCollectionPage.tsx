import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { ImportUrlResult } from '../lib/types'

type ImportTab = 'urls' | 'youtube'
type ImportState = 'idle' | 'submitting' | 'polling' | 'complete' | 'error'

export function ImportCollectionPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<ImportTab>('urls')
  const [urlsText, setUrlsText] = useState('')
  const [importState, setImportState] = useState<ImportState>('idle')
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [results, setResults] = useState<ImportUrlResult[]>([])
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const urls = urlsText
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.length > 0)
    if (urls.length === 0) return

    setImportState('submitting')
    setError('')
    setResults([])
    setCollectionId(null)

    try {
      const res = await api.collections.importUrls(urls)
      setCollectionId(res.collection_id)

      if (res.results && res.results.length > 0) {
        setResults(res.results)
        setImportState('complete')
      } else {
        setImportState('polling')
        pollRef.current = setInterval(async () => {
          try {
            const col = await api.collections.get(res.collection_id)
            if (col.collection.video_count !== undefined) {
              if (pollRef.current) clearInterval(pollRef.current)
              pollRef.current = null
              setImportState('complete')
            }
          } catch {
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = null
            setError('Failed to check import status')
            setImportState('error')
          }
        }, 2000)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setImportState('error')
    }
  }

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
    setUrlsText('')
    setImportState('idle')
    setCollectionId(null)
    setResults([])
    setError('')
  }

  const summary = results.reduce(
    (acc, r) => {
      if (r.status === 'imported') acc.imported++
      else if (r.status === 'skipped') acc.skipped++
      else if (r.status === 'failed') acc.failed++
      return acc
    },
    { imported: 0, skipped: 0, failed: 0 }
  )

  const tabClass = (t: ImportTab) =>
    `px-4 py-2 rounded-lg text-sm font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Import Collections</h1>
        <p className="text-gray-400 mt-1">Import videos into a new collection</p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('urls')} className={tabClass('urls')}>
          Paste URLs
        </button>
        <button onClick={() => setTab('youtube')} className={tabClass('youtube')}>
          From YouTube
        </button>
      </div>

      {tab === 'urls' && (
        <div className="space-y-6 max-w-2xl">
          {error && importState === 'error' && (
            <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg flex items-center justify-between">
              <p className="text-red-300">{error}</p>
              <button onClick={handleReset} className="text-sm text-red-400 hover:underline">Try again</button>
            </div>
          )}

          {importState === 'idle' || importState === 'submitting' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="urls" className="block text-sm font-medium text-gray-300 mb-1">
                  Paste URLs (one per line)
                </label>
                <textarea
                  id="urls"
                  value={urlsText}
                  onChange={e => setUrlsText(e.target.value)}
                  rows={10}
                  placeholder="https://youtube.com/watch?v=...&#10;https://vimeo.com/...&#10;https://example.com/video/..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono text-sm"
                  disabled={importState === 'submitting'}
                />
              </div>
              <button
                type="submit"
                disabled={importState === 'submitting' || !urlsText.trim()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {importState === 'submitting' ? 'Importing...' : 'Import URLs'}
              </button>
            </form>
          ) : null}

          {importState === 'polling' && (
            <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
              <div className="flex items-center gap-3">
                <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
                <div>
                  <p className="text-white font-medium">Processing import...</p>
                  <p className="text-sm text-gray-400">Checking import status</p>
                </div>
              </div>
            </div>
          )}

          {importState === 'complete' && (
            <div className="space-y-6">
              {results.length > 0 && (
                <div className="flex gap-4 flex-wrap">
                  <div className="px-4 py-2 bg-emerald-900/50 border border-emerald-700 rounded-lg">
                    <span className="text-emerald-300 font-bold">{summary.imported}</span>
                    <span className="text-emerald-400/70 text-sm ml-1">imported</span>
                  </div>
                  {summary.skipped > 0 && (
                    <div className="px-4 py-2 bg-yellow-900/50 border border-yellow-700 rounded-lg">
                      <span className="text-yellow-300 font-bold">{summary.skipped}</span>
                      <span className="text-yellow-400/70 text-sm ml-1">skipped</span>
                    </div>
                  )}
                  {summary.failed > 0 && (
                    <div className="px-4 py-2 bg-red-900/50 border border-red-700 rounded-lg">
                      <span className="text-red-300 font-bold">{summary.failed}</span>
                      <span className="text-red-400/70 text-sm ml-1">failed</span>
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 text-sm">
                      <th className="pb-3 font-medium">URL</th>
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {results.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-900/50">
                        <td className="py-3 pr-4">
                          <span className="text-gray-300 text-sm break-all" title={r.url}>
                            {r.title || r.url.length > 60 ? r.url.substring(0, 60) + '...' : r.url}
                          </span>
                        </td>
                        <td className="py-3 pr-4">
                          {r.status === 'imported' ? (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/60 text-emerald-300">
                              Imported
                            </span>
                          ) : r.status === 'skipped' ? (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-900/60 text-yellow-300">
                              Skipped
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-900/60 text-red-300">
                              Failed
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-gray-400 text-sm">
                          {r.error || r.title || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3">
                {collectionId && (
                  <button
                    onClick={() => navigate(`/collections/${collectionId}`)}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                  >
                    View Collection
                  </button>
                )}
                <button
                  onClick={handleReset}
                  className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
                >
                  Import More
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'youtube' && (
        <div className="max-w-2xl p-6 bg-gray-900 rounded-xl border border-gray-800 space-y-4">
          <div>
            <h3 className="text-lg font-medium text-white">Import from YouTube</h3>
            <p className="text-gray-400 mt-1">
              Import your YouTube playlists and liked videos directly into VidFriends.
            </p>
          </div>
          <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
            <p className="text-gray-300 text-sm">
              YouTube import requires connecting your Google account via OAuth. This feature is coming soon.
            </p>
          </div>
          <button
            disabled
            className="px-6 py-3 bg-gray-700 text-gray-500 font-medium rounded-lg cursor-not-allowed"
            title="YouTube OAuth is not yet available"
          >
            Connect YouTube
          </button>
          <p className="text-xs text-gray-500">
            Once available, clicking this will redirect you to Google to authorize access to your YouTube account.
          </p>
        </div>
      )}
    </div>
  )
}
