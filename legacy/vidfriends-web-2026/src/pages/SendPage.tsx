import { useState, useRef, type DragEvent } from 'react'
import { api } from '../lib/api'
import { FriendPicker } from '../components/FriendPicker'
import type { Friend } from '../lib/types'

type SendMode = 'link' | 'upload'
type SendStatus = 'idle' | 'sending' | 'success' | 'error'

export function SendPage() {
  const [mode, setMode] = useState<SendMode>('link')
  const [link, setLink] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<SendStatus>('idle')
  const [message, setMessage] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [videoId, setVideoId] = useState<string | null>(null)
  const [recipient, setRecipient] = useState<Friend | null>(null)
  const [caption, setCaption] = useState('')
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  const fullReset = () => {
    setStatus('idle')
    setMessage('')
    setLink('')
    setTitle('')
    setDescription('')
    setSelectedFile(null)
    setUploadProgress(0)
    setVideoId(null)
    setRecipient(null)
    setCaption('')
    setSendStatus('idle')
  }

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!link.trim()) return
    setStatus('sending')
    try {
      const { id } = await api.videos.create({ url: link.trim(), title: title.trim() || undefined, description: description.trim() || undefined })
      setVideoId(id)
      setStatus('success')
      setMessage('Video link submitted! It will be processed shortly.')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Failed to submit link')
    }
  }

  const handleFileUpload = async () => {
    if (!selectedFile) return
    setStatus('sending')
    setUploadProgress(0)
    try {
      const { id } = await api.videos.upload(selectedFile, title, description, setUploadProgress)
      setVideoId(id)
      setStatus('success')
      setMessage('Video uploaded! It will be processed shortly.')
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Failed to upload video')
    }
  }

  const handleSendToFriend = async () => {
    if (!videoId || !recipient) return
    setSendStatus('sending')
    try {
      await api.friends.send(recipient.user_id, videoId, caption.trim() || undefined)
      setSendStatus('sent')
      setMessage('Video sent to ' + recipient.username + '!')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to send video')
      setSendStatus('idle')
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('video/')) {
      setSelectedFile(file)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const showCreateForm = status === 'idle' || status === 'sending'
  const showShareForm = status === 'success' && videoId && sendStatus !== 'sent'
  const showFinalSuccess = sendStatus === 'sent' || (status === 'success' && !recipient && !showCreateForm)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Send a Video</h1>
        <p className="text-gray-400 mt-1">Share a video with friends</p>
      </div>

      {status === 'error' && !videoId && (
        <div className="p-4 bg-red-900/50 border border-red-700 rounded-lg flex items-center justify-between">
          <p className="text-red-300">{message}</p>
          <button onClick={fullReset} className="text-sm text-red-400 hover:underline">Try again</button>
        </div>
      )}

      {(showFinalSuccess) && (
        <div className="p-6 bg-emerald-900/50 border border-emerald-700 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-300 font-medium">{message || 'Video created successfully!'}</p>
              {!recipient && (
                <p className="text-emerald-400/70 text-sm mt-1">You can send it to a friend below.</p>
              )}
            </div>
            <button onClick={fullReset} className="text-sm text-emerald-400 hover:underline">Send another</button>
          </div>
        </div>
      )}

      {showCreateForm && (
        <>
          <div className="flex gap-2">
            <button
              onClick={() => { setMode('link'); setStatus('idle') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'link' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              Paste Link
            </button>
            <button
              onClick={() => { setMode('upload'); setStatus('idle') }}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${mode === 'upload' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              Upload File
            </button>
          </div>

          {mode === 'link' ? (
            <form onSubmit={handleSendLink} className="space-y-4 max-w-lg">
              <div>
                <label htmlFor="link" className="block text-sm font-medium text-gray-300 mb-1">Video Link</label>
                <input
                  id="link"
                  type="url"
                  required
                  value={link}
                  onChange={e => setLink(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">Title (optional)</label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="My video title"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-300 mb-1">Description (optional)</label>
                <textarea
                  id="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Add a description..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={status === 'sending' || !link.trim()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {status === 'sending' ? 'Submitting...' : 'Submit Link'}
              </button>
            </form>
          ) : (
            <div className="space-y-4 max-w-lg">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-xl p-6 sm:p-12 text-center transition-colors cursor-pointer
                  ${dragOver ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700 hover:border-gray-500 bg-gray-900'}`}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
                aria-label="Upload video file"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                />
                {selectedFile ? (
                  <div>
                    <p className="text-lg font-medium text-white">{selectedFile.name}</p>
                    <p className="text-sm text-gray-400 mt-1">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div>
                    <svg className="mx-auto h-12 w-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="mt-2 text-gray-400">Drag and drop a video file, or click to browse</p>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="uploadTitle" className="block text-sm font-medium text-gray-300 mb-1">Title (optional)</label>
                <input
                  id="uploadTitle"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="My video title"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label htmlFor="uploadDescription" className="block text-sm font-medium text-gray-300 mb-1">Description (optional)</label>
                <textarea
                  id="uploadDescription"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Add a description..."
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {status === 'sending' && (
                <div className="space-y-2">
                  <div className="w-full bg-gray-800 rounded-full h-3">
                    <div
                      className="bg-indigo-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-sm text-gray-400 text-right">{uploadProgress}%</p>
                </div>
              )}

              <button
                onClick={handleFileUpload}
                disabled={status === 'sending' || !selectedFile}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {status === 'sending' ? `Uploading ${uploadProgress}%` : 'Upload File'}
              </button>
            </div>
          )}
        </>
      )}

      {showShareForm && (
        <div className="max-w-lg space-y-4 p-6 bg-gray-900 rounded-xl border border-gray-800">
          <h2 className="text-lg font-semibold text-white">Share with a friend</h2>
          <p className="text-sm text-gray-400">Send this video to a friend on VidFriends</p>

          <FriendPicker
            selectedUserId={recipient?.user_id || null}
            onSelect={setRecipient}
          />

          {recipient && (
            <div>
              <label htmlFor="caption" className="block text-sm font-medium text-gray-300 mb-1">Add a message (optional)</label>
              <textarea
                id="caption"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="Say something..."
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSendToFriend}
              disabled={sendStatus === 'sending' || !recipient}
              className="flex-1 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {sendStatus === 'sending' ? 'Sending...' : `Send to ${recipient?.username || 'friend'}`}
            </button>
            <button
              onClick={fullReset}
              className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg transition-colors"
            >
              Skip
            </button>
          </div>

          {message && (
            <p className="text-sm text-red-400">{message}</p>
          )}
        </div>
      )}
    </div>
  )
}
