---
title: "Быстрый старт: Python"
description: "Минимальный плагин на Python: код, структура пакета, черновик манифеста, упаковка и установка."
section: "Начало"
order: 2
slug: "quickstart-python"
status: "экспериментально"
---

## Что это и зачем

Плагин на Python — программа, которую хост запускает как команду: её выполняет CPython, собранный для WASI, а сообщения идут через stdin и stdout (`Telegram/plugins_sdk/README.md:9-10`). Плагин не имеет собственных файлов, сокетов и процессов. Каждое действие — это вызов к приложению, а каждый вызов проверяется по разрешениям, которые выдал пользователь (`Telegram/plugins_sdk/README.md:3-5`).

Минимальный плагин состоит из `main.py` с обработчиками событий и вызова `freshgram.run()`, а также `manifest.json`, который описывает пакет. Ниже — код, структура пакета, сборка и установка.

## Перед началом

- Нужен рантайм Python. Приложение скачивает его вместе с хостом и Wasmtime одним набором, когда пользователь включает плагины; в инсталлятор он не входит (`Telegram/plugins_host/RUNTIME.md:3-6`).
- Без рантайма запуск завершается ошибкой `the Python runtime is not installed` (`Telegram/plugins_host/src/fgpl/manager.cpp:1422-1424`).
- Рантайм выбирается для платформ `linux-x86_64` и `linux-aarch64` (`Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:50-54`). Исполняемый файл хоста собирается только под Linux (`Telegram/plugins_host/CMakeLists.txt:98-100`).

> [!WARNING]
> Работа плагинов на Windows не подтверждена кодом (OPEN-21).

## Минимальный плагин

Пример дословно из справки SDK (`Telegram/plugins_sdk/README.md:464-477`):

```python
import freshgram

@freshgram.on_init
def start(info):
    freshgram.storage.set("started", True)

@freshgram.on("message.*")
def message(event):
    count = freshgram.storage.get("count", 0) + 1
    freshgram.storage.set("count", count)

freshgram.run()
```

Что делает каждая часть:

- `@freshgram.on_init` ставится без скобок: декоратор принимает функцию напрямую и вызывает её при старте плагина (`Telegram/plugins_sdk/python/freshgram/__init__.py:659-662`).
- `@freshgram.on("message.*")` ставится со скобками. Шаблон с `*` в конце сравнивается по префиксу (`Telegram/plugins_sdk/python/freshgram/__init__.py:905-908`), поэтому обработчик получает события, имя типа которых начинается с `message.`. Имя берётся из поля `type` события (`Telegram/plugins_sdk/python/freshgram/__init__.py:930`). В коде поле `type` задаёт имя события: `{ "type", Value::FromText(type) }` (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2765`). Вызовы передают `message.new`, `message.edited`, `message.reaction` и `message.deleted` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:525`, `:538`, `:549`, `:554`, `:566`, `:579`).
- `freshgram.storage` хранит значения по ключам: `get(key, default)` и `set(key, value)` (`Telegram/plugins_sdk/python/freshgram/__init__.py:75-80`). Для этого нужно право `storage.private` (`Telegram/plugins_host/src/fgpl/broker.cpp:929-930`).
- `freshgram.run()` обрабатывает события до остановки плагина хостом (`Telegram/plugins_sdk/python/freshgram/__init__.py:939-941`).

> [!NOTE]
> Обработчик `@freshgram.on("message.*")` получает только события, которые перечислены в `contributes.events` манифеста и на которые выданы права. В примере объявлено только `message.new`, поэтому `message.edited`, `message.reaction` и `message.deleted` до обработчика не дойдут, даже если совпадают с шаблоном. Хост подписывается только на перечисленные и выданные события (`Telegram/plugins_host/src/fgpl/manager.cpp:1963-1975`). Маски в `contributes.events` не принимаются, имена должны совпадать точно (`Telegram/plugins_host/src/fgpl/manifest.cpp:727-735`).

## Структура пакета

Пакет — это ZIP-архив `.fgpl`, внутри которого лежат `manifest.json` и файлы плагина (`Telegram/plugins_host/src/fgpl/zip_reader.cpp:86-154`). Исходники плагина хранятся в каталоге, который команда `fgpl_tool pack` превращает в архив (см. раздел «Упаковка и установка» ниже). Точка входа задаётся полем `runtime.entry`. Структура исходников:

```text
counter/
├── manifest.json
└── main.py
```

