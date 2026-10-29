import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { Menu, Monitor, MoonStar, Search, SunMedium, X, type LucideIcon } from 'lucide-react'
import { getPages } from '../content/loader'
import { search } from '../search'
import { useTheme, type Theme } from '../theme'
import { GitHubMark, ICON_PROPS } from './icons'

// Порядок переключения тем: системная, светлая, тёмная
const THEME_MODES: Record<Theme, { label: string; Icon: LucideIcon; next: Theme }> = {
  system: { label: 'системная', Icon: Monitor, next: 'light' },
  light: { label: 'светлая', Icon: SunMedium, next: 'dark' },
  dark: { label: 'тёмная', Icon: MoonStar, next: 'system' },
}

type TopBarProps = {
  menuOpen: boolean
  onToggleMenu: () => void
}

export function TopBar({ menuOpen, onToggleMenu }: TopBarProps) {
  const pages = getPages()
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const resultsId = useId()
  const [theme, setTheme] = useTheme()
  const mode = THEME_MODES[theme]
  const ModeIcon = mode.Icon
  const results = useMemo(() => search(pages, query), [pages, query])
  const showResults = searchOpen && query.trim() !== ''

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  // Клавиша «/» переводит фокус в поиск, если пользователь не печатает в другом поле
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
        return
      }
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
        return
      }
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setSearchOpen(false)
      event.currentTarget.blur()
    } else if (event.key === 'ArrowDown' && showResults) {
      event.preventDefault()
      listRef.current?.querySelector('a')?.focus()
    }
  }

  function handleListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === 'Escape') {
      inputRef.current?.focus()
      setSearchOpen(false)
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return
    }
    event.preventDefault()
    const links = Array.from(event.currentTarget.querySelectorAll('a'))
    const index = links.indexOf(event.target as HTMLAnchorElement)
    const next = event.key === 'ArrowDown' ? index + 1 : index - 1
    if (next < 0) {
      inputRef.current?.focus()
    } else {
      links[next]?.focus()
    }
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next && !event.currentTarget.contains(next)) {
      setSearchOpen(false)
    }
  }

  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-button menu-button"
        aria-controls="sidebar"
        aria-expanded={menuOpen}
        aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
        onClick={onToggleMenu}
      >
        {menuOpen ? <X {...ICON_PROPS} /> : <Menu {...ICON_PROPS} />}
      </button>

      <a href="#/introduction" className="brand">
        <img src="/freshgram-wheel.svg" alt="" width={28} height={28} className="brand-logo" />
        <span className="brand-text">
          freshGram<span className="brand-suffix"> · плагины</span>
        </span>
      </a>

      <div className="search" ref={searchRef} onBlur={handleBlur}>
        <Search {...ICON_PROPS} className="search-icon" />
        <input
          ref={inputRef}
          type="search"
          className="search-input"
          placeholder="Поиск по документации"
          aria-label="Поиск по документации"
          aria-controls={resultsId}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setSearchOpen(true)
          }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={handleInputKeyDown}
        />
        <kbd className="search-hint" aria-hidden="true">/</kbd>
        {showResults && (
          <ul id={resultsId} ref={listRef} className="search-results" onKeyDown={handleListKeyDown}>
            {results.length === 0 ? (
              <li className="search-empty">Ничего не найдено</li>
            ) : (
              results.map((page) => (
                <li key={page.slug}>
                  <a
                    href={`#/${page.slug}`}
                    className="search-result"
                    onClick={() => {
                      setSearchOpen(false)
                      setQuery('')
                    }}
                  >
                    <span className="search-result-title">{page.title}</span>
                    <span className="search-result-section">{page.section}</span>
                  </a>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <a
        href="https://github.com/Snowy-Fluffy/freshGram"
        className="icon-button github-link"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="freshGram на GitHub: официальный репозиторий"
      >
        <GitHubMark />
      </a>

      <button
        type="button"
        className="icon-button theme-button"
        onClick={() => setTheme(mode.next)}
        aria-label={`Тема оформления: ${mode.label}`}
      >
        <ModeIcon {...ICON_PROPS} />
      </button>
    </header>
  )
}
