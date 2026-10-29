---
title: "Исходящие сообщения"
description: "Как плагин перехватывает отправляемое текстовое сообщение, меняет или отменяет его, а также отправляет и правит сообщения сам."
section: "Возможности"
order: 14
slug: "outgoing-messages"
status: "экспериментально"
---

## Что это и зачем

Плагин может вмешаться в текстовое сообщение до того, как оно уйдёт в чат: заменить текст или параметры отправки либо отменить отправку. Это событие `message.outgoing`. Кроме того, плагин может сам отправить сообщение или файл, а также отредактировать или удалить сообщение, которое отправил сам.

Сообщения с файлами пока не перехватываются (`Telegram/plugins_sdk/README.md:179-181`).

Страница идёт по порядку работы: подписка, событие, вызовы внутри события, поведение при задержке, отправка и правка, вызовы из C, ограничения.

> [!NOTE]
> Раздел экспериментальный. Описание опирается на исходный код и README SDK, поведение может измениться.

## Подписка

Чтобы получать событие, нужны право `messages.transform_outgoing` и блок `contributes.outgoing` в `manifest.json`:

```json
{
  "permissions": {
    "required": [
      { "id": "messages.transform_outgoing", "reason": "Менять исходящие сообщения" }
    ]
  },
  "contributes": {
    "outgoing": {
      "onFailure": "block",
      "filter": { "chat_types": ["user", "group"] }
    }
  }
}
```

Без права `messages.transform_outgoing` блок `contributes.outgoing` не проходит проверку манифеста (`Telegram/plugins_host/src/fgpl/manifest.cpp:982-984`). У каждого права в `permissions` обязательны `id` и `reason` (`Telegram/plugins_host/src/fgpl/manifest.cpp:684`, `Telegram/plugins_host/src/fgpl/manifest.cpp:692`).

Поля `filter` ограничивают событие:

- `chats` — список id чатов: до 256 ненулевых целых чисел (`Telegram/plugins_host/src/fgpl/manifest.cpp:854-862`);
- `chat_types` — типы чатов: `user`, `bot`, `self`, `group`, `supergroup`, `forum`, `channel` (`Telegram/plugins_host/src/fgpl/manifest.cpp:456-461`, `Telegram/plugins_host/src/fgpl/manifest.cpp:863-874`).

Сообщение, которое не проходит фильтр, плагин не задерживает совсем (`Telegram/plugins_sdk/README.md:183-185`).

Поле `onFailure` задаёт поведение при сбое или задержке плагина (см. раздел «Что происходит, если плагин не ответил»). Допустимы значения `pass` и `block` (`Telegram/plugins_host/src/fgpl/manifest.cpp:846-849`). Если поле не указано, действует `pass` (`Telegram/plugins_host/src/fgpl/manifest.cpp:846`).

> [!NOTE]
> README не называет значение по умолчанию (OPEN-19). Если поведение важно, указывайте `onFailure` явно.

Событие не приходит для:

- секретных чатов (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:743`);
- «Сохранённых сообщений» (тип чата `self`) и служебного чата Telegram с id 777000 (`Telegram/plugins_host/src/fgpl/manager.cpp:2370-2372`; `Telegram/plugins_host/src/fgpl/broker.h:23`);
- сообщений без текста;
- бизнес-быстрых ответов, приветственных шаблонов и предложенных постов (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:758-763`);
- сообщений с файлами (`Telegram/plugins_sdk/README.md:179-181`).

Сообщения, которые отправляет сам плагин через `messages.send`, тоже проходят цепочку `message.outgoing` (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2301-2305`, `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:986-991`). Если цепочка останавливает такое сообщение, текст не возвращается в поле ввода (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:861-863`).

## Событие message.outgoing

Обработчик регистрируется обычным декоратором:

```python
import freshgram


@freshgram.on("message.outgoing")
def outgoing(event):
    if "spam" in event["text"]:
        freshgram.messages.drop_outgoing(reason="Сообщение заблокировано")
```

