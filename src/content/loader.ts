export type Page = {
  slug: string
  title: string
  description: string
  section: string
  order: number
  status: string
  body: string
}

export type Section = {
  name: string
  pages: Page[]
}

const SECTION_ORDER: readonly string[] = [
  'Начало',
  'Разработка',
  'Концепции',
  'Возможности',
  'Справочник',
  'Примеры',
  'Статус',
  'Поддержка',
  'Внутренности',
]

const DEFAULT_SECTION = 'Прочее'

const sources: Record<string, string> = import.meta.glob('/content/ru/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

function unquote(value: string): string {
  const quote = value[0]
  if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
    return value.slice(1, -1)
  }
  return value
}

function parseFrontmatter(source: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)
  if (!match) {
    return { meta: {}, body: source }
  }
  const meta: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim())
    if (pair) {
      meta[pair[1]] = unquote(pair[2].trim())
    }
  }
  return { meta, body: source.slice(match[0].length) }
}

function parseOrder(value: string | undefined): number {
  const n = value ? Number(value) : NaN
  return Number.isFinite(n) ? n : Infinity
}

function toPage(path: string, source: string): Page {
  const { meta, body } = parseFrontmatter(source)
  const fileName = path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')
  return {
    slug: meta.slug || fileName,
    title: meta.title || '',
    description: meta.description || '',
    section: meta.section || DEFAULT_SECTION,
    order: parseOrder(meta.order),
    status: meta.status || '',
    body: body.trim(),
  }
}

function sectionRank(section: string): number {
  const index = SECTION_ORDER.indexOf(section)
  return index === -1 ? SECTION_ORDER.length : index
}

function compareValues<T extends string | number>(a: T, b: T): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const PAGES: Page[] = Object.entries(sources)
  .map(([path, source]) => toPage(path, source))
  .sort(
    (a, b) =>
      sectionRank(a.section) - sectionRank(b.section) ||
      a.section.localeCompare(b.section, 'ru') ||
      compareValues(a.order, b.order) ||
      compareValues(a.slug, b.slug),
  )

export function getPages(): Page[] {
  return PAGES
}

export function getPage(slug: string): Page | undefined {
  return PAGES.find((page) => page.slug === slug)
}

export function getSections(): Section[] {
  const sections: Section[] = []
  for (const page of PAGES) {
    const last = sections[sections.length - 1]
    if (last && last.name === page.section) {
      last.pages.push(page)
    } else {
      sections.push({ name: page.section, pages: [page] })
    }
  }
  return sections
}