- Каталог плагина попадает в `PYTHONPATH` как `/plugin`, поэтому модули рядом с `main.py` доступны для импорта (`Telegram/plugins_host/src/fgpl/manager.cpp:1425-1428`).
- Модуль `freshgram` находится в `/runtime/sdk`, поэтому достаточно `import freshgram` (`Telegram/plugins_host/src/fgpl/manager.cpp:1428`).
- Хост запускает интерпретатор командой `python -S -B /plugin/<entry>` (`Telegram/plugins_host/src/fgpl/manager.cpp:1425`) с переменными окружения `PYTHONHOME=/runtime`, `PYTHONPATH=/runtime/sdk:/plugin`, `PYTHONDONTWRITEBYTECODE=1`, `PYTHONNOUSERSITE=1`, `PYTHONUTF8=1`, `PYTHONUNBUFFERED=1`, `PYTHONHASHSEED=0` (`Telegram/plugins_host/src/fgpl/manager.cpp:1426-1434`).
- Для Python хост поднимает лимит памяти до 128 MiB, если манифест задаёт меньше (`Telegram/plugins_host/src/fgpl/manager.cpp:1435`).

## Манифест

> [!WARNING]
> Манифест ниже — черновик, составленный по проверкам кода. Он не проверялся командой `fgpl_tool verify`: не подтверждено кодом (OPEN-18).
>
> Значение `compat.freshgram` в черновике — `>=7.5.0 <8.0.0` — не выбрано окончательно и не подтверждено кодом (OPEN-17). В тестовой фикстуре стоит `>=7.6.0 <8.0.0` (`Telegram/plugins_host/tests/package_builder.h:107`), а в тексте ошибки проверки тот же диапазон приведён как пример (`Telegram/plugins_host/src/fgpl/manifest.cpp:583`). Версия клиента в журнале изменений — `7.5.10 beta` (`changelog.txt:1`). Какой диапазон указывать бета-тестерам, по коду не определено.

```json
{
  "schema": 1,
  "id": "com.example.counter",
  "name": "Counter",
  "version": "0.1.0",
  "compat": { "freshgram": ">=7.5.0 <8.0.0" },
  "runtime": { "kind": "python", "entry": "main.py" },
  "permissions": {
    "required": [
      { "id": "messages.read", "reason": "Counts messages." },
      { "id": "storage.private", "reason": "Keeps the counter." }
    ]
  },
  "contributes": { "events": ["message.new"] }
}
```

Поля, которые проверяет код:

