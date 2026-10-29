import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'
import ReactMarkdown, { type Components, type ExtraProps } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { Check, Copy, ExternalLink, Info, Lightbulb, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import { copyText } from '../clipboard'
import { scrollToAnchor } from '../router'
import { ICON_PROPS, ICON_SMALL_PROPS } from './icons'

type ElementProps<T extends 'a' | 'blockquote' | 'pre' | 'table'> = ComponentPropsWithoutRef<T> & ExtraProps

type CalloutKind = 'NOTE' | 'TIP' | 'WARNING' | 'CAUTION'

const CALLOUTS: Record<CalloutKind, { title: string; className: string; Icon: LucideIcon }> = {
  NOTE: { title: 'Примечание', className: 'callout-note', Icon: Info },
  TIP: { title: 'Совет', className: 'callout-tip', Icon: Lightbulb },
  WARNING: { title: 'Внимание', className: 'callout-warning', Icon: TriangleAlert },
  CAUTION: { title: 'Осторожно', className: 'callout-caution', Icon: OctagonAlert },
}

const CALLOUT_MARKER = /^\s*\[!(NOTE|TIP|WARNING|CAUTION)\]\s*/

function isBlank(node: ReactNode): boolean {
  return typeof node === 'string' && node.trim() === ''
}

function Blockquote({ node, children, ...props }: ElementProps<'blockquote'>) {
  const items = Children.toArray(children)
  const index = items.findIndex((item) => !isBlank(item))
  const first = items[index]
  if (index === -1 || !isValidElement<{ children?: ReactNode }>(first) || first.type !== 'p') {
    return <blockquote {...props}>{children}</blockquote>
  }

  const inner = Children.toArray(first.props.children)
  const lead = inner[0]
  if (typeof lead !== 'string') {
    return <blockquote {...props}>{children}</blockquote>
  }
  const match = CALLOUT_MARKER.exec(lead)
  if (!match) {
    return <blockquote {...props}>{children}</blockquote>
  }

  const kind = match[1] as CalloutKind
  const callout = CALLOUTS[kind]
  const { Icon } = callout
  const rest = lead.slice(match[0].length)
  const paragraph = rest ? [rest, ...inner.slice(1)] : inner.slice(1)

  return (
    <div className={`callout ${callout.className}`}>
      <p className="callout-title">
        <Icon {...ICON_PROPS} className="callout-icon" />
        {callout.title}
      </p>
      {paragraph.length > 0 && cloneElement(first, undefined, ...paragraph)}
      {items.slice(index + 1)}
    </div>
  )
}

// Язык берётся из класса language-* у элемента code, который выставляет rehype-highlight
function languageOf(child: ReactNode): string | null {
  if (!isValidElement<{ className?: string }>(child)) {
    return null
  }
  const match = /(?:^|\s)language-([\w-]+)/.exec(child.props.className ?? '')
  return match ? match[1] : null
}

function CodeBlock({ node, children, ...props }: ElementProps<'pre'>) {
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const language = languageOf(children)

  async function copy() {
    const ok = await copyText(preRef.current?.textContent ?? '')
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{language}</span>
        <button type="button" className="copy-button" onClick={copy} aria-label={copied ? 'Скопировано' : 'Копировать'}>
          {copied ? <Check {...ICON_PROPS} /> : <Copy {...ICON_PROPS} />}
          <span className="copy-label">{copied ? 'Скопировано' : 'Копировать'}</span>
        </button>
      </div>
      <span className="visually-hidden" aria-live="polite">
        {copied ? 'Скопировано' : ''}
      </span>
      <pre ref={preRef} {...props}>
        {children}
      </pre>
    </div>
  )
}

function Anchor({ node, href, children, ...props }: ElementProps<'a'>) {
  if (href?.startsWith('#') && !href.startsWith('#/')) {
    const id = href.slice(1)
    return (
      <a
        href={href}
        {...props}
        onClick={(event) => {
          event.preventDefault()
          scrollToAnchor(id)
        }}
      >
        {children}
      </a>
    )
  }

  const external = href !== undefined && /^(https?:)?\/\//.test(href)
  return (
    <a
      href={href}
      {...props}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
    >
      {children}
      {external && <ExternalLink {...ICON_SMALL_PROPS} className="external-icon" />}
    </a>
  )
}

function Table({ node, ...props }: ElementProps<'table'>) {
  return (
    <div className="table-wrap">
      <table {...props} />
    </div>
  )
}

const components: Components = {
  a: Anchor,
  blockquote: Blockquote,
  pre: CodeBlock,
  table: Table,
}

const remarkPlugins = [remarkGfm]

export function Markdown({ source }: { source: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={[rehypeSlug, [rehypeHighlight, { plainText: ['text'] }]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
