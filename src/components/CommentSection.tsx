import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import type { Comment } from '../lib/types'

interface CommentSectionProps {
  videoId: string
}

function groupComments(comments: Comment[]): { top: Comment[]; replies: Record<string, Comment[]> } {
  const top: Comment[] = []
  const replies: Record<string, Comment[]> = {}

  for (const c of comments) {
    if (c.parent_id) {
      if (!replies[c.parent_id]) replies[c.parent_id] = []
      replies[c.parent_id].push(c)
    } else {
      top.push(c)
    }
  }

  top.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  for (const key of Object.keys(replies)) {
    replies[key].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }

  return { top, replies }
}

function ReplyForm({ videoId, parentId, onDone }: { videoId: string; parentId: string; onDone: () => void }) {
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    setSubmitting(true)
    try {
      await api.videos.addComment(videoId, body.trim(), parentId)
      setBody('')
      onDone()
    } catch {
      // silently fail
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
      <input
        type="text"
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Write a reply..."
        maxLength={500}
        className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        aria-label="Reply to comment"
      />
      <button
        type="submit"
        disabled={submitting || !body.trim()}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
      >
        {submitting ? '...' : 'Reply'}
      </button>
    </form>
  )
}

function CommentItem({
  comment,
  replies,
  videoId,
  onRefresh,
}: {
  comment: Comment
  replies: Comment[]
  videoId: string
  onRefresh: () => void
}) {
  const [showReply, setShowReply] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center text-sm font-bold text-indigo-300 flex-shrink-0 mt-0.5">
          {comment.user_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200">{comment.user_name}</span>
            <span className="text-xs text-gray-500">
              {new Date(comment.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          <p className="text-sm text-gray-100 mt-0.5 whitespace-pre-wrap break-words">{comment.body}</p>
          <button
            onClick={() => setShowReply(!showReply)}
            className="text-xs text-gray-400 hover:text-indigo-400 mt-1 transition-colors"
            aria-label={showReply ? 'Cancel reply' : 'Reply to comment'}
          >
            {showReply ? 'Cancel' : 'Reply'}
          </button>
        </div>
      </div>

      {showReply && (
        <div className="ml-11">
          <ReplyForm videoId={videoId} parentId={comment.id} onDone={() => { setShowReply(false); onRefresh() }} />
        </div>
      )}

      {replies.length > 0 && (
        <div className="ml-11 space-y-3 border-l-2 border-gray-800 pl-4">
          {replies.map(reply => (
            <div key={reply.id} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0 mt-0.5">
                {reply.user_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-200">{reply.user_name}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(reply.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-sm text-gray-100 mt-0.5 whitespace-pre-wrap break-words">{reply.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function CommentSection({ videoId }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchComments = useCallback(() => {
    setLoading(true)
    setError('')
    api.videos.getComments(videoId)
      .then(data => {
        setComments(data)
        setError('')
      })
      .catch(() => setError('Failed to load comments'))
      .finally(() => setLoading(false))
  }, [videoId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchComments()
  }, [fetchComments, refreshKey])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return
    setSubmitting(true)
    try {
      await api.videos.addComment(videoId, body.trim())
      setBody('')
      setRefreshKey(k => k + 1)
    } catch {
      setError('Failed to post comment')
    } finally {
      setSubmitting(false)
    }
  }

  const { top, replies } = groupComments(comments)

  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4">
        Comments {comments.length > 0 && <span className="text-gray-400 font-normal">({comments.length})</span>}
      </h3>

      <form onSubmit={handleSubmit} className="flex gap-3 mb-6">
        <input
          type="text"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Add a comment..."
          maxLength={500}
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          aria-label="Add a comment"
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Posting...' : 'Post'}
        </button>
      </form>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-800 rounded-lg mb-4">
          <p className="text-sm text-red-300">{error}</p>
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="text-sm text-red-200 underline mt-1 hover:text-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      ) : !error && top.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No comments yet. Be the first to comment!</p>
      ) : (
        <div className="space-y-5">
          {top.map(comment => (
            <CommentItem
              key={comment.id}
              comment={comment}
              replies={replies[comment.id] || []}
              videoId={videoId}
              onRefresh={() => setRefreshKey(k => k + 1)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