- `schema` — только `1` (`Telegram/plugins_host/src/fgpl/manifest.cpp:520-522`).
- `id` — обратное доменное имя, от 5 до 64 символов. Обязательна хотя бы одна точка. Допускаются строчные латинские буквы, цифры, точка и дефис; точка и дефис не идут подряд и не стоят в начале или в конце (`Telegram/plugins_host/src/fgpl/manifest.cpp:37-53`, `:523-527`).
- `name` — строка до 80 символов или словарь по языкам; `version` — семантическая версия. Оба поля обязательны (`Telegram/plugins_host/src/fgpl/manifest.cpp:529-538`). Если `name` задан словарём, ключ `default` обязателен (`Telegram/plugins_host/src/fgpl/manifest.cpp:241-260`).
- `compat` — обязательный блок; `compat.freshgram` — диапазон версий в формате вида `>=7.6.0 <8.0.0` (`Telegram/plugins_host/src/fgpl/manifest.cpp:577-584`).
- `runtime.kind` — `python`; `runtime.entry` — безопасный относительный путь к файлу с расширением `.py` (`Telegram/plugins_host/src/fgpl/manifest.cpp:627-631`).
- `permissions` — объект с массивами `required` и `optional`. Каждый элемент — объект с `id` из известного набора разрешений и `reason`; один и тот же `id` нельзя указать дважды (`Telegram/plugins_host/src/fgpl/manifest.cpp:670-700`). В диалоге прав переключатель для обязательных разрешений скрыт, опциональные пользователь может включить или выключить (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3045-3047`).
- `contributes.events` принимает только точные имена событий, маски не принимаются (`Telegram/plugins_host/src/fgpl/manifest.cpp:727-735`; список имён — `Telegram/plugins_host/src/fgpl/manifest.cpp:430-446`). Хост подписывается на событие, только если оно перечислено в `contributes.events` и право на него выдано (`Telegram/plugins_host/src/fgpl/manager.cpp:1963-1975`). Событие `message.new` требует право `messages.read` (`Telegram/plugins_host/src/fgpl/manifest.cpp:432`).
- `files` — обязательное поле: пакет без него не проходит проверку (`Telegram/plugins_host/src/fgpl/manifest.cpp:908-910`). В черновике выше его нет, и писать его вручную не нужно: `fgpl_tool pack` сам вычисляет хэши файлов, добавляет `files` и отбрасывает `files` и `signature`, если они были в исходном `manifest.json` (`Telegram/plugins_host/src/fgpl/tool_main.cpp:147-153`).

Остальные поля манифеста (`activation`, `contributes` кроме `events`, `storage`, `dependencies` и другие) здесь не разобраны, см. [Пакет и манифест](#/package-manifest).

## Упаковка и установка

1. Убедитесь, что в корне каталога есть `manifest.json`. Без него упаковка не выполняется (`Telegram/plugins_host/src/fgpl/tool_main.cpp:116`).
2. Создайте ключ плагинов: `fgpl_tool keygen plugins`. Ключ записывается в файл `plugins.key` (`Telegram/plugins_host/src/fgpl/tool_main.cpp:60`); строка 61 содержит только сообщение об ошибке записи.

   ```bash
   fgpl_tool keygen plugins
   ```

   > [!WARNING]
   > `plugins.key` — закрытый ключ подписи. Команда `keygen` сама выводит предупреждение «keep it secret» (`Telegram/plugins_host/src/fgpl/tool_main.cpp:64`). Храните файл в секрете: не передавайте его другим людям, не публикуйте и не кладите в репозиторий плагина. Ключ, созданный `keygen`, принадлежит автору пакета и не является ключом freshGram (`Telegram/plugins_host/src/fgpl/tool_main.cpp:53-68`).

3. Упакуйте каталог в файл `.fgpl`:

   ```bash
   fgpl_tool pack <directory> <output.fgpl> --key plugins.key
   ```

   Без `--key` пакет остаётся неподписанным (`Telegram/plugins_host/src/fgpl/tool_main.cpp:314-320`). Пакет показывается как официальный только при подписи ключом freshGram; любой другой пакет — подписанный чужим ключом или без подписи — показывается как неофициальный (`Telegram/plugins_host/RUNTIME.md:93-94`). Статус сравнивает издателя пакета с отпечатком ключа freshGram (`Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:314-320`), поэтому пакет, подписанный ключом, созданным `keygen`, будет неофициальным.

> [!TIP]
> Перед установкой проверьте готовый пакет командой `fgpl_tool verify <file.fgpl>`. Она выводит описание пакета или причины отказа (`Telegram/plugins_host/src/fgpl/tool_main.cpp:96-111`).

4. Установите пакет в клиенте: пункт «Установить из файла» (`Telegram/Resources/langs/fresh/ru.strings:129`) открывает выбор файла с фильтром `Plugins (*.fgpl)` (`Telegram/SourceFiles/ayu/ui/boxes/plugin_install_box.cpp:369-375`). Установка доступна только при включённом плагин-рантайме (`Telegram/SourceFiles/ayu/ui/boxes/plugin_install_box.cpp:345-347`).
5. Включите плагин и выдайте ему права. Установленный плагин выключен по умолчанию (`Telegram/plugins_host/src/fgpl/manager.h:399`; `Telegram/plugins_host/src/fgpl/manager.cpp:780-786`). Без выданных прав он не запускается (`Telegram/plugins_host/src/fgpl/manager.cpp:1462-1464`).

## Полный пример

Полный пример — `counter_plugin.py` из тестов хоста. Он считает сообщения, пишет счётчик в хранилище и выводит его в журнал плагина через `freshgram.log`:

```python
import freshgram


@freshgram.on("message.*")
def message(event):
    count = freshgram.storage.get("count", 0) + 1
    freshgram.storage.set("count", count)
    freshgram.log("count=" + str(count))


freshgram.run()
```

Файл: `Telegram/plugins_host/tests/plugins/python/counter_plugin.py:1-11` (дословно).

Для пакета с этим кодом подходит манифест из раздела «Манифест»: права `messages.read` и `storage.private` и событие `message.new` в черновике соответствуют коду примера. Сам манифест не проверен (OPEN-18). Файл — тестовая фикстура: он показывает API, а не рекомендуемый стиль. Другие примеры собраны в разделе [examples](#/examples).

## Проверка

Плагин работает, когда пакет установлен, плагин включён и права выданы. Порядок проверки:

1. Проверьте пакет командой `fgpl_tool verify <file.fgpl>`. Если пакет некорректен, команда выводит причины отказа и завершается с кодом 2 (`Telegram/plugins_host/src/fgpl/tool_main.cpp:96-111`).
2. Установите пакет, включите плагин и выдайте права (шаги 4 и 5 раздела «Упаковка и установка»).
3. Получите или отправьте сообщение в чате, на который выданы права `messages.read`. Событие `message.new` доставляется плагину, только если оно указано в `contributes.events` и право `messages.read` выдано.
4. В деталях плагина нажмите кнопку «Журнал плагина» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2270-2277`). В окне журнала есть вкладки «Все» и «Проблемы». Во вкладке «Проблемы» показываются строки с `failure:` или `rolled back` в начале, трейсбеки и строки, которые начинаются с имени вида `*Error` или `*Exception` (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:1768-1775`).
5. Для `counter_plugin.py` ожидаемые строки — `count=1`, `count=2` и так далее, по одной на каждое полученное сообщение. Вызов `freshgram.log` записывается в буфер журнала (`Telegram/plugins_host/src/fgpl/manager.cpp:1482-1483`), который хранит последние 200 строк (`Telegram/plugins_host/src/fgpl/manager.h:110`).

> [!TIP]
> Если журнал пуст, проверьте, что плагин включён и права выданы: без выданных прав запуск не выполняется (`Telegram/plugins_host/src/fgpl/manager.cpp:1462-1464`). Причины сбоев описаны в разделе [Жизненный цикл, логи и отладка](#/lifecycle).

## Частые ошибки

- **Декораторы-фабрики без скобок.** `@freshgram.on_command` и `@freshgram.on_dialog` без аргументов не регистрируют обработчик и не выдают ошибку: декоратор получает функцию как аргумент и возвращает `register`. Правильно: `@freshgram.on_command("name")` (`Telegram/plugins_sdk/python/freshgram/__init__.py:703-710`; для `on_dialog` — `Telegram/plugins_sdk/python/freshgram/__init__.py:741-749`).
- **`asyncio` не работает.** В песочнице цикл asyncio не запускается. Асинхронные вызовы берите из модуля `aio`, который нужно импортировать явно: `from freshgram import aio`. Фоновые задачи запускаются через `freshgram.spawn` (`Telegram/plugins_sdk/README.md:247-249`; `Telegram/plugins_sdk/python/freshgram/aio.py:3`, `:12-13`).
- **`files` есть только в `aio`.** Методы `files.pick` и `files.save` доступны только в модуле `aio`: после `from freshgram import aio` обращайтесь к `aio.files` (`Telegram/plugins_sdk/python/freshgram/aio.py:65`; `Telegram/plugins_sdk/README.md:488-489`). В синхронном модуле `freshgram` атрибута `files` нет, поэтому `freshgram.files` вызывает `AttributeError`.
- **`print` и stderr.** SDK перенаправляет `sys.stdout` в `sys.stderr` (`Telegram/plugins_sdk/python/freshgram/_channel.py:7-8`), поэтому случайный вывод не попадает в протокольный канал. Всё, что плагин пишет в stderr, хост режет по переводу строки и передаёт в журнал плагина (`Telegram/plugins_host/src/fgpl/runtime.cpp:401-402`, `:187-204`). Журнал открывается кнопкой в деталях плагина (раздел «Проверка» выше). Справка SDK описывает то же место вывода (`Telegram/plugins_sdk/README.md:492-493`).
- **Нет права — ошибка `denied`.** Вызов, для которого нет нужного права, возвращает код `denied` и имя недостающего разрешения (`Telegram/plugins_host/src/fgpl/broker.cpp:1372-1374`). В Python SDK это исключение `freshgram.Denied` (`Telegram/plugins_sdk/python/freshgram/__init__.py:24`; `Telegram/plugins_sdk/python/freshgram/_errors.py:8`, `:37`; `Telegram/plugins_sdk/README.md:491`). Остальные исключения SDK из той же справки: `Invalid`, `NotFound`, `QuotaExceeded`, `LimitExceeded`, `Unavailable`, `Failed` (`Telegram/plugins_sdk/README.md:491`).
- **Лимиты вызовов.** Не больше 256 вызовов на одно событие и 200 вызовов в секунду (`Telegram/plugins_sdk/README.md:94-96`).

## Что дальше

- [Справочник Python SDK](#/python-sdk-reference) — модули, namespace-объекты, декораторы и исключения.
- [Пакет и манифест](#/package-manifest) — полный формат `manifest.json` и архива `.fgpl`.
- [Разрешения](#/permissions) — как плагин объявляет права и как пользователь их выдаёт.
- [Жизненный цикл, логи и отладка](#/lifecycle) — установка, включение, обновление, журналы плагина.
- [Примеры](#/examples) — проверенные фрагменты из SDK и тестов с путями к исходникам.
- [Ограничения и WIP](#/limits-wip) — лимиты, заглушки и расхождения между справкой и кодом.
- [FAQ](#/faq) — типовые ситуации: отказы, отсутствие событий, платформа.
