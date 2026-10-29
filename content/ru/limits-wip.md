---
title: "Ограничения и WIP"
description: "Сводка лимитов, заглушек и расхождений между README и кодом, которые нужно учесть при написании плагина."
section: "Статус"
order: 16
slug: "limits-wip"
status: "WIP"
---

Эта страница собирает то, что в текущей бета-версии ограничено, не работает или описано в README иначе, чем в коде. Прочитайте её до проектирования плагина: большая часть отказов, с которыми вы столкнётесь, объясняется здесь.

Числа взяты из исходников плагинного модуля и из README SDK. Там, где факт не подтверждён запуском, стоит предупреждение.

## Что учитывать при проектировании

- **Данные плагина** храните в `storage.*`: ключ до 128 байт, значение до 1 MiB. Файлы пользователя передавайте через `files.pick` и `files.save`; оба вызова работают только после действия пользователя. Подробнее: [Хранилище и файлы](#/storage-files).
- **Большие файлы** (до 100 MiB) ожидайте (`await`) и заранее закладывайте запас в `runtime.limits.memoryMb`.
- **Частота вызовов**: общий бюджет 200 вызовов в секунду, на одно событие не больше 256 вызовов. Превышение бюджета в секунду возвращает ошибку `limit`; что возвращается при превышении 256 вызовов на событие, зависит от способа вызова (см. раздел «Лимиты вызовов и времени»).
- **Сбои**: три сбоя за 10 минут отключают плагин. При ожидающем обновлении (`pendingUpdate`) и наличии предыдущей версии первый же сбой откатывает плагин к ней (`Telegram/plugins_host/src/fgpl/manager.cpp:2058-2070`), поэтому не допускайте повторяющихся падений в обработчике событий.
- **Файлы пакета** доступны только для чтения: записать на диск из модуля нельзя. Постоянные данные — в `storage.*`.

## Статус сборки

Версия клиента помечена как `beta` (`changelog.txt:1`). Плагинный модуль подключается автоматически, если существует цель `fgpl_app`: тогда CMake задаёт макрос `FRESHGRAM_PLUGINS` (`Telegram/CMakeLists.txt:118-120`). Цель создаётся только в Linux (`Telegram/plugins_host/app.cmake:2-4`); отдельной опции для этого макроса нет. Без него состояние плагинов — `Unavailable`, `NetworkTransport()` возвращает `nullptr`, а `IsOfficialPublisher` всегда возвращает `false` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:1020-1034`, `Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:1515-1517`, `Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:584-586`).

Загрузка рантайма без `FRESHGRAM_RUNTIME_KEY` запрещена: приложение отказывает в любой загрузке (`Telegram/plugins_host/RUNTIME.md:87-89`).

Сообщения с файлами не перехватываются: событие `message.outgoing` для них не приходит (`Telegram/plugins_sdk/README.md:180`). Подробнее: [Исходящие сообщения](#/outgoing-messages).

## Платформа

- Хост и рантайм собираются для Linux: `linux-x86_64` и `linux-aarch64` (`Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:51-53`).
- Песочница — Landlock. Если Landlock недоступен, состояние плагинов — `NoSandbox`, и плагины не запускаются (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:211-215`).
- На Windows модуль плагинов не подключается: `fgpl_app` создаётся только для Linux (`Telegram/plugins_host/app.cmake:2-4`), поэтому `FRESHGRAM_PLUGINS` там не задаётся (`Telegram/CMakeLists.txt:118-120`), а состояние плагинов — `Unavailable` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:1020-1026`).

> [!WARNING]
> Не подтверждено запуском. В коде модуль плагинов на Windows не подключается, потому что цель `fgpl_app` не создаётся (`Telegram/plugins_host/app.cmake:2-4`). Поведение интерфейса плагинов на Windows не проверено (OPEN-21).

## Лимиты вызовов и времени

- Бюджет — 200 вызовов в секунду; на одно событие — не больше 256 вызовов (`Telegram/plugins_sdk/README.md:94-95`).
- `messages.send` разрешает 5 сообщений подряд, затем по одному в секунду. `ui.toast` — один тост в 2 секунды (`Telegram/plugins_sdk/README.md:96-97`; `Telegram/plugins_host/src/fgpl/broker.cpp:47-49`).
- Вызов сверх лимита брокера завершается ошибкой `limit` (`Telegram/plugins_host/src/fgpl/broker.h:31`): для 200 вызовов в секунду — `Telegram/plugins_host/src/fgpl/broker.cpp:628-629`, для тостов, уведомлений, разрешения имён и диалогов — `Telegram/plugins_host/src/fgpl/broker.cpp:741-765`. Для лимита 256 вызовов на событие код зависит от способа вызова: в Python-плагинах (кадры `call` в stdout) это `limit` с текстом «too many calls for one event» (`Telegram/plugins_host/src/fgpl/runtime.cpp:432-440`), а через импорт `freshgram.call` в Wasm-плагинах — guest-статус `-5` без ответа (`Telegram/plugins_host/src/fgpl/runtime.cpp:271-277`; `Telegram/plugins_host/src/fgpl/runtime.h:65`).
- `runtime.limits.eventTimeoutMs` — собственное время плагина на событие. Время ожидания приложения (загрузка, чтение сокета) не считается, но все вызовы одного события вместе могут ждать не дольше 60 секунд (`Telegram/plugins_sdk/README.md:102-105`).
- `time.sleep` — до 60000 мс (`Telegram/plugins_sdk/README.md:92`; `Telegram/plugins_host/src/fgpl/broker.cpp:45`).
- `ui.dialog.show`: по коду первый диалог проходит и без действия пользователя. Повторный диалог без действия пользователя и без уже открытого диалога плагина разрешён не раньше чем через 60 секунд после предыдущего (`Telegram/plugins_host/src/fgpl/broker.cpp:50`, `:755-765`). Окно, в котором действие пользователя открывает диалог, — 10 секунд (`Telegram/plugins_host/src/fgpl/broker.cpp:51`).

> [!WARNING]
> Не подтверждено запуском. README описывает только окно 10 секунд после действия пользователя или уже открытый диалог (`Telegram/plugins_sdk/README.md:97-99`), а код дополнительно разрешает первый диалог без действия пользователя и повтор не раньше чем через 60 секунд после предыдущего (`Telegram/plugins_host/src/fgpl/broker.cpp:755-765`). Какое поведение зафиксировать в README — см. OPEN-2.

- `timers.set` принимает задержку от 1000 мс до 7 суток (`Telegram/plugins_host/src/fgpl/broker.cpp:80-81`; `Telegram/plugins_sdk/README.md:85`). Флаг `repeat` необязателен: при его отсутствии брокер берёт `false` (`Telegram/plugins_host/src/fgpl/broker.cpp:2230`), и одноразовый таймер создаётся с `repeat = false` (`Telegram/plugins_host/src/fgpl/broker.cpp:2234`; `Telegram/plugins_host/src/fgpl/manager.cpp:338`). Отказ `kInvalid` с текстом `delay must be from 1000 ms to 7 days` возникает при отсутствии задержки, её выходе за границы или нелогическом значении `repeat` (`Telegram/plugins_host/src/fgpl/broker.cpp:2231-2232`). В Python-варианте `timers.set(timer_id, seconds, repeat=False)` (`Telegram/plugins_sdk/python/freshgram/__init__.py:538-544`) ложное значение `repeat` отбрасывается функцией `_given` (`Telegram/plugins_sdk/python/freshgram/__init__.py:250-251`), поэтому вызов без `repeat=True` проходит.

> [!WARNING]
> Не подтверждено запуском. README (`Telegram/plugins_sdk/README.md:85`) не требует `repeat: true`, и код его тоже не требует: отказ из-за `repeat` возможен только для нелогического значения (`Telegram/plugins_host/src/fgpl/broker.cpp:2231-2232`). Сообщение «delay must be from 1000 ms to 7 days» в таком отказе вводит в заблуждение. Какое поведение зафиксировать в README — см. OPEN-1.

- Процессорное время: `RLIMIT_CPU` по умолчанию не задаётся, потому что `cpuSeconds` равен 0 (`Telegram/plugins_host/src/fgpl/host_client.h:45`), а ветка `setrlimit` выполняется только при ненулевом значении (`Telegram/plugins_host/src/fgpl/sandbox_linux.cpp:365-367`). Ограничение выполнения задаёт epoch-дедлайн рантайма, который берётся из `runtime.limits.eventTimeoutMs` (`Telegram/plugins_host/src/fgpl/manager.cpp:1416`; `Telegram/plugins_host/src/fgpl/runtime.cpp:136-141`, `:170-171`).

- Лимиты времени и количества вызовов относятся к одному событию и сбрасываются при каждой выдаче плагину нового кадра события: счётчик вызовов возвращается к `maxCallsPerDispatch` (256), дедлайн выполнения ставится заново по `eventTimeoutMs`, а время вызовов хоста (`hostMs`) обнуляется, поэтому бюджет `maxHostCallMs` (по умолчанию 60000 мс, `Telegram/plugins_host/src/fgpl/runtime.h:24`) начинается заново (`Telegram/plugins_host/src/fgpl/runtime.cpp:501`, `:513`, `:136-141`, `:149`). Ответы на вызовы из очереди `replies` сброса не делают (`Telegram/plugins_host/src/fgpl/runtime.cpp:485-488`). Подробнее: [События](#/events).

> [!WARNING]
> Не подтверждено запуском. В коде сброс виден при выдаче следующего кадра события через `CommandInput` (`Telegram/plugins_host/src/fgpl/runtime.cpp:483-514`) и при `Invoke` (`Telegram/plugins_host/src/fgpl/runtime.cpp:348-349`). Как сбросы ведут себя при очереди событий и при долгих вызовах хоста, на запущенном плагине не проверено.

## Данные и файлы

- Хранилище (`storage.*`): до 4096 ключей, ключ до 128 байт, значение до 1 MiB, квота на плагин (`Telegram/plugins_sdk/README.md:40`; `Telegram/plugins_host/src/fgpl/broker.cpp:35-37`; проверка квоты: `Telegram/plugins_host/src/fgpl/broker.cpp:1062-1066`). Манифест: [Пакет и манифест](#/package-manifest).
- Файлы до 100 MiB в обе стороны: `net.fetch` (тело запроса и ответа), `media.get`, `messages.send_media`, `messages.edit_media`, `files.pick` и `files.save` (`Telegram/plugins_sdk/README.md:109-110`; `Telegram/plugins_host/src/fgpl/broker.cpp:40-41`, `Telegram/plugins_host/src/fgpl/broker.cpp:60`, `Telegram/plugins_host/src/fgpl/broker.cpp:76-78`).
- Файл проходит через память плагина примерно трижды: ответ, собственная копия плагина и следующий запрос. Поэтому задавайте `runtime.limits.memoryMb` с запасом (`Telegram/plugins_sdk/README.md:110-114`).
- Ограничения полей `runtime.limits` в манифесте (`Telegram/plugins_host/src/fgpl/manifest.cpp:645-647`): `memoryMb` от 1 до 1024, `eventTimeoutMs` от 10 до 60000, `storageMb` от 0 до 1024.
- Значения по умолчанию, если поле не указано: `memoryMb` — 64 MiB, `eventTimeoutMs` — 500 мс, `storageMb` — 10 MiB (`Telegram/plugins_host/src/fgpl/manifest.cpp:645-647`; `Telegram/plugins_host/src/fgpl/manifest.h:165-167`). Для Python-плагинов рантайм выделяет не меньше 128 MiB памяти независимо от `memoryMb` (`Telegram/plugins_host/src/fgpl/manager.cpp:1435`).

```json
{
  "runtime": {
    "limits": {
      "memoryMb": 128,
      "eventTimeoutMs": 2000,
      "storageMb": 20
    }
  }
}
```

Фрагмент: значения приведены как пример.

> [!WARNING]
> Не подтверждено запуском. README не называет значения по умолчанию для `memoryMb` и `eventTimeoutMs` (`Telegram/plugins_sdk/README.md:102-112`), а в коде они заданы в `Telegram/plugins_host/src/fgpl/manifest.cpp:645-646`. Что фиксировать в README — см. OPEN-20. Задавайте их явно.

- `storageMb = 0` манифест принимает (`Telegram/plugins_host/src/fgpl/manifest.cpp:647`), квота становится 0 (`Telegram/plugins_host/src/fgpl/permissions.cpp:49`: `grants.storageQuotaBytes = uint64_t(manifest.storageMb) << 20;`), и любая непустая запись отказывает с сообщением `the quota is used up` (`Telegram/plugins_host/src/fgpl/broker.cpp:1064-1065`).

> [!WARNING]
> Не подтверждено запуском. В коде квота при `storageMb = 0` равна нулю (`Telegram/plugins_host/src/fgpl/permissions.cpp:49`), а непустая запись получает отказ `the quota is used up` (`Telegram/plugins_host/src/fgpl/broker.cpp:1064-1065`). Ожидаемое поведение — см. OPEN-25.

- Файл хранилища переписывается целиком при каждом сбросе на диск, журнала изменений нет. Сброс выполняется только при наличии изменений и не раньше чем через `storageFlushMs` = 2000 мс после предыдущего сброса (`Telegram/plugins_host/src/fgpl/file_storage.cpp:175-222`; `Telegram/plugins_host/src/fgpl/manager.h:114`; `Telegram/plugins_host/src/fgpl/manager.cpp:1901-1909`).

> [!WARNING]
> Не подтверждено запуском. В коде файл переписывается целиком при каждом сбросе, журнала изменений нет (`Telegram/plugins_host/src/fgpl/file_storage.cpp:175-222`). Гарантии сохранности данных `storage.*` при сбоях — см. OPEN-24.

- Очередь событий одного плагина: до 256 событий и 256 MiB. При переполнении отбрасываются самые старые события (`Telegram/plugins_host/src/fgpl/manager.h:111-112`; `Telegram/plugins_host/src/fgpl/manager.cpp:289-295`).
- Письма между плагинами: очередь до 1024 писем. При переполнении отправка возвращает `limit` (`Telegram/plugins_host/src/fgpl/manager.cpp:26`, `Telegram/plugins_host/src/fgpl/manager.cpp:253-254`).
- Иконки: в `contributes.icons` не больше 32 значков (`Telegram/plugins_host/src/fgpl/manifest.cpp:720-721`). Файл больше 64 KiB пропускается без сообщения об ошибке, а манифест при этом проходит проверку (`Telegram/plugins_host/src/fgpl/manager.cpp:31`, `Telegram/plugins_host/src/fgpl/manager.cpp:1041-1046`; `Telegram/plugins_host/src/fgpl/manifest.cpp:709-725`).
- Габариты JPEG-картинок на стороне хоста не проверяются. `ImageSize` принимает JPEG только по сигнатуре и возвращает размеры 0×0, поэтому ограничения 128×128 для значков и 2048×2048 для картинок интерфейса к JPEG не применяются (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:106-113`; проверки: `Telegram/plugins_host/src/fgpl/ui_tree.cpp:243-248`, `:653-655`; константа `kMaxImageDimension = 2048`: `Telegram/plugins_host/src/fgpl/ui_tree.h:31`, проверка в ветке PNG функции `ImageSize`: `Telegram/plugins_host/src/fgpl/ui_tree.cpp:126`). Размеры картинки интерфейса задаёт плагин полями `width` и `height` (до 512, `Telegram/plugins_host/src/fgpl/ui_tree.cpp:656-657`), а не измеряет файл.

