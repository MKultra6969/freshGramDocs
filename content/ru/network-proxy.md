---
title: "Сеть и прокси"
description: "Как плагин работает с сетью через net.fetch, net.tcp и net.udp: ограничения адресов, заголовков и сокетов, блокировки пользователя, прокси плагинов и коды ошибок."
section: "Возможности"
order: 11
slug: "network-proxy"
status: "экспериментально"
---

## Что это и зачем

Плагин не открывает сокеты и не ходит в сеть сам. Весь сетевой доступ идёт через вызовы `net.*`, и приложение проверяет каждый из них:

- `net.fetch` — HTTPS-запрос с полным ответом, право `net.https`;
- `net.tcp.connect` — TCP-соединение, при необходимости с TLS, право `net.tcp`;
- `net.udp.connect` — UDP-сокет к одному адресу, право `net.udp`.

Право объявляется в манифесте в `permissions.required` или `permissions.optional`:

```json
{
  "permissions": {
    "required": [
      { "id": "net.https", "reason": "Загружает курсы валют." }
    ]
  }
}
```

Каждый элемент `permissions.required` и `permissions.optional` — объект с полями `id` и `reason`; поле `reason` обязательно. Строка вместо объекта, например `"net.https"`, отвергается манифестом с текстом «entries must be objects».

Без права, выданного пользователем, вызов завершается ошибкой `denied`. Подробнее — в разделе [Разрешения](#/permissions).

> [!NOTE]
> Раздел экспериментальный. Имена, лимиты и коды ошибок могут меняться между сборками.

## Быстрый пример

Запрос из обычного обработчика (фрагмент):

```python
import freshgram

response = freshgram.net.get("https://example.org/usd", timeout=5000)
if response.ok:
    freshgram.log(response.text())
```

Несколько запросов параллельно из асинхронного обработчика (фрагмент, внутри `async`-функции):

```python
from freshgram import aio

async def rates():
    usd, eur = await aio.gather(
        aio.net.get("https://example.org/usd"),
        aio.net.get("https://example.org/eur"))
    return usd.text(), eur.text()
```

Сокет как контекстный менеджер (фрагмент):

```python
import freshgram

with freshgram.net.tcp("example.org", 443, tls=True) as sock:
    sock.send(b"ping\n")
    data, closed = sock.recv(timeout=1000)
```

## Вызовы

Модуль — `freshgram`, пространство имён — `freshgram.net`; в асинхронном коде используется `aio.net`, а методы сокетов возвращают awaitable-объекты.

| Вызов | Право | Python (`net` = `freshgram.net`) | Примечание |
|---|---|---|---|
| `net.fetch` | `net.https` | `net.fetch(url, method="GET", headers=None, body=None, timeout=10000)` | Обёртки: `net.get(url, **options)`, `net.post(url, body=None, **options)` |
| `net.tcp.connect` | `net.tcp` | `net.tcp(host, port, tls=False, timeout=10000)` | Возвращает сокет с полем `id`; не больше 16 открытых |
| `net.udp.connect` | `net.udp` | `net.udp(host, port, timeout=10000)` | Сокет к одному адресу; не больше 16 открытых |
| `net.socket.send` | право вида сокета | `sock.send(data, timeout=10000)` | Возвращает количество отправленных байт |
| `net.socket.recv` | право вида сокета | `sock.recv(max_bytes=65507, timeout=1000)` | Возвращает `(data, closed)` |
| `net.socket.close` | право вида сокета | `sock.close()` | Вызывается и при выходе из `with` |

### Запрос (`net.fetch`)

Результат — объект `Response`: поля `status`, `headers` (словарь), `header_list` (список пар) и `body` (байты); методы `text(encoding="utf-8")` и `json()`; свойство `ok` — статус от 200 до 299.

- Методы: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`. Любой другой метод отклоняется с ошибкой `invalid`.
- Заголовков — не больше 32. Значение — до 4096 байт, без символов CR и LF. Имя — до 64 символов из допустимых для HTTP-заголовка символов; неверное имя даёт `invalid`.
- Запрещены заголовки `host`, `content-length`, `transfer-encoding`, `connection`, `upgrade`, `te`, `trailer`, `expect`, `cookie`, `cookie2`, `proxy-authorization`, `proxy-connection`, `keep-alive`, `via`, `forwarded`, `x-forwarded-for`, `x-forwarded-host`, `x-forwarded-proto`, `x-real-ip`, а также любые `proxy-*` и `sec-*`. Попытка передать такой заголовок даёт `invalid` (`Telegram/plugins_host/src/fgpl/net_policy.cpp:395-406`, `Telegram/plugins_host/src/fgpl/broker.cpp:1097-1110`).
- Транспорт сам ставит `Host`, `Content-Length` (по размеру тела), а также всегда `Connection: close` и `Accept-Encoding: identity`. Заголовок `User-Agent: freshGram-plugin` добавляется, только если плагин не передал свой (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:1345-1353`).
- Тело запроса и тело ответа — до 100 МиБ каждое (`Telegram/plugins_host/src/fgpl/broker.cpp:40-41`):
  - тело запроса больше лимита даёт `limit` с текстом «the body is too large» (`Telegram/plugins_host/src/fgpl/broker.cpp:1122-1123`);
  - ответ больше лимита без `chunked`-кодировки, то есть с `Content-Length` или без длины, даёт `limit` с текстом «the response is too large» (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:1407-1409`, `:1415-1417`; `Telegram/plugins_host/src/fgpl/broker.cpp:1132-1133`);
  - ответ с `Transfer-Encoding: chunked`, в котором тело некорректно или больше лимита, даёт `response` с текстом «a malformed or too large body» (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:311-313`, `:1400-1404`).