Учебный пример, не из SDK и не из README: тело обработчика придумано для иллюстрации. Декоратор `freshgram.on` (`Telegram/plugins_sdk/python/freshgram/__init__.py:665`) и сигнатура `drop_outgoing` (`Telegram/plugins_sdk/python/freshgram/__init__.py:434-439`) взяты из Python SDK.

Поля `event` (`Telegram/plugins_host/src/fgpl/manager.cpp:2476-2490`):

| Поле | Значение |
|---|---|
| `chat` | id чата |
| `text` | текст с правками предыдущих плагинов цепочки |
| `chat_type` | тип чата, значения те же, что в `chat_types` |
| `silent` | `true`, если сообщение отправляется без звука |
| `topic` | id темы форума; есть, только если тема задана |
| `reply_to` | id сообщения, на которое ответ; есть, только если ответ задан, ответ на корень темы поля не даёт |
| `scheduled` | unix time отложенной отправки; есть, только если отправка отложена |

Обработчик может быть `async def`. В этом случае `set_outgoing` или `drop_outgoing` нужно вызвать до первого `await` (`Telegram/plugins_sdk/README.md:250-251`). В асинхронном модуле `freshgram.aio.messages` этих методов нет (`Telegram/plugins_sdk/python/freshgram/aio.py:50`).

## Вызовы внутри события

### messages.set_outgoing

Фрагмент сигнатуры Python (`Telegram/plugins_sdk/python/freshgram/__init__.py:416-432`):

```python
freshgram.messages.set_outgoing(text=None, markdown=False, silent=None, schedule=None, reply_to=None, topic=None)
```

| Поле | Значение |
|---|---|
| `text` | новый текст, не больше 4096 байт; пустой текст даёт ошибку `invalid` |
| `format` | `"plain"` или `"markdown"`; в Python это параметр `markdown=True` |
| `silent` | отправить без звука |
| `schedule` | unix time; `0` — отправить сейчас; время, которое клиент не может применить, игнорируется |
| `reply_to` | id сообщения в этом чате; `0` — без ответа; несуществующий id игнорируется |
| `topic` | id темы форума |

В разметке `format: "markdown"` работают `**жирный**`, `__курсив__`, `` `код` ``, `~~зачёркнутый~~` и спойлер `||текст||` (`Telegram/plugins_sdk/README.md:52`).

- Передайте хотя бы одно поле, иначе вызов вернёт `invalid` (`Telegram/plugins_host/src/fgpl/broker.cpp:802-804`).
- Формат относится к тексту этого вызова. Если текст не передан, прежний формат сохраняется (`Telegram/plugins_host/src/fgpl/broker.cpp:806-809`; `Telegram/plugins_host/src/fgpl/manager.cpp:2417-2419`).
- Вызов работает только внутри `message.outgoing`, иначе он вернёт `invalid` (`Telegram/plugins_host/src/fgpl/broker.cpp:776-781`). Без права `messages.transform_outgoing` вернётся `denied` (`Telegram/plugins_host/src/fgpl/broker.cpp:777-778`).
- Вызов нельзя запустить через `await` (`Telegram/plugins_host/src/fgpl/broker.cpp:662-665`).

### messages.drop_outgoing

Фрагмент сигнатуры Python: `freshgram.messages.drop_outgoing(reason="")` (`Telegram/plugins_sdk/python/freshgram/__init__.py:434-439`).

- Сообщение не отправляется, поле ввода остаётся пустым, черновик не восстанавливается (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:872-887`).
- `reason` — до 200 байт (`Telegram/plugins_host/src/fgpl/broker.cpp:829-830`). Непустая причина показывается тостом. Текст тоста берётся из строки `fresh_PluginOutgoingBlocked`, в исходном английском виде это (`Telegram/Resources/langs/lang.strings:8902`):

```text
{plugin} stopped the message: {reason}
```

Здесь `{plugin}` — имя плагина, `{reason}` — причина.

- Следующие плагины цепочки сообщение уже не видят (`Telegram/plugins_host/src/fgpl/manager.cpp:2411-2416`).

### Что происходит, если плагин не ответил

Плагины, которые проходят фильтр, вызываются по очереди. Каждому отводится 1000 мс (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:64`; `Telegram/plugins_host/src/fgpl/manager.cpp:2499`).

