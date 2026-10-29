---
title: "Пакет и манифест"
description: "Формат пакета .fgpl, структура архива, поля manifest.json, подпись пакета и сборка через fgpl_tool."
section: "Разработка"
order: 5
slug: "package-manifest"
status: "экспериментально"
---

Плагин freshGram распространяется одним файлом пакета `.fgpl`. Пакет — это ZIP-архив, в корне которого лежит `manifest.json`. Манифест описывает плагин: идентификатор и версию, совместимость с клиентом, точку входа (модуль WebAssembly или Python-файл), запрашиваемые разрешения, точки подключения в интерфейсе и хэши всех файлов архива.

Хэши позволяют заметить любое изменение файла после сборки: при открытии хост проверяет архив и манифест целиком. Если что-то не сходится, пакет отвергается с перечнем проблем. Ошибки манифеста выводятся строками вида «путь: что не так», не более 50 строк (`Telegram/plugins_host/src/fgpl/manifest.cpp:100-103`).

> [!NOTE]
> Формат пакета экспериментальный. Поля, лимиты и тексты ошибок могут меняться между сборками клиента.

## Как собрать и проверить пакет

Пакет собирает утилита `fgpl_tool`. Её исходник — `Telegram/plugins_host/src/fgpl/tool_main.cpp`, цель сборки — `fgpl_tool` в `Telegram/plugins_host/CMakeLists.txt:93`.

Порядок действий (ключ нужен только для подписи):

```bash
fgpl_tool keygen plugins
fgpl_tool pack ./my-plugin ./my-plugin.fgpl --key plugins.key
fgpl_tool verify ./my-plugin.fgpl
```

- `fgpl_tool keygen <имя>` создаёт закрытый ключ `<имя>.key` (одна строка в base64) и печатает открытый ключ и отпечаток издателя (`Telegram/plugins_host/src/fgpl/tool_main.cpp:53-68`).
- `fgpl_tool pack <каталог> <файл.fgpl> [--key <имя>.key]` собирает архив. Без `--key` пакет остаётся неподписанным.
- `fgpl_tool verify <файл.fgpl>` открывает пакет тем же разбором, что и хост. При успехе печатает идентификатор и версию, диапазон версий клиента, тип рантайма, состояние подписи, разрешения и число файлов. При ошибке выводит список проблем и завершается с кодом 2 (`Telegram/plugins_host/src/fgpl/tool_main.cpp:96-111`).

> [!WARNING]
> Описание команд, их вывода и кодов возврата не подтверждено запуском: оно построено по исходнику `Telegram/plugins_host/src/fgpl/tool_main.cpp` (`keygen` — строки 53–68, `pack` — 113–195, `verify` — 96–111, разбор аргументов — 288–324). Сборка `fgpl_tool` и запуск команд не проверялись.

> [!CAUTION]
> Не клади файл ключа в каталог плагина. `pack` включает в пакет все обычные файлы каталога, в том числе из вложенных каталогов, кроме корневого `manifest.json`. Вложенный файл с таким же именем в пакет попадает (`Telegram/plugins_host/src/fgpl/tool_main.cpp:129-131`).

После сборки `pack` вызывает `OpenPackage` для готового архива. Если пакет не принимается, команда печатает сообщение «the package would not be accepted» и список проблем, возвращает код 2 и файл не записывает (`Telegram/plugins_host/src/fgpl/tool_main.cpp:180-192`). Поле `files` из исходного `manifest.json` команда отбрасывает и пересчитывает всегда. Поле `signature` пересчитывается только с ключом `--key`; без ключа оно отбрасывается (`Telegram/plugins_host/src/fgpl/tool_main.cpp:149, 155-170`). Поэтому в исходнике эти поля можно не писать.

> [!NOTE]
> Способ получить бинарник `fgpl_tool` для своей платформы на этой странице не описан.

## Подпись

Подпись необязательна. Если она есть, она покрывает канонический JSON манифеста без поля `signature` (`Telegram/plugins_host/src/fgpl/manifest.cpp:501-509`). Поскольку в манифесте есть `files` с хэшами, подпись покрывает и содержимое всех файлов.

