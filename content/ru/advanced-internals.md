---
title: "Продвинутое: WASM/WASI и сборка рантайма"
description: "Как freshGram запускает плагины: движок Wasmtime, песочница хоста, загрузка модулей, кэш, WASI-импорты, индекс и бандл рантайма и его сборка для мейнтейнеров."
section: "Внутренности"
order: 18
slug: "advanced-internals"
status: "экспериментально"
---

Эта страница описывает, что происходит между установкой плагина и вызовом его кода. Для написания плагина эти детали не нужны: начните с [введения](#/introduction) и [быстрого старта на Python](#/quickstart-python). Страница адресована тем, кто тестирует механизм запуска или собирает рантайм.

> [!NOTE]
> Ссылки вида `Telegram/...:строка` ведут к исходникам от корня репозитория. Раздел о сборке рантайма нужен мейнтейнерам.

## Общая схема

Плагин не исполняется в процессе приложения. Приложение запускает отдельный процесс `fgpl_plugin_host`, связанный с приложением сокетом на дескрипторе 3. Внутри хоста работает Wasmtime, который исполняет модуль плагина: WebAssembly-файл или CPython для WASI (`python.wasm`). Кроме WASI-функций из разрешённого списка, модуль может импортировать только `freshgram.call`.

Схема (фрагмент):

```text
приложение (Telegram/SourceFiles/ayu/features/plugins)
  └─ fgpl_plugin_host: отдельный процесс, сокет на дескрипторе 3
       ├─ ограничения ОС: rlimits, Landlock, seccomp
       └─ Wasmtime: модуль плагина (.wasm) или python.wasm (CPython для WASI)
            └─ импорты: freshgram.call и функции wasi_snapshot_preview1 из списка
```

Запуск проходит в четыре шага:

1. Приложение проверяет подписанный индекс рантайма и хэш хоста, затем запускает хост с пустым окружением (Telegram/plugins_host/src/fgpl/host_client.cpp:151-197; Telegram/plugins_host/src/fgpl/host_client.cpp:253).
2. Хост накладывает ограничения и отправляет приложению кадр `hello` с их результатами (Telegram/plugins_host/src/fgpl/host_main.cpp:378-389).
3. Модуль загружается в Wasmtime: проверяются размер, импорты и экспорты (Telegram/plugins_host/src/fgpl/runtime.cpp:653-774).
4. Модуль работает в одном из двух режимов: reactor или command.

## Движок Wasmtime

Версия движка: 50.0.0 (Telegram/plugins_host/CMakeLists.txt:13; Telegram/plugins_host/runtime/build_bundle.sh:5). Хост сообщает её приложению в поле `engine` кадра `hello` (Telegram/plugins_host/src/fgpl/host_main.cpp:382-389).

Настройки движка (Telegram/plugins_host/src/fgpl/runtime.cpp:517-550):

- прерывание по эпохам включено, учёт топлива (fuel) выключен; фоновый поток увеличивает эпоху каждые 10 мс (Telegram/plugins_host/src/fgpl/runtime.cpp:42-53, 66);
- стек WebAssembly ограничен 512 КиБ (Telegram/plugins_host/src/fgpl/runtime.h:29; Telegram/plugins_host/src/fgpl/runtime.cpp:521);
- включены bulk memory, multi-value и reference types (Telegram/plugins_host/src/fgpl/runtime.cpp:535-537);
- выключены потоки, SIMD, multi-memory, memory64, GC, function references, исключения, component model, tail calls и wide arithmetic (Telegram/plugins_host/src/fgpl/runtime.cpp:522-534);
- флаг `--winch` переключает стратегию компиляции на Winch (Telegram/plugins_host/src/fgpl/host_main.cpp:354-355; Telegram/plugins_host/src/fgpl/runtime.cpp:541-543).

### Таймауты и бюджеты

Дедлайн выставляется в тиках эпохи по формуле `ms / 10 + 1` (Telegram/plugins_host/src/fgpl/runtime.cpp:136-141). Лимиты собраны в структуре `RuntimeLimits` (Telegram/plugins_host/src/fgpl/runtime.h:17-26):

- `callTimeoutMs` — бюджет одного события. Значение задаёт поле `eventTimeoutMs` манифеста (Telegram/plugins_host/src/fgpl/manager.cpp:1416).
- `startTimeoutMs` — бюджет запуска командного модуля, по умолчанию 10000 мс (Telegram/plugins_host/src/fgpl/runtime.h:20; Telegram/plugins_host/src/fgpl/runtime.cpp:579).
- `maxCallsPerDispatch` — 256 обращений к хосту на одно событие. Сверх лимита хост возвращает ошибку `limit` (Telegram/plugins_host/src/fgpl/runtime.h:23; Telegram/plugins_host/src/fgpl/runtime.cpp:435-440).
- `maxHostCallMs` — 60000 мс суммарного времени хост-вызовов на одно событие. Время, проведённое в хост-вызовах, не списывается с бюджета модуля (Telegram/plugins_host/src/fgpl/runtime.h:24; Telegram/plugins_host/src/fgpl/runtime.cpp:160-168, 441-446).
- `maxMessageBytes` — 128 МиБ на одно сообщение (Telegram/plugins_host/src/fgpl/runtime.h:22).

## Загрузка модуля

Проверки при загрузке (Telegram/plugins_host/src/fgpl/runtime.cpp:653-774):

- Размер `.wasm` не больше 32 МиБ. Предкомпилированный образ может быть в четыре раза больше, то есть 128 МиБ (Telegram/plugins_host/src/fgpl/runtime.h:21; Telegram/plugins_host/src/fgpl/runtime.cpp:663-668).
- Память ограничивается через `store.limiter` значением `memoryBytes` (Telegram/plugins_host/src/fgpl/runtime.cpp:678). Для плагина оно берётся из поля `memoryMb` манифеста (Telegram/plugins_host/src/fgpl/manager.cpp:1415). Для Python память не меньше 128 МиБ (Telegram/plugins_host/src/fgpl/manager.cpp:1435).
- Импорты сверяются с набором, который создаёт `LinkHost` (Telegram/plugins_host/src/fgpl/runtime.cpp:319-333, 694-704). Импорт вне набора даёт ошибку `ForbiddenImport`. Тот же список проверяется при разборе пакета (Telegram/plugins_host/src/fgpl/package.cpp:160-180; Telegram/plugins_host/src/fgpl/abi.h:8-32).
- Предоткрытые каталоги: `plugin` и `runtime` (Telegram/plugins_host/src/fgpl/runtime.cpp:680-692).
- Экспорты:
  - `memory` обязателен;
  - reactor: обязательны `fg_alloc`, `fg_init` и `fg_on_event`, необязателен `fg_free`;
  - command: если нет `fg_on_event`, но есть `_start`, модуль запускается как командный (Telegram/plugins_host/src/fgpl/runtime.cpp:725-773).

> [!WARNING]
> Расхождение README и кода: README (Telegram/plugins_sdk/README.md:11-12) называет `fg_free` обязательным, а загрузчик (Telegram/plugins_host/src/fgpl/runtime.cpp:766-773) его не требует. Какое из двух правил верно, не подтверждено (OPEN-15).

### Режим reactor

Сообщение в CBOR копируется в память модуля через `fg_alloc`, после чего вызывается `fg_init` или `fg_on_event` с указателем и длиной (Telegram/plugins_host/src/fgpl/runtime.cpp:335-360, 560-566).

Модуль обращается к хосту через `freshgram.call` с четырьмя аргументами типа `int32` (Telegram/plugins_host/src/fgpl/runtime.cpp:323-331).

### Режим command

Python-плагин запускается в режиме command (Telegram/plugins_sdk/README.md:9-10; Telegram/plugins_host/src/fgpl/runtime.cpp:568-593, 736-745).

Хост передаёт модулю кадры через stdin, модуль отвечает кадрами в stdout (дескриптор 1). Вывод в другие дескрипторы попадает в журнал (Telegram/plugins_host/src/fgpl/runtime.cpp:397-422, 483-515).

Кадр состоит из 4-байтовой длины в порядке big-endian и тела в CBOR (Telegram/plugins_host/src/fgpl/runtime.cpp:381-395). Схема (фрагмент):

```text
[длина тела: 4 байта, big-endian][тело: CBOR-словарь]
```

Хост отправляет модулю словари с полями `t` (`init` или `event`), `id` и `v`. Модуль отправляет `call` (хост отвечает `reply`) и `done` с полем `status`, когда событие завершено (Telegram/plugins_host/src/fgpl/runtime.cpp:432-473, 502-507). Размер кадра ограничен `maxMessageBytes` (Telegram/plugins_host/src/fgpl/runtime.cpp:413).

Python SDK читает `sys.stdin.buffer`, пишет в `sys.stdout.buffer`, а `sys.stdout` перенаправляет в `sys.stderr` (Telegram/plugins_sdk/python/freshgram/_channel.py:6-8).

> [!WARNING]
> Протокол для командных модулей, написанных не на Python, не подтверждён кодом (OPEN-27). Описанное выше реализовано хостом, но то, как такой модуль должен быть устроен, в коде не подтверждено.

## Песочница

### Платформы

Хост собирается только для Linux (Telegram/plugins_host/CMakeLists.txt:98-102). Код песочницы поддерживает архитектуры x86_64 и aarch64 (Telegram/plugins_host/src/fgpl/sandbox_linux.cpp:50-55). Приложение считает песочницу доступной, если ядро поддерживает Landlock (Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:1011-1018). Без неё плагины переходят в состояние `NoSandbox` (Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:211-215).

> [!WARNING]
> Поведение интерфейса на Windows не подтверждено кодом (OPEN-21).

### Запуск хоста

- Бинарник хоста сверяется с `hostSha256` из подписанного индекса. Затем он копируется в запечатанный memfd, где запрещены запись и изменение размера, и все хосты стартуют из этой копии (Telegram/plugins_host/src/fgpl/host_client.cpp:151-197; Telegram/plugins_host/RUNTIME.md:55-58).
- Если `/proc/sys/vm/memfd_noexec` равен `2`, хост запускается из проверенного файла (Telegram/plugins_host/src/fgpl/host_client.cpp:35-44, 180-182).
- Окружение хоста пустое (Telegram/plugins_host/src/fgpl/host_client.cpp:253). Дескриптор 3 используется для IPC, дескриптор 4 для исполняемого файла (Telegram/plugins_host/src/fgpl/host_client.cpp:27-28, 208, 219).
- Аргументы командной строки включают `--ipc-fd=3`, а также `--address-space-mb`, `--cpu-seconds` и `--reservation-mb`, если они заданы (Telegram/plugins_host/src/fgpl/host_client.cpp:224-244).

### Три слоя

Хост накладывает три слоя: rlimits, Landlock и seccomp (Telegram/plugins_host/src/fgpl/host_main.cpp:368-381).

rlimits (Telegram/plugins_host/src/fgpl/sandbox_linux.cpp:353-370):

- `RLIMIT_CORE`, `RLIMIT_FSIZE`, `RLIMIT_MEMLOCK` и `RLIMIT_MSGQUEUE` равны 0;
- `RLIMIT_NOFILE` равен 8 (Telegram/plugins_host/src/fgpl/sandbox_linux.h:19);
- `RLIMIT_AS` равен `addressSpaceMb`: по умолчанию 1024 МиБ (Telegram/plugins_host/src/fgpl/host_client.h:41), для Python не меньше 2048 МиБ (Telegram/plugins_host/src/fgpl/manager.cpp:1634-1637);
- `RLIMIT_CPU` ставится, если задано `cpuSeconds`.

Landlock (Telegram/plugins_host/src/fgpl/sandbox_linux.cpp:371-402): набор правил объявляет все классы файловых прав как обрабатываемые. Начиная с ABI 4 обрабатываются и сетевые права (маска `kNetMask`, Telegram/plugins_host/src/fgpl/sandbox_linux.cpp:40, 379). Правила не добавляются, поэтому обрабатываемые действия запрещены.

seccomp (Telegram/plugins_host/src/fgpl/sandbox_linux.cpp:172-265, 418-425):

- сначала проверяется архитектура процесса; несовпадение завершает процесс (`SECCOMP_RET_KILL_PROCESS`);
- вызов вне списка разрешённых тоже завершает процесс;
- `read` разрешён только на IPC-дескрипторе; `write` разрешён на IPC-дескрипторе и на stderr, поскольку `allowStderr` включён по умолчанию (Telegram/plugins_host/src/fgpl/sandbox_linux.h:18);
- `futex` разрешён только для нескольких операций, `tgkill` только для собственного процесса;
- фильтр ставится с флагом `SECCOMP_FILTER_FLAG_TSYNC`, то есть действует на все потоки.

Если включены все три слоя и хотя бы один не сработал, хост завершается с сообщением `the sandbox is incomplete` (Telegram/plugins_host/src/fgpl/host_main.cpp:378-381). Ошибка на этапе наложения rlimits или Landlock тоже завершает хост (Telegram/plugins_host/src/fgpl/host_main.cpp:368-371).

> [!NOTE]
> Сборка `fgpl_plugin_host_unsandboxed` с флагом `--layers=none` предназначена только для тестов. Она собирается при `FGPL_BUILD_TESTS` и без `FGPL_HOST_ONLY`, а флаг `--layers=none` принимается только в ней (Telegram/plugins_host/CMakeLists.txt:103-106; Telegram/plugins_host/src/fgpl/host_main.cpp:336-341).

## Кэш модулей

Каталог кэша: `tdata/plugins/cache` (Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:197).

Ключ кэша (fingerprint) имеет вид `engine=<версия Wasmtime>;format=1;...;reservation=<N>`, где на месте многоточия стоят дополнительные аргументы хоста (Telegram/plugins_host/src/fgpl/cached_load.cpp:8-17).

Имя файла: `<SHA-256 модуля в hex>.cwasm`. Содержимое файла по порядку (фрагмент):

```text
магическая строка FGPLCWM1 (8 байт)
длина ключа (4 байта, little-endian) и текст ключа
SHA-256 модуля (32 байта)
длина образа (8 байт, little-endian) и сам образ
HMAC-SHA256 всего содержимого выше (32 байта)
```

Ключ HMAC задаётся полем `CacheSettings.secret` (Telegram/plugins_host/src/fgpl/module_cache.cpp:14, 48-55, 114-128; Telegram/plugins_host/src/fgpl/cached_load.h:21-25).

При чтении сначала проверяются HMAC (сравнение за постоянное время), магическая строка, ключ, SHA-256 модуля и длина образа (Telegram/plugins_host/src/fgpl/module_cache.cpp:57-102).

При промахе модуль компилируется хостом-компилятором с ограничением 128 МиБ на результат и тайм-аутом 120000 мс (Telegram/plugins_host/src/fgpl/cached_load.cpp:57-62; Telegram/plugins_host/src/fgpl/host_client.h:78-83). Результат пишется во временный файл, который затем переименовывается. Если кэшированный образ не загрузился, файл удаляется и модуль загружается напрямую (Telegram/plugins_host/src/fgpl/cached_load.cpp:43-55, 77-82).

После записи, если суммарный размер файлов `.cwasm` превышает `maxTotalBytes` (256 МиБ), удаляются файлы с самым ранним временем записи (Telegram/plugins_host/src/fgpl/cached_load.cpp:69-70; Telegram/plugins_host/src/fgpl/module_cache.cpp:157-187; Telegram/plugins_host/src/fgpl/cached_load.h:24).

## Файловая система модуля (VFS)

Ограничения (Telegram/plugins_host/src/fgpl/vfs.h:31-39): 16384 файла, 4096 каталогов, глубина 32, длина имени 128, длина пути 512, суммарный объём 256 МиБ, 64 открытых дескриптора.

Операции, которые создают или удаляют каталоги, переименовывают или удаляют файлы, меняют размер или время файла, возвращают код «только для чтения» (Telegram/plugins_host/src/fgpl/wasi_host.cpp:936 и далее).

## WASI

Разрешённый набор функций задан в `AllowedWasiImports()` (Telegram/plugins_host/src/fgpl/abi.h:8-24). Он включает семейства `args_*`, `environ_*`, `clock_*`, `fd_*`, `path_*` и `sock_*`, а также `poll_oneoff`, `proc_exit`, `proc_raise`, `random_get` и `sched_yield`.

- Часы: `id` 0 означает реальное время, 1 — монотонное. Значение округляется до 1 мс (Telegram/plugins_host/src/fgpl/wasi_host.cpp:62, 287-311).
- `random_get` берёт случайные байты из `std::random_device`. Длина ограничена `maxMessageBytes` (Telegram/plugins_host/src/fgpl/wasi_host.cpp:327-351; Telegram/plugins_host/src/fgpl/runtime.cpp:683).
- `proc_exit(N)` превращается в ловушку с причиной «the plugin called proc_exit(N)» (Telegram/plugins_host/src/fgpl/wasi_host.cpp:356-368). В командном режиме код 0 считается штатным завершением (Telegram/plugins_host/src/fgpl/runtime.cpp:583-590).

Аргументы и переменные окружения:

- для wasm-модуля список аргументов и переменных окружения пуст, потому что манифест их не задаёт (Telegram/plugins_host/src/fgpl/manager.cpp:1417-1420);
- для Python запуск выглядит так (фрагмент, Telegram/plugins_host/src/fgpl/manager.cpp:1425-1434):

```text
args: python -S -B /plugin/<entry>
env:  PYTHONHOME=/runtime
      PYTHONPATH=/runtime/sdk:/plugin
      PYTHONDONTWRITEBYTECODE=1, PYTHONNOUSERSITE=1, PYTHONUTF8=1,
      PYTHONUNBUFFERED=1, PYTHONHASHSEED=0
```

## Индекс рантайма и бандл

Бандл — zip-архив, в котором лежат `fgpl_plugin_host`, `python/python.wasm` вместе с `python/lib/...` и `sdk/freshgram/...` (Telegram/plugins_host/RUNTIME.md:32-38).

Индекс `runtime.json` — JSON-объект. Фрагмент с его структурой (значения заменены многоточием):

```json
{
  "schema": 1,
  "revision": …,
  "minRevision": …,
  "host": 1,
  "wasmtime": "50.0.0",
  "python": "3.14.7",
  "revoked": [],
  "bundles": {
    "linux-x86_64": {
      "post": …,
      "sha256": "…",
      "size": …,
      "hostSha256": "…",
      "pythonSha256": "…"
    }
  }
}
```

Правила проверки индекса:

- допустимы только поля из списка `kIndexKeys`, лишнее поле отвергается (Telegram/plugins_host/src/fgpl/runtime_bundle.cpp:25-26, 116-119);
- подпись обязательна: поле `signature` с `alg` равным `ed25519` и значением в base64 длиной 64 байта (Telegram/plugins_host/src/fgpl/runtime_bundle.cpp:121-138);
- бандлов от 1 до 16 (Telegram/plugins_host/src/fgpl/runtime_bundle.cpp:177-178);
- ревизия принимается, если она не меньше `minRevision` и не входит в `revoked` (Telegram/plugins_host/src/fgpl/runtime_bundle.cpp:218-221);
- политика сохраняется рядом с установкой и только ужесточается: минимальная ревизия не понижается, список отозванных растёт (Telegram/plugins_host/src/fgpl/runtime_bundle.cpp:223-245).

Установка (Telegram/plugins_host/src/fgpl/runtime_bundle.cpp:309-374; Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:1083):

1. Архив распаковывается в каталог `staging-<pid>` внутри `tdata/plugins/runtime`.
2. В этот каталог записываются `installed.json` и `index.json`, затем каталог переименовывается в `rev-<N>`.
3. Симлинк `current` переключается на новую ревизию. Затем удаляются каталоги `rev-<M>`, где `M` меньше `N−1` (`N` — номер новой ревизии), а каталог предыдущей ревизии `rev-<N−1>` сохраняется (Telegram/plugins_host/src/fgpl/runtime_bundle.cpp:361-374).

Хэши `fgpl_plugin_host` и `python/python.wasm` записываются в индекс (Telegram/plugins_host/runtime/build_bundle.sh:204). Перед запуском плагина приложение сверяет хост с `hostSha256` (Telegram/plugins_host/RUNTIME.md:55-58; Telegram/plugins_host/src/fgpl/host_client.cpp:151-197). Перед запуском Python-плагина дополнительно сверяется `python/python.wasm` с `pythonSha256` (Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:192; Telegram/plugins_host/src/fgpl/manager.cpp:1380-1386).

> [!WARNING]
> Файлы `python/lib/**` и `sdk/**` по хэшам не проверяются. Функция `VerifyInstalledRuntime` (Telegram/plugins_host/src/fgpl/runtime_bundle.cpp:440) в коде приложения не вызывается, её используют только тесты (Telegram/plugins_host/tests/test_runtime_bundle.cpp:165, 171).

> [!WARNING]
> Какие модули стандартной библиотеки CPython работают под WASI, не подтверждено кодом (OPEN-22). В репозитории этот список не перечислен.

Пакеты, которые не загружают исполняемые файлы (например, дистрибутивные), собирают приложение с `-DFRESHGRAM_RUNTIME_DIR=<каталог>`. Тогда рантайм ставится только из этого каталога (Telegram/plugins_host/RUNTIME.md:71-77).

## Сборка рантайма (для мейнтейнеров)

### Требования

- Docker. Сборка идёт в образе `rockylinux:8` (Telegram/plugins_host/runtime/Dockerfile:1; Telegram/plugins_host/RUNTIME.md:14-19).
- Версии закреплены в скрипте: Wasmtime 50.0.0 (отдельный архив для каждой архитектуры с закреплённым SHA-256), CPython 3.14.7 для WASI (архив `wasi_sdk-24` с закреплённым SHA-256), `HOST_VERSION=1`, максимальная версия glibc 2.28 (Telegram/plugins_host/runtime/build_bundle.sh:5-18).
- Скачанные архивы проверяются по SHA-256. При несовпадении сборка останавливается (Telegram/plugins_host/runtime/build_bundle.sh:56-67).

### Запуск

Команда из Telegram/plugins_host/RUNTIME.md:11:

```bash
runtime/build_bundle.sh <revision> [--arch x86_64|aarch64] [--min-revision N] [--out DIR] [--skip-tests]
```

- `<revision>` — целое число, а `--min-revision` не больше него (Telegram/plugins_host/runtime/build_bundle.sh:27, 43).
- `--arch` ограничивает сборку одной архитектурой. По умолчанию собираются обе (Telegram/plugins_host/runtime/build_bundle.sh:33, 36).
- `--out` по умолчанию указывает на `$HOME/freshgram-runtime` (Telegram/plugins_host/runtime/build_bundle.sh:31).
- Каталог `DIR/rev-<revision>` не должен существовать: скрипт его не перезаписывает (Telegram/plugins_host/runtime/build_bundle.sh:49-54).

Результат (Telegram/plugins_host/runtime/build_bundle.sh:192-212):

- `runtime-linux-<arch>.zip` для каждой архитектуры;
- `runtime.unsigned.json` с описанием бандлов. Вместо идентификаторов постов в нём стоят заглушки `POST_ID_X86_64` и `POST_ID_AARCH64` (Telegram/plugins_host/runtime/build_bundle.sh:197, 204). Заглушки записаны без кавычек, поэтому до их замены файл не является корректным JSON.

### Подпись

Команды из Telegram/plugins_host/RUNTIME.md:61-62:

```bash
fgpl_tool keygen runtime
fgpl_tool sign-runtime runtime.json runtime.key runtime.signed.json
```

- Ключ `runtime.key` хранится офлайн (Telegram/plugins_host/RUNTIME.md:89).
- Приложение собирается с `-DFRESHGRAM_RUNTIME_KEY=<публичный ключ>`. Без него приложение отказывается скачивать рантайм (Telegram/plugins_host/RUNTIME.md:87-89).
- Ключ подписи плагинов отделён от ключа рантайма (Telegram/plugins_host/RUNTIME.md:93-94).

### Тесты

- Для x86_64 тесты запускаются в контейнере командой `ctest --test-dir /out --output-on-failure -j4` (Telegram/plugins_host/runtime/build_bundle.sh:127).
- Для aarch64 наборы, не требующие песочницы, запускаются под `qemu-aarch64`, если он установлен. Наборы песочницы требуют ядра aarch64 (Telegram/plugins_host/runtime/build_bundle.sh:129-148; Telegram/plugins_host/RUNTIME.md:21-25).

> [!WARNING]
> Флаг `-j4` запускает тесты параллельно и нагружает процессор. Чтобы пропустить тесты, передайте `--skip-tests` (Telegram/plugins_host/runtime/build_bundle.sh:39, 127).

Проверка хоста (Telegram/plugins_host/runtime/build_bundle.sh:151-166): разрешены только `libc.so.6`, `libm.so.6`, `libpthread.so.0`, `libdl.so.2` и загрузчик архитектуры, а требуемая версия glibc не выше 2.28.

### Публикация

Порядок из Telegram/plugins_host/RUNTIME.md:81-85:

1. Каждый zip публикуется в канале `@freshgram_runtime` как файл, а не как медиа. Записываются идентификаторы постов.
2. Идентификаторы подставляются в `bundles.*.post`, после чего индекс подписывается.
3. Подписанный `runtime.signed.json` публикуется как файл и закрепляется. Приложение читает только закреплённый пост.

## Что дальше

- [Пакет и манифест](#/package-manifest): поля `memoryMb` и `eventTimeoutMs`, из которых берутся лимиты модуля.
- [Жизненный цикл](#/lifecycle): установка, обновление и откат плагинов.
- [C-ABI: справочник](#/c-abi-reference): экспорты модуля `fg_alloc`, `fg_init`, `fg_on_event`.
- [Ограничения и WIP](#/limits-wip): сводка лимитов и известных пробелов.
