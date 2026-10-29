import { useEffect, useState, type MouseEvent } from 'react'
import { TriangleAlert } from 'lucide-react'
import { getPage, getPages, getSections } from './content/loader'
import { HeroMark } from './components/HeroMark'
import { ICON_PROPS } from './components/icons'
import { PageView } from './components/PageView'
import { Sidebar } from './components/Sidebar'
import { TableOfContents } from './components/TableOfContents'
import { TopBar } from './components/TopBar'
import { anchorFromHash, DEFAULT_SLUG, scrollToAnchor, useDocumentTitle, useSlug } from './router'

const pages = getPages()
const sections = getSections()

function NotFound() {
  return (
    <article className="page not-found">
      <HeroMark />
      <h1>Страница не найдена</h1>
      <p>
        Такой страницы нет. Вернитесь к <a href={`#/${DEFAULT_SLUG}`}>введению</a> или выберите раздел в меню.
      </p>
    </article>
  )
}

// Переводит фокус на основное содержимое без изменения адреса (#/slug)
function skipToContent(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault()
  document.getElementById('content')?.focus()
}

export function App() {
  const slug = useSlug()
  const [menuOpen, setMenuOpen] = useState(false)
  const page = getPage(slug)
  const index = pages.findIndex((item) => item.slug === slug)
  const prev = index > 0 ? pages[index - 1] : null
  const next = index >= 0 && index < pages.length - 1 ? pages[index + 1] : null

  useDocumentTitle(page ? page.title : 'Страница не найдена')

  useEffect(() => {
    window.scrollTo(0, 0)
    setMenuOpen(false)
  }, [slug])

  useEffect(() => {
    const scrollToHashAnchor = () => {
      const id = anchorFromHash(window.location.hash)
      if (id) {
        scrollToAnchor(id)
      }
    }
    scrollToHashAnchor()
    window.addEventListener('hashchange', scrollToHashAnchor)
    return () => window.removeEventListener('hashchange', scrollToHashAnchor)
  }, [])

  return (
    <div className="app">
      <a href="#content" className="skip-link" onClick={skipToContent}>
        Перейти к содержимому
      </a>
      <div className="beta-banner" role="note">
        <TriangleAlert {...ICON_PROPS} className="beta-icon" />
        <span>Документация описывает бета-версию: API может меняться.</span>
      </div>
      <TopBar menuOpen={menuOpen} onToggleMenu={() => setMenuOpen((open) => !open)} />
      <div className="layout">
        <Sidebar
          sections={sections}
          currentSlug={slug}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
        />
        <main id="content" className="content" tabIndex={-1}>
          {page ? <PageView key={page.slug} page={page} prev={prev} next={next} /> : <NotFound />}
        </main>
        {page && <TableOfContents key={page.slug} body={page.body} />}
      </div>
    </div>
  )
}
