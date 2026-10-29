---
title: "Частые вопросы"
description: "Ответы на типовые ситуации при разработке плагина: отказы вызовов, незапуск, лимиты, обновление и ограничения платформы."
section: "Поддержка"
order: 17
slug: "faq"
status: "экспериментально"
---

Здесь собраны типовые вопросы о разработке плагина. Сначала языки и рантайм, затем запуск, вызовы и лимиты, файлы и сеть, обновление и настройки. Пути к исходникам указаны от корня репозитория плагинов.

> [!TIP]
> Если плагин не работает, проверьте по порядку: включён ли он, какое у него состояние, выданы ли ему права и что записано в журнале. Порядок проверок описан в вопросе «Плагин не запускается».

## Языки и рантайм

### Нужен ли Python отдельно?

Нет. Хост, Wasmtime, CPython для WASI и Python-SDK `freshgram` входят в один рантайм-бандл. Он скачивается при включении плагинов и не входит в инсталлятор (`Telegram/plugins_host/RUNTIME.md:3-6`; состав бандла: `Telegram/plugins_host/RUNTIME.md:32-38`). Модуль `freshgram` импортируется из `/runtime/sdk` этого же бандла (`Telegram/plugins_host/src/fgpl/manager.cpp:1428`). Если Python-рантайм не установлен, Python-плагин не запускается: клиент возвращает ошибку `the Python runtime is not installed` (`Telegram/plugins_host/src/fgpl/manager.cpp:1422-1424`). Пример первого плагина — в [Быстром старте: Python](#/quickstart-python).

### Почему компонент рантайма не загружается?

Рантайм загружается через MTProto из публичного канала, через вошедший аккаунт (`Telegram/plugins_host/RUNTIME.md:3-6`). Без входа в Telegram загрузка завершается ошибкой `sign in to Telegram to download` (`Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:189-191`). Если сборка не содержит ключа для проверки загрузок, загрузка запрещена с текстом `this build has no key to verify downloads` (`Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:343-346`).

## Запуск и отключение

### Плагин не запускается. Что проверить?

Ниже причины собраны в порядке, в котором их удобно проверять: сначала включение плагина и его состояние, затем совместимость, права, сбои и журнал. Состояние плагина вычисляет `Compute()`: она возвращает первое выполнившееся условие из `Disabled`, `NoSandbox`, `NoRuntime`, `NoKey`, а если ни одно не выполнено, `Ready` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:211-222`).

- **Плагин выключен.** Тумблер включения находится в списке плагинов (`Telegram/SourceFiles/ayu/ui/settings/plugins_settings.cpp:143-163`) и в деталях плагина (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2191-2201`).
- **Функция плагинов выключена целиком.** Состояние `Disabled`.
- **Песочница не поддерживается.** Состояние `NoSandbox`, см. вопрос «Что значит состояние NoSandbox?».
- **Рантайм не установлен.** Состояние `NoRuntime`, см. вопрос «Почему компонент рантайма не загружается?».
- **Ключ не задан.** Состояние `NoKey`: `FreshVault::HasKey()` возвращает `false` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:218-219`). Клиент показывает текст «Плагины запустятся после разблокировки приложения» (`Telegram/SourceFiles/ayu/ui/settings/plugins_settings.cpp:51-52`).
- **Плагин несовместим с версией клиента.** Клиент отвечает `the plugin is not compatible with this version` (`Telegram/plugins_host/src/fgpl/manager.cpp:1459-1461`). Требования к клиенту задаются в `compat.requires` (`Telegram/plugins_sdk/README.md:116-118`).
- **Не выданы права.** Установленный плагин не запускается без выданных прав (`Telegram/plugins_host/src/fgpl/manager.cpp:1462-1464`). Подробнее — в [Разрешениях](#/permissions).
- **Плагин отключён после повторных сбоев.** Три сбоя за 10 минут (`Telegram/plugins_host/src/fgpl/manager.h:108-109`) переводят плагин в отключённое состояние с причиной `stopped after repeated failures` (`Telegram/plugins_host/src/fgpl/manager.cpp:2071-2075`).
- **Журнал плагина.** Записи о запуске и сбоях описаны в [Жизненном цикле, логах и отладке](#/lifecycle).

### Вызов вернул `denied`. Что делать?

Брокер возвращает `denied`, если права нет: право не выдано или не объявлено в манифесте (`Telegram/plugins_host/src/fgpl/broker.cpp:1372-1374`). В грант попадают только права, объявленные в манифесте (`Telegram/plugins_host/src/fgpl/manager.cpp:917-921`). Грант записывается сразу для всех аккаунтов (`manager.cpp:923-924`). Проверьте, что право объявлено в манифесте и выдано пользователем. См. [Разрешения](#/permissions).

### Вызов вернул `limit`. Какие бывают бюджеты?

Лимиты заданы в коде брокера и рантайма:

- все вызовы вместе: 200 в секунду (`callsPerSecond = 200`, `Telegram/plugins_host/src/fgpl/broker.h:51`);
- на одно событие: не больше 256 вызовов (`maxCallsPerDispatch = 256`, `Telegram/plugins_host/src/fgpl/runtime.h:23`);
- `messages.send`: пять сообщений подряд, затем по одному в секунду (`kSendBurst = 5.`, `kSendEachMs = 1000.`, `Telegram/plugins_host/src/fgpl/broker.cpp:47-48`);
- `ui.toast`: одно уведомление раз в 2 секунды (`kToastEachMs = 2000`, `broker.cpp:49`).

Превышение любого из лимитов возвращает `limit`. Подробнее — в [Ограничениях и WIP](#/limits-wip).

### Почему одноразовый таймер не работает?

Одноразовый таймер с корректным `delay` (от 1000 мс до 7 дней) по коду проходит проверку. Отсутствующий `repeat` брокер считает равным `false` (`Telegram/plugins_host/src/fgpl/broker.cpp:2230`, `:118-127`), и таймер ставится как одноразовый (`broker.cpp:2234`). Тест `Telegram/plugins_host/tests/test_manager.cpp:1606-1631` ставит такой таймер на 1000 мс без `repeat` и проверяет, что он запускает плагин.

В Python-модуле `repeat=False` — значение по умолчанию (`Telegram/plugins_sdk/python/freshgram/__init__.py:538`). Функция `_given` не включает ложные значения в запрос (`__init__.py:250-251`), поэтому параметр просто не передаётся, и брокер использует `false`.

Отказ `invalid` с текстом «delay must be from 1000 ms to 7 days» (`Telegram/plugins_host/src/fgpl/broker.cpp:2231-2232`) возвращается, если `delay` не передан, не является целым числом или вне диапазона, либо если `repeat` задан не логическим значением.

> [!WARNING]
> Не подтверждено кодом (OPEN-1): причина, по которой одноразовый таймер не работает на практике, в коде не установлена и запуском не проверена. Тест `Telegram/plugins_host/tests/test_broker.cpp:1893` проверяет отказ при `delay` 10, а не при отсутствии `repeat`.

### Почему команда не сработала при отложенной отправке?

Обработка команд плагина в `HistoryWidget::send` пропускается, если сообщение отправляется отложенно, без звука или как правка уже отправленного сообщения (`Telegram/SourceFiles/history/history_widget.cpp:6090`). Отправьте сообщение обычным способом, без этих режимов.

### Почему `message.outgoing` не срабатывает на файлы?

По описанию SDK сообщения с файлами пока не перехватываются: событие `message.outgoing` приходит только перед отправкой текстового сообщения (`Telegram/plugins_sdk/README.md:176-181`). Оно также не приходит для секретных чатов, «Избранного», чата 777000, бизнес-быстрых ответов, приветственных шаблонов и предложенных постов (там же). Подробнее — в [Исходящих сообщениях](#/outgoing-messages).

## Файлы, сеть и хранилище

### Можно ли писать файлы на диск?

Нет. Каталоги пакета и рантайма открыты только на чтение: запись в них возвращает код `kRoFs` (`Telegram/plugins_host/src/fgpl/wasi_host.cpp:761-763`). Постоянные данные плагин хранит через `storage.*`, см. [Хранилище и файлы](#/storage-files). Файл, который должен получить пользователь, передаётся через `files.save`. Этот вызов доступен только асинхронно и после действия пользователя, пользователь выбирает место сохранения, а имя файла не может содержать `/` и `\` (`Telegram/plugins_sdk/README.md:84`; `Telegram/plugins_host/src/fgpl/broker.cpp:2183-2196`).

### Можно ли открыть произвольный сокет?

Нет. Сетевые соединения делаются только через вызовы `net.*`: `net.fetch`, `net.tcp.connect` и `net.udp.connect`. Их выполняет клиент, а соединения видны в панели сети приложения (`Telegram/plugins_sdk/README.md:41-46`, `:105-106`). Базовый набор системных вызовов песочницы (`PlainSyscalls`, `Telegram/plugins_host/src/fgpl/sandbox_linux.cpp:137-168`) не содержит `socket` и `connect`. Подробнее — в [Сети и прокси](#/network-proxy).

### Какой максимальный размер файла и значения?

- **Файлы до 100 MiB** в обе стороны: `net.fetch`, `media.get`, `messages.send_media`, `messages.edit_media`, `files.pick` и `files.save` (`Telegram/plugins_sdk/README.md:109-110`; `Telegram/plugins_host/src/fgpl/broker.cpp:76`).
- **Память для больших файлов.** Файл проходит через память плагина примерно трижды, поэтому для больших файлов нужно увеличить `runtime.limits.memoryMb` (`Telegram/plugins_sdk/README.md:110-113`).
- **Значение `storage`** — до 1 MiB (`kMaxValueBytes`, `Telegram/plugins_host/src/fgpl/broker.cpp:36`). Ключ — до 128 байт, ключей — до 4096 (`broker.cpp:35`, `:37`).
- **Тело запроса и ответ `net.fetch`** — до 100 MiB каждое (`broker.cpp:40-41`).

### Почему `freshgram.files` недоступен в синхронном модуле?

Объект `files` создаётся только в асинхронном модуле `freshgram.aio` (`Telegram/plugins_sdk/python/freshgram/aio.py:65`). В синхронном модуле `freshgram` такого объекта нет (`Telegram/plugins_sdk/python/freshgram/__init__.py:620-639`). Для работы с файлами импортируйте асинхронный модуль: `from freshgram import aio`.

### Почему асинхронный код не работает через `asyncio`?

`asyncio` в песочнице не работает. Ожидать можно только awaitable из `freshgram`: `aio.sleep`, `aio.gather`, `aio.wait_for` и `freshgram.spawn`. Одновременно могут ожидать не больше 32 вызовов (`Telegram/plugins_sdk/README.md:220-221`; значение по умолчанию — `Telegram/plugins_host/src/fgpl/broker.h:52`, проверка в `Telegram/plugins_host/src/fgpl/broker.cpp:672`). Асинхронный обработчик `message.outgoing` должен вызвать `messages.set_outgoing` или `messages.drop_outgoing` до первого `await` (`Telegram/plugins_sdk/README.md:250-251`).

Пример (фрагмент, по `Telegram/plugins_sdk/README.md:228-237`):

```python
import freshgram
from freshgram import aio

