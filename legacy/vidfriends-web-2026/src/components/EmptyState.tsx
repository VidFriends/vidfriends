import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  className?: string
}

export function EmptyState({ icon, title, description, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${className}`}>
      <div className="mb-6">
        {icon}
      </div>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <p className="text-gray-400 mt-2 max-w-sm leading-relaxed">{description}</p>
    </div>
  )
}

export function FeedEmptyIcon() {
  return (
    <svg className="w-24 h-24 text-amber-400/80" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="48" r="40" stroke="currentColor" strokeWidth="2" className="text-amber-400/20" />
      <circle cx="48" cy="48" r="28" stroke="currentColor" strokeWidth="1.5" className="text-amber-400/30" />
      <circle cx="48" cy="48" r="16" stroke="currentColor" strokeWidth="2" className="text-amber-400/40" />
      <circle cx="48" cy="35" r="3" fill="currentColor" className="text-amber-400/60" />
      <circle cx="35" cy="48" r="3" fill="currentColor" className="text-amber-400/60" />
      <circle cx="61" cy="48" r="3" fill="currentColor" className="text-amber-400/60" />
      <circle cx="48" cy="61" r="3" fill="currentColor" className="text-amber-400/60" />
      <circle cx="48" cy="48" r="5" fill="currentColor" className="text-amber-300/80" />
      <path d="M38 56s4 6 10 6 10-6 10-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-amber-400/50" />
    </svg>
  )
}

export function InboxEmptyIcon() {
  return (
    <svg className="w-24 h-24 text-amber-400/80" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <rect x="20" y="28" width="56" height="44" rx="6" stroke="currentColor" strokeWidth="2" className="text-amber-400/30" />
      <path d="M20 44l28 16 28-16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400/50" />
      <circle cx="68" cy="28" r="14" fill="currentColor" className="text-amber-400/15" />
      <circle cx="68" cy="28" r="8" fill="currentColor" className="text-amber-400/25" />
      <circle cx="68" cy="28" r="3" fill="currentColor" className="text-amber-300/60" />
    </svg>
  )
}

export function HistoryEmptyIcon() {
  return (
    <svg className="w-24 h-24 text-amber-400/80" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="48" r="36" stroke="currentColor" strokeWidth="2" className="text-amber-400/25" />
      <path d="M48 30v18l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400/60" />
      <circle cx="48" cy="48" r="3" fill="currentColor" className="text-amber-300/80" />
      <path d="M24 36q6-12 18-16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-amber-400/30" />
      <path d="M72 36q-6-12-18-16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-amber-400/30" />
    </svg>
  )
}

export function ProfileEmptyIcon() {
  return (
    <svg className="w-24 h-24 text-amber-400/80" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <circle cx="48" cy="36" r="16" stroke="currentColor" strokeWidth="2" className="text-amber-400/40" />
      <circle cx="48" cy="36" r="6" fill="currentColor" className="text-amber-300/60" />
      <path d="M20 76c0-14 12.5-24 28-24s28 10 28 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-amber-400/40" />
      <path d="M42 72l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400/60" />
    </svg>
  )
}
