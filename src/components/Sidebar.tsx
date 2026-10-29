import { useEffect } from 'react'
import { Activity, BookOpen, Braces, Cpu, Download, FileCode, LifeBuoy, Package, Puzzle, Rocket, X, type LucideIcon } from 'lucide-react'
import type { Section } from '../content/loader'
import { DOCS_VERSION_LABEL } from '../version'
import { GitHubMark, ICON_PROPS, ICON_SMALL_PROPS } from './icons'

type SidebarProps = {
  sections: Section[]
  currentSlug: string
  open: boolean
  onClose: () => void
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  'Начало': Rocket,
  'Разработка': Package,
  'Концепции': BookOpen,
  'Возможности': Puzzle,
  'Справочник': Braces,
  'Примеры': FileCode,
  'Статус': Activity,
  'Поддержка': LifeBuoy,
  'Внутренности': Cpu,
}

export function Sidebar({ sections, currentSlug, open, onClose }: SidebarProps) {
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <>
      <div
        className={`sidebar-backdrop${open ? ' is-visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="sidebar"
        className={`sidebar${open ? ' is-open' : ''}`}
        aria-label="Разделы документации"
      >
        <div className="sidebar-head">
          <span>Разделы</span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть меню">
            <X {...ICON_PROPS} />
          </button>
        </div>
        <nav aria-label="Разделы">
          {sections.map((section) => {
            const SectionIcon = SECTION_ICONS[section.name]
            return (
              <div className="sidebar-section" key={section.name}>
                <h2 className="sidebar-title">
                  {SectionIcon && <SectionIcon {...ICON_PROPS} />}
                  <span>{section.name}</span>
                </h2>
                <ul>
                  {section.pages.map((page) => {
                    const active = page.slug === currentSlug
                    return (
                      <li key={page.slug}>
                        <a
                          href={`#/${page.slug}`}
                          className={active ? 'sidebar-link is-active' : 'sidebar-link'}
                          aria-current={active ? 'page' : undefined}
                          onClick={onClose}
                        >
                          {page.title}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>
        <p className="sidebar-version">Документация для freshGram {DOCS_VERSION_LABEL}</p>
        <div className="sidebar-links">
          <a href="https://github.com/Snowy-Fluffy/freshGram" target="_blank" rel="noopener noreferrer">
            <GitHubMark size={ICON_SMALL_PROPS.size} />
            Официальный репозиторий freshGram
          </a>
          <a href="https://github.com/MKultra6969" target="_blank" rel="noopener noreferrer">
            <GitHubMark size={ICON_SMALL_PROPS.size} />
            Создатель документации: MKultra6969
          </a>
        </div>
        <div className="sidebar-links">
          <a href="/llms.txt">
            <Download {...ICON_SMALL_PROPS} />
            llms.txt
          </a>
          <a href="/llms-full.txt">
            <Download {...ICON_SMALL_PROPS} />
            llms-full.txt
          </a>
        </div>
      </aside>
    </>
  )
}
