import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CONTENT_DIR = path.join(ROOT, "content", "ru");
const VERSION_FILE = path.join(ROOT, "src", "version.ts");
const PUBLIC_DIR = path.join(ROOT, "public");
const MD_DIR = path.join(PUBLIC_DIR, "md");

const SECTION_ORDER = [
  "Начало",
  "Разработка",
  "Концепции",
  "Возможности",
  "Справочник",
  "Примеры",
  "Статус",
  "Поддержка",
  "Внутренности",
];
const DEFAULT_SECTION = "Прочее";

function fail(message) {
  throw new Error(message);
}

function unquote(value) {
  const m = /^(["'])(.*)\1$/.exec(value);
  return m ? m[2] : value;
}

function parseOrder(value) {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : Infinity;
}

function parsePage(file, rawText) {
  const text = rawText.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") fail(`${file}: нет блока frontmatter`);
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) fail(`${file}: не закрыт блок frontmatter`);

  const meta = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (m) meta[m[1]] = unquote(m[2].trim());
  }

  const title = meta.title ?? "";
  const slug = meta.slug ?? "";
  if (!title) fail(`${file}: не задано поле title`);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug)) {
    fail(`${file}: поле slug должно быть латиницей без пробелов, сейчас "${slug}"`);
  }

  const order = parseOrder(meta.order);

  const body = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .trimEnd();

  return {
    file,
    slug,
    title,
    description: meta.description ?? "",
    section: meta.section || DEFAULT_SECTION,
    order,
    status: meta.status ?? "",
    body,
  };
}

function sectionRank(name) {
  const i = SECTION_ORDER.indexOf(name);
  return i === -1 ? SECTION_ORDER.length : i;
}

function compareByOrder(a, b) {
  if (a.order !== b.order) return a.order < b.order ? -1 : 1;
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

function groupBySection(pages) {
  const groups = new Map();
  for (const page of pages) {
    if (!groups.has(page.section)) groups.set(page.section, []);
    groups.get(page.section).push(page);
  }
  const names = [...groups.keys()].sort(
    (a, b) => sectionRank(a) - sectionRank(b) || a.localeCompare(b, "ru"),
  );
  return names.map((name) => ({ name, pages: groups.get(name).sort(compareByOrder) }));
}

// DOCS_VERSION_LABEL задан шаблонной строкой из других констант, поэтому подставляем их значения.
function readDocsVersion() {
  let src;
  try {
    src = fs.readFileSync(VERSION_FILE, "utf8");
  } catch (err) {
    fail(`не удалось прочитать ${VERSION_FILE}: ${err.message}`);
  }
  const m = /DOCS_VERSION_LABEL\s*=\s*(["'`])(.*?)\1\s*;/.exec(src);
  if (!m) fail(`в ${VERSION_FILE} не найдено значение DOCS_VERSION_LABEL`);
  return m[2].replace(/\$\{\s*(\w+)\s*\}/g, (_, name) => {
    const c = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`).exec(src);
    if (!c) fail(`в ${VERSION_FILE} не найдено строковое значение ${name}`);
    return c[1];
  });
}

function pageMarkdown(page) {
  const out = [`# ${page.title}`, ""];
  if (page.description) out.push(`> ${page.description}`, "");
  out.push(page.body, "");
  return out.join("\n");
}

function indexText(sections, version) {
  const out = [
    "# freshGram: документация плагинов",
    "",
    `> Документация по системе плагинов бета-версии freshGram, версия ${version}. API может меняться.`,
    "",
  ];
  for (const section of sections) {
    out.push(`## ${section.name}`, "");
    for (const p of section.pages) {
      const desc = p.description ? `: ${p.description}` : "";
      out.push(`- [${p.title}](md/${p.slug}.md)${desc}`);
    }
    out.push("");
  }
  out.push("## Полный текст", "", "Весь текст одним файлом: [llms-full.txt](llms-full.txt).", "");
  return out.join("\n");
}

function fullText(pages, version) {
  const out = [
    "# freshGram: документация плагинов (полный текст)",
    "",
    `Версия документации: ${version}.`,
    "",
  ];
  pages.forEach((p, i) => {
    if (i > 0) out.push("---", "");
    out.push(`# ${p.title}`, "");
    if (p.description) out.push(`> ${p.description}`, "");
    out.push(p.body, "");
  });
  return out.join("\n");
}

function main() {
  if (!fs.existsSync(CONTENT_DIR)) fail(`каталог ${CONTENT_DIR} не найден`);
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();
  if (files.length === 0) fail(`в ${CONTENT_DIR} нет .md файлов`);

  const pages = files.map((f) =>
    parsePage(f, fs.readFileSync(path.join(CONTENT_DIR, f), "utf8")),
  );

  const slugs = new Set();
  for (const p of pages) {
    if (slugs.has(p.slug)) fail(`повторяется slug "${p.slug}" (${p.file})`);
    slugs.add(p.slug);
  }

  const version = readDocsVersion();
  const sections = groupBySection(pages);
  const ordered = sections.flatMap((s) => s.pages);

  // public/md целиком генерируется заново, чтобы удалённые страницы не оставались файлами.
  fs.rmSync(MD_DIR, { recursive: true, force: true });
  fs.mkdirSync(MD_DIR, { recursive: true });
  for (const p of ordered) {
    fs.writeFileSync(path.join(MD_DIR, `${p.slug}.md`), pageMarkdown(p), "utf8");
  }
  fs.writeFileSync(path.join(PUBLIC_DIR, "llms.txt"), indexText(sections, version), "utf8");
  fs.writeFileSync(path.join(PUBLIC_DIR, "llms-full.txt"), fullText(ordered, version), "utf8");

  console.log(`llms: страниц ${ordered.length}, версия ${version}`);
}

try {
  main();
} catch (err) {
  console.error(`build-llms: ${err.message}`);
  process.exit(1);
}
