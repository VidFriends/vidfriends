interface LikeButtonProps {
  liked: boolean
  count: number
  onToggle: () => void
  loading?: boolean
}

export function LikeButton({ liked, count, onToggle, loading }: LikeButtonProps) {
  return (
    <button
      onClick={onToggle}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
        liked
          ? 'border-red-800 bg-red-900/30 text-red-400 hover:bg-red-900/50'
          : 'border-gray-700 bg-gray-800/50 text-gray-300 hover:border-gray-600 hover:text-red-400'
      } disabled:opacity-50`}
      aria-label={liked ? 'Unlike this video' : 'Like this video'}
    >
      {liked ? (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      )}
      <span className="text-sm font-medium">{count}</span>
    </button>
  )
}
