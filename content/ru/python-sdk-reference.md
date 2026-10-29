---
title: "Python SDK: справочник"
description: "Справочник модуля freshgram для плагинов на Python: функции, namespace-объекты, декораторы, исключения и асинхронный модуль freshgram.aio."
section: "Справочник"
order: 8
slug: "python-sdk-reference"
status: "экспериментально"
---

## Что это и зачем

Модуль `freshgram` — всё, что Python-плагин делает с приложением. Плагин не открывает файлы, сокеты и процессы сам: каждый вызов идёт через `freshgram` и проверяется по разрешениям, которые пользователь выдал плагину (`Telegram/plugins_sdk/python/freshgram/__init__.py:1-6`).

Эта страница — справочник по именам, сигнатурам и поведению. Порядок работы с плагином описан в [Быстром старте: Python](#/quickstart-python), разрешения — в [Разрешениях](#/permissions).

## Импорт и два режима вызовов

```python
import freshgram
from freshgram import aio
```

- `freshgram` — синхронные вызовы: результат возвращается сразу, плагин ждёт ответа приложения.
- `freshgram.aio` — те же namespace, но вызовы возвращают awaitable, а обработчики могут быть `async def`. В `aio` нет декораторов регистрации, `info`, `log`, `run`, `unload`, `call` и исключений (`Telegram/plugins_sdk/python/freshgram/aio.py:16-66`).

> [!NOTE]
> asyncio в плагине не работает: `await` принимает только awaitable из `freshgram` (`Telegram/plugins_sdk/python/freshgram/aio.py:12-13`).

> [!TIP]
> `files` доступен только как `aio.files`. Имени `freshgram.files` нет (`Telegram/plugins_sdk/python/freshgram/aio.py:65`; в `__init__.py` такого namespace нет).

## Функции уровня модуля

| Имя | Что делает |
|---|---|
| `API_VERSION` | Версия API, сейчас `4` (`Telegram/plugins_sdk/python/freshgram/__init__.py:17`) |
| `info()` | Версия API, id плагина и выданные разрешения (`Telegram/plugins_sdk/python/freshgram/__init__.py:47-49`) |
| `log(text)` | Пишет строку в журнал плагина; текст длиннее 4000 байт обрезается с начала, остаётся его конец (`Telegram/plugins_sdk/python/freshgram/__init__.py:52-60`) |
| `spawn(coroutine)` | Запускает корутину как фоновую задачу; её исключение пишется в журнал (`Telegram/plugins_sdk/python/freshgram/__init__.py:642-644`, `Telegram/plugins_sdk/python/freshgram/_aio.py:116-120`) |
| `unload()` | Останавливает плагин после текущего события, чтобы освободить память; приложение запустит его снова, когда наступит событие, которым он активируется (`Telegram/plugins_sdk/python/freshgram/__init__.py:647-653`) |
| `run(handler=None)` | Обрабатывает сообщения хоста `init` и `event` до остановки плагина (`Telegram/plugins_sdk/python/freshgram/__init__.py:939-965`); тип обычного события — см. предупреждение ниже |
| `call` | Сырой вызов протокола (`_channel.raw_call`): принимает словарь `{"op": ..., "a": {...}}`. Публичного описания в README нет: `Telegram/plugins_sdk/README.md:13` описывает `freshgram.call(req_ptr, req_len, out_ptr_slot, out_len_slot)` как импорт Wasm-реактора (C ABI), а не функцию Python-SDK (`Telegram/plugins_sdk/python/freshgram/__init__.py:20`, `Telegram/plugins_sdk/python/freshgram/_channel.py:38-43`) |

Сообщения хоста с полем `t`, равным `init` или `event`, передаются в `handler(kind, value)`, если он задан; без него работают декораторы (`Telegram/plugins_sdk/python/freshgram/__init__.py:949-951`, `:957-960`). Сообщение `call.result` обрабатывается раньше, через `_aio.resolve`, и в `handler` не попадает (`Telegram/plugins_sdk/python/freshgram/__init__.py:954-956`). Сообщения с другим `t` пропускаются (`Telegram/plugins_sdk/python/freshgram/__init__.py:950-951`). Цикл завершается при закрытии канала (`Telegram/plugins_sdk/python/freshgram/__init__.py:944-945`) и при ошибке `ValueError` на получении сообщения, которая записывается в журнал (`Telegram/plugins_sdk/python/freshgram/__init__.py:946-948`).

> [!WARNING]
> Не подтверждено запуском: полное имя типа обычного события (OPEN-7). По коду `_handle` сопоставляет поле `type` события со всеми шаблонами декораторов (`Telegram/plugins_sdk/python/freshgram/__init__.py:930-936`; `_matches` на :905-908), а `call.result` перехватывается раньше (:931-933, :954-956). Хост присылает события с полем `type`, например `Telegram/plugins_host/src/fgpl/manager.cpp:386-389`. Конверт обычного события в raw-обработчике `run(handler)` — пара `(kind, value)`, где `value` — поле `v` сообщения (`Telegram/plugins_sdk/python/freshgram/__init__.py:952`, :957-958).

> [!NOTE]
> При обрезке в `log` остаётся конец текста: последние 4000 байт (`Telegram/plugins_sdk/python/freshgram/__init__.py:52-56`). Трейсбеки обработчиков и фоновых задач тоже обрезаются с начала (`Telegram/plugins_sdk/python/freshgram/__init__.py:63-65`, `Telegram/plugins_sdk/python/freshgram/_aio.py:109`).

## Namespace-объекты

Ниже все namespace модуля и их вызовы. Разрешения и лимиты описаны на страницах по темам: [Хранилище и файлы](#/storage-files), [Сеть и прокси](#/network-proxy), [Интерфейс клиента](#/client-ui), [Исходящие сообщения](#/outgoing-messages), [События](#/events).

### Разрешения вызовов

Каждый вызов проверяется по разрешениям, которые пользователь выдал плагину. Без нужного разрешения хост отвечает `denied` (`Telegram/plugins_host/src/fgpl/broker.cpp:1372-1374`). Сводка построена по `Telegram/plugins_sdk/README.md:36-92`; полный список разрешений и уровни опасности — на странице [Разрешения](#/permissions).

| Группа | Вызовы | Разрешение | Ограничения |
|---|---|---|---|
| Служебные | `info()`, `log()`, `unload()`, `timers.*`, `aio.sleep` | не требуются | `timers.set`: задержка от 1000 мс до 7 суток, `repeat` должен быть логическим значением (`repeat=False` принимается, см. предупреждение ниже); до 32 таймеров на плагин и аккаунт; `aio.sleep` до 60 000 мс |
| Хранилище | `storage.get`, `storage.set`, `storage.delete`, `storage.keys`, `storage.usage` | `storage.private` | ключ до 128 байт, значение до 1 MiB, до 4096 ключей, квота плагина |
| HTTP | `net.fetch`, `net.get`, `net.post` | `net.https` | только https; публичные имена и IP; тело запроса и ответа до 100 MiB; `timeout` до 300000 мс |
| Сокеты | `net.tcp`, `net.udp`; `send`, `recv`, `close` у сокета | `net.tcp` или `net.udp` по типу сокета | TCP: до 16 открытых сокетов, отправка до 1 MiB; UDP: до 16 открытых, 200 датаграмм в секунду (по README, `Telegram/plugins_sdk/README.md:43`; в `Telegram/plugins_host/src` такого лимита не найдено, общий бюджет вызовов `callsPerSecond` = 200 в `Telegram/plugins_host/src/fgpl/broker.h:51` — не лимит датаграмм), отправка до 65507 байт |
| Отправка | `messages.send`, `messages.send_media`, `stickers.send`, `stickers.search`, `stickers.recent`, `chats.mark_read`, `chats.action` | `messages.send` | `messages.send`: 5 подряд, затем по одному в секунду; `chats.action` не чаще раза в 3 с на чат; `send_media` — файл до 100 MiB |
| Пересылка | `messages.forward` | `messages.send` и `messages.read` | до 100 сообщений; оба чата в области доступа |
| Правка | `messages.edit`, `messages.edit_media` | `messages.edit` | только свои сообщения, которые ещё можно править; `edit_media` — файл до 100 MiB |
| Удаление | `messages.delete` | `messages.delete` | до 100 своих сообщений; `everyone` по умолчанию включён |
| Реакции | `messages.react` | `messages.react` | без эмодзи и `custom_emoji` снимает свою реакцию |
| История и поиск | `messages.history`, `messages.search` | `messages.history` | `messages.history`: `limit` до 100 |
| Чтение реакций | `messages.reactions` | `messages.read` | до 100 записей |
| Медиа | `media.get`, `media.list` | `media.read` | `media.get`: файл до 100 MiB |
| Чаты | `chats.list`, `chats.info` | `chats.list` и `chat.info` соответственно | — |
| Пользователи и каналы | `users.info`, `users.resolve`, `users.photo`; `channels.info`, `channels.resolve`, `channels.photo` | `users.info` для пользователей, `chat.info` для каналов | `users.resolve` и `channels.resolve` — одна проверка в секунду |
| Контакты и папки | `contacts.list`, `folders.list` | `contacts.list`, `folders.list` | — |
| Аккаунт и звёзды | `account.info`, `stars.balance` | `account.info`, `stars.balance` | — |
| Черновики | `composer.draft`, `composer.set_draft` | `composer.draft` | установка черновика не переключает чат |
| Настройки | `settings.read` | `settings.read` | поля `language`, `theme`, `streamerMode` |
| Диалоги и окна | `ui.dialog`, `ui.close_dialog`, `ui.window`, `ui.update_window`, `ui.close_window` | `ui.dialog` | `ui.dialog`: см. предупреждение о правиле открытия выше; окон одновременно до 3 |
| Страница настроек | `ui.settings_page` | `ui.settings_page` | требует `contributes.settingsPage` в манифесте |
| Тосты | `ui.toast` | `ui.toast` | один тост в 2 с |
| Значки | `badges.set`, `badges.clear` | `ui.badges` | до 4 значков на пользователя |
| Уведомления | `notify.show` | `notifications` | не чаще раза в 5 с |
| Буфер обмена | `clipboard.write`, `clipboard.read` | `clipboard` | только в течение 10 с после действия пользователя; до 64 KiB |
| Файлы | `aio.files.pick`, `aio.files.save` | `fs.user_selected` | только через `await` и только после действия пользователя; файл до 100 MiB; имя файла до 128 байт |
| Плагины | `plugins.send`, `plugins.peers` | `plugins.message` | данные до 64 KiB; только плагины того же аккаунта |
| Исходящие сообщения | `messages.set_outgoing`, `messages.drop_outgoing` | `messages.transform_outgoing` | только при событии `message.outgoing` |
| Перевод | ответ на `translate.request` (`on_translate`) | `translate.provide` | ответ до 32 KiB на текст, 96 KiB всего |

### Хранилище и файлы

| Вызов | Что делает |
|---|---|
| `storage.get(key, default=None)` | Значение по ключу или `default`, если значения нет |
| `storage.set(key, value)` | Записывает значение |
| `storage.delete(key)` | Удаляет ключ |
| `storage.keys(prefix="", limit=100)` | Ключи с префиксом (вызов протокола `storage.list`) |
| `storage.usage()` | Использование хранилища |
| `aio.files.pick(title="", filter="")` | Выбор файла пользователем: `{"name", "data"}` или `None`, если выбор отменён. Нужно разрешение `fs.user_selected`; вызов только через `await` и только после действия пользователя; файл до 100 MiB (`Telegram/plugins_sdk/README.md:83`; `Telegram/plugins_host/src/fgpl/broker.cpp:2171`, `:2176-2177`) |
| `aio.files.save(name, data)` | Сохранение через системный диалог: `True`, или `False`, если отменено. Нужно разрешение `fs.user_selected`; вызов только через `await` и только после действия пользователя; имя файла до 128 байт (`Telegram/plugins_sdk/README.md:84`; `Telegram/plugins_host/src/fgpl/broker.cpp:105`, `:2187`; `kMaxFileName` = 128 в `Telegram/plugins_host/src/fgpl/broker.cpp:77`) |

Фрагмент:

```python
data = await aio.files.pick(title="Выберите файл", filter="Images (*.png *.jpg)")
```

> [!NOTE]
> Имя для `aio.files.save` не может содержать `/` и `\`. Такой вызов завершится ошибкой `invalid` (`Telegram/plugins_host/src/fgpl/broker.cpp:2191-2196`).

### Сеть

Таймауты указаны в миллисекундах (`Telegram/plugins_sdk/python/freshgram/__init__.py:117-118`).

| Вызов | Что делает |
|---|---|
| `net.fetch(url, method="GET", headers=None, body=None, timeout=10000)` | HTTP-запрос; возвращает `Response` |
| `net.get(url, **options)` | То же с методом GET |
| `net.post(url, body=None, **options)` | То же с методом POST |
| `net.tcp(host, port, tls=False, timeout=10000)` | TCP-соединение, при `tls=True` поверх TLS; возвращает `Socket` |
| `net.udp(host, port, timeout=10000)` | UDP-сокет на одного адресата; возвращает `Socket` |

### Интерфейс

| Вызов | Что делает |
|---|---|
| `ui.toast(text, action=None, label=None, undo=False, duration=None)` | Показывает тост. С `action` у тоста появляется кнопка; её подпись — `label`. Пустой `label` допустим только при `undo=True` (то есть `style: "undo"`): клиент тогда подставляет локализованную строку «Undo» (см. предупреждение ниже); для обычного тоста с `action` пустой `label` хост отвергает (`Telegram/plugins_host/src/fgpl/broker.cpp:1708-1713`). Нажатие приходит в `on_toast`. `undo=True` SDK отправляет на хост как `style: "undo"` (`Telegram/plugins_sdk/python/freshgram/__init__.py:199-200`); хост разбирает `style` (`Telegram/plugins_host/src/fgpl/broker.cpp:1690-1693`) и передаёт в приложение флаг `undo` (`ToastAction.undo`, `Telegram/plugins_host/src/fgpl/broker.cpp:1703`; `Telegram/plugins_host/src/fgpl/broker.h:213-220`). `style: "undo"` без `action` отвергается (`Telegram/plugins_host/src/fgpl/broker.cpp:1720-1721`). Идентификатор действия — до 32 байт, подпись — до 40 байт. `duration` — от 1 до 8 секунд, для тоста с кнопкой README указывает 5 (`Telegram/plugins_sdk/README.md:91`) |
| `ui.settings_page(title, items, buttons=None)` | Описывает страницу настроек плагина; рисует её приложение. Поля элементов — в [Интерфейсе клиента](#/client-ui) |
| `ui.dialog(title, items, buttons=None)` | Показывает диалог; клики приходят как события `dialog.*`. `buttons` — список `{"id", "label", "style"}` |
| `ui.close_dialog()` | Закрывает диалог |
| `ui.window(window_id, title, items, buttons=None, mode="layer")` | Показывает окно или обновляет его. `mode`: `layer` (поверх чата) или `window` (отдельное окно). Открытое окно сохраняет свой режим |
| `ui.update_window(window_id, title, items, buttons=None)` | Обновляет окно |
| `ui.close_window(window_id)` | Закрывает окно |

> [!WARNING]
> Не подтверждено запуском: вид подписи пустой кнопки (OPEN-6). По коду пустой `label` хост пропускает только при `style: "undo"` (`Telegram/plugins_host/src/fgpl/broker.cpp:1712-1713`). Клиент подставляет для пустого `label` локализованную строку `lng_translate_undo` (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2049-2051`; `Telegram/Resources/langs/lang.strings:5648`), а флаг `undo` клиент не читает. Пустой `label` без `style: "undo"` до клиента не доходит, а README (`Telegram/plugins_sdk/README.md:91`) описывает то же поведение, поэтому расхождения README и кода здесь по коду не видно.

### Значки, уведомления и буфер обмена

| Вызов | Что делает |
|---|---|
| `badges.set(user, items)` | Значки рядом с именем пользователя, до 4 штук: `{"id", "icon"}` или `{"id", "image"}` и `"tooltip"`. `icon` — встроенный значок или значок плагина, `image` — PNG до 128x128 и 64 KiB, либо JPEG до 64 KiB (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:240`, `:243-247`). Пустой список убирает значки. Нажатие приходит как `on_badge_click` |
| `badges.clear()` | Убирает все значки плагина |
| `notify.show(text, title="")` | Системное уведомление |
| `clipboard.write(text)` | Пишет текст в буфер обмена |
| `clipboard.read()` | Читает буфер обмена |

> [!WARNING]
> Расхождение с описанием: габариты JPEG-значка не проверяются. `ImageSize` возвращает `(0, 0)` для любого JPEG с сигнатурой `FF D8 FF` (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:106-113`), поэтому проверка `128x128` (`ui_tree.cpp:243-247`) пропускает JPEG любых габаритов. Ограничение 64 KiB для JPEG действует (`ui_tree.cpp:240`). Не подтверждено запуском.

### Чаты и сообщения

| Вызов | Что делает |
|---|---|
| `chats.list(limit=100)` | Список чатов: `id`, `title`, `type`, `unread`, `pinned`, `archived` (`Telegram/plugins_sdk/README.md:60`). `limit` по умолчанию 100, значение ограничивается диапазоном 1–500 (`Telegram/plugins_host/src/fgpl/broker.cpp:38`, `:1384-1387`) |
| `chats.info(chat)` | Сведения о чате |
| `chats.mark_read(chat)` | Отмечает чат прочитанным |
| `chats.action(chat, kind="typing", topic=0)` | Показывает действие в чате. Значения `kind`: `typing` (по умолчанию), `upload_photo`, `upload_video`, `upload_file`, `record_voice`, `upload_voice`, `record_video`, `record_round`, `choose_sticker`, `cancel` (`Telegram/plugins_sdk/README.md:74`). Для всех значений, кроме `cancel`, не чаще раза в 3 с на чат |
| `messages.history(chat, limit=20, before=0, topic=0)` | История чата; `limit` до 100 (`Telegram/plugins_sdk/README.md:61`). Нужно разрешение `messages.history`. Сообщение содержит `id`, `chat`, `from`, `date`, `text`, `out` и другие поля по README (`Telegram/plugins_sdk/README.md:61`); поля, которых README не перечисляет, описаны в предупреждении ниже |
| `messages.send(chat, text, reply_to=0, topic=0, silent=False, schedule=0, markdown=False, custom_emoji=None) -> Sent` | Отправляет сообщение. `schedule` — unix-время, `0` — сразу. `custom_emoji` — список `{"offset", "length", "id"}` (смещения в единицах UTF-16); требует Premium (`Telegram/plugins_sdk/python/freshgram/__init__.py:309-312`) |
| `messages.send_media(chat, data, name, caption="", kind="auto", markdown=False, reply_to=0, topic=0, silent=False, schedule=0, spoiler=False, duration=0) -> Sent` | Отправляет файл. `kind`: `auto` (фото и видео как медиа), `file` (документ), `voice` (OGG/Opus, нужен `duration` в секундах) |
| `messages.edit(chat, message, text, markdown=False)` | Редактирует своё сообщение |
| `messages.edit_media(chat, message, data, name, caption="", kind="auto", markdown=False, spoiler=False)` | Заменяет медиа своего сообщения; вызов нужно ждать (`await`): он завершается, когда Telegram принял файл |
| `messages.delete(chat, messages, everyone=True)` | Удаляет свои сообщения из списка `messages` (до 100). `everyone=True` по умолчанию: удалить у всех, когда Telegram это позволяет (`Telegram/plugins_sdk/python/freshgram/__init__.py:380`; `Telegram/plugins_sdk/README.md:66`) |
| `messages.react(chat, message, emoji="", custom_emoji=0)` | Ставит реакцию; без `emoji` и `custom_emoji` снимает свою |
| `messages.reactions(chat, message, emoji=None, custom_emoji=0, limit=50)` | Кто поставил реакции: список `{user, name, date}` с видом реакции |
| `messages.forward(from_chat, messages, to_chat, silent=False)` | Пересылает сообщения по списку id |
| `messages.search(chat, query, limit=20)` | Поиск по чату на стороне сервера |
| `messages.set_outgoing(text=None, markdown=False, silent=None, schedule=None, reply_to=None, topic=None)` | Меняет отправляемое сообщение; только в `freshgram`, не в `aio` (см. [Исходящие сообщения](#/outgoing-messages)) |
| `messages.drop_outgoing(reason="")` | Не отправляет сообщение; непустой `reason` показывается тостом. Только в `freshgram` |

Значение `kind` проверяет приложение: список задан в `Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:601-611`, неизвестное значение отклоняется ответом `invalid` (`plugins_data.cpp:1344-1345`). Значение по умолчанию `typing` задано в `Telegram/plugins_host/src/fgpl/broker.cpp:1968`. Лимит 3 с на чат (`broker.cpp:74`, `:1977-1978`) проверяется до передачи `kind` в приложение, поэтому отклонённый `kind` тоже занимает это окно (`broker.cpp:1976-1982`).

> [!WARNING]
> Не подтверждено запуском: значения `kind`, лимиты и поведение `cancel` проверены только чтением исходников. Отдельное расхождение: `kind="cancel"` снимает только запрос с видом `Typing` (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:1357-1358`; `Telegram/SourceFiles/api/api_send_progress.cpp:44-53`), поэтому, судя по коду, индикаторы `upload_*`, `record_*` и `choose_sticker` этим вызовом не снимаются.

> [!WARNING]
> Не подтверждено запуском: поля ответа проверены по исходникам. `MessageValue` (`Telegram/plugins_host/src/fgpl/broker.cpp:343-351`) добавляет поля `from_kind`, `sticker`, `emoji_only`, `entities` и `reactions` (`Telegram/plugins_host/src/fgpl/broker.cpp:352-383`). README (`Telegram/plugins_sdk/README.md:61`) для `messages.history` этих полей не перечисляет; для событий `message.*` README описывает их отдельно (`Telegram/plugins_sdk/README.md:135-144`).

### Медиа и стикеры

| Вызов | Что делает |
|---|---|
| `media.get(chat, message, thumbnail=False, download=False)` | Файл сообщения: `kind`, `mime`, `name`, `data`. Без `download=True` — только файл, уже загруженный на устройство; с `download=True` приложение сначала скачивает его; ожидание ограничено (`Telegram/plugins_sdk/python/freshgram/__init__.py:584-588`). Для загрузки лучше использовать `aio` |
| `media.list(chat, kind="any", limit=20, before=0)` | Сообщения с медиа, новые первыми. `kind`: `photo`, `video`, `photo_video`, `file`, `voice`, `round`, `audio`, `gif` или `any` |
| `stickers.send(chat, sticker, reply_to=0, topic=0, silent=False) -> Sent` | Отправляет стикер по id |
| `stickers.search(emoji, limit=20)` | Установленные стикеры для эмодзи: `[{id, emoji, set, animated, video}]` |
| `stickers.recent(limit=20)` | Недавние стикеры, поля как у `search` |

### Пользователи, каналы и папки

| Вызов | Что делает |
|---|---|
| `users.info(user)` | Имя, username, бот, premium, контакт и онлайн-статус пользователя |
| `users.resolve(username)` | Поиск пользователя по `@username`; одна проверка в секунду |
| `users.photo(user)` | Фото профиля `{"mime", "data"}` в полном размере: MP4, если есть видеоаватар, иначе JPEG |
| `channels.info(channel)` | Название, username, тип, описание, участники и флаги канала или супергруппы |
| `channels.resolve(username)` | Поиск канала или супергруппы по `@username`; одна проверка в секунду |
| `channels.photo(channel)` | Фото канала `{"mime", "data"}` |
| `contacts.list(limit=200)` | Контакты: `id`, `name`, `username` (`Telegram/plugins_sdk/README.md:47`). `limit` по умолчанию 200, значение ограничивается диапазоном 1–1000 (`Telegram/plugins_host/src/fgpl/broker.cpp:61`, `:1558-1561`) |
| `folders.list()` | Список папок |

### Аккаунт, плагины и таймеры

| Вызов | Что делает |
|---|---|
| `account.info()` | Сведения об аккаунте: `id`, `name`, `username`, `premium` (`Telegram/plugins_host/src/fgpl/broker.cpp:1435-1439`). Телефона в ответе нет (`Telegram/plugins_sdk/README.md:86`) |
| `stars.balance()` | Баланс звёзд (поле `balance`) |
| `composer.draft(chat)` | Черновик чата |
| `composer.set_draft(chat, text)` | Записывает черновик чата |
| `settings.read()` | Читает настройки приложения: поля `language`, `theme` и `streamerMode`. Нужно разрешение `settings.read` (`Telegram/plugins_sdk/README.md:49`; `Telegram/plugins_host/src/fgpl/broker.cpp:1598-1599`) |
| `plugins.send(to, data=None)` | Отправляет данные другому плагину. Получатель должен перечислить этот плагин (или `"*"`) в `contributes.messages.from`; сообщение приходит как `plugin.message` (см. [Пакет и манифест](#/package-manifest)) |
| `plugins.peers()` | Плагины, которым можно отправить сообщение |
| `timers.set(timer_id, seconds, repeat=False)` | Таймер; `seconds` переводятся в миллисекунды (`int(seconds * 1000)`). Одноразовый таймер (`repeat=False`, значение по умолчанию) принимается (проверка `Telegram/plugins_host/src/fgpl/broker.cpp:2229-2234`): он создаётся с периодом 0 (`Telegram/plugins_host/src/fgpl/manager.cpp:338`) и удаляется после срабатывания (`Telegram/plugins_host/src/fgpl/manager.cpp:365-370`), см. предупреждение ниже |
| `timers.clear(timer_id)` | Снимает таймер |
| `timers.list()` | Список таймеров |

> [!WARNING]
> Не подтверждено запуском: по коду `timers.set` с `repeat=False` (значение по умолчанию) принимается. Проверка на `Telegram/plugins_host/src/fgpl/broker.cpp:2231` отвергает `repeat` только тогда, когда он не является логическим значением: `BoolArg` при отсутствии ключа возвращает `false` (`Telegram/plugins_host/src/fgpl/broker.cpp:118-127`), а `asBool` возвращает значение и для `false` (`Telegram/plugins_host/src/fgpl/cbor.cpp:367-372`). Одноразовый таймер создаётся с периодом 0 (`Telegram/plugins_host/src/fgpl/manager.cpp:338`) и удаляется после срабатывания (`Telegram/plugins_host/src/fgpl/manager.cpp:365-370`). README (`Telegram/plugins_sdk/README.md:85`) не требует `repeat=True`, а `Telegram/plugins_sdk/README.md:488` перечисляет вызов с `repeat=False`. Тест `Telegram/plugins_host/tests/test_broker.cpp:1890-1894` покрывает `repeat=true` и отказы по `delay` и при отсутствии `id`, одноразовый таймер он не проверяет. По коду расхождения README и кода не видно (OPEN-1).

## Классы

### Response

Возвращается из `net.fetch`, `net.get` и `net.post`.

- `status`, `headers`, `header_list` (список пар) и `body` (байты).
- `text(encoding="utf-8")` — `body`, декодированный с заменой некорректных байтов (`Telegram/plugins_sdk/python/freshgram/__init__.py:103-104`).
- `json()` — разбор `text()` как JSON.
- `ok` — истина для статусов от 200 до 299 (`Telegram/plugins_sdk/python/freshgram/__init__.py:109-111`).

### Socket

Возвращается из `net.tcp` и `net.udp`.

- `id` — идентификатор сокета у приложения.
- `send(data, timeout=10000)` — возвращает значение поля `sent` из ответа.
- `recv(max_bytes=65507, timeout=1000)` — возвращает `(data, closed)`; `data` пуст, если за время ничего не пришло (`Telegram/plugins_sdk/python/freshgram/__init__.py:129-136`).
- `close()` — закрывает сокет.
- Адрес — имя или публичный IP; локальные и приватные адреса отклоняются (`Telegram/plugins_sdk/python/freshgram/__init__.py:117-118`).
- Поддерживаются `with` и `async with`. В `aio` используйте `async with`: `close()` там возвращает awaitable, и `with` его не ожидает (`Telegram/plugins_sdk/python/freshgram/__init__.py:141-151`).

### Sent

Возвращается из `messages.send`, `messages.send_media`, `stickers.send`.

- `id` — серверный id. Нужно разрешение `messages.ids`; без него или если сервер не ответил вовремя, значение `None`.
- `local_id` — известен сразу; действителен до перезапуска приложения.
- Сам объект `Sent` (или его `id`, или `local_id`) принимается как `message` в `edit`, `edit_media` и `react`, а в `delete` — в списке. Если `id` пуст, берётся `local_id` (`Telegram/plugins_sdk/python/freshgram/__init__.py:292-295`).

## Декораторы регистрации

Прямые декораторы ставятся без скобок, фабрики — со скобками. Все декораторы возвращают исходную функцию (`Telegram/plugins_sdk/python/freshgram/__init__.py:659-902`). Ошибка одного обработчика не мешает остальным (`Telegram/plugins_sdk/python/freshgram/__init__.py:916-936`). Типы событий — см. [События](#/events).

| Декоратор | Тип | Событие | Обработчик получает |
|---|---|---|---|
| `on_init(function)` | прямой | запуск плагина | значение `init`: поля `account`, `plugin`, `version`, `api` (`Telegram/plugins_host/src/fgpl/manager.cpp:1640-1645`) |
| `on(pattern)` | фабрика | имя, совпадающее с `pattern`: точное или префикс с `*` | словарь события |
| `on_menu(menu_id, surface=None)` | фабрика | `menu.click` | словарь события, отфильтрованный по `id` и `surface` |
| `on_badge_click(badge_id=None)` | фабрика | `badge.click` | словарь события |
| `on_command(name)` | фабрика | `command` | словарь события, отфильтрованный по `name` |
| `on_plugin_message(sender=None)` | фабрика | `plugin.message` | два аргумента: `from` и `data` |
| `on_setting(item_id=None)` | фабрика | `settings.*`, кроме `settings.open` | словарь события |
| `on_settings_open(function)` | прямой | `settings.open` | словарь события |
| `on_dialog(item_id=None)` | фабрика | `dialog.*` | словарь события |
| `on_window(window_id, item_id=None)` | фабрика | `window.*` | словарь события |
| `on_timer(timer_id=None)` | фабрика | `timer` | словарь события |
| `on_chat_opened(function)` | прямой | `chat.opened` | словарь события |
| `on_translate(function=None, markdown=False)` | оба варианта | `translate.request` | два аргумента: `items` и `to`; возвращает список строк или корутину |
| `on_toast(action_id=None)` | фабрика | `toast.click` | словарь события с `id` |
| `on_toast_close(action_id=None)` | фабрика | `toast.close` | словарь события с `id` и `reason` |
| `on_typing(function)` | прямой | `chat.typing` | словарь события |
| `on_read(function)` | прямой | `chat.read` | словарь события |
| `on_member(function)` | прямой | `chat.member` | словарь события |
| `on_user_status(function)` | прямой | `user.status` | словарь события |
| `on_app_focus(function)` | прямой | `app.focus` | словарь события |
| `on_app_blur(function)` | прямой | `app.blur` | словарь события |

Фрагмент из `Telegram/plugins_sdk/README.md:425-427`:

```python
@freshgram.on_badge_click("vip")
def vip(event):
    freshgram.ui.toast("VIP user " + str(event["user"]))
```

- `on_translate` работает и как `@on_translate`, и как `@on_translate(markdown=True)` (`Telegram/plugins_sdk/python/freshgram/__init__.py:824`). Функция получает до 20 текстов и код языка, возвращает список переводов по одному на каждый текст или корутину с ним. Исключение отвечает приложению ошибкой (`Telegram/plugins_sdk/python/freshgram/__init__.py:780-824`).
- Обработчик-корутина ставится в очередь при событии (`Telegram/plugins_sdk/python/freshgram/__init__.py:911-924`; `Task.__init__` в `Telegram/plugins_sdk/python/freshgram/_aio.py:74`). Её первый шаг выполняется не внутри обработчика, а после того, как обработчики сообщения вернули управление: `_aio.run_ready()` вызывается в `Telegram/plugins_sdk/python/freshgram/__init__.py:964` до отправки `done` (`_aio.py:147-152`). Дальше шаги идут после ответов приложения (`call.result`). Докстринг `on` (`Telegram/plugins_sdk/python/freshgram/__init__.py:666-670`) говорит, что асинхронный обработчик выполняется до первого `await` во время обработки события; по коду это не так (см. выше).
- Ответ на асинхронный вызов обрабатывается раньше обычных обработчиков (`Telegram/plugins_sdk/python/freshgram/__init__.py:954-956`).

## Исключения

Все исключения экспортируются из `freshgram`, не из `freshgram.aio` (`Telegram/plugins_sdk/python/freshgram/__init__.py:22-31`). У каждого есть атрибуты `code` и `message` (`Telegram/plugins_sdk/python/freshgram/_errors.py:1-5`). Базовый класс — `FreshgramError`, остальные — его наследники (`Telegram/plugins_sdk/python/freshgram/_errors.py:8-33`).

| Код `e` в ответе хоста | Исключение |
|---|---|
| `denied` | `Denied` |
| `invalid` | `Invalid` |
| `not_found` | `NotFound` |
| `quota` | `QuotaExceeded` |
| `limit` | `LimitExceeded` |
| `unavailable` | `Unavailable` |
| `failed` и любой неизвестный код | `Failed` |

> [!NOTE]
> Ответ, который не является словарём, превращается в `Failed` с кодом `failed` (`Telegram/plugins_sdk/python/freshgram/_errors.py:46-49`).

> [!NOTE]
> Код `cancelled` упомянут в README (`Telegram/plugins_sdk/README.md:30-32`), но в таблице соответствия кодов его нет: ошибка с таким кодом станет `Failed`.

> [!NOTE]
> Для `files.pick` и `files.save` отмена не считается ошибкой: `pick` возвращает `None`, `save` — `False` (`Telegram/plugins_host/src/fgpl/broker.cpp:2172-2175`, `:2201-2203`).

## freshgram.aio

Вызовы `aio` сразу уходят приложению, и плагин продолжает обрабатывать события, пока ждёт ответ. Одновременно можно ждать не больше 32 вызовов (`Telegram/plugins_sdk/python/freshgram/aio.py:10-12`).

Фрагмент из докстринга `Telegram/plugins_sdk/python/freshgram/aio.py:3-8`:

```python
from freshgram import aio

@freshgram.on("command")
async def weather(event):
    response = await aio.net.get("https://example.org/weather")
    await aio.ui.toast(response.text()[:100])
```

Все namespace из `freshgram` есть в `aio` с тем же набором вызовов, кроме `messages.set_outgoing` и `messages.drop_outgoing` (`Telegram/plugins_sdk/python/freshgram/aio.py:50`).

Вызов `aio` возвращает `Future` (`Telegram/plugins_sdk/python/freshgram/_aio.py:123-132`). Хост сразу отвечает на него значением `{ticket: N}`, а результат приходит отдельным событием `call.result`; такой ответ обрабатывается раньше обычных обработчиков (`Telegram/plugins_sdk/README.md:216-220`; `Telegram/plugins_sdk/python/freshgram/__init__.py:954-956`). Для обычной работы достаточно `await`.

| Имя | Что делает |
|---|---|
| `aio.sleep(seconds)` | Ждёт, не блокируя плагин. README ограничивает паузу 60 000 мс (`Telegram/plugins_sdk/README.md:92`); сама функция этот предел не проверяет (`Telegram/plugins_sdk/python/freshgram/aio.py:69-71`) |
| `aio.gather(*awaitables)` | Ждёт все вызовы и возвращает список результатов. При первой ошибке она поднимается, остальные вызовы продолжают работать (`Telegram/plugins_sdk/python/freshgram/aio.py:74-98`) |
| `aio.wait_for(awaitable, timeout)` | Ждёт не дольше `timeout` секунд, но не дольше 60. По истечении поднимает `TimeoutError("the call did not finish in time")`; сам вызов не отменяется, его результат отбрасывается (`Telegram/plugins_sdk/python/freshgram/aio.py:101-124`) |
| `aio.spawn(coroutine)` | То же, что `freshgram.spawn` (`Telegram/plugins_sdk/python/freshgram/aio.py:44`) |
| `aio.Future`, `aio.Task` | Публичные имена модуля (`Telegram/plugins_sdk/python/freshgram/aio.py:42-43`) |

> [!WARNING]
> Не подтверждено запуском: публичного описания `aio.Task` и `aio.Future` в документации SDK нет (README их не упоминает). Во внутреннем модуле `_aio.py` есть краткие докстринги: `Future` — «A value that arrives later; await it inside an async function.» (`Telegram/plugins_sdk/python/freshgram/_aio.py:18-19`), `Task` — «A coroutine running on the plugin's loop.» (`Telegram/plugins_sdk/python/freshgram/_aio.py:68-69`). Контракт сверх этих строк (например, методы `done`, `result`, `exception`) докстрингами не описан (OPEN-29). Пока описания нет, опирайтесь на вызовы из таблицы выше.

## Протокол и типы данных

Плагин обменивается сообщениями с приложением через stdin и stdout. Кадр — это 4 байта длины (big-endian) и тело в CBOR. Максимальный размер кадра — 128 MiB (`Telegram/plugins_sdk/python/freshgram/_channel.py:10`, `:23-35`). Вызов отправляется как `{"t": "call", "v": {"op": ..., "a": {...}}}`, а `raw_call` ждёт ответ `reply` (`Telegram/plugins_sdk/python/freshgram/_channel.py:38-43`).

- Целые кодируются в 64 бита; большее значение вызывает `OverflowError`.
- Поддерживаются `None`, `bool`, `int`, `float`, `bytes`, `bytearray`, `str`, `list` и `tuple` (как массив), а также `dict` только со строковыми ключами. Другие типы, например `set`, вызывают `TypeError`.
- Глубина вложенности — не больше 24.
- При разборе ответов тег (мажор 6) не обрабатывается и даёт `ValueError` (`Telegram/plugins_sdk/python/freshgram/_cbor.py:149`). Значение неопределённой длины тоже не поддерживается и даёт `ValueError` (`Telegram/plugins_sdk/python/freshgram/_cbor.py:108-109`).

## Стандартная библиотека Python

В рантайме плагина есть стандартная библиотека CPython: пакет рантайма содержит `python/python.wasm` и `python/lib/...`, то есть CPython для WASI вместе со стандартной библиотекой (`Telegram/plugins_host/RUNTIME.md:37`).

Пакеты примеров (пути ниже — от корня репозитория примеров) используют из неё модули:

- `json` и `random` — пример `pictures`, `pictures/main.py:1-2`;
- `json` и `time` — пример `freshgram-badges`, `freshgram-badges/main.py:19-20`;
- `base64` — пример `freshgram-badges`, `freshgram-badges/icons.py:3`, `:20`.

> [!WARNING]
> Не подтверждено запуском. Полный список модулей, доступных плагину, по `RUNTIME.md` и проверенным страницам не определяется: `RUNTIME.md` описывает только состав пакета (`RUNTIME.md:36-38`). Часовой пояс рантайма WASI не описан ни в одной из проверенных страниц и в коде. `time.localtime` в примере `freshgram-badges` (`freshgram-badges/main.py:710`) зависит от него, но какой пояс получает рантайм, по коду не видно.

## Лимиты, которые важны в коде

| Что | Ограничение | Источник |
|---|---|---|
| Бюджет вызовов | 200 вызовов в секунду; не больше 256 вызовов при обработке одного события | `Telegram/plugins_sdk/README.md:94-95` |
| `messages.send` | 5 сообщений подряд, затем по одному в секунду | `Telegram/plugins_sdk/README.md:96` |
| `ui.toast` | один тост в 2 секунды | `Telegram/plugins_sdk/README.md:96-97` |
| `notify.show` | одно уведомление в 5 секунд | `Telegram/plugins_sdk/README.md:81` |
| `chats.action` | не чаще раза в 3 секунды на чат | `Telegram/plugins_sdk/README.md:74` |
| `users.resolve`, `channels.resolve` | одна проверка в секунду | `Telegram/plugins_sdk/README.md:76`, `:79` |
| `clipboard` | только в течение 10 секунд после действия пользователя; до 64 KiB | `Telegram/plugins_sdk/README.md:82` |
| `storage` | ключ до 128 байт, значение до 1 MiB, до 4096 ключей | `Telegram/plugins_sdk/README.md:40` |
| Файлы и медиа | до 100 MiB | `Telegram/plugins_sdk/python/freshgram/__init__.py:328`, `:363`, `:584`; `Telegram/plugins_sdk/README.md:50`, `:83-84` |
| Отправка в сокет | до 1 MiB (TCP) или 65507 байт (UDP) | `Telegram/plugins_sdk/README.md:44` |
| Таймеры | до 32 на плагин и аккаунт; задержка от 1 секунды до 7 дней | `Telegram/plugins_sdk/README.md:85` |
| Пауза | до 60 000 мс для `aio.sleep` (операция `time.sleep`) | `Telegram/plugins_sdk/README.md:92` |
| Ожидающие вызовы `aio` | не больше 32 одновременно | `Telegram/plugins_sdk/python/freshgram/aio.py:10-12` |
| Кадр протокола | 128 MiB | `Telegram/plugins_sdk/python/freshgram/_channel.py:10` |

> [!WARNING]
> Не подтверждено запуском: открытие диалога через `ui.dialog`. README требует действия пользователя в пределах 10 секунд или уже открытый диалог плагина (`Telegram/plugins_sdk/README.md:97-100`). По коду (`Telegram/plugins_host/src/fgpl/broker.cpp:755-765`; `kUserActionWindowMs` = 10000 и `kDialogEachMs` = 60000 в `Telegram/plugins_host/src/fgpl/broker.cpp:50-51`) первый диалог открывается без действия пользователя, а повторный без действия — не чаще раза в 60 с. Это расхождение README и кода (OPEN-2).

> [!WARNING]
> Не подтверждено запуском: соответствие лимиту кадра 128 MiB. По коду Python-SDK ограничивает кадр 128 MiB (`MAX_FRAME`, `Telegram/plugins_sdk/python/freshgram/_channel.py:10`). Хост по умолчанию принимает входящие кадры плагина до `maxMessageBytes` = 128 MiB (`Telegram/plugins_host/src/fgpl/runtime.h:22`; проверка размера в `Telegram/plugins_host/src/fgpl/runtime.cpp:413-416`); значение передаётся в запуске как `limits.message` (`Telegram/plugins_host/src/fgpl/host_client.cpp:429-433`) и читается в `Telegram/plugins_host/src/fgpl/host_main.cpp:98-100`. Лимит 256 MiB (`Telegram/plugins_host/src/fgpl/ipc.h:19`) относится к IPC между хостом и клиентом (`Telegram/plugins_host/src/fgpl/host_client.cpp`), а не к каналу плагина (OPEN-23).

Подробнее о лимитах и расхождениях README с кодом — в [Ограничениях и WIP](#/limits-wip).

## Частые ловушки

- Прямые декораторы ставятся без скобок (`@freshgram.on_init`), фабрики — со скобками (`@freshgram.on("chat.*")`, `@freshgram.on_command("name")`).
- `freshgram.files` не существует. `files` есть только в `aio`.
- `set_outgoing` и `drop_outgoing` есть только у синхронного `messages`. Подробности — в [Исходящих сообщениях](#/outgoing-messages).
- Без разрешения `messages.ids` поле `Sent.id` равно `None`. Для дальнейших действий используйте сам объект `Sent` или `local_id`.
- В `aio` для сокетов используйте `async with`, а не `with`.
- `print` попадает в журнал плагина через stderr: `_channel.py` подменяет `sys.stdout` на `sys.stderr` (`Telegram/plugins_sdk/python/freshgram/_channel.py:6-8`), а строки вывода пишутся в журнал (`Telegram/plugins_host/src/fgpl/runtime.cpp:187-204`; `Telegram/plugins_sdk/README.md:492-493`). Явный способ записи в журнал — `freshgram.log`.

Смотрите также: [Примеры](#/examples), [Ограничения и WIP](#/limits-wip), [FAQ](#/faq).
