import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = process.env.FRESHGRAM_SRC;
if (!srcRoot) {
  console.error("Не задана переменная окружения FRESHGRAM_SRC: укажите путь к корню исходников клиента freshGram.");
  console.error('Пример (PowerShell): $env:FRESHGRAM_SRC="путь"; npm run sync-version');
  process.exit(1);
}

const versionFile = path.join(srcRoot, "Telegram", "build", "version");

let text;
try {
  text = fs.readFileSync(versionFile, "utf8");
} catch (err) {
  const reason = err.code === "ENOENT" ? "файл не найден" : err.message;
  console.error(`Не удалось прочитать ${versionFile}: ${reason}.`);
  console.error("Проверьте, что FRESHGRAM_SRC указывает на корень исходников клиента.");
  process.exit(1);
}

const values = new Map();
for (const raw of text.split(/\r?\n/)) {
  const line = raw.trim();
  const m = /^(\S+)\s+(.+)$/.exec(line);
  if (m && !values.has(m[1])) values.set(m[1], m[2].trim());
}

const version = values.get("AppVersionStr");
if (!version) {
  console.error(`В ${versionFile} не найдена строка AppVersionStr.`);
  process.exit(1);
}
if (!/^\d+(\.\d+)+$/.test(version)) {
  console.error(`Некорректное значение AppVersionStr в ${versionFile}: "${version}".`);
  process.exit(1);
}

const channel = values.get("BetaChannel") === "1" ? "beta" : "stable";

const content = [
  "// Версия документации совпадает с версией клиента freshGram.",
  "// Источник: Telegram/build/version клиента (AppVersionStr, BetaChannel).",
  "// Обновляется командой npm run sync-version при заданной переменной FRESHGRAM_SRC.",
  "",
  `export const DOCS_VERSION = "${version}";`,
  `export const DOCS_CHANNEL = "${channel}";`,
  'export const DOCS_VERSION_LABEL = `${DOCS_VERSION} ${DOCS_CHANNEL}`;',
  "",
].join("\n");

const target = fileURLToPath(new URL("../src/version.ts", import.meta.url));
fs.writeFileSync(target, content, "utf8");

console.log(`src/version.ts обновлён: DOCS_VERSION = ${version}, DOCS_CHANNEL = ${channel}`);