> [!WARNING]
> Не подтверждено запуском. В коде хоста размеры JPEG не читаются (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:106-113`). Клиент перед декодированием картинок интерфейса проверяет площадь изображения, которую сообщает декодер, не больше `kMaxPixels = 4 * 1024 * 1024` пикселей для PNG и JPEG (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:849`; функция `:848-862`, вызовы `:1472`, `:1512`). Отдельного ограничения по каждой стороне в этой функции нет. Поведение с большими JPEG при запуске не проверено.

- Меню и команды: в `contributes.menus` не больше 32 записей, в `contributes.commands` не больше 32 (`Telegram/plugins_host/src/fgpl/manifest.cpp:736`, `Telegram/plugins_host/src/fgpl/manifest.cpp:796`). Подробнее: [Интерфейс клиента](#/client-ui).
- Сбои: три сбоя за 10 минут отключают плагин (`Telegram/plugins_host/src/fgpl/manager.h:108-109`; `Telegram/plugins_host/src/fgpl/manager.cpp:2071-2074`). При ожидающем обновлении (`pendingUpdate`) и наличии предыдущей версии сбой откатывает версию, а не отключает плагин (`Telegram/plugins_host/src/fgpl/manager.cpp:2058-2070`).

## Файлы, сеть и WASI

- Каталоги пакета и рантайма доступны только для чтения. Попытка записи возвращает код ошибки `kRoFs` (69): при `path_open` с флагами создания или усечения либо с правом записи (`Telegram/plugins_host/src/fgpl/wasi_host.cpp:761-763`). Операции изменения путей и размера файла (например, `path_unlink_file`, `path_rename`, `fd_filestat_set_size`) тоже возвращают `kRoFs` (`Telegram/plugins_host/src/fgpl/wasi_host.cpp:943-983`). Вызов `fd_pwrite` возвращает `kBadf` (`Telegram/plugins_host/src/fgpl/wasi_host.cpp:984-987`).
- Сокеты WASI (`sock_accept`, `sock_recv`, `sock_send`, `sock_shutdown`) возвращают код ошибки `kNotSup` (58). Сетевые вызовы делаются через `net.*`, см. [Сеть и прокси](#/network-proxy) (`Telegram/plugins_host/src/fgpl/wasi_host.cpp:1000-1013`).
- Ограничения `net.fetch` и сокетов (методы, заголовки, таймауты) описаны на странице [Сеть и прокси](#/network-proxy).
- `poll_oneoff`, `proc_raise`, `fd_renumber` и `fd_fdstat_set_rights` возвращают код ошибки `kNoSys` (52) (`Telegram/plugins_host/src/fgpl/wasi_host.cpp:988-998`).
- Выключены возможности WebAssembly: threads, SIMD (включая relaxed SIMD), multi-memory, memory64, GC, function references, tail call, exceptions, component model, wide arithmetic и custom page sizes. Включены bulk memory, multi-value и reference types (`Telegram/plugins_host/src/fgpl/runtime.cpp:522-537`).

## Архив и версии

- Архив `.fgpl` (zip) не принимается, если в нём есть zip64, многотомность, комментарий к архиву, зашифрованные записи, методы сжатия кроме stored и deflate, ссылки и специальные файлы (для записей с атрибутами Unix) или имена с символами вне ASCII (`Telegram/plugins_host/src/fgpl/zip_reader.cpp:94-95`, `:100`, `:135`, `:136-137`, `:149-153`, `:169-171`; `Telegram/plugins_host/src/fgpl/vfs.cpp:24-43`). Подробнее: [Пакет и манифест](#/package-manifest).
- Диапазоны версий: поддерживаются `*`, `>=`, `<=`, `>`, `<`, `=` и версия без оператора; условий в одном диапазоне не больше 8. Синтаксис `^`, `~`, `||` и `x` не поддерживается (`Telegram/plugins_host/src/fgpl/semver.cpp:161-187`).

## Формат протокола

- CBOR в протоколе: теги, данные неопределённой длины и значение `undefined` не поддерживаются. Это проверено тестами хоста (`Telegram/plugins_host/tests/test_cbor.cpp:178-185`); Python-декодер SDK отвергает неподдерживаемые кодировки (`Telegram/plugins_sdk/python/freshgram/_cbor.py:108-109`).

## Языки

Подтверждён только протокол C-ABI из заголовка `Telegram/plugins_sdk/c/freshgram.h` (`Telegram/plugins_sdk/README.md:11-18`). Подробнее: [C-ABI: справочник](#/c-abi-reference). Для Python используется пакет `freshgram`: [Python SDK: справочник](#/python-sdk-reference).

## Функции, которые не работают или не используются клиентом

- Порядок пунктов меню плагинов нельзя задать из интерфейса. Клиент читает сохранённый порядок, а `setPluginMenuState` передаёт прежний (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:540`, `:2083`; `Telegram/SourceFiles/ayu/ayu_settings.cpp:1830-1836`).
- Событие `chat.opened` клиент отправляет и для секретных чатов: он их не фильтрует и передаёт флаг `secret` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:1098-1128`, флаг в строке `:1113`). Хост отбрасывает такое событие до плагина: `FilterEvent` возвращает `nullopt` при `secret` или `self` и для чата 777000 (`Telegram/plugins_host/src/fgpl/broker.cpp:2291-2298`); `chat.opened` входит в `EventIsChatScoped` (`Telegram/plugins_host/src/fgpl/manifest.cpp:448-454`), а фильтр применяется до запуска экземпляра плагина (`Telegram/plugins_host/src/fgpl/manager.cpp:2242`) и перед постановкой в очередь (`Telegram/plugins_host/src/fgpl/manager.cpp:2256`).
- Поле `style` у `ui.toast` клиент не читает. Хост переводит `style: "undo"` во флаг отмены (`Telegram/plugins_host/src/fgpl/broker.cpp:1690`, `:1703`), но клиент этот флаг не использует (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2026-2060`).
- Подпись кнопки `action.label` у `ui.toast` клиент показывает. Пустую подпись хост принимает только при `style: "undo"` (`Telegram/plugins_host/src/fgpl/broker.cpp:1708-1712`), и тогда клиент подписывает кнопку «Undo» (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2049-2051`). Подробнее: [Интерфейс клиента](#/client-ui).

> [!WARNING]
> Не подтверждено запуском. Хост пропускает пустую подпись `action.label` только при `style: "undo"` (`Telegram/plugins_host/src/fgpl/broker.cpp:1708-1712`), а клиент подставляет «Undo» при любом пустом `action.label` (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2049-2051`). README (`Telegram/plugins_sdk/README.md:91`) связывает «Undo» со `style: "undo"`. Какое поведение зафиксировать как контракт — см. OPEN-6.

## Расхождения README и кода

> [!WARNING]
> - Не подтверждено запуском. Прокси плагинов (формулировка README о том, что трафик плагина не идёт через прокси приложения): в коде есть отдельная настройка прокси для плагинов (`pluginsProxyValue`, `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:656-675`); поведение на запущенном приложении не проверено (OPEN-3). См. [Сеть и прокси](#/network-proxy).
> - Не подтверждено запуском. Датаграммы в секунду (README указывает 200 в секунду): в клиенте есть лимит `kDatagramsPerSecond = 200` (`Telegram/SourceFiles/ayu/features/plugins/plugins_transport.cpp:47`, `:1171-1172`), а в хосте отдельного лимита датаграмм нет (OPEN-4). См. [Сеть и прокси](#/network-proxy).
> - Не подтверждено запуском. Заблокированные пользователи и фильтрация событий `message.*`: проверка `FiltersController::isBlocked` есть в функции `Hidden` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:345`), для `message.*` в каталоге плагинов такой проверки не найдено (OPEN-5). См. [События](#/events).
> - Не подтверждено запуском. `onFailure`, значение по умолчанию: в коде по умолчанию `pass` (`Telegram/plugins_host/src/fgpl/manifest.cpp:846`); поведение на запущенном приложении не проверено (OPEN-19). См. [Исходящие сообщения](#/outgoing-messages).
