import type { Page } from './content/loader'
import { plainText } from './content/text'

const MAX_RESULTS = 8

const haystacks = new Map<string, string>()

function haystackOf(page: Page): string {
  let text = haystacks.get(page.slug)
  if (text === undefined) {
    text = `${page.title} ${page.description} ${plainText(page.body)}`.toLowerCase()
    haystacks.set(page.slug, text)
  }
  return text
}

export function search(pages: readonly Page[], query: string): Page[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return []
  }
  const results: Page[] = []
  for (const page of pages) {
    if (haystackOf(page).includes(needle)) {
      results.push(page)
      if (results.length === MAX_RESULTS) {
        break
      }
    }
  }
  return results
}
