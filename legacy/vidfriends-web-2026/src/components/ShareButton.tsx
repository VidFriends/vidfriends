import { useState, useCallback } from 'react'

interface ShareButtonProps {
  videoId: string
}

export function ShareButton({ videoId }: ShareButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/videos/${videoId}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const input = document.createElement('input')
      input.value = url
      document.body.appendChild(input)
      input.select()
      document.execCommand('copy')
      document.body.removeChild(input)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [videoId])

  if ('share' in navigator && navigator.share) {
    return (
      <button
        onClick={() => navigator.share({ url: `/videos/${videoId}` })}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600 hover:text-indigo-400 transition-colors"
        aria-label="Share this video"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <span className="text-sm font-medium">Share</span>
      </button>
    )
  }

  return (
    <button
      onClick={handleShare}
      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600 hover:text-indigo-400 transition-colors"
      aria-label={copied ? 'Link copied' : 'Copy video link'}
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
      </svg>
      <span className="text-sm font-medium">{copied ? 'Copied!' : 'Share'}</span>
    </button>
  )
}
