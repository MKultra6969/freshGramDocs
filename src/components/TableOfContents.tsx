import { useEffect, useLayoutEffect, useState } from 'react'
import { scrollToAnchor } from '../router'

type Heading = {
  level: number
  text: string
  id: string
}

function readHeadings(): Heading[] {
  return Array.from(
    document.querySelectorAll<HTMLHeadingElement>('.markdown > h2[id], .markdown > h3[id]'),
    (element) => ({
      level: element.tagName === 'H3' ? 3 : 2,
      text: element.textContent ?? '',
      id: element.id,
    }),
  )
}

// Порог отсчитывается от нижнего края шапки, которая перекрывает верх окна
function activeHeadingId(ids: string[]): string | null {
  const topbar = document.querySelector('.topbar')
  const line = topbar ? topbar.getBoundingClientRect().bottom : 0
  let active: string | null = null
  for (const id of ids) {
    const element = document.getElementById(id)
    if (!element || element.getBoundingClientRect().top > line) {
      break
    }
    active = id
  }
  return active ?? ids[0] ?? null
}

export function TableOfContents({ body }: { body: string }) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  useLayoutEffect(() => {
    setHeadings(readHeadings())
  }, [body])

  useEffect(() => {
    if (headings.length === 0) {
      return
    }
    const ids = headings.map((heading) => heading.id)
    let frame = 0
    const update = () => {
      frame = 0
      setActiveId(activeHeadingId(ids))
    }
    const schedule = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(update)
      }
    }
    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.cancelAnimationFrame(frame)
    }
  }, [headings])

  if (headings.length === 0) {
    return null
  }

  return (
    <aside className="toc" aria-label="Содержание страницы">
      <p className="toc-title">На этой странице</p>
      <ul>
        {headings.map((heading) => {
          const active = heading.id === activeId
          return (
            <li key={heading.id} className={heading.level === 3 ? 'toc-sub' : undefined}>
              <a
                href={`#${heading.id}`}
                className={active ? 'is-active' : undefined}
                aria-current={active ? 'location' : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  scrollToAnchor(heading.id)
                }}
              >
                {heading.text}
              </a>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
