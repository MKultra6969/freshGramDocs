---
title: "Примеры"
description: "Проверенные фрагменты кода из SDK и тестов freshGram с путями к исходникам и пояснением, какие файлы являются тестовыми фикстурами."
section: "Примеры"
order: 15
slug: "examples"
status: "экспериментально"
---

Этот раздел содержит фрагменты кода, которые можно взять за основу. Каждый фрагмент взят из репозитория и сверен с исходниками: рядом указан путь от корня репозитория и номера строк. Ниже приведены примеры на Python (модуль `freshgram`) и C (заголовок `freshgram.h`).

## Образцы и фикстуры

Образцами считаются примеры из `Telegram/plugins_sdk/README.md` и файл `Telegram/plugins_sdk/c/examples/counter.c`. Готового пакета плагина в `Telegram/plugins_sdk/` нет: ни манифеста, ни полного Python-примера с упаковкой. Файлы из `Telegram/plugins_host/tests/plugins/` показывают API в тестах, но образцами не являются. Их назначение перечислено в конце страницы.

## Счётчик на Python (тестовая фикстура)

Плагин считает события, тип которых начинается с `message.`, и пишет текущее значение счётчика в журнал. Файл `counter_plugin.py` — тестовая фикстура: он лежит в каталоге фикстур и используется тестами (`Telegram/plugins_host/tests/test_manager.cpp:533`). Фрагмент приведён целиком, потому что он короткий; образцом из списка выше он не является.

```python
import freshgram


@freshgram.on("message.*")
def message(event):
    count = freshgram.storage.get("count", 0) + 1
    freshgram.storage.set("count", count)
    freshgram.log("count=" + str(count))


freshgram.run()
```

Источник: `Telegram/plugins_host/tests/plugins/python/counter_plugin.py:1-11`.