- Каждый следующий плагин видит текст и параметры с учётом правок предыдущих (`Telegram/plugins_host/src/fgpl/manager.cpp:2417-2433`).
- Правки плагина, который не ответил вовремя или завершился с ошибкой, не применяются (`Telegram/plugins_host/src/fgpl/manager.cpp:2408`).
- Плагин, который ещё не запущен, при `pass` пропускается, при `block` останавливает сообщение с причиной `the plugin is not ready yet` (`Telegram/plugins_host/src/fgpl/manager.cpp:2463-2471`).

Что клиент делает с результатом:

- `pass` — сообщение уходит с текстом и параметрами, которые были до этого плагина. Тост не показывается.
- `block` — сообщение не отправляется, текст возвращается в поле ввода (если сообщение отправлял не сам плагин, `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:861-863`). Показывается тост с причиной: `the plugin did not answer in time` (не ответил вовремя), `the plugin failed` (сбой), `the plugin is not ready yet` (не готов) (`Telegram/plugins_host/src/fgpl/manager.cpp:2434-2437`, `Telegram/plugins_host/src/fgpl/manager.cpp:2470`; `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:855-870`).

### Ограничения во время события

Пока обрабатывается `message.outgoing`, любой вызов, кроме `meta.info`, `log`, `messages.set_outgoing` и `messages.drop_outgoing`, возвращает `unavailable` (`Telegram/plugins_host/src/fgpl/broker.cpp:632-637`). Асинхронные вызовы в это время тоже не запускаются (`Telegram/plugins_host/src/fgpl/broker.cpp:659-661`).

## Отправка и правка из плагина

