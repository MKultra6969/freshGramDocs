---
title: "Хранилище и файлы"
description: "Как плагин хранит данные в storage, какие лимиты действуют, как читать файлы пакета, выбирать и сохранять файлы через files.pick и files.save и переносить настройки."
section: "Возможности"
order: 10
slug: "storage-files"
status: "экспериментально"
---

Плагин хранит данные в `storage`: это словарь «ключ — значение», который сохраняется между запусками приложения. Файлы пакета плагина доступны только для чтения, поэтому изменяемые данные кладутся в хранилище. Файлы, которые нужно прочитать у пользователя или сохранить ему, передаются через системный диалог: `files.pick` и `files.save`. Настройки можно вынести из хранилища в файл `.fgpls` и перенести на другое устройство.

Описаны Python-SDK (`import freshgram`) и C-хелперы из `freshgram.h`.

## Какие права нужны

Вызовы `storage.*` требуют право `storage.private`. Для `files.pick` и `files.save` нужно право `fs.user_selected`. Оба права объявляются в манифесте и выдаются пользователем. Подробнее — в разделе [Разрешения](#/permissions).

Если права `storage.private` нет, вызов завершается ошибкой `denied` с текстом `storage.private`; в Python это исключение `Denied` (`Telegram/plugins_host/src/fgpl/broker.cpp:929-930`).

## Хранилище

### Вызовы в Python

Фрагмент из `Telegram/plugins_sdk/README.md`:

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

| Вызов | Что возвращает |
|---|---|
| `storage.get(key, default=None)` | значение; `default`, если ключа нет |
| `storage.set(key, value)` | ничего |
| `storage.delete(key)` | `True`, если ключ был и удалён; иначе `False` |
| `storage.keys(prefix="", limit=100)` | список ключей с заданным префиксом |
| `storage.usage()` | словарь с полями `used`, `quota`, `keys` |

Те же вызовы есть в `freshgram.aio` как `aio.storage`. Их результат получают через `await` (`Telegram/plugins_sdk/python/freshgram/aio.py:46`).

### Ограничения

- **Ключ**: от 1 до 128 байт. Лимит считается в байтах UTF-8, а не в символах: кириллическая буква занимает 2 байта, поэтому кириллица в ключах допустима, но ключ из 64 русских букв уже достигает предела. Управляющие байты (меньше `0x20` и равные `0x7F`) запрещены (`Telegram/plugins_host/src/fgpl/broker.cpp:188-198`).
- **Значение**: любое значение, которое кодируется в CBOR; закодированное значение не больше 1 MiB (`Telegram/plugins_host/src/fgpl/broker.cpp:1055-1058`). Python-SDK кодирует `None`, `bool`, целые числа 64-битного знакового диапазона, `float`, `bytes`, `str`, списки, кортежи и словари со строковыми ключами (`Telegram/plugins_sdk/python/freshgram/_cbor.py:36-71`).
- **Количество ключей**: не больше 4096 (`Telegram/plugins_host/src/fgpl/broker.cpp:1062-1063`).
- **Квота**: задаётся в манифесте полем `runtime.limits.storageMb`, допустимый диапазон от 0 до 1024, по умолчанию 10 MiB (`Telegram/plugins_host/src/fgpl/manifest.cpp:647`). Занятость — сумма длины ключа и длины закодированного значения (`Telegram/plugins_host/src/fgpl/file_storage.cpp:128-146`).

```json
{
  "runtime": {
    "limits": { "storageMb": 20 }
  }
}
```

Фрагмент манифеста: значение `20` взято для примера.

> [!WARNING]
> Манифест принимает значение 0. Поведение хранилища при квоте 0 не подтверждено кодом (OPEN-25).

- **Список ключей**: префикс до 128 байт; `limit` по умолчанию 100, значение больше 1000 уменьшается до 1000, значение меньше 1 даёт ошибку `invalid` (`Telegram/plugins_host/src/fgpl/broker.cpp:1020-1034`). Ключи возвращаются в порядке возрастания байтов (`Telegram/plugins_host/src/fgpl/file_storage.h:40`).
- **Асинхронные вызовы**: вызов с `await` ставится в очередь; ожидающих вызовов одновременно не больше 32. Сверх этого лимита вызов завершается ошибкой `limit` с текстом «too many calls are pending» (в Python — `LimitExceeded`) (`Telegram/plugins_host/src/fgpl/broker.cpp:659-711`; `Telegram/plugins_host/src/fgpl/broker.cpp:672-673`; `Telegram/plugins_host/src/fgpl/broker.h:52`).
- **Глубина вложенности** значения на стороне хоста: не больше 16 (`Telegram/plugins_host/src/fgpl/broker.cpp:200-206`).

> [!WARNING]
> Значение с вложенностью глубже 16 уровней хост не кодирует, и `storage.set` такое значение не записывает. Python-SDK допускает вложенность до 24 уровней; при вложенности больше 24 он выбрасывает `ValueError("too deep")` (`Telegram/plugins_sdk/python/freshgram/_cbor.py:36-37`). При вложенности от 17 до 24 хост отвечает ошибкой `limit` с текстом «the value is too large», в Python это `LimitExceeded` (`Telegram/plugins_host/src/fgpl/cbor.cpp:251`, `Telegram/plugins_host/src/fgpl/broker.cpp:200-206`, `Telegram/plugins_host/src/fgpl/broker.cpp:1055-1057`). Держите вложенность не глубже 16.

### Ошибки

| Ситуация | Код | Исключение в Python | Текст сообщения |
|---|---|---|---|
| Нет права `storage.private` | `denied` | `Denied` | `storage.private` |
| Некорректный ключ | `invalid` | `Invalid` | `key` |
| `storage.set` без `value` | `invalid` | `Invalid` | `value` |
| Значение больше 1 MiB или не кодируется | `limit` | `LimitExceeded` | `the value is too large` |
| Ключей больше 4096 | `quota` | `QuotaExceeded` | `too many keys` |
| Квота исчерпана | `quota` | `QuotaExceeded` | `the quota is used up` |
| Значение повреждено при чтении | `failed` | `Failed` | `a damaged value` |

Все исключения наследуют `FreshgramError`. Текст исключения собирается как `код: сообщение`, например `quota: the quota is used up` (`Telegram/plugins_sdk/python/freshgram/_errors.py:1-3`, `Telegram/plugins_sdk/python/freshgram/_errors.py:53`). Если ключа нет, `storage.get` возвращает значение по умолчанию и не выдаёт ошибки.

### Область видимости

- Хранилище принадлежит плагину, а не аккаунту. Если плагин работает в нескольких аккаунтах, все они видят одни и те же ключи (`Telegram/plugins_sdk/README.md`, раздел «Accounts»; `Telegram/plugins_host/src/fgpl/manager.cpp:1918-1921`).
- Обработка событий одного плагина идёт по одному, поэтому обновления хранилища из двух аккаунтов не перемежаются (`Telegram/plugins_sdk/README.md`, раздел «Accounts»).

### Где лежат данные

- Файл: `<корень>/<id>/data/store.cbor`, где `<id>` — идентификатор плагина, а `<корень>` задаёт хост (`Telegram/plugins_host/src/fgpl/manager.cpp:1922-1923`).
- Формат: CBOR-словарь `{"v": 1, "items": {ключ: bytes}}`. Каждое значение записано закодированными байтами CBOR (`Telegram/plugins_host/src/fgpl/file_storage.cpp:175-187`).
- Когда пишется: файл перезаписывается целиком. Если есть изменения, запись идёт не чаще, чем раз в `storageFlushMs` = 2000 мс. Сброс также выполняется при запуске и при остановке плагина (`Telegram/plugins_host/src/fgpl/manager.h:114`, `Telegram/plugins_host/src/fgpl/manager.cpp:2093-2101`, `Telegram/plugins_host/src/fgpl/manager.cpp:651-653`, `Telegram/plugins_host/src/fgpl/manager.cpp:1756`). Журнала изменений нет.
- Резервная копия: при записи предыдущая версия сохраняется как `store.cbor.bak`. Если основной файл повреждён, он переименовывается в `store.cbor.corrupt`, а данные восстанавливаются из `store.cbor.bak` (`Telegram/plugins_host/src/fgpl/file_storage.cpp:90-113`, `Telegram/plugins_host/src/fgpl/file_storage.cpp:200-212`). В журнал плагина пишется сообщение `failure: the storage file was damaged, restored the previous copy, the latest changes may be lost` (`Telegram/plugins_host/src/fgpl/manager.cpp:1943-1944`).
- Если `store.cbor` отсутствует, хост копирует самый свежий `store.cbor` из подкаталогов `data/` (`Telegram/plugins_host/src/fgpl/manager.cpp:1925-1941`).

> [!WARNING]
> Сохранность данных при сбое: не подтверждено кодом (OPEN-24). Между сбросами на диск проходит до 2000 мс, и последние изменения при сбое могут быть потеряны. Не полагайтесь на то, что каждая запись переживёт аварийное завершение.

## Файлы пакета

Файлы пакета плагина доступны в двух каталогах:

- `/plugin` — файлы пакета, кроме `manifest.json` (`Telegram/plugins_host/src/fgpl/package.cpp:122-124`, `Telegram/plugins_host/src/fgpl/runtime.cpp:680-683`);
- `/runtime` — для Python-плагинов: `runtime/lib/**` и `runtime/sdk/**/*.py` (`Telegram/plugins_host/src/fgpl/manager.cpp:1389-1404`).

Чтение разрешено: открытие файла только на чтение, чтение файла и чтение каталога. Любая попытка записи отказывает с кодом 69 (`kRoFs`) (`Telegram/plugins_host/src/fgpl/wasi_host.cpp:30`, `Telegram/plugins_host/src/fgpl/wasi_host.cpp:761-763`).

> [!TIP]
> Изменяемые данные храните в `storage`, а не в файлах пакета: каталог `/plugin` только для чтения.

## Файлы пользователя: files.pick и files.save

Оба вызова доступны только во `freshgram.aio` и только с `await` (`Telegram/plugins_sdk/README.md:83-84`, «awaitable only»; `Telegram/plugins_sdk/README.md:488-489`; `Telegram/plugins_sdk/python/freshgram/aio.py:65`).

| Вызов | Аргументы | Результат |
|---|---|---|
| `await aio.files.pick(title="", filter="")` | `title` — заголовок диалога; `filter` — фильтр, например `Images (*.png *.jpg)` | `{"name", "data"}` или `None`, если пользователь отменил выбор |
| `await aio.files.save(name, data)` | `name` — имя файла; `data` — байты или текст | `True`, или `False`, если пользователь отменил сохранение |

Условия вызова:

- Нужно право `fs.user_selected` (`Telegram/plugins_host/src/fgpl/broker.cpp:2158-2161`, `Telegram/plugins_host/src/fgpl/broker.cpp:2183-2186`).
- Вызов разрешён только в течение 10 с после последнего действия пользователя. Действием считается событие из интерфейса, например команда, пункт меню, действие в окне или диалоге (`Telegram/plugins_host/src/fgpl/broker.cpp:51`, `Telegram/plugins_host/src/fgpl/broker.cpp:2108-2125`; `Telegram/plugins_host/src/fgpl/manager.cpp:1304-1336`). Иначе вызов завершится ошибкой `denied` с текстом `only right after a user action`.
- Файл — до 100 MiB в обе стороны (`Telegram/plugins_host/src/fgpl/broker.cpp:76`, `Telegram/plugins_host/src/fgpl/broker.cpp:2176`, `Telegram/plugins_host/src/fgpl/broker.cpp:2198`).
- `name` — не пустое, без символов `/` и `\`, до 128 байт (`Telegram/plugins_host/src/fgpl/broker.cpp:77`, `Telegram/plugins_host/src/fgpl/broker.cpp:2187-2196`).

Фрагмент:

```python
from freshgram import aio

async def pick_file():
    picked = await aio.files.pick(title="Выберите файл", filter="Images (*.png *.jpg)")
    if picked is None:
        return None
    return picked["name"], picked["data"]
```

## Экспорт и импорт настроек

Плагин объявляет, какие ключи можно экспортировать. Фрагмент манифеста из `Telegram/plugins_sdk/README.md`, раздел «Exporting settings»:

```json
{
  "storage": {
    "schema": 2,
    "export": {
      "prefixes": ["settings."],
      "exclude": ["settings.token"]
    }
  }
}
```

- `storage.schema` — целое число от 1 до 100000, по умолчанию 1 (`Telegram/plugins_host/src/fgpl/manifest.cpp:882`).
- `export.prefixes` — от 1 до 32 префиксов; хотя бы один обязателен. `export.exclude` — до 32 исключений (`Telegram/plugins_host/src/fgpl/manifest.cpp:897-901`).
- Ключ попадает в экспорт, если начинается с одного из префиксов и ни с одного из исключений (`Telegram/plugins_host/src/fgpl/manifest.cpp:381-388`).
- В карточке плагина есть два пункта для экспорта и импорта настроек. В исходнике это английские строки «Export settings» и «Import settings» (`Telegram/Resources/langs/lang.strings:9000-9001`). Они записывают и читают файл `.fgpls`.

Файл `.fgpls` — это CBOR-словарь с полями `format` (значение `freshgram.plugin-settings`), `v` (значение 1), `plugin`, `pluginVersion`, `storageSchema`, `exported` (время экспорта) и `items` (значения экспортируемых ключей) (`Telegram/plugins_host/src/fgpl/manager.cpp:2547-2556`).

Импорт отвергается в следующих случаях (`Telegram/plugins_host/src/fgpl/manager.cpp:2562-2625`):

- файл не содержит корректных полей `format`, `v` (равно 1), `items` и `storageSchema` — ошибка `invalid`;
- поле `plugin` не совпадает с идентификатором плагина — ошибка `wrong_plugin`;
- `storageSchema` в файле больше `storage.schema` из манифеста — ошибка `newer`;
- ключ пустой, длиннее 128 байт, не проходит проверку текста или не входит в `export` — ошибка `invalid`;
- значение больше 1 MiB — ошибка `invalid`;
- ключей больше 4096 или занятость больше `storageMb` — ошибка `quota`;
- экспорт не объявлен в манифесте — ошибка `unavailable`.

После подтверждения импорта плагин останавливается, значения записываются и сразу сбрасываются на диск (`Telegram/plugins_host/src/fgpl/manager.cpp:2620-2624`). Ключи, которых нет в файле, не меняются. Затем плагин запускается снова (`Telegram/plugins_sdk/README.md`, раздел «Exporting settings»).

> [!NOTE]
> Миграций хранилища в хосте нет. Поле `storage.schema` используется только при импорте (`Telegram/plugins_host/src/fgpl/manifest.cpp:882`, `Telegram/plugins_host/src/fgpl/manager.cpp:2588`). README рекомендует повышать `storage.schema`, когда меняется смысл ключей (`Telegram/plugins_sdk/README.md`, раздел «Exporting settings»).

## Лимиты файлов

- Файлы до 100 MiB передаются в обе стороны: тела `net.fetch`, `media.get`, `messages.send_media`, `messages.edit_media`, `files.pick` и `files.save` (`Telegram/plugins_sdk/README.md:109-110`).
- Такой файл проходит через память плагина примерно три раза: ответ, собственная копия плагина и следующий запрос (`Telegram/plugins_sdk/README.md:111-113`). Поэтому `runtime.limits.memoryMb` должен быть достаточным. Допустимый диапазон этого поля — от 1 до 1024 (`Telegram/plugins_host/src/fgpl/manifest.cpp:645`).
- В C-плагине `FG_HEAP_BYTES` должен быть достаточным для файла (`Telegram/plugins_sdk/README.md:113-114`).

> [!WARNING]
> Значение `FG_HEAP_BYTES`, достаточное для файла 100 MiB, не подтверждено кодом (OPEN-13). По умолчанию в `freshgram.h` задан 1 MiB (`Telegram/plugins_sdk/c/freshgram.h:33-35`).

## Для C

В C-ABI есть только целочисленные хелперы хранилища (`Telegram/plugins_sdk/c/freshgram.h:419-440`):

- `fg_storage_get_int(const char *key, fg_i64 *out)` — читает целое число (`Telegram/plugins_sdk/c/freshgram.h:419`);
- `fg_storage_set_int(key, value)` — записывает целое число.

Если ключа нет, `fg_storage_get_int` возвращает `FG_OK`, а `out` не меняется: хост в таком случае отвечает `ok` без значения (`Telegram/plugins_host/src/fgpl/broker.cpp:1039-1043`). Поэтому значение по умолчанию нужно задать до вызова.

Строки и байты передаются через `fg_begin` и `fg_send`. Подробнее — в [справочнике C-ABI](#/c-abi-reference).

Фрагмент из `Telegram/plugins_sdk/README.md`; строка `fg_i64 count = 0;` добавлена, чтобы значение по умолчанию было задано до вызова:

```c
fg_i64 count = 0;
fg_storage_get_int("count", &count);
fg_storage_set_int("count", count + 1);
```

## Связанные страницы

- [Разрешения](#/permissions)
- [Манифест пакета](#/package-manifest)
- [Жизненный цикл](#/lifecycle)
- [Сеть и прокси](#/network-proxy)
- [Справочник Python SDK](#/python-sdk-reference)
- [C-ABI: справочник](#/c-abi-reference)