- `freshgram.on("message.*")` срабатывает для событий, тип которых начинается с `message.`: суффикс `*` проверяет префикс (`Telegram/plugins_sdk/python/freshgram/__init__.py:905-908`).
- `freshgram.storage.get(key, default)` и `freshgram.storage.set(key, value)` работают с хранилищем плагина. Подробнее: [Хранилище и файлы](#/storage-files).
- `freshgram.log(text)` пишет строку в журнал плагина. Подробнее: [Жизненный цикл, логи и отладка](#/lifecycle).
- `freshgram.run()` обрабатывает события, пока хост не остановит плагин (`Telegram/plugins_sdk/python/freshgram/__init__.py:939-940`).

> [!NOTE]
> Этот код не является пакетом. Для установки нужны манифест и упаковка, см. [Пакет и манифест](#/package-manifest) и [Быстрый старт: Python](#/quickstart-python).

## Асинхронные вызовы

Вызовы `freshgram.aio` возвращают awaitable-объекты. Плагин не блокируется на ожидании ответа и продолжает обрабатывать другие события. Одновременно могут ждать не больше 32 вызовов (`Telegram/plugins_sdk/python/freshgram/aio.py:12`).

```python
import freshgram
from freshgram import aio

@freshgram.on_command("rates")
async def rates(event):
    usd, eur = await aio.gather(
        aio.net.get("https://example.org/usd"),
        aio.net.get("https://example.org/eur"))
    await aio.ui.toast(usd.text() + " / " + eur.text())

@freshgram.on("message.new")
def counted(event):
    # Runs while rates() waits for the network.
    freshgram.storage.set("seen", freshgram.storage.get("seen", 0) + 1)

freshgram.run()
```

Источник: `Telegram/plugins_sdk/README.md:228-245`.

- Awaitable-вызов сначала получает ответ `{"ticket": N}`, а результат приходит позже событием `call.result`: `{ticket, ok, v}` при успехе или `{ticket, ok: false, e, m}` при ошибке (`Telegram/plugins_sdk/README.md:216-220`). SDK сопоставляет `call.result` с вызовом по `ticket`: при `ok` результат строится из `v`, при `ok: false` поднимается исключение (`Telegram/plugins_sdk/python/freshgram/_aio.py:123-144`; `Telegram/plugins_sdk/python/freshgram/_errors.py:46-53`).
- `aio.gather(*awaitables)` ждёт все вызовы и возвращает список результатов в исходном порядке; в примере это ответы `usd` и `eur`. При первой ошибке она поднимается, остальные вызовы продолжают работать (`Telegram/plugins_sdk/python/freshgram/aio.py:74-78`).
- `aio.sleep(seconds)` ждёт `seconds` секунд, не блокируя плагин. Docstring (`Telegram/plugins_sdk/python/freshgram/aio.py:69-71`) называет предел 60 секунд, но SDK его не применяет: вызов `time.sleep` с `ms` больше 60000 хост отклоняет ошибкой `api::error::kInvalid` (`Telegram/plugins_host/src/fgpl/broker.cpp:45`, `:676-680`).
- `aio.wait_for(awaitable, timeout)` ограничивает таймер значением `min(timeout, 60)`: при `timeout` больше 60 ожидание завершается `TimeoutError` через 60 секунд, а сам вызов не отменяется (`Telegram/plugins_sdk/python/freshgram/aio.py:104`, `:123`).
- `usd.text()` — метод ответа сети (`Telegram/plugins_sdk/python/freshgram/__init__.py:103`).
- Асинхронный обработчик выполняется до первого `await` во время обработки события, а остальная часть — после получения ответов на вызовы (`Telegram/plugins_sdk/python/freshgram/__init__.py:665-670`).

> [!NOTE]
> Нужны обе строки импорта: `import freshgram` и `from freshgram import aio`. Docstring модуля `Telegram/plugins_sdk/python/freshgram/aio.py` (строки 3–8) даёт пример без `import freshgram`, в нём импорт нужно добавить. `asyncio` в песочнице не работает (`Telegram/plugins_sdk/python/freshgram/aio.py:12-13`).

## Переводчик

Плагин становится переводчиком, если в манифесте объявлен `contributes.translator`, а у плагина есть право `translate.provide` (`Telegram/plugins_host/src/fgpl/manifest.cpp:979-980`). Обработчик получает список текстов (до 20) и код языка, а возвращает список переводов той же длины. Ответ на запрос перевода должен прийти в течение 20 секунд (`Telegram/plugins_sdk/README.md:198-199`).

Фрагмент манифеста:

```json
"contributes": { "translator": { "name": "DeepL", "languages": ["en", "ru"], "maxChars": 4096 } }
```

Значения взяты из `Telegram/plugins_sdk/README.md:193`; поля проверяет `Telegram/plugins_host/src/fgpl/manifest.cpp:828-842`. `maxChars` принимает значения от 64 до 8192, по умолчанию 4096 (`Telegram/plugins_host/src/fgpl/manifest.cpp:842`). `languages` носит справочный характер (`Telegram/plugins_sdk/README.md:193-194`).

Фрагмент обработчика:

```python
@freshgram.on_translate
def translate(items, to):
    return [shout(text) for text in items]
```

Источник: `Telegram/plugins_sdk/README.md:204-208`. Декоратор `on_translate` описан в `Telegram/plugins_sdk/python/freshgram/__init__.py:780-788`; обработчик вызывается как `handler(items, to)` (`Telegram/plugins_sdk/python/freshgram/__init__.py:804`).

> [!NOTE]
> Функция `shout` в README не определена, поэтому без её определения фрагмент выдаст ошибку. Фрагмент показывает форму обработчика. Вызов `on_translate(markdown=True)` делает ответы разбираемыми как markdown.

## Значки у имён

С правом `ui.badges` плагин показывает значки рядом с именем пользователя. Вызов `freshgram.badges.set(user, items)` заменяет значки плагина для пользователя, пустой список их убирает (`Telegram/plugins_sdk/README.md:415-417`).

```python
freshgram.badges.set(user_id, [
    {"id": "vip", "icon": "star", "tooltip": "VIP"},
    {"id": "logo", "image": png_bytes},
])

@freshgram.on_badge_click("vip")
def vip(event):
    freshgram.ui.toast("VIP user " + str(event["user"]))
```

Источник: `Telegram/plugins_sdk/README.md:419-428`.

- `user_id` — peer id, как его показывает `chats.list` (`Telegram/plugins_sdk/README.md:415`).
- `icon` — встроенное имя или значок плагина; `image` — PNG до 128×128 или JPEG. Нужно указать одно из двух (`Telegram/plugins_sdk/README.md:430-431`).
- `on_badge_click("vip")` вызывает обработчик при нажатии на значок `vip`. Событие содержит `id`, `user` и `surface`, а для сообщения также `chat` и `message` (`Telegram/plugins_sdk/python/freshgram/__init__.py:688-693`).
- Значки живут, пока работает приложение. Задавать их заново нужно при `init`; для этого в `activation.on` должен быть `startup` (`Telegram/plugins_sdk/README.md:433-434`).

## Окно с вкладками

Окно описывается деревом элементов, которое рисует приложение: плагин не выполняет код в окне. Плагин получает события `window.*` с id окна (`Telegram/plugins_sdk/README.md:441-442`).

```python
@freshgram.on_command("board")
def board(event):
    freshgram.ui.window("board", "Board", [
        {"type": "tabs", "id": "tabs", "tabs": [
            {"id": "todo", "label": "To do", "items": [
                {"type": "list", "items": [{"id": "t1", "title": "Write docs"}]}]},
            {"id": "info", "label": "Info", "items": [{"type": "text", "text": "Hello"}]},
        ]},
    ], mode="window")

@freshgram.on_window("board", "t1")
def clicked(event):
    freshgram.ui.close_window("board")
```

Источник: `Telegram/plugins_sdk/README.md:447-459`.

- `ui.window(window_id, title, items, buttons=None, mode="layer")` открывает окно или обновляет уже открытое с тем же id (`Telegram/plugins_sdk/python/freshgram/__init__.py:223-232`).
- `mode="window"` открывает окно отдельно; `mode="layer"` (значение по умолчанию) показывает его поверх чата (`Telegram/plugins_sdk/python/freshgram/__init__.py:226-228`).
- `on_window("board", "t1")` срабатывает на события окна `board`, у которых id элемента равен `t1` (`Telegram/plugins_sdk/python/freshgram/__init__.py:752-760`).
- `ui.close_window(window_id)` закрывает окно (`Telegram/plugins_sdk/python/freshgram/__init__.py:239-240`).

## Межплагинные сообщения

Плагины не обращаются друг к другу напрямую: сообщение проходит через приложение, которое проверяет обе стороны. Отправитель и получатель должны иметь право `plugins.message`. Получатель перечисляет, кто может ему писать, в `contributes.messages.from` (`Telegram/plugins_sdk/README.md:256-261`). Сообщения остаются внутри одного аккаунта (`Telegram/plugins_sdk/README.md:264`).

```python
@freshgram.on_plugin_message("com.example.sender")
def got(sender, data):
    freshgram.plugins.send(sender, {"echo": data})
```

Источник: `Telegram/plugins_sdk/README.md:266-270`.

- Обработчик получает два аргумента: идентификатор отправителя и данные (`Telegram/plugins_sdk/python/freshgram/__init__.py:713-720`).
- `freshgram.plugins.send(to, data=None)` отправляет ответ (`Telegram/plugins_sdk/python/freshgram/__init__.py:554`).

## Экспорт настроек и меню

Фрагменты ниже относятся к `manifest.json`. Общие поля описаны в [Пакет и манифест](#/package-manifest).

Экспорт настроек: `prefixes` выбирает ключи хранилища, `exclude` убирает из них часть (`Telegram/plugins_sdk/README.md:289`).

```json
"storage": { "schema": 2, "export": { "prefixes": ["settings."], "exclude": ["settings.token"] } }
```

Источник: `Telegram/plugins_sdk/README.md:285-287`; поля проверяет `Telegram/plugins_host/src/fgpl/manifest.cpp:881-898`.

Значки и пункты меню:

```json
"contributes": {
  "icons": { "spark": "icons/spark.svg" },
  "menus": [
    { "surface": "composer", "id": "tr", "title": "Translate", "icon": "translate" },
    { "surface": "message", "id": "save", "title": "Save note", "icon": "spark" }
  ]
}
```

Источник: `Telegram/plugins_sdk/README.md:333-341`. Поле `contributes.icons` проверяет `Telegram/plugins_host/src/fgpl/manifest.cpp:709`, поле `contributes.menus` — `Telegram/plugins_host/src/fgpl/manifest.cpp:736-752`.

- `translate` — встроенное имя значка (`Telegram/plugins_sdk/README.md:323-331`). `spark` — собственный значок плагина: он объявлен в `contributes.icons` в примере JSON (`Telegram/plugins_sdk/README.md:335`). Собственные значки перечисляются в `contributes.icons` в виде `{"имя": "путь"}`: до 32 файлов `.svg` или `.png` из `files`, каждый до 64 KiB (`Telegram/plugins_sdk/README.md:320-321`).
- Меню требует право `ui.menu` (`Telegram/plugins_sdk/README.md:310`). Пункт меню на поверхности `composer` требует ещё право `ui.composer_button` (`Telegram/plugins_host/src/fgpl/manifest.cpp:989-990`).
- Пункт меню со значком, которого нет во встроенном списке и который плагин не объявил, отклоняется при установке (`Telegram/plugins_sdk/README.md:330-331`).

## Эталонный C-плагин

Файл `counter.c` — единственный C-пример в `Telegram/plugins_sdk/`:

```c
#include "../freshgram.h"

int fg_plugin_init(fg_value info) {
	(void)info;
	fg_log("counter ready");
	return 0;
}

int fg_plugin_event(fg_value event) {
	fg_i64 chat = 0;
	fg_as_int(fg_find(event, "chat"), &chat);
	fg_i64 count = 0;
	int read = fg_storage_get_int("count", &count);
	if (read != FG_OK) {
		fg_log("cannot read the counter");
		return 100 + read;
	}
	count += 1;
	int written = fg_storage_set_int("count", count);
	if (written != FG_OK) {
		fg_log("cannot save the counter");
		return 200 + written;
	}
	fg_storage_set_int("last_chat", chat);
	return (int)count;
}
```

Источник: `Telegram/plugins_sdk/c/examples/counter.c:1-26`.

- `fg_init` из заголовка вызывает `fg_plugin_init` с `info` (`Telegram/plugins_sdk/c/freshgram.h:817-819`). Пример пишет строку в журнал и возвращает 0.
- `fg_plugin_event` читает поле `chat` события, увеличивает счётчик `count` в хранилище, сохраняет `last_chat` и возвращает новое значение счётчика.
- При первом запуске ключа `count` в хранилище ещё нет. Для отсутствующего ключа `fg_storage_get_int` возвращает `FG_OK` и не меняет `*out` (`Telegram/plugins_host/src/fgpl/broker.cpp:1041-1043`; `Telegram/plugins_sdk/c/freshgram.h:419-430`). Поэтому счётчик начинается с 0, а код `103` (`100 + FG_NOT_FOUND`, `Telegram/plugins_sdk/c/freshgram.h:25`) не возникает.
- Ошибки чтения и записи возвращаются как `100 + код` и `200 + код`.
- Лог `counter ready` проверяется тестом `Telegram/plugins_host/tests/test_sdk.cpp:205`.

> [!WARNING]
> Не подтверждено кодом (OPEN-14): смысл возвращаемого `int`. Коды 100+ и 200+ выбраны автором примера, а заголовок не описывает, что означает результат (`Telegram/plugins_sdk/c/freshgram.h:804-805`).

### Сборка

Команда сборки из README:

```bash
clang --target=wasm32 -O2 -nostdlib -fno-builtin -Wl,--no-entry -o plugin.wasm plugin.c
```

Источник: `Telegram/plugins_sdk/README.md:510`.

> [!WARNING]
> Не подтверждено кодом (OPEN-12): путь к заголовку. README подключает `"freshgram.h"` (`Telegram/plugins_sdk/README.md:498`), пример — `"../freshgram.h"` (`Telegram/plugins_sdk/c/examples/counter.c:1`), а команда сборки не задаёт `-I`.

> [!WARNING]
> Размер арены в команде не задан. По умолчанию `FG_HEAP_BYTES` равен 1 MiB (`Telegram/plugins_sdk/c/freshgram.h:33-35`). Какое значение нужно для файлов большого размера, не подтверждено кодом (OPEN-13).

> [!WARNING]
> `fg_heap_` и `fg_heap_used_` объявлены `static` в заголовке (`Telegram/plugins_sdk/c/freshgram.h:37-38`), поэтому каждая единица трансляции получит свою копию арены. Поведение модуля из нескольких `.c`-файлов не подтверждено кодом (OPEN-28).

## Тестовые фикстуры

Эти файлы нужны тестам. Их API показан, но образцами они не являются.

| Файл | Назначение |
|---|---|
| `Telegram/plugins_host/tests/plugins/python/main.py` | Обработчик `handle(kind, value)`, передаваемый в `freshgram.run(handle)`. |
| `Telegram/plugins_host/tests/plugins/python/sdk_demo.py` | Отчёт о плагине: попытки сетевых вызовов разных видов и запись значения в 5000 байт в хранилище. |
| `Telegram/plugins_host/tests/plugins/python/denied_demo.py` | Попытки действий без нужных прав; отказ фиксируется как `denied`. |
| `Telegram/plugins_host/tests/plugins/python/async_plugin.py` | `aio.gather` с сетевым вызовом и `aio.sleep(0.3)`. |
| `Telegram/plugins_host/tests/plugins/python/ui_demo.py` | Страница настроек (`ui.settings_page`), меню (`on_menu`), команда `tr` и окно `board`. |
| `Telegram/plugins_host/tests/plugins/python/attacks.py` | Проверки попыток выйти за разрешённое: функция `escape` и её вложенные проверки. |
| `Telegram/plugins_host/tests/plugins/wasi_probe.c` | Служебный модуль, который напрямую объявляет 14 WASI-импортов: `fd_write`, `fd_read`, `fd_pread`, `fd_seek`, `fd_tell`, `fd_close`, `fd_prestat_get`, `fd_prestat_dir_name`, `fd_filestat_get`, `fd_fdstat_get`, `fd_readdir`, `path_open`, `path_filestat_get`, `path_unlink_file` (`Telegram/plugins_host/tests/plugins/wasi_probe.c:13-28`). |

Фикстуры запускают тесты из `Telegram/plugins_host/tests/`: например, `sdk_demo.py` используется в `Telegram/plugins_host/tests/test_sdk.cpp:86`, `ui_demo.py` — в `Telegram/plugins_host/tests/test_manager.cpp:594`, `async_plugin.py` — в `Telegram/plugins_host/tests/test_manager.cpp:1396`, `attacks.py` — в `Telegram/plugins_host/tests/test_abuse.cpp:220`.

## Дальше

- [Python SDK: справочник](#/python-sdk-reference) — полный список модулей, функций и декораторов.
- [C-ABI: справочник](#/c-abi-reference) — экспорты, типы и вспомогательные функции `freshgram.h`.
- [Пакет и манифест](#/package-manifest) — поля `manifest.json` и упаковка.
- [Разрешения](#/permissions) — какие права нужны каждой возможности.
- [Ограничения и WIP](#/limits-wip) — что ещё не готово.

## Рабочие плагины

Этот раздел описывает два пакета из каталога `plugins-examples/`. Это полные плагины с `manifest.json` и исходным кодом, а не фрагменты. Сведения взяты из манифестов и исходников; пути к файлам пакетов даны от корня репозитория, где лежит каталог `plugins-examples/`.

> [!WARNING]
> Не подтверждено запуском: плагины не запускались. Поведение описано по манифестам и чтению `main.py`. Запасный путь при замене заглушки и постраничное чтение истории проверены только по коду.

| Поле манифеста | freshgram-badges | pictures |
|---|---|---|
| `id` | `app.freshgram.badges` | `app.freshgram.pictures` |
| `name` (ru) | Бейджи | Котики и обои |
| `version` | `1.1.3` | `3.0.5` |
| `author.name` | `partisanian` | `Snowy Fluffy` |
| `homepage` | `https://example.com` | `https://snowyfl.com` |
| `license` | `GPL-3.0-or-later` | в манифесте не указана |
| `categories` | `interface` | `fun` |

### freshgram-badges

Плагин рисует рядом с именами значки разработчиков, саппортеров и каналов AyuGram и exteraGram, донатеров Cherrygram, а также значки в стиле exteraless, которые пользователь выдаёт сам. Списки AyuGram и exteraGram скачиваются с `update.ayugram.one` и `api.exteragram.app`, список Cherrygram берётся по адресу, который задаёт пользователь (поле `reason` разрешения `net.https` в `plugins-examples/freshgram-badges/manifest.json`).

- Обязательные разрешения (`permissions.required`): `ui.badges`, `storage.private`, `net.https`.
- Необязательные разрешения (`permissions.optional`): `ui.settings_page`, `ui.menu`, `ui.dialog`, `ui.toast`, `settings.read`, `account.info`, `chats.list`, `contacts.list`, `chats.active`, `messages.history`, `messages.read` (с `scope` равным `all`).

### pictures

Автор: Snowy Fluffy, основатель freshGram. Репозиторий: [github.com/Snowy-Fluffy/freshGram](https://github.com/Snowy-Fluffy/freshGram).

Плагин присылает случайных котиков и обои по командам `/cat` и `/wallpaper` и по кнопкам у поля ввода. В манифесте перечислены варианты `gif` и `orange` для `/cat` и `mountains` для `/wallpaper`. Сначала отправляется сообщение «Loading image...» (`plugins-examples/pictures/main.py:186–187`), затем плагин заменяет его картинкой.

- Обязательные разрешения (`permissions.required`): `ui.command`, `net.https`, `messages.send`, `messages.edit`.
- Необязательные разрешения (`permissions.optional`): `messages.delete`, `ui.menu`, `ui.composer_button`, `ui.toast`, `storage.private`, `ui.settings_page`, `settings.read`.

### Фрагменты кода

**(а) Обработчик `menu.click`.** Файл `plugins-examples/pictures/main.py`, строки 225–232. Фильтр по `surface` (`composer`) и `id` (`cat`, `wallpaper`) совпадает с пунктами `contributes.menus` в манифесте. SDK-декоратор `on_menu` проверяет `id` и, если передан, `surface` (`Telegram/plugins_sdk/python/freshgram/__init__.py:678–685`).

```python
@freshgram.on("menu.click")
async def menu_click(event):
    if event.get("surface") != "composer":
        return
    if event.get("id") == "cat":
        await send_picture(event, cat_sources(""), False)
    elif event.get("id") == "wallpaper":
        await send_picture(event, wallpaper_sources(""), True)
```

**(б) Замена заглушки через `edit_media`.** Файл `plugins-examples/pictures/main.py`, строки 150–158. При ошибке `edit_media` функция пишет строку в журнал и продолжает: удаляет заглушку через `aio.messages.delete` (строка 160), отправляет картинку через `aio.messages.send_media` (строка 164), а при `freshgram.Denied` отправляет ссылку текстом через `aio.messages.send` (строки 167–170).

```python
async def show_result(chat, loading, topic, reply_to, name, data, caption, as_file, url):
    kind = "file" if as_file else "auto"
    spoiler = settings["spoiler"] and not as_file
    try:
        await aio.messages.edit_media(
            chat, loading, data, name, caption=caption, kind=kind, spoiler=spoiler)
        return
    except freshgram.FreshgramError as error:
        freshgram.log("edit_media failed: %s" % error)
```

**(в) Постраничное чтение истории при `chat.opened`.** Файл `plugins-examples/freshgram-badges/main.py`, строки 601–616. Строки относятся к функции `on_opened` (строки 593–594), которую регистрирует декоратор `@freshgram.on_chat_opened` (`Telegram/plugins_sdk/python/freshgram/__init__.py:774–777`). Страниц не больше `HISTORY_PAGES` = 5 по `HISTORY_LIMIT` = 100 сообщений (`plugins-examples/freshgram-badges/main.py:33–34`). Курсор `before` равен наименьшему `id` полученной страницы. По описанию в манифесте текст сообщений не сохраняется.

```python
    # Older messages show their senders too, so read a few pages back.
    before = 0
    for _ in range(HISTORY_PAGES):
        try:
            page = await aio.messages.history(chat, HISTORY_LIMIT, before, topic)
        except freshgram.FreshgramError as error:
            log("history: %s" % error)
            return
        if not page:
            return
        await show_peers(sorted({message["from"] for message in page
                                 if valid_peer(message.get("from"))}))
        ids = [message["id"] for message in page if isinstance(message.get("id"), int)]
        if len(page) < HISTORY_LIMIT or not ids:
            return
        before = min(ids)
```

Фрагменты выше приведены для примера; файл и строки указаны перед каждым из них.