- Алгоритм — Ed25519. Блок `signature` содержит `alg` (строго `"ed25519"`), `publicKey` и `value` в base64. После декодирования открытый ключ — 32 байта, подпись — 64 байта.
- Подпись подтверждает, что пакет не менялся после подписи. Она не подтверждает, кто издатель: доверенных ключей в пакете нет. Пакет, подписанный любым ключом, считается подписанным, но не «официальным».
- Отпечаток издателя — первые 16 байт SHA-256 от открытого ключа, записанные hex-цифрами группами по 4 символа через пробел (`Telegram/plugins_host/src/fgpl/signature.cpp:96-108`).
- Клиент считает издателя официальным, только если его отпечаток совпадает с ключом, заданным при сборке клиента через `FRESHGRAM_PLUGINS_KEY` (`Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:314-320`).

## Структура архива

- В корне обязателен `manifest.json`.
- Каждый файл архива, кроме корневого `manifest.json`, должен быть перечислен в `files` с хэшем, и наоборот: запись в `files`, которой нет в архиве, — ошибка.
- Файлы, на которые ссылаются `runtime`, `icon`, `changelog` и пути из `contributes.icons`, тоже обязаны быть в `files`.
- Архив читается строго. Отвергаются: ZIP-комментарий, zip64, многодисковые архивы, шифрование, методы сжатия кроме stored и deflate, симлинки и специальные файлы (`Telegram/plugins_host/src/fgpl/zip_reader.cpp:86-154`). Конец центрального каталога ZIP (end of central directory) должен стоять в самом конце файла: его сигнатура ищется в последних 22 байтах (`Telegram/plugins_host/src/fgpl/zip_reader.cpp:17, 86`). Если после него есть лишние байты (в том числе ZIP-комментарий), ошибка «no end of central directory (comments are not allowed)» (`Telegram/plugins_host/src/fgpl/zip_reader.cpp:86-89`). Ошибка «the central directory is not where it should be» выдаётся, когда конец каталога стоит в самом конце, но смещение и размер центрального каталога не сходятся с его положением (`Telegram/plugins_host/src/fgpl/zip_reader.cpp:103-104`).

Каталог Python-плагина до сборки (фрагмент):

```text
my-plugin/
├── manifest.json
└── main.py
```

### Запрещённые файлы

Пакет не может содержать исполняемые файлы, скрипты и вложенные архивы. Отклоняются:

- файлы с расширениями `.so`, `.dll`, `.exe`, `.dylib`, `.dex`, `.jar`, `.class`, `.apk`, `.sh`, `.bat`, `.cmd`, `.ps1`, `.com`, `.scr`, `.msi`, `.node`, `.pyd`, `.pyc`, `.pyo`, `.elf`, `.bin.exe`, `.app`, `.vbs`, `.js.exe`;
- файлы по содержимому: ELF, PE (начинаются с `MZ`), Mach-O, Java class (`CAFEBABE`), DEX, вложенный ZIP (`PK\x03\x04`);
- файлы с `#!` в начале, кроме `.py` (`Telegram/plugins_host/src/fgpl/package.cpp:50-73`).

### Лимиты

| Параметр | Значение | Код |
|---|---|---|
| Размер архива | 300 MiB | `Telegram/plugins_host/src/fgpl/zip_reader.h:13-21` |
| Записей в ZIP | 4096 | `Telegram/plugins_host/src/fgpl/zip_reader.h:13-21` |
| Размер одного файла | 128 MiB | `Telegram/plugins_host/src/fgpl/zip_reader.h:13-21` |
| Сумма несжатых данных | 256 MiB | `Telegram/plugins_host/src/fgpl/zip_reader.h:13-21` |
| Коэффициент сжатия | не больше 100:1 (с запасом 1024 байта) | `Telegram/plugins_host/src/fgpl/zip_reader.cpp:197` |
| Число компонентов пути | не больше 16 | `Telegram/plugins_host/src/fgpl/zip_reader.cpp:179` |
| Длина имени записи | 255 байт | `Telegram/plugins_host/src/fgpl/zip_reader.h:18` |
| `manifest.json` | 256 KiB | `Telegram/plugins_host/src/fgpl/package.h:35` |
| Иконка `icon` | PNG до 256 KiB | `Telegram/plugins_host/src/fgpl/package.h:36` |
| Записей в `files` | не больше 4095 | `Telegram/plugins_host/src/fgpl/manifest.cpp:914-915` |
| Путь в манифесте | до 200 символов, относительный, без `..` | `Telegram/plugins_host/src/fgpl/manifest.cpp:72-92` |

