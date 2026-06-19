import { useRef, useState, useEffect } from 'react'

interface LazyImageProps {
  src: string
  alt: string
  className?: string
  rootMargin?: string
}

export function LazyImage({ src, alt, className, rootMargin = '200px' }: LazyImageProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setLoaded(true)
          observer.disconnect()
        }
      },
      { rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [rootMargin])

  return (
    <div ref={ref} className={className}>
      {loaded ? (
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 w-full h-full object-contain"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gray-900" />
      )}
    </div>
  )
}