- `timeout` — в миллисекундах, по умолчанию 10000. Значения вне диапазона 100–300000 приводятся к границам, а не отклоняются. Таймаут один на всю цепочку редиректов (`Telegram/plugins_host/src/fgpl/broker.cpp:1093-1094`; `Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:994`).
- Имена заголовков в ответе приводятся к нижнему регистру. Повторяющиеся заголовки в `headers` склеены через `, `, а `header_list` содержит все пары. Заголовки `Set-Cookie` и `Set-Cookie2` не возвращаются (`Telegram/plugins_host/src/fgpl/broker.cpp:1135-1154`).

### Адреса

URL в `net.fetch`:

- не длиннее 2048 символов; только печатные ASCII-символы, без пробелов;
- схема строго `https://`; символ `@` в адресе запрещён; IPv6-адрес указывается только в квадратных скобках;
- порт — от 1 до 65535; фрагмент (`#...`) отбрасывается.

Имя хоста:

- не длиннее 253 символов; каждая метка — до 63 символов из букв, цифр, `-` и `_`, метка не начинается и не заканчивается дефисом; последняя метка не начинается с цифры;
- запрещены `localhost`, `*.localhost`, `*.local`, `*.internal` и `*.home.arpa`.

Проверки выполняются в `Telegram/plugins_host/src/fgpl/net_policy.cpp:163-308`.

IP-адреса:

- непубличный адрес, записанный прямо в URL или в `host` сокета, даёт `invalid` с текстом «the address is not public»;
- публичные адреса разрешены, например `https://8.8.8.8/` и `https://[2606:4700::1]/`;
- непубличными считаются, например, IPv4 из диапазонов 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16 и адреса от 224.0.0.0; среди IPv6 — `::`, `::1`, `fc00::/7`, `fe80::/10` и другие (`Telegram/plugins_host/src/fgpl/net_policy.cpp:134-159`, `:329-379`);
- имя хоста, которое после DNS указывает на непубличный адрес, даёт `blocked` с текстом «the address is not public». Эта проверка выполняется только без прокси, см. раздел «Прокси плагинов» ниже (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:384-388`).

### Редиректы

- Переходов — не больше 5. Переходы выполняются по кодам 301, 302, 303, 307 и 308. Цель перехода должна быть `https://` и проходить те же проверки адреса; иначе ошибка `redirect` с текстом «a redirect is not allowed». Если переходов больше пяти, ошибка `redirect` с текстом «too many redirects» (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:995-1047`).
- Коды 301 и 302 при `POST`, а также код 303 переводят запрос в `GET` без тела. В остальных случаях метод и тело не меняются.
- При смене хоста заголовок `Authorization` удаляется.

### TCP и UDP

TCP:

- `tls=True` — TLS 1.2 и новее; сертификат сервера проверяется, имя сверяется с `host` (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:1114-1120`).
- Таймауты: для `connect` и `send` по умолчанию 10 с, минимум 100 мс; для `recv` по умолчанию 1 с, а `timeout=0` означает опрос без ожидания. Любой таймаут сокетного вызова ограничен 30 с (`Telegram/plugins_host/src/fgpl/broker.cpp:56-59`, `:1168-1173`, `:1205`, `:1240`, `:1250`).
- `send` — до 1 МиБ за вызов. `recv(max_bytes)` принимает значения от 1 байта до 1 МиБ; в Python по умолчанию 65507.
- Не больше 16 открытых TCP-сокетов и не больше 16 открытых UDP-сокетов одновременно. Превышение даёт `limit` (`Telegram/plugins_host/src/fgpl/broker.cpp:1183-1185`).

UDP:

- Принимаются только датаграммы от заданного адреса и порта (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:1226-1230`).
- Одна отправляемая датаграмма — до 65507 байт.
- `tls` для UDP не допускается: вызов с `tls` даёт `invalid` (`Telegram/plugins_host/src/fgpl/broker.cpp:1196`).
- Отправка — не больше 200 датаграмм за любую скользящую секунду на соединение. Сверх лимита ошибка `limit` с текстом «too many datagrams» (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:1166-1174`).

> [!WARNING]
> README (`Telegram/plugins_sdk/README.md:43`) пишет про 200 датаграмм в секунду без указания области действия. Код считает их отдельно для каждого соединения. Формулировка README не подтверждена кодом (OPEN-4).

### Блокировки пользователя

В настройках плагинов пользователь может запретить три вида трафика: HTTPS (`net.fetch`), TCP и UDP. По умолчанию все три выключены. Запреты действуют сразу для всех плагинов и всех аккаунтов (`Telegram/SourceFiles/ayu/ayu_settings.h:538-540`, `:1135-1137`; `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:651-679`).

- При включении запрета уже открытые соединения этого вида закрываются. Дальнейшие операции с ними возвращают `closed` (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:1441-1454`, `:1152-1154`).
- Новый вызов запрещённого вида возвращает `blocked`: «HTTPS is blocked for plugins», «TCP is blocked for plugins» или «UDP is blocked for plugins». Соединение с TLS относится к TCP, и его сообщение — «TLS is blocked for plugins» (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:109-113`, `:986-987`, `:1070`).

### Прокси плагинов

Прокси для плагинов задаётся отдельно от других сетевых настроек. Поля: `enabled` (по умолчанию выключен), `type` — `Socks5` (по умолчанию) или `Http`, `host`, `port`, `user`, `password`. Прокси действует, если он включён, `host` не пуст, а порт — от 1 до 65535 (`Telegram/SourceFiles/ayu/ayu_settings.h:26-41`; `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:667-677`). Адрес самого прокси разрешается системным DNS, если `host` задан именем (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:742-764`).

> [!WARNING]
> README (`Telegram/plugins_sdk/README.md:106-107`) пишет, что трафик плагинов всегда идёт напрямую и никогда не использует прокси, настроенный в приложении. Код использует прокси плагинов, если он включён. Формулировка README не подтверждена кодом (OPEN-3).

Через прокси:

- TCP и TLS — через SOCKS5 или HTTP CONNECT. Для HTTP CONNECT передаётся заголовок `Proxy-Authorization: Basic`. Логин и пароль SOCKS5 — не длиннее 255 байт (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:543`, `:690-735`, `:815-817`).
- `net.fetch` — через прокси, если он включён (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:1319-1325`).
- UDP — только через SOCKS5 (UDP ASSOCIATE). С HTTP-прокси UDP даёт `unavailable` с текстом «UDP is not supported through an HTTP proxy» (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:1078-1081`).
- Ошибка прокси имеет код `connect`, и её текст начинается с «proxy: ». Ответ прокси 407 даёт «proxy: authentication is required» (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:464-466`, `:729-730`).
- Проверка публичности адреса после DNS выполняется только без прокси. IP-адреса, записанные литералами, проверяются всегда (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:815-825`).

### Панель сети

Соединения плагинов видны в панели сети, которая открывается для плагинов с сетевыми правами. Панель обновляется раз в секунду, и пользователь может закрыть любое соединение. Журнал хранит до 300 записей (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:1850`, `:2278-2285`, `:2822-2829`, `:2847-2848`; `Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:48`).

## Коды ошибок

| Код | Когда возникает | Пример текста |
|---|---|---|
| `denied` | Право не выдано | имя права (`net.https`, `net.tcp`, `net.udp`); для `net.socket.send`, `net.socket.recv` и `net.socket.close` — «socket» |
| `invalid` | Неверный URL, метод, заголовок или порт; непубличный IP-адрес в URL или в `host` | «only https URLs are allowed», «the address is not public» |
| `limit` | Тело запроса больше 100 МиБ; ответ больше 100 МиБ (с `Content-Length` или без длины); больше 16 открытых сокетов одного вида; больше 200 датаграмм в секунду | «the body is too large», «the response is too large», «too many open sockets», «too many datagrams» |
| `response` | Ответ не разобран или не дочитан: заголовки некорректны или слишком большие; `chunked`-тело некорректно или больше 100 МиБ; соединение закрыто до конца ответа | «the headers are too large», «a malformed response», «a malformed or too large body», «the connection closed early» |
| `not_found` | Неизвестный `id` сокета | «socket» |
| `unavailable` | Сетевой сервис приложения недоступен; UDP через HTTP-прокси | «network», «UDP is not supported through an HTTP proxy» |
| `blocked` | Вид трафика запрещён пользователем; адрес после DNS непубличный (без прокси) | «HTTPS is blocked for plugins», «the address is not public» |
| `closed` | Соединение закрыто пользователем, политикой или прокси | «the connection was closed by the user», «the connection is closed» |
| `dns` | Имя хоста не найдено | «the host was not found» |
| `timeout` | Истёк таймаут: поиска адреса, отправки данных или ожидания ответа | «the host lookup timed out», «the data was not sent in time», «the request timed out» |
| `redirect` | Редирект запрещён или переходов больше пяти | «a redirect is not allowed», «too many redirects» |
| `connect` | Не удалось подключиться; ошибка прокси | «proxy: authentication is required» |
| `tls` | TLS-рукопожатие не завершилось в срок или ошибка TLS-сокета | «the handshake timed out»; текст системной ошибки сокета (`errorString()`) |
| `write` | Ошибка записи в TCP-сокет или UDP-датаграмму | текст системной ошибки сокета (`errorString()`) |

> [!NOTE]
> Таблица неполная: она перечисляет коды и тексты, описанные на этой странице, а транспорт и брокер возвращают и другие тексты.

> [!TIP]
> В Python ошибка приходит как `freshgram.FreshgramError` с полями `code` и `message`. Коды `denied`, `invalid`, `not_found`, `limit` и `unavailable` превращаются в классы `Denied`, `Invalid`, `NotFound`, `LimitExceeded` и `Unavailable`. Остальные коды, включая `blocked`, `closed`, `dns`, `timeout`, `redirect`, `connect`, `response`, `tls` и `write`, попадают в `Failed`. Проверяйте `error.code`.

Обработка ошибок (фрагмент):

```python
import freshgram

try:
    response = freshgram.net.get("https://example.org/", timeout=5000)
except freshgram.Denied:
    freshgram.log("право net.https не выдано")
except freshgram.FreshgramError as error:
    if error.code == "blocked":
        freshgram.log("сеть для плагинов заблокирована пользователем")
    else:
        freshgram.log(error.code + ": " + error.message)
```

Частые ситуации собраны в разделе [FAQ](#/faq).

## C и другие языки

В репозитории есть только C-ABI, заголовок `Telegram/plugins_sdk/c/freshgram.h`. Подробности по C — в разделе [C-ABI: справочник](#/c-abi-reference).

Сетевые helper-функции заголовка (фрагмент, сигнатуры как в `freshgram.h`):

```c
static int fg_fetch(const char *url, fg_i64 timeout, fg_value *result);
static int fg_tcp_connect(const char *host, fg_i64 port, int tls, fg_i64 *id);
static int fg_udp_connect(const char *host, fg_i64 port, fg_i64 *id);
static int fg_socket_recv(fg_i64 id, fg_i64 max, fg_i64 timeout, fg_value *result);
static int fg_socket_send(fg_i64 id, const void *data, fg_u32 length);
static int fg_socket_close(fg_i64 id);
```

- `fg_fetch` передаёт только `url` и `timeout`: запрос уходит как `GET` без заголовков и тела (`Telegram/plugins_sdk/c/freshgram.h:700-708`).
- `fg_tcp_connect` и `fg_udp_connect`, а также `fg_socket_send` не передают таймаут, поэтому действует значение по умолчанию (`Telegram/plugins_sdk/c/freshgram.h:488-513`, `:722-730`).
- Разбор ответа: в `freshgram.h` есть `fg_find`, `fg_as_int`, `fg_as_bool` и `fg_as_text`. Отдельных helper для статуса, заголовков и тела ответа нет (`Telegram/plugins_sdk/c/freshgram.h:143-200`).

> [!WARNING]
> README (`Telegram/plugins_sdk/README.md:109-114`) требует, чтобы `FG_HEAP_BYTES` был достаточным для ответов до 100 МиБ. Какое значение для этого нужно, не подтверждено кодом (OPEN-13).

### Сокеты в WASI

- Импорты WASI `sock_accept`, `sock_recv`, `sock_send` и `sock_shutdown` возвращают ошибку `kNotSup`. Сеть плагина — только через `net.*` (`Telegram/plugins_host/src/fgpl/wasi_host.cpp:1000-1013`).
- Базовый список разрешённых системных вызовов песочницы Linux не содержит `socket` и `connect` (`Telegram/plugins_host/src/fgpl/sandbox_linux.cpp:137-168`).

Сводка расхождений между README и кодом по лимитам — в разделе [Ограничения и WIP](#/limits-wip). Примеры на Python и подробности модуля — в [Python SDK: справочник](#/python-sdk-reference).

> [!WARNING]
> README (`Telegram/plugins_sdk/README.md:100-101`) называет для запроса и ответа предел 128 МиБ, а для тела `net.fetch` код задаёт 100 МиБ (`Telegram/plugins_host/src/fgpl/broker.cpp:40-41`). Связь этих чисел с размером кадра не подтверждена кодом (OPEN-23).