Вызовы отправки и правки работают вне события `message.outgoing` и требуют прав (подробнее — [Разрешения](#/permissions)). В Python они есть в `freshgram.messages` (синхронно) и в `freshgram.aio.messages` (с `await`).

| Метод | Право | Что важно |
|---|---|---|
| `messages.send` | `messages.send` | текст непустой, до 4096 байт; есть `reply_to`, `topic`, `silent`, `schedule`, `format`, `custom_emoji` (`Telegram/plugins_host/src/fgpl/broker.cpp:1472-1489`) |
| `messages.send_media` | `messages.send` | файл до 100 МиБ, имя файла до 128 байт, подпись до 4096 байт; `kind`: `auto`, `file`, `voice`; для `voice` нужен `duration` в секундах (`Telegram/plugins_sdk/python/freshgram/__init__.py:330-331`) |
| `messages.edit` | `messages.edit` | только своё сообщение, пока Telegram разрешает его правку |
| `messages.edit_media` | `messages.edit` | только своё сообщение, файл до 100 МиБ, таймаут 270 с; `MESSAGE_NOT_MODIFIED` считается успехом (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2472`) |
| `messages.delete` | `messages.delete` | только свои сообщения; удаление для всех — если Telegram разрешает |

Фрагмент сигнатур Python (`Telegram/plugins_sdk/python/freshgram/__init__.py:307-308`, `:326-327`, `:351`, `:361-362`, `:379`):

```python
freshgram.messages.send(chat, text, reply_to=0, topic=0, silent=False, schedule=0, markdown=False, custom_emoji=None)
freshgram.messages.send_media(chat, data, name, caption="", kind="auto", markdown=False, reply_to=0, topic=0, silent=False, schedule=0, spoiler=False, duration=0)
freshgram.messages.edit(chat, message, text, markdown=False)
freshgram.messages.edit_media(chat, message, data, name, caption="", kind="auto", markdown=False, spoiler=False)
freshgram.messages.delete(chat, messages, everyone=True)
```

Вызовы возвращают коды ошибок:

- `not_found` — нет чата или сообщения, на которое ответ (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2253`, `Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2261`);
- `denied` — писать в эту тему или чат нельзя (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2263`); если право выдано только для выбранных вами чатов, вызов в другом чате тоже даёт `denied` (`Telegram/plugins_host/src/fgpl/broker.cpp:590-591`, `Telegram/plugins_host/src/fgpl/broker.cpp:1490-1491`);
- `limit` — в чате включён slowmode (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2265`);
- `invalid` — время отложенной отправки вне диапазона (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2268`);
- `failed` — правка не удалась (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:1055`).

Дополнительно:

- Время отложенной отправки должно быть больше чем через 10 секунд и не дальше чем через 365 дней (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2693-2696`).
- С правом `messages.ids` вызов `messages.send` ждёт, пока сообщение получит серверный id (`Telegram/plugins_host/src/fgpl/broker.cpp:1505-1507`). В Python такой вызов нужно `await`-ить в `freshgram.aio` (`Telegram/plugins_sdk/python/freshgram/__init__.py:314-315`).
- Отправка от имени канала возможна только тем отправителем, который пользователь выбрал для чата (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:457-463`).
- В платном чате, где за сообщения платят звёздами, `send_media` отвечает `denied` (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2323-2325`).
- Файл для `send_media` сохраняется в `tdata/plugins/outbox` и хранится 1 час (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:105`, `Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:617`).

## Вызовы из C

Из C доступны функции из `Telegram/plugins_sdk/c/freshgram.h`, подробнее — [C-ABI: справочник](#/c-abi-reference).

Сигнатуры (тела опущены) из `Telegram/plugins_sdk/c/freshgram.h:448-486`:

```c
static int fg_set_outgoing(const char *text);
static int fg_set_outgoing_markdown(const char *text);
static int fg_set_outgoing_silent(int silent);
static int fg_drop_outgoing(const char *reason);
```

- `fg_set_outgoing` меняет текст, `fg_set_outgoing_markdown` меняет текст с разметкой, `fg_set_outgoing_silent` задаёт отправку без звука, `fg_drop_outgoing` отменяет отправку. Пустой `reason` не даёт тоста.
- Для отправки есть `fg_send_text(chat, text)` (`Telegram/plugins_sdk/c/freshgram.h:515-523`), `fg_send_text_ids(chat, text, &id, &local_id)` (`Telegram/plugins_sdk/c/freshgram.h:539-552`) и `fg_send_media(chat, data, length, name, caption, kind, &id, &local_id)` (`Telegram/plugins_sdk/c/freshgram.h:555-566`). В `kind` передаются `"auto"`, `"file"` или `"voice"`, `NULL` означает `"auto"`.

> [!WARNING]
> Смысл значения, которое возвращает `fg_plugin_event` для `message.outgoing`, не подтверждено кодом (OPEN-14).

## Ограничения

- Текст сообщения и `set_outgoing` — до 4096 байт, подпись — до 4096 байт, `reason` — до 200 байт, файл — до 100 МиБ, имя файла — до 128 байт (`Telegram/plugins_host/src/fgpl/broker.cpp:55`, `Telegram/plugins_host/src/fgpl/broker.cpp:77-79`, `Telegram/plugins_host/src/fgpl/broker.cpp:830`).
- На каждый плагин цепочки `message.outgoing` отводится 1000 мс.
- Сообщения с файлами не перехватываются.
- Значение `onFailure` по умолчанию — `pass` (`Telegram/plugins_host/src/fgpl/manifest.cpp:846`).

Подробнее о лимитах и незавершённых частях — [Ограничения и WIP](#/limits-wip). Связанные разделы: [События](#/events), [Разрешения](#/permissions), [Python SDK: справочник](#/python-sdk-reference), [C-ABI: справочник](#/c-abi-reference).