@freshgram.on_command("weather")
async def weather(event):
    response = await aio.net.get("https://example.org/weather")
    await aio.ui.toast(response.text()[:100])
```

> [!NOTE]
> `@freshgram.on("command")` вызывает обработчик для любой команды. `@freshgram.on_command("weather")` вызывает его только для команды с именем `weather`: обёртка сравнивает `event.get("name")` с этим именем (`Telegram/plugins_sdk/python/freshgram/__init__.py:703-710`).

## Установка, обновление и настройки

### Как обновить плагин?

Установите новую версию из файла поверх текущей. Запись плагина сохраняется, и хранилище при обновлении не удаляется (`Telegram/plugins_host/src/fgpl/manager.cpp:787-802`). Предыдущая версия удаляется после первого успешного события новой версии (`manager.cpp:2079-2090`, `:2131-2133`). Если новая версия падает раньше, клиент откатывается на предыдущую (`manager.cpp:2058-2070`).

> [!WARNING]
> Не подтверждено кодом (OPEN-24): документированной гарантии сохранности хранилища при сбоях нет. Хранилище перезаписывается целиком при каждом сохранении (`Telegram/plugins_host/src/fgpl/file_storage.cpp:175-222`), интервал сохранения — 2000 мс (`Telegram/plugins_host/src/fgpl/manager.h:114`, `storageFlushMs`).

Обновление от другого издателя отклоняется (`manager.cpp:759-766`), как и понижение версии (`manager.cpp:755-756`), если параметры установки этого не разрешают (`allowDowngrade`, `acceptNewPublisher`).

### Что такое `.fgpls`?

Это файл экспорта настроек, а не пакет плагина. Ключи для экспорта задаются в разделе `storage` манифеста: `export` с полями `prefixes` и `exclude` (`Telegram/plugins_sdk/README.md:284-296`):

```json
"storage": { "schema": 2, "export": { "prefixes": ["settings."], "exclude": ["settings.token"] } }
```

Фрагмент из `Telegram/plugins_sdk/README.md:286`. Экспорт и импорт доступны в деталях плагина. Импорт отказывает для другого плагина и для `storage.schema`, более новой, чем установленная (`Telegram/plugins_sdk/README.md:292-293`). После подтверждения плагин останавливается, значения заменяются и плагин запускается снова (`Telegram/plugins_sdk/README.md:295-296`; `Telegram/plugins_host/src/fgpl/manager.cpp:2620`). Ключи, которых нет в файле, остаются без изменений.

### Что означает «устарел»?

Плагин проверен для более старой версии клиента: версия клиента новее `testedWith` из манифеста по мажорной части или по минорной при той же мажорной (`Telegram/plugins_host/src/fgpl/manifest.cpp:370-379`). Установка при этом не блокируется, показывается предупреждение (`Telegram/SourceFiles/ayu/ui/boxes/plugin_install_box.cpp:205-213`).

## Платформа

### Что значит состояние `NoSandbox`?

Состояние `NoSandbox` означает, что песочница недоступна: Landlock в этой системе не работает. Функция `SandboxSupported()` возвращает `true` только при `LandlockAbi()` больше нуля (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:1011-1018`). Рантайм-бандл плагинов есть только для платформ `linux-x86_64` и `linux-aarch64` (`Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:50-54`). Текст в интерфейсе: Linux 5.13 или новее с включённым Landlock (`Telegram/Resources/langs/lang.strings:8877`).

