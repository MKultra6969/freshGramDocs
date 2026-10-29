import { useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, CircleCheck, Copy, Download, FlaskConical, Info, Wrench, type LucideIcon } from 'lucide-react'
import { copyText } from '../clipboard'
import type { Page } from '../content/loader'
import { DEFAULT_SLUG } from '../router'
import { DOCS_VERSION_LABEL } from '../version'
import { HeroMark } from './HeroMark'
import { ICON_PROPS, ICON_SMALL_PROPS } from './icons'
import { Markdown } from './Markdown'

type PageViewProps = {
  page: Page
  prev: Page | null
  next: Page | null
}

type StatusStyle = { className: string; Icon: LucideIcon }

const STATUSES: Record<string, StatusStyle> = {
  стабильно: { className: 'status-stable', Icon: CircleCheck },
  экспериментально: { className: 'status-experimental', Icon: FlaskConical },
  WIP: { className: 'status-wip', Icon: Wrench },
}

const UNKNOWN_STATUS: StatusStyle = { className: 'status-unknown', Icon: Info }

const COPIED_TIMEOUT_MS = 2000
const REVOKE_DELAY_MS = 1000

function markdownFor(page: Page): string {
  return `# ${page.title}\n\n> ${page.description}\n\n${page.body}`
}

function downloadMarkdown(page: Page) {
  const url = URL.createObjectURL(new Blob([markdownFor(page)], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${page.slug}.md`
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Отзыв сразу после click в части браузеров обрывает загрузку
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

type CopyState = 'idle' | 'copied' | 'failed'

function AiActions({ page }: { page: Page }) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function copy() {
    const ok = await copyText(markdownFor(page))
    window.clearTimeout(timer.current)
    setState(ok ? 'copied' : 'failed')
    timer.current = window.setTimeout(() => setState('idle'), COPIED_TIMEOUT_MS)
  }

  const copied = state === 'copied'
  const copyLabel = copied ? 'Скопировано' : 'Скопировать для ИИ'
  const statusText = state === 'failed' ? 'Не удалось скопировать' : copied ? 'Скопировано' : ''

  return (
    <div className="page-actions">
      <button type="button" className="btn" onClick={copy} aria-label={copyLabel}>
        {copied ? <Check {...ICON_PROPS} /> : <Copy {...ICON_PROPS} />}
        <span className="btn-label">{copyLabel}</span>
      </button>
      <button type="button" className="btn" onClick={() => downloadMarkdown(page)} aria-label="Скачать .md">
        <Download {...ICON_PROPS} />
        <span className="btn-label">Скачать .md</span>
      </button>
      <span className="visually-hidden" aria-live="polite">
        {statusText}
      </span>
    </div>
  )
}

export function PageView({ page, prev, next }: PageViewProps) {
  const status = page.status ? (STATUSES[page.status] ?? UNKNOWN_STATUS) : null

  return (
    <article className="page">
      <header className="page-header">
        {page.slug === DEFAULT_SLUG && <HeroMark />}
        <nav className="breadcrumb" aria-label="Путь к странице">
          <ol>
            <li>
              <a href={`#/${DEFAULT_SLUG}`}>Документация</a>
              <ChevronRight {...ICON_SMALL_PROPS} />
            </li>
            <li>{page.section}</li>
          </ol>
        </nav>
        <h1>{page.title}</h1>
        {page.description && <p className="page-description">{page.description}</p>}
        {status && (
          <span className={`status-badge ${status.className}`}>
            <status.Icon {...ICON_SMALL_PROPS} />
            {page.status}
          </span>
        )}
        {page.slug === 'introduction' && <p className="page-version">Документация для freshGram {DOCS_VERSION_LABEL}</p>}
        <AiActions key={page.slug} page={page} />
      </header>

      <Markdown source={page.body} />

      {(prev || next) && (
        <nav className="pager" aria-label="Соседние страницы">
          {prev && (
            <a className="pager-link pager-prev" href={`#/${prev.slug}`}>
              <span className="pager-label">
                <ChevronLeft {...ICON_SMALL_PROPS} />
                Назад
              </span>
              <span className="pager-title">{prev.title}</span>
            </a>
          )}
          {next && (
            <a className="pager-link pager-next" href={`#/${next.slug}`}>
              <span className="pager-label">
                Далее
                <ChevronRight {...ICON_SMALL_PROPS} />
              </span>
              <span className="pager-title">{next.title}</span>
            </a>
          )}
        </nav>
      )}
    </article>
  )
}