Имена компонентов пути проверяются так: только ASCII-символы с кодами 0x20–0x7E, без символов `/ \ : * ? " < > |`, до 128 символов, без пробела в начале и в конце, без точки в конце (точка в начале допустима), без `.` и `..` (`Telegram/plugins_host/src/fgpl/vfs.cpp:24-43`). Имена сравниваются без учёта регистра, поэтому `A.py` и `a.py` в одном пакете — дубликат (`Telegram/plugins_host/src/fgpl/zip_reader.cpp:181`).

Сводка лимитов и расхождений документации с кодом — на странице [Ограничения и WIP](#/limits-wip).

## Порядок проверок при открытии

1. Чтение ZIP и проверка CRC каждой записи.
2. Наличие `manifest.json` в корне.
3. Размер `manifest.json` не больше 256 KiB.
4. Строгий JSON (дубликаты ключей отвергаются), затем разбор полей манифеста.
5. Соответствие `files`: каждый файл перечислен и совпадает по хэшу, каждая запись есть в архиве.
6. Запрещённые типы файлов и иконка.
7. Для WebAssembly: модуль экспортирует `memory` и либо `fg_alloc`, `fg_init`, `fg_on_event`, либо `_start`; импорты только из разрешённого набора. Для Python: entry-файл — текст в UTF-8 без нулевых байт.
8. Подпись, если она есть.

> [!WARNING]
> Порядок проверок при открытии не подтверждено запуском: он описан по функции `OpenPackage` (`Telegram/plugins_host/src/fgpl/package.cpp:83-210`), проверка CRC выполняется в `ReadZip` (`Telegram/plugins_host/src/fgpl/zip_reader.cpp:317`).

Совместимость с клиентом проверяется отдельно, см. раздел «compat» ниже.

## Манифест

Минимальный манифест Python-плагина (фрагмент):

```json
{
  "schema": 1,
  "id": "com.example.demo",
  "name": "Demo",
  "version": "1.0.0",
  "compat": { "freshgram": ">=7.6.0 <8.0.0" },
  "runtime": { "kind": "python", "entry": "main.py" }
}
```

> [!WARNING]
> Принятие полного Python-манифеста не подтверждено запуском (OPEN-18). Пример собран по правилам разбора манифеста (`Telegram/plugins_host/src/fgpl/manifest.cpp:520-649`), но на реальном пакете не проверен через `fgpl_tool verify`.

> [!WARNING]
> Диапазон в `compat.freshgram` взят из тестовой фикстуры (`Telegram/plugins_host/tests/package_builder.h:107`) и показан как пример синтаксиса. Выбор диапазона для текущей бета-сборки не подтверждено запуском (OPEN-17). Версия клиента — `7.5.10.beta` (`Telegram/build/version:7`, `AppVersionOriginal`), числовая часть — `7.5.10` (`Telegram/SourceFiles/core/version.h:26`, `AppVersionStr`); она не входит в диапазон `>=7.6.0 <8.0.0`.

Поле `files` в примере опущено: `fgpl_tool pack` добавит его сам.

Для WebAssembly-плагина вместо `entry` указывается `"runtime": { "kind": "wasm", "module": "plugin.wasm" }`. Поле `module` обязано заканчиваться на `.wasm`, поле `entry` для wasm недопустимо, и наоборот: `module` недопустимо для Python.

Верхний уровень манифеста допускает только перечисленные ключи: `schema`, `id`, `name`, `version`, `description`, `author`, `license`, `homepage`, `repository`, `support`, `changelog`, `icon`, `categories`, `keywords`, `locales`, `compat`, `runtime`, `activation`, `permissions`, `contributes`, `dependencies`, `conflicts`, `storage`, `updates`, `files`, `signature`. Неизвестный ключ — ошибка, кроме ключей с префиксом `x-`: они допускаются и не разбираются (`Telegram/plugins_host/src/fgpl/manifest.cpp:15-21, 132-135`).

Строгий разбор JSON отвергает дубликаты ключей, `NaN`, дробные числа, числа с экспонентой (`e` или `E`) и BOM в начале файла. Целые числа допустимы в пределах ±(2^53 − 1) (`Telegram/plugins_host/src/fgpl/json.h:17`, `Telegram/plugins_host/src/fgpl/json.cpp:83, 86-118, 267-268, 416-419`).

## Справочник полей

### Верхний уровень

| Поле | Обязательно | Правила | Код |
|---|---|---|---|
| `schema` | да | только `1` | `Telegram/plugins_host/src/fgpl/manifest.cpp:520` |
| `id` | да | reverse-DNS: строчные латинские буквы, цифры, `.` и `-`; от 5 до 64 символов; нужна хотя бы одна точка; `.` и `-` не идут подряд и не стоят в начале или в конце | `Telegram/plugins_host/src/fgpl/manifest.cpp:37-53, 523-528` |
| `name` | да | строка или объект «язык → текст»; до 80 символов; пустое значение недопустимо; в объекте обязателен ключ `default` | `Telegram/plugins_host/src/fgpl/manifest.cpp:236-262, 529-531` |
| `version` | да | semver `X.Y.Z` с необязательным суффиксом `-pre`; до 64 символов | `Telegram/plugins_host/src/fgpl/manifest.cpp:532-538` |
| `description` | нет | строка или объект «язык → текст»; до 1000 символов; без управляющих символов, кроме перевода строки, и без двунаправленных символов | `Telegram/plugins_host/src/fgpl/manifest.cpp:539-547` |
| `author` | нет | объект: `name` до 100 символов, `url` — https-адрес до 500, `contact` до 200. Клиент берёт `url` запасной ссылкой, если нет `homepage`; `contact` клиентом не используется | `Telegram/plugins_host/src/fgpl/manifest.cpp:548-552`; `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3193` |
| `license` | нет | строка до 64 символов | `Telegram/plugins_host/src/fgpl/manifest.cpp:553` |
| `homepage`, `repository`, `support` | нет | https-адреса до 500 символов | `Telegram/plugins_host/src/fgpl/manifest.cpp:264-274, 554-556`; `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3193-3195` |
| `changelog` | нет | безопасный относительный путь до 200 символов; обязан быть в `files`; клиентом не используется | `Telegram/plugins_host/src/fgpl/manifest.cpp:557-564, 996-998` |
| `icon` | нет | безопасный относительный путь до 200 символов; обязан быть в `files`; содержимое — PNG до 256 KiB, проверка по сигнатуре | `Telegram/plugins_host/src/fgpl/manifest.cpp:557-564, 996-998`; `Telegram/plugins_host/src/fgpl/package.cpp:148-155` |
| `categories`, `keywords` | нет | массивы токенов в нижнем регистре: `categories` — до 8 элементов по 32 символа, `keywords` — до 16 по 32; клиентом не используются | `Telegram/plugins_host/src/fgpl/manifest.cpp:565-566` |
| `locales` | нет | до 64 кодов языков; клиентом не используется | `Telegram/plugins_host/src/fgpl/manifest.cpp:567-575` |
| `compat` | да | см. раздел «compat» | `Telegram/plugins_host/src/fgpl/manifest.cpp:577-614` |
| `runtime` | да | см. раздел «runtime» | `Telegram/plugins_host/src/fgpl/manifest.cpp:616-649` |
| `activation` | нет | см. раздел «activation» | `Telegram/plugins_host/src/fgpl/manifest.cpp:651-668` |
| `permissions` | нет | см. раздел «permissions» | `Telegram/plugins_host/src/fgpl/manifest.cpp:670-704` |
| `contributes` | нет | см. раздел «contributes» | `Telegram/plugins_host/src/fgpl/manifest.cpp:706-843` |
| `dependencies`, `conflicts`, `storage`, `updates` | нет | см. одноимённый раздел ниже | `Telegram/plugins_host/src/fgpl/manifest.cpp:316-350, 879-906` |
| `files` | да | объект «путь → `sha256-<base64>`» (хэш SHA-256, 32 байта); до 4095 записей; ключ с префиксом `x-` недопустим | `Telegram/plugins_host/src/fgpl/manifest.cpp:908-930` |
| `signature` | нет | см. раздел «Подпись» | `Telegram/plugins_host/src/fgpl/manifest.cpp:932-948` |

### compat

- `compat.freshgram` — обязательно, строка-диапазон до 128 символов. Пример: `>=7.6.0 <8.0.0`; оба примера плагинов (`pictures`, `freshgram-badges`) используют `>=7.5.0 <8.0.0`. Операторы: `>=`, `<=`, `>`, `<`, `=`. Без оператора версия должна совпасть точно, `*` означает любую версию. Пробел между оператором и версией недопустим: `>= 7.6.0` не разбирается. Не поддерживаются `^`, `~`, `||` и шаблоны с `x`; сравнений не больше 8 (`Telegram/plugins_host/src/fgpl/semver.cpp:155-199`).
- Если версия клиента ниже диапазона, пакет получает причину `AppTooOld`, выше — `AppTooNew` (`Telegram/plugins_host/src/fgpl/manifest.cpp:1020-1038`).
- `compat.testedWith` — необязательно, semver до 64 символов. Установку не блокирует. Плагин помечается как устаревший, если major клиента больше; при равном major — если больше minor клиента. Патч не учитывается (`Telegram/plugins_host/src/fgpl/manifest.cpp:370-379, 586-591`).
- `compat.api` — целое от 1 до 1000 или объект `{min, max}` с границами от 1 до 1000, где `max` не меньше `min`. Одно число задаёт только нижнюю границу: диапазон — от этого числа до 1000 включительно (`Telegram/plugins_host/src/fgpl/manifest.cpp:593-595`), а не точный уровень API. Для объекта по умолчанию `min` = 1, `max` = 1000 (`Telegram/plugins_host/src/fgpl/manifest.cpp:601-602`). Если уровень API клиента не входит в этот диапазон, пакет получает причину `ApiUnsupported` (`Telegram/plugins_host/src/fgpl/manifest.cpp:1039-1046`). Текущий уровень API в коде — 4 (`Telegram/plugins_host/src/fgpl/broker.h:22`).
- `compat.requires` — до 32 токенов: имена разрешений или `menu.<поверхность>`. Если клиент не поддерживает указанную функцию, пакет получает причину `MissingFeature` (`Telegram/plugins_host/src/fgpl/manifest.cpp:610, 1047-1050`).
- `compat.accounts.premium` — `true` или `false`, по умолчанию `false`. При `true` и без Premium у аккаунта пакет получает причину `PremiumRequired` («needs a Premium account») (`Telegram/plugins_host/src/fgpl/manifest.cpp:611-612, 1052-1053`).

### runtime

- `kind` — `wasm` или `python`; другое значение — ошибка.
- Для `wasm`: `module` обязательно, безопасный путь до 200 символов, заканчивается на `.wasm`. `abi` — только `1`, по умолчанию `1`.
- Для `python`: `entry` обязательно, безопасный путь до 200 символов, заканчивается на `.py`. Необязательное `pythonVersion` до 32 символов разбирается только для Python и клиентом не используется.
- `language` — до 32 символов, разбирается, но клиентом не используется.
- `limits`:
  - `memoryMb` — от 1 до 1024, по умолчанию 64;
  - `eventTimeoutMs` — от 10 до 60000, по умолчанию 500. Это собственное время плагина на одно событие: время ожидания ответов приложения (загрузка, чтение сокета) в него не входит, но все вызовы одного события вместе могут ждать не дольше 60 секунд (`Telegram/plugins_sdk/README.md:102-105`). Значение передаётся в `callTimeoutMs` (`Telegram/plugins_host/src/fgpl/manager.cpp:1416`), а время вызовов приложения вычитается из бюджета события (`Telegram/plugins_host/src/fgpl/runtime.cpp:163-166`). Предел в 60 секунд — значение по умолчанию `maxHostCallMs` (`Telegram/plugins_host/src/fgpl/runtime.h:24`), которое манифест не меняет. В примерах плагинов `pictures` и `freshgram-badges` заданы 2000 и 10000 соответственно;
  - `storageMb` — от 0 до 1024, по умолчанию 10 (`Telegram/plugins_host/src/fgpl/manifest.cpp:643-648`).

> [!WARNING]
> Поведение `eventTimeoutMs` не подтверждено запуском. В коде видно, как время вызовов приложения уменьшает бюджет события (`Telegram/plugins_host/src/fgpl/runtime.cpp:163-166`), и предел 60 секунд (`Telegram/plugins_host/src/fgpl/runtime.cpp:148-149, 275-277`), но проверки на реальном плагине не было.

> [!WARNING]
> Значения по умолчанию `memoryMb` 64 и `eventTimeoutMs` 500 взяты из кода (`Telegram/plugins_host/src/fgpl/manifest.cpp:645-646`), но их действие на плагине не подтверждено запуском (OPEN-20). README SDK называет оба поля (`Telegram/plugins_sdk/README.md:102`, `:112`), но значения по умолчанию в нём не указаны, и решение о фиксации не принято.

> [!WARNING]
> `storageMb: 0` манифест принимает (`Telegram/plugins_host/src/fgpl/manifest.cpp:647`). Квота считается как `storageMb` × 2^20 байт (`Telegram/plugins_host/src/fgpl/permissions.cpp:49`), и при нулевой квоте любая запись через `storage.set` отказывает (`Telegram/plugins_host/src/fgpl/broker.cpp:1064`). Ожидаемое поведение для плагина не подтверждено запуском (OPEN-25).

### activation

- `on` — массив до 8 значений: `startup`, `command`, `event`, `menu`, `settings`, `message`, `timer`, `translate`, `toast`. По умолчанию включены все значения, кроме `startup` (`Telegram/plugins_host/src/fgpl/manifest.h:169`). Подробности о запуске — на странице [Жизненный цикл, логи и отладка](#/lifecycle).
- `background` — `true` или `false`, по умолчанию `false`. Требует разрешения `background` (`Telegram/plugins_host/src/fgpl/manifest.cpp:667, 973-975`).

Неизвестное значение в `on` — ошибка (`Telegram/plugins_host/src/fgpl/manifest.cpp:651-668`).

### permissions

- `required` и `optional` — массивы до 64 элементов каждый. Элемент — объект `{id, reason, scope}`.
- `id` — имя известного разрешения до 64 символов. Неизвестное имя и повтор одного и того же `id` — ошибка.
- `reason` — обязательно; строка или объект «язык → текст» до 500 символов.
- `scope` — допустим только для `messages.read`: `selected` или `all`.

Список разрешений и их выдача пользователем — на странице [Разрешения](#/permissions) (`Telegram/plugins_host/src/fgpl/manifest.cpp:670-704`).

### contributes

- `events` — до 16 имён: `message.new`, `message.edited`, `message.deleted`, `message.reaction`, `chat.opened`, `chat.typing`, `chat.read`, `chat.member`, `user.status`, `app.focus`, `app.blur`. Для каждого нужно своё разрешение: `message.*` — `messages.read`; `chat.opened` — `chats.active`; `chat.typing`, `chat.read`, `chat.member` — `chats.activity`; `user.status` — `users.presence`; `app.focus`, `app.blur` — `app.activity`. Событие исходящих сообщений в этот список не входит: для него есть блок `outgoing`. Событие `timer` здесь тоже не принимается (`Telegram/plugins_host/src/fgpl/manifest.cpp:727-735, 430-446`). Подробности — на странице [События](#/events).
- `menus` — до 32 записей с ключами `surface`, `id`, `title`, `icon`, `when`. Блок требует разрешения `ui.menu` (`Telegram/plugins_host/src/fgpl/manifest.cpp:964-966`). `surface` — одно из восьми значений: `message`, `chat`, `profile`, `composer`, `main_menu`, `tray`, `selection`, `shared_media`. `id` — токен в нижнем регистре до 64 символов. `title` — локализуемая строка до 80 символов. `icon` — имя из `contributes.icons` или встроенной иконки. Поверхность `composer` дополнительно требует разрешения `ui.composer_button` (`Telegram/plugins_host/src/fgpl/manifest.cpp:390-396, 736-795, 985-991`). Подробности — на странице [Интерфейс клиента](#/client-ui).
  - `when` — необязательный объект с ключами `chat_type`, `out`, `has_media`, `has_text`, `media`, `forwarded` (`Telegram/plugins_host/src/fgpl/manifest.cpp:760-793`). Ключ `chat_type` допустим на поверхностях `message`, `selection`, `shared_media`, `chat`, `profile`, `composer`. Остальные ключи допустимы только на `message`, `selection`, `shared_media`; ключ, не подходящий поверхности, — ошибка. `chat_type` — список до 16 значений: `user`, `bot`, `self`, `group`, `supergroup`, `forum`, `channel` (`Telegram/plugins_host/src/fgpl/manifest.cpp:456-461`). `media` — список до 16 значений из `MenuMediaKinds()` (`Telegram/plugins_host/src/fgpl/manifest.cpp:404-410`). Ключи `out`, `has_media`, `has_text`, `forwarded` принимают `true` или `false`.
- `commands` — до 32 записей. `name` обязательно: до 32 символов, только `a–z`, `0–9` и `_`. `description` — локализуемая строка до 200 символов, необязательно. Требует разрешения `ui.command` (`Telegram/plugins_host/src/fgpl/manifest.cpp:796-815, 967-969`).
- `messages` — объект с полем `from`: до 64 элементов, каждый — id плагина или строка `"*"`. Требует разрешения `plugins.message` (`Telegram/plugins_host/src/fgpl/manifest.cpp:817-827, 976-978`).
- `translator` — объект: `name` обязательно, до 40 символов; `languages` — до 200 кодов языков; `maxChars` — от 64 до 8192, по умолчанию 4096. Требует разрешения `translate.provide` (`Telegram/plugins_host/src/fgpl/manifest.cpp:828-843, 979-981`).
- `icons` — объект «имя → путь». Имя проверяется функцией `ui::ValidIconName` (`Telegram/plugins_host/src/fgpl/manifest.cpp:716`). Путь — `.png` или `.svg`, файл обязан быть в `files`. До 32 записей. Ключи с префиксом `x-` пропускаются. Иконка больше 64 KiB при загрузке пропускается без ошибки (`Telegram/plugins_host/src/fgpl/manifest.cpp:709-725, 1001-1005`; `Telegram/plugins_host/src/fgpl/manager.cpp:31, 1041-1046`).
- `outgoing` — `onFailure`: `pass` (по умолчанию) или `block`. В `filter.chats` — до 256 ненулевых id чатов; в `filter.chat_types` — значения `user`, `bot`, `self`, `group`, `supergroup`, `forum`, `channel`. Требует разрешения `messages.transform_outgoing` (`Telegram/plugins_host/src/fgpl/manifest.cpp:844-876, 982-984`). Подробности — на странице [Исходящие сообщения](#/outgoing-messages).
- `settingsPage` — логический флаг `true` или `false`, по умолчанию `false`. При `true` требует разрешения `ui.settings_page` (`Telegram/plugins_host/src/fgpl/manifest.cpp:816, 970-972`). Подробности — на странице [Интерфейс клиента](#/client-ui).

> [!WARNING]
> Значение по умолчанию `pass` для `contributes.outgoing.onFailure` не подтверждено запуском (OPEN-19): оно взято из кода (`Telegram/plugins_host/src/fgpl/manifest.cpp:846`). README SDK описывает оба значения, `pass` и `block` (`Telegram/plugins_sdk/README.md:186-188`), но значения по умолчанию в нём не указано, и решение о фиксации не принято.

### dependencies, conflicts, storage, updates

- `dependencies` — до 16 записей `{id, version}`. `version` — диапазон версий до 128 символов, обязателен. `conflicts` — то же, но `version` необязателен. `id` должен быть валидным идентификатором и не совпадать с id самого плагина (`Telegram/plugins_host/src/fgpl/manifest.cpp:316-350, 879-880`).
- `storage` — `schema`: целое от 1 до 100000, по умолчанию 1. `export.prefixes` — от 1 до 32 строк, пустой список недопустим. `export.exclude` — до 32 строк. Каждый ключ до 128 байт (`Telegram/plugins_host/src/fgpl/manifest.cpp:881-903`). Подробности — на странице [Хранилище и файлы](#/storage-files).
- `updates` — объект с полем `feed`, https-адрес до 500 символов. Клиентом не используется (`Telegram/plugins_host/src/fgpl/manifest.cpp:904-906`).

## Связанные страницы

- [Быстрый старт: Python](#/quickstart-python) — минимальный плагин и первый запуск пакета.
- [Разрешения](#/permissions) — список разрешений и их выдача.
- [Жизненный цикл, логи и отладка](#/lifecycle) — установка, обновление, активация.
- [Ограничения и WIP](#/limits-wip) — сводка лимитов и известных расхождений.
