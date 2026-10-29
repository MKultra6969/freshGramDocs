import { useEffect, useState } from 'react'

export const DEFAULT_SLUG = 'introduction'

export function slugFromHash(hash: string): string {
  if (!hash.startsWith('#/')) {
    return DEFAULT_SLUG
  }
  const raw = hash.slice(2)
  let slug = raw
  try {
    slug = decodeURIComponent(raw)
  } catch {
    slug = raw
  }
  return slug.trim() || DEFAULT_SLUG
}

export function anchorFromHash(hash: string): string | null {
  if (hash.length < 2 || hash.startsWith('#/')) {
    return null
  }
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return hash.slice(1)
  }
}

export function navigate(slug: string): void {
  window.location.hash = `/${slug}`
}

export function useSlug(): string {
  const [slug, setSlug] = useState(() => slugFromHash(window.location.hash))

  useEffect(() => {
    const update = () => {
      if (anchorFromHash(window.location.hash) === null) {
        setSlug(slugFromHash(window.location.hash))
      }
    }
    window.addEventListener('hashchange', update)
    update()
    return () => window.removeEventListener('hashchange', update)
  }, [])

  return slug
}

export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · freshGram`
  }, [title])
}

export function scrollToAnchor(id: string): void {
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}
