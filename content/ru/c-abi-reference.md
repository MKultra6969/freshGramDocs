---
title: "C-ABI: справочник (`freshgram.h`)"
description: "Справочник заголовка freshgram.h для плагинов на C: экспорты и импорт Wasm-модуля, типы, коды результата, helper-функции и правила памяти."
section: "Справочник"
order: 9
slug: "c-abi-reference"
status: "экспериментально"
---

Заголовок `freshgram.h` реализует протокол freshGram на C для плагинов, которые собираются в Wasm-модуль. Он отправляет запросы в приложение, разбирает ответы, строит CBOR-значения и содержит готовые обёртки над частыми вызовами: сообщения, таймеры, сокеты, хранилище. Страница нужна тем, кто пишет плагин на C или собирает Wasm-реактор на другом языке без Python. Здесь перечислено, что модуль должен экспортировать, что получает от хоста и как не выйти за пределы своей памяти.

Для Python см. [Python SDK: справочник](#/python-sdk-reference). Заголовок лежит в `Telegram/plugins_sdk/c/freshgram.h` и не включает других файлов.

## Как устроен обмен

Модуль экспортирует функции, которые вызывает хост, и импортирует одну функцию, `freshgram.call`, через которую обращается к приложению. Все данные передаются в CBOR: целые, байтовые и текстовые строки, массивы, карты с текстовыми ключами, bool, null и числа с плавающей точкой (floats). Теги и строки неопределённой длины не используются (`Telegram/plugins_sdk/README.md:22-23`). Заголовок `freshgram.h` floats не записывает, а `fg_as_*` их не читают: разбираются только целые, bool и текст (`Telegram/plugins_sdk/c/freshgram.h:175-213`).

- Хост вызывает `fg_init` с картой `info`, а затем `fg_on_event` с каждым событием.
- Плагин обращается к приложению через `fg_host_call`. Запрос имеет вид `{"op": "<имя>", "a": {...}}`, ответ: `{"ok": true, "v": ...}` или `{"ok": false, "e": "<код>", "m": "<текст>"}` (`Telegram/plugins_sdk/README.md:25-26`).
- Обычный вызов блокирует плагин до ответа. Асинхронный вызов (`"async": true`) сразу возвращает `{"ticket": N}`, а результат приходит в `fg_plugin_event` (`Telegram/plugins_sdk/README.md:216-220`). Асинхронно можно вызвать всё, кроме `messages.set_outgoing`, `messages.drop_outgoing` и `plugin.unload`. Одновременно ждут не больше 32 вызовов, а во время обработки `message.outgoing` новые асинхронные вызовы не начинаются (`Telegram/plugins_sdk/README.md:219-222`; в коде: `Telegram/plugins_host/src/fgpl/broker.cpp:630-631`, `:659-661`, лимит 32 ожидающих вызовов: `Telegram/plugins_host/src/fgpl/broker.h:52`, `Telegram/plugins_host/src/fgpl/broker.cpp:672-673`).

## Минимальный плагин

Пример из `Telegram/plugins_sdk/README.md:497-508`:

```c
#include "freshgram.h"

int fg_plugin_init(fg_value info) { fg_log("ready"); return 0; }

int fg_plugin_event(fg_value event) {
	fg_i64 count = 0;
	fg_storage_get_int("count", &count);
	fg_storage_set_int("count", count + 1);
	return 0;
}
```

Счётчик начинается с нуля. Если ключа `count` ещё нет, хост отвечает `ok` без поля `v`, и `fg_storage_get_int` возвращает `FG_OK`, не меняя `*out` (`Telegram/plugins_host/src/fgpl/broker.cpp:1041-1042`).

> [!WARNING]
> Не подтверждено кодом (OPEN-14): смысл возвращаемого `int` у `fg_plugin_init` и `fg_plugin_event`. Пример возвращает 0, а другие значения не описаны.

## Сборка

Команда из `Telegram/plugins_sdk/README.md:510`:

```bash
clang --target=wasm32 -O2 -nostdlib -fno-builtin -Wl,--no-entry -o plugin.wasm plugin.c
```

Заголовок использует расширения GCC и Clang: `__attribute__` и `#pragma GCC` (`Telegram/plugins_sdk/c/freshgram.h:4`, `:11`). MSVC не поддерживается, так как он не понимает эти расширения. Сборка другими компиляторами не описана.

Заголовок сам определяет `memcpy` и `memset` как weak-функции (`Telegram/plugins_sdk/c/freshgram.h:40-55`). При сборке с `-nostdlib`, как в команде выше, эти символы поставляет сам заголовок.

> [!WARNING]
> Не подтверждено кодом (OPEN-12): путь к заголовку. README использует `#include "freshgram.h"`, а команда сборки не содержит флага `-I`.

> [!WARNING]
> Не подтверждено кодом (OPEN-13): размер арены для больших файлов. По умолчанию `FG_HEAP_BYTES` равен 1 MiB (`Telegram/plugins_sdk/c/freshgram.h:33-35`). README требует достаточный размер для файлов до 100 MiB (`Telegram/plugins_sdk/README.md:109-114`), но цифры не называет, а команда сборки её не задаёт.

## Экспорты и импорт

### Импорт `fg_host_call`

Макросы и объявление импорта (фрагмент из `Telegram/plugins_sdk/c/freshgram.h:11-19`):

```c
#define FG_EXPORT(name) __attribute__((export_name(name)))
#define FG_HOST_CALL \
	__attribute__((import_module("freshgram"), import_name("call")))

FG_HOST_CALL int fg_host_call(
	const void *request,
	fg_u32 length,
	void **response,
	fg_u32 *response_length);
```

Правила вызова:

- Запрос принадлежит плагину. Хост читает его во время вызова (`Telegram/plugins_host/src/fgpl/runtime.cpp:284-296`).
- Ответ выделяет хост через экспорт `fg_alloc` плагина и записывает указатель и длину в `response` и `response_length` (`Telegram/plugins_host/src/fgpl/runtime.cpp:233-258`, `:305-315`). Плагин ответ не освобождает: буфер живёт до сброса арены после события (см. раздел «Память» ниже).
- Запрос с отрицательной или слишком большой длиной отклоняется статусом `-1`. Ответ больше `maxMessageBytes` заменяется служебным ответом. Значение по умолчанию составляет 128 MiB (`Telegram/plugins_host/src/fgpl/runtime.h:22`, `Telegram/plugins_host/src/fgpl/runtime.cpp:284-289`, `:301-304`).

Статусы, которые возвращает `fg_host_call` (`Telegram/plugins_host/src/fgpl/runtime.h:60-65`):

| Статус | Имя в хосте | Когда возвращается |
|---|---|---|
| `0` | `kOk` | вызов обработан |
| `-1` | `kBadArguments` | у модуля нет экспорта `memory` или `fg_alloc`; длина запроса отрицательна или больше `maxMessageBytes`; указатели запроса или слота ответа вне памяти модуля |
| `-2` | `kBadRequest` | запрос не разбирается как CBOR |
| `-3` | `kBadResponse` | ответ не кодируется как CBOR |
| `-4` | `kNoMemory` | `fg_alloc` вернул 0 при выделении буфера ответа |
| `-5` | `kTooManyCalls` | исчерпан лимит вызовов на одно событие (по умолчанию 256, `Telegram/plugins_host/src/fgpl/runtime.h:23`) или лимит времени вызовов хоста (`Telegram/plugins_host/src/fgpl/runtime.cpp:271-277`) |

Любой ненулевой статус, пустой указатель ответа или переполнение буфера запроса `fg_send` переводит в `FG_TRANSPORT` (см. таблицу кодов ниже).

### Экспорты, которые пишет плагин

```c
int fg_plugin_init(fg_value info);
int fg_plugin_event(fg_value event);
```

Объявлены в `Telegram/plugins_sdk/c/freshgram.h:804-805`. Плагин их реализует.

- `fg_plugin_init` получает карту `info` с полями `account`, `plugin`, `version` и `api`. Поле `api` содержит версию API хоста (`Telegram/plugins_host/src/fgpl/manager.cpp:1640-1645`).
- `fg_plugin_event` получает событие. Результаты асинхронных вызовов приходят сюда же как событие `call.result`: README описывает их как `{ticket, ok, v}` или `{ticket, ok: false, e, m}` (`Telegram/plugins_sdk/README.md:218-220`). Заголовок не разбирает результат, поэтому плагин читает поля сам: `ticket` через `fg_find` и `fg_as_int`, `ok` через `fg_find` и `fg_as_bool`, а `v` — произвольное CBOR-значение.

> [!WARNING]
> Не подтверждено кодом (OPEN-7): ключи конверта события и имя типа для обычных событий, таких как `message.new`, при разборе из C. Заголовок этот конверт не описывает.

### Экспорты, которые даёт заголовок

Файл: `Telegram/plugins_sdk/c/freshgram.h`.

| Экспорт | Сигнатура | Поведение | Строки |
|---|---|---|---|
| `fg_alloc` | `fg_u32 fg_alloc(fg_u32 size)` | выделяет `size` байт из арены; при нехватке возвращает 0 | 807-809 |
| `fg_free` | `void fg_free(fg_u32 pointer, fg_u32 size)` | аргументы не используются; сбрасывает всю арену | 811-815 |
| `fg_init` | `int fg_init(fg_u32 pointer, fg_u32 size)` | строит `fg_value` из памяти и вызывает `fg_plugin_init` | 817-820 |
| `fg_on_event` | `int fg_on_event(fg_u32 pointer, fg_u32 size)` | то же для `fg_plugin_event` | 822-825 |

Загрузчик хоста требует от модуля линейную память под именем `memory` и экспорты `fg_alloc`, `fg_init` и `fg_on_event` (`Telegram/plugins_host/src/fgpl/runtime.cpp:725-751`). Если `fg_on_event` не экспортирован, а есть `_start`, модуль загружается в режиме `_start` (`Telegram/plugins_host/src/fgpl/runtime.cpp:736-744`).

> [!WARNING]
> Не подтверждено кодом (OPEN-27): протокол режима `_start`, в котором модуль загружается без `fg_on_event`. Протокол для модулей не на Python не описан.

Заголовок экспортирует `fg_free`, если его включить. README перечисляет `fg_free` среди экспортов, которые плагин должен предоставить, однако загрузчик его не требует. Если экспорта нет, сброс арены между событиями не выполняется (`Telegram/plugins_host/src/fgpl/runtime.cpp:766-773`).

> [!WARNING]
> Не подтверждено кодом (OPEN-15): обязательность `fg_free`. README называет его обязательным, а загрузчик допускает модуль без него.

## Типы и константы

### Базовые типы

```c
typedef unsigned char fg_u8;
typedef unsigned int fg_u32;
typedef long long fg_i64;
typedef unsigned long long fg_u64;
```

Фрагмент из `Telegram/plugins_sdk/c/freshgram.h:6-9`. Защита от повторного включения: макрос `FRESHGRAM_H` (строки 1-2).

`FG_HEAP_BYTES` задаётся через `#ifndef`: по умолчанию `(1u << 20)`, то есть 1 MiB. Чтобы изменить размер арены, определите макрос до `#include "freshgram.h"` (`Telegram/plugins_sdk/c/freshgram.h:33-35`).

### Коды результата

Константы объявлены в `Telegram/plugins_sdk/c/freshgram.h:21-31`.

| Код | Константа | Строка `e` от хоста |
|---|---|---|
| 0 | `FG_OK` | ответ с `"ok": true` |
| 1 | `FG_DENIED` | `denied` |
| 2 | `FG_INVALID` | `invalid` |
| 3 | `FG_NOT_FOUND` | `not_found` |
| 4 | `FG_QUOTA` | `quota` |
| 5 | `FG_LIMIT` | `limit` |
| 6 | `FG_UNAVAILABLE` | `unavailable` |
| 7 | `FG_FAILED` | `failed`, `cancelled`, любая другая строка или отсутствие `e` |
| 8 | `FG_TRANSPORT` | с хоста не приходит |

`FG_FAILED` возвращается также, если поля `ok` нет или оно не bool (`Telegram/plugins_sdk/c/freshgram.h:383-384`). Разбор поля `e` для остальных кодов выполняет `fg_error_code` (`Telegram/plugins_sdk/c/freshgram.h:350-370`). Отдельной константы для `failed` и `cancelled` в enum нет. `cancelled` означает, что пользователь закрыл диалог выбора файла (`Telegram/plugins_sdk/README.md:31-32`).

`FG_TRANSPORT` плагин возвращает сам: при ненулевом статусе `fg_host_call`, пустом указателе ответа или переполнении буфера запроса (`Telegram/plugins_sdk/c/freshgram.h:373-379`).

### Структуры

`fg_value` задаёт вид на CBOR-значение без владения (`Telegram/plugins_sdk/c/freshgram.h:74-77`):

```c
typedef struct {
	const fg_u8 *p;
	const fg_u8 *end;
} fg_value;
```

`fg_writer` описывает буфер запроса (`Telegram/plugins_sdk/c/freshgram.h:215-220`):

```c
typedef struct {
	fg_u8 *data;
	fg_u32 size;
	fg_u32 capacity;
	int failed;
} fg_writer;
```

Обе структуры живут внутри плагина. Хост с ними не работает: обмен идёт через CBOR-буферы.

## Память

- Все выделения идут из арены `fg_heap_` размером `FG_HEAP_BYTES` с выравниванием 16 байт (`Telegram/plugins_sdk/c/freshgram.h:37`). Выделения выравниваются по 8 байт (`Telegram/plugins_sdk/c/freshgram.h:57-64`). Освободить отдельный блок нельзя. Единственный сброс — `fg_free`, который сбрасывает всю арену (`Telegram/plugins_sdk/c/freshgram.h:811-815`).
- Хост после каждого `fg_init` и `fg_on_event` вызывает `fg_free` с теми же аргументами (`Telegram/plugins_host/src/fgpl/runtime.cpp:369-376`). Входные буферы и буферы ответов живут до конца этого вызова. `fg_value` нельзя сохранять между событиями.
- Каждый `fg_begin` и `fg_begin_async` резервирует 4096 байт (`Telegram/plugins_sdk/c/freshgram.h:326-327`, `:337-338`). Без других выделений арена по умолчанию (1 MiB) вмещает 256 таких вызовов. Хост допускает столько же вызовов на одно событие (`maxCallsPerDispatch`, `Telegram/plugins_host/src/fgpl/runtime.h:23`). Но в ту же арену `fg_heap_` попадают входной буфер события (`Telegram/plugins_host/src/fgpl/runtime.cpp:350`) и буферы ответов хоста, которые выделяются через `fg_alloc` (`Telegram/plugins_host/src/fgpl/runtime.cpp:246`, `:305`), поэтому 256 вызовов по 4096 байт на практике не набираются.
- Буфер записи растёт удвоением. Если буфер уже больше `FG_HEAP_BYTES / 2`, а нужно ещё больше, рост отказывает, и `fg_send` возвращает `FG_TRANSPORT` (`Telegram/plugins_sdk/c/freshgram.h:229-247`, `:373`).
- Если `fg_alloc` вернул 0, хост при выделении буфера ответа возвращает `-4` (`kNoMemory`). При выделении входного события вызов завершается ошибкой (`Telegram/plugins_host/src/fgpl/runtime.cpp:305-309`, `:357-358`).
- Строки, которые передаёт плагин, копируются в буфер запроса (`Telegram/plugins_sdk/c/freshgram.h:291-308`). Строка, которую возвращает `fg_as_text`, является указателем внутрь буфера ответа и не завершается NUL (`Telegram/plugins_sdk/c/freshgram.h:200-213`).

> [!WARNING]
> Не подтверждено кодом (OPEN-28): модуль из нескольких единиц трансляции. `fg_heap_` и `fg_heap_used_` объявлены `static`, поэтому каждая единица трансляции получает свою копию арены. Поведение такого модуля не проверено.

## Helper-функции

Helper-функции объявлены `static` и доступны после `#include "freshgram.h"`. Обёртки возвращают `int`: код результата из таблицы выше. Источник — `Telegram/plugins_sdk/c/freshgram.h`.

| Функция | Сигнатура | Op | Строки |
|---|---|---|---|
| `fg_log` | `int fg_log(const char *text)` | `log` | 411-417 |
| `fg_storage_get_int` | `int fg_storage_get_int(const char *key, fg_i64 *out)` | `storage.get` | 419-430 |
| `fg_storage_set_int` | `int fg_storage_set_int(const char *key, fg_i64 value)` | `storage.set` | 432-440 |
| `fg_unload` | `int fg_unload(void)` | `plugin.unload` | 442-446 |
| `fg_set_outgoing` | `int fg_set_outgoing(const char *text)` | `messages.set_outgoing` | 448-454 |
| `fg_set_outgoing_markdown` | `int fg_set_outgoing_markdown(const char *text)` | `messages.set_outgoing`, `format: "markdown"` | 456-465 |
| `fg_set_outgoing_silent` | `int fg_set_outgoing_silent(int silent)` | `messages.set_outgoing`, `silent` | 467-474 |
| `fg_drop_outgoing` | `int fg_drop_outgoing(const char *reason)` | `messages.drop_outgoing` | 476-486 |
| `fg_socket_connect` | `int fg_socket_connect(const char *op, const char *host, fg_i64 port, int tls, fg_i64 *id)` | значение `op` | 488-505 |
| `fg_tcp_connect` | `int fg_tcp_connect(const char *host, fg_i64 port, int tls, fg_i64 *id)` | `net.tcp.connect` | 507-509 |
| `fg_udp_connect` | `int fg_udp_connect(const char *host, fg_i64 port, fg_i64 *id)` | `net.udp.connect` | 511-513 |
| `fg_send_text` | `int fg_send_text(fg_i64 chat, const char *text)` | `messages.send` | 515-523 |
| `fg_send_text_ids` | `int fg_send_text_ids(fg_i64 chat, const char *text, fg_i64 *id, fg_i64 *local_id)` | `messages.send` | 539-552 |
| `fg_send_media` | `int fg_send_media(fg_i64 chat, const void *data, fg_u32 length, const char *name, const char *caption, const char *kind, fg_i64 *id, fg_i64 *local_id)` | `messages.send_media` | 554-582 |
| `fg_edit_media` | `int fg_edit_media(fg_i64 chat, fg_i64 message, const void *data, fg_u32 length, const char *name, const char *caption, const char *kind)` | `messages.edit_media` | 584-608 |
| `fg_toast_action` | `int fg_toast_action(const char *text, const char *id, const char *label, int undo, fg_i64 seconds)` | `ui.toast` | 610-637 |
| `fg_translate_reply` | `int fg_translate_reply(fg_i64 ticket, const char *const *items, fg_u32 count, int markdown)` | `translate.reply` | 639-659 |
| `fg_translate_error` | `int fg_translate_error(fg_i64 ticket, const char *error)` | `translate.reply` с полем `error` | 661-670 |
| `fg_toast` | `int fg_toast(const char *text)` | `ui.toast` | 672-678 |
| `fg_chat_info` | `int fg_chat_info(fg_i64 chat, fg_value *result)` | `chat.info` | 680-686 |
| `fg_history` | `int fg_history(fg_i64 chat, fg_i64 limit, fg_i64 before, fg_value *result)` | `messages.history` | 688-698 |
| `fg_fetch` | `int fg_fetch(const char *url, fg_i64 timeout, fg_value *result)` | `net.fetch` | 700-708 |
| `fg_socket_recv` | `int fg_socket_recv(fg_i64 id, fg_i64 max, fg_i64 timeout, fg_value *result)` | `net.socket.recv` | 710-720 |
| `fg_socket_send` | `int fg_socket_send(fg_i64 id, const void *data, fg_u32 length)` | `net.socket.send` | 722-730 |
| `fg_plugin_send_text` | `int fg_plugin_send_text(const char *to, const char *text)` | `plugins.send` | 732-740 |
| `fg_socket_close` | `int fg_socket_close(fg_i64 id)` | `net.socket.close` | 742-748 |
| `fg_edit_text` | `int fg_edit_text(fg_i64 chat, fg_i64 message, const char *text)` | `messages.edit` | 750-760 |
| `fg_react` | `int fg_react(fg_i64 chat, fg_i64 message, const char *emoji)` | `messages.react` | 762-772 |
| `fg_notify` | `int fg_notify(const char *title, const char *text)` | `notify.show` | 774-782 |
| `fg_timer_set` | `int fg_timer_set(const char *id, fg_i64 delay_ms, int repeat)` | `timers.set` | 784-794 |
| `fg_timer_clear` | `int fg_timer_clear(const char *id)` | `timers.clear` | 796-802 |
| `fg_sleep_async` | `int fg_sleep_async(fg_i64 ms, fg_i64 *ticket)` | `time.sleep`, асинхронно | 403-409 |

### Особенности отдельных helper-функций

- `fg_storage_get_int` возвращает `FG_OK`, если ключ есть, но значение не целое. В этом случае `*out` не меняется, потому что результат разбора не проверяется (`Telegram/plugins_sdk/c/freshgram.h:426-428`). Строки и байты хранилища в заголовке не обёрнуты: их записывают и читают через `fg_begin` и `fg_send`. Ключ и значение добавляются через `fg_w_text` (для байтов — `fg_w_bytes`); после `fg_send` значение лежит в `result`, и строку из него разбирает `fg_as_text`. Ключи хранилища до 128 байт, значения до 1 MiB (`Telegram/plugins_sdk/README.md:40`; в коде: `Telegram/plugins_host/src/fgpl/broker.cpp:35-36`).
- `fg_send_text_ids` и `fg_send_media` возвращают `local_id` сразу. Серверный `id` приходит только при разрешении `messages.ids` (`Telegram/plugins_host/src/fgpl/broker.cpp:1505-1507`). Пока он неизвестен, в `id` записывается 0 (`Telegram/plugins_sdk/c/freshgram.h:525-526`).
- `fg_send_media` принимает `kind` со значениями `"auto"`, `"file"` или `"voice"`. `NULL` означает `"auto"` (`Telegram/plugins_sdk/c/freshgram.h:554`, `:576`). Но `"voice"` через этот хелпер не отправляется: у `fg_send_media` нет параметра `duration`, и он его не передаёт (`Telegram/plugins_sdk/c/freshgram.h:555-582`). Хост для `kind` `"voice"` без `duration` отвечает `invalid` (`Telegram/plugins_host/src/fgpl/broker.cpp:1763`, `:1791-1792`). Голосовое сообщение можно отправить вызовом `messages.send_media` через `fg_begin` и `fg_send` с полем `duration` (для `"voice"` — от 1 до 3600 секунд, та же проверка в `Telegram/plugins_host/src/fgpl/broker.cpp:1791-1792`). `fg_edit_media` принимает `"auto"` или `"file"`. Параметр `message` может быть серверным или локальным id (`Telegram/plugins_sdk/c/freshgram.h:584`).
- `fg_set_outgoing_markdown` разбирает markdown, например `**жирный**` (`Telegram/plugins_sdk/c/freshgram.h:456`). `fg_drop_outgoing` показывает непустую причину как тост (`Telegram/plugins_sdk/c/freshgram.h:476`). Подробности о перехвате исходящих сообщений описаны на странице [Исходящие сообщения](#/outgoing-messages).
- `fg_translate_error` принимает ошибку длиной до 200 байт (`Telegram/plugins_sdk/c/freshgram.h:661`).
- `fg_fetch` передаёт только `url` и `timeout`. Остальные аргументы `net.fetch`, такие как `method`, `headers` и `body`, описаны в README (`Telegram/plugins_sdk/README.md:41-46`), но helper их не передаёт. Для них используйте `fg_begin` и `fg_send`.
- `fg_socket_send` не передаёт `timeout`. `fg_socket_connect`, `fg_tcp_connect` и `fg_udp_connect` тоже не передают `timeout`, хотя для `net.tcp.connect` README предусматривает этот параметр (`Telegram/plugins_sdk/README.md:42`). `fg_plugin_send_text` передаёт только текст. `fg_history` не передаёт `topic`.
- `fg_timer_set` принимает задержку от 1000 до 604800000 мс (7 дней). Эти границы проверяет хост (`Telegram/plugins_host/src/fgpl/broker.cpp:80-81`, `:2231-2232`). Повторяющийся таймер задаётся значением `1`, потому что `fg_w_bool` превращает ненулевое значение в `true` (`Telegram/plugins_sdk/c/freshgram.h:318-320`).

> [!WARNING]
> Не подтверждено кодом (OPEN-1): поведение одноразового таймера (`repeat` не передан или равен `false`). По коду проверка в `Telegram/plugins_host/src/fgpl/broker.cpp:2231-2232` отвергает `repeat` только тогда, когда он не является bool; значение `false` проходит. Такой таймер сохраняется с периодом 0 (`Telegram/plugins_host/src/fgpl/manager.cpp:338`) и удаляется после срабатывания (`Telegram/plugins_host/src/fgpl/manager.cpp:365-370`). Вызовы без `repeat` или с `repeat: false` (`fg_timer_set(id, ms, 0)` в C и `timers.set` без `repeat` в Python) проходят эту проверку. README не говорит, что `repeat` обязателен. Запуском не проверено. Сообщение `delay must be from 1000 ms to 7 days` (`Telegram/plugins_host/src/fgpl/broker.cpp:2232`) выводится и при ошибке в `repeat`, поэтому вводит в заблуждение.

> [!WARNING]
> Не подтверждено кодом (OPEN-6): подпись кнопки тоста при пустом `label`. README связывает подпись «Undo» со `style: "undo"`, а заголовок пишет, что `label` может быть пустым при `undo`. Клиент (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2049-2051`) подставляет «Undo» при пустом `label` для любого тоста, а поле `style` в этом месте не читает. Задавайте `label` явно.

Операции, для которых в заголовке нет обёртки, вызываются через `fg_begin` и `fg_send` (`Telegram/plugins_sdk/README.md:38`). К ним относятся `meta.info`, `storage.delete`, `storage.list`, `storage.usage`, `contacts.list`, `folders.list`, `settings.read`, `media.get`, `media.list`, `chats.list`, `users.info`, `users.resolve`, `users.photo`, `channels.info`, `channels.resolve`, `channels.photo`, `clipboard.write`, `clipboard.read`, `ui.dialog.show`, `ui.dialog.close`, `ui.window.show`, `ui.window.update`, `ui.window.close`. Вызовы `files.pick` и `files.save` в Python доступны только в `freshgram.aio` (`Telegram/plugins_sdk/README.md:488-489`). Полный перечень вызовов с правами — в таблице Calls (`Telegram/plugins_sdk/README.md:36-91`).

### Низкоуровневые функции

Эти функции нужны, если в заголовке нет готовой обёртки. Все они `static`. Файл: `Telegram/plugins_sdk/c/freshgram.h`.

| Функция | Сигнатура | Назначение | Строки |
|---|---|---|---|
| `fg_begin` | `void fg_begin(fg_writer *w, const char *op, fg_u32 arguments)` | начинает запрос с `op`; `arguments` — число пар в `a`, 0 означает отсутствие `a` | 326-335 |
| `fg_begin_async` | `void fg_begin_async(fg_writer *w, const char *op, fg_u32 arguments)` | то же, с `"async": true` | 337-348 |
| `fg_send` | `int fg_send(fg_writer *w, fg_value *result)` | отправляет запрос; при успехе в `*result` попадает поле `v` (если `result` не `NULL`) | 372-392 |
| `fg_send_async` | `int fg_send_async(fg_writer *w, fg_i64 *ticket)` | отправляет асинхронный запрос и читает из ответа `ticket` | 394-401 |
| `fg_sent_ids` | `int fg_sent_ids(fg_value result, fg_i64 *id, fg_i64 *local_id)` | читает `id` и `local_id` из ответа; всегда возвращает `FG_OK` | 525-537 |
| `fg_find` | `fg_value fg_find(fg_value map, const char *key)` | возвращает значение поля карты с текстовым ключом; если поля нет, поле `p` равно 0 | 143-173 |
| `fg_as_int` | `int fg_as_int(fg_value v, fg_i64 *out)` | читает целое (major 0 или 1); иначе возвращает -1 | 175-190 |
| `fg_as_bool` | `int fg_as_bool(fg_value v, int *out)` | читает bool (0xF4 или 0xF5); иначе возвращает -1 | 192-198 |
| `fg_as_text` | `int fg_as_text(fg_value v, const char **text, fg_u32 *length)` | читает текстовую строку без копирования; иначе возвращает -1 | 200-213 |
| `fg_w_map` | `void fg_w_map(fg_writer *w, fg_u32 count)` | заголовок карты из `count` пар | 283-285 |
| `fg_w_array` | `void fg_w_array(fg_writer *w, fg_u32 count)` | заголовок массива из `count` элементов | 287-289 |
| `fg_w_text_n` | `void fg_w_text_n(fg_writer *w, const char *text, fg_u32 length)` | текстовая строка заданной длины | 291-296 |
| `fg_w_bytes` | `void fg_w_bytes(fg_writer *w, const void *data, fg_u32 length)` | байтовая строка | 298-304 |
| `fg_w_text` | `void fg_w_text(fg_writer *w, const char *text)` | текстовая строка; длина берётся через `fg_strlen`, текст должен завершаться NUL | 306-308 |
| `fg_w_int` | `void fg_w_int(fg_writer *w, fg_i64 value)` | целое; отрицательные числа кодируются как major 1 | 310-316 |
| `fg_w_bool` | `void fg_w_bool(fg_writer *w, int value)` | `true` кодируется как 0xF5, `false` как 0xF4 | 318-320 |
| `fg_w_null` | `void fg_w_null(fg_writer *w)` | `null` (0xF6) | 322-324 |

Пример запроса без обёртки (`meta.info` без аргументов):

```c
fg_writer w;
fg_value info;
fg_begin(&w, "meta.info", 0);
if (fg_send(&w, &info) == FG_OK) {
	/* info содержит поле v ответа */
}
```

Фрагмент собран по сигнатурам `fg_begin` и `fg_send` (`Telegram/plugins_sdk/c/freshgram.h:326-335`, `:372-392`). Операция `meta.info` описана в `Telegram/plugins_sdk/README.md:38`.

### Внутренние функции заголовка

Эти функции объявлены `static` и не описаны в README. Они находятся в `Telegram/plugins_sdk/c/freshgram.h` и доступны при `#include "freshgram.h"`.

| Функция | Сигнатура | Назначение | Строки |
|---|---|---|---|
| `fg_arena` | `void *fg_arena(fg_u32 size)` | выделение из `fg_heap_`, выравнивание 8 байт; при нехватке возвращает 0 | 57-64 |
| `fg_strlen` | `fg_u32 fg_strlen(const char *text)` | длина строки до NUL | 66-72 |
| `fg_head` | `int fg_head(const fg_u8 **p, const fg_u8 *end, int *major, fg_u64 *argument)` | разбирает заголовок CBOR-элемента; неопределённая длина (additional info 28–31) даёт -1 | 79-110 |
| `fg_skip` | `int fg_skip(const fg_u8 **p, const fg_u8 *end, int depth)` | пропускает CBOR-значение; при `depth > 24` возвращает -1 | 112-132 |
| `fg_none` | `fg_value fg_none(void)` | пустой `fg_value` | 134-137 |
| `fg_valid` | `int fg_valid(fg_value v)` | проверяет `p != 0 && p < end` | 139-141 |
| `fg_writer_init` | `void fg_writer_init(fg_writer *w, fg_u32 capacity)` | буфер записи из арены; при неудаче `capacity` равен 0 | 222-227 |
| `fg_grow` | `int fg_grow(fg_writer *w, fg_u32 needed)` | удваивает буфер; если ёмкость равна 0, начинает с 64 байт | 229-247 |
| `fg_put` | `void fg_put(fg_writer *w, fg_u8 byte)` | записывает байт; при неудаче ставит `failed` | 249-257 |
| `fg_put_head` | `void fg_put_head(fg_writer *w, int major, fg_u64 argument)` | заголовок CBOR минимальной длины: 0, 1, 2, 4 или 8 байт аргумента | 259-281 |
| `fg_error_code` | `int fg_error_code(fg_value response)` | код результата по полю `e` ответа | 350-370 |

Ограничения: `fg_head` не разбирает неопределённую длину, а `fg_skip` ограничен глубиной 24 (`Telegram/plugins_sdk/c/freshgram.h:90-100`, `:115`).

## См. также

- [Разрешения](#/permissions): какие вызовы требуют прав.
- [Исходящие сообщения](#/outgoing-messages): перехват `message.outgoing`.
- [Хранилище и файлы](#/storage-files): квоты и ограничения `storage.*`.
- [Ограничения и WIP](#/limits-wip): сводка лимитов и заглушек.