> [!WARNING]
> Не подтверждено кодом (OPEN-21): поведение интерфейса при состоянии `NoSandbox` на Windows не проверено запуском.

### Что значит «официальный»?

Плагин считается официальным, если его издатель совпадает с отпечатком ключа, заданного при сборке через `FRESHGRAM_PLUGINS_KEY` (`Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:314-319`). В заголовке деталей плагина и в диалоге установки показывается значок «Официальный плагин» или «Неофициальный плагин» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3298-3303`). При установке неофициального пакета дополнительно выводится предупреждение «Неофициальный плагин. Устанавливайте его, только если доверяете источнику.» (`Telegram/SourceFiles/ayu/ui/boxes/plugin_install_box.cpp:195-200`). Установка при этом не блокируется. Признак используется только для отображения и предупреждения (`plugins_ui.cpp:2172`, `:3196`; `plugin_install_box.cpp:182`), на выдачу прав он не влияет.

Подпись пакета проверяется Ed25519 по ключу, который указан в самой подписи пакета. Издатель определяется как отпечаток этого ключа (`Telegram/plugins_host/src/fgpl/package.cpp:195-208`). Проверка идёт не по списку издателей freshGram.

## См. также

- [Пакет и манифест](#/package-manifest)
- [Разрешения](#/permissions)
- [Жизненный цикл, логи и отладка](#/lifecycle)
- [Ограничения и WIP](#/limits-wip)
