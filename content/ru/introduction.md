---
title: "Введение"
description: "Что такое плагин freshGram, как устроена песочница, какие есть способы написать плагин и какие базовые параметры платформы."
section: "Начало"
order: 1
slug: "introduction"
status: "экспериментально"
---

## Что такое плагин freshGram

Плагин — это программа, которую клиент freshGram запускает в песочнице. Плагин получает события и выполняет действия через приложение. Собственных файлов, сокетов и процессов у плагина нет: каждое действие — это вызов приложения, и каждый вызов проверяется по разрешениям, которые выдал пользователь.

> [!NOTE]
> Документация описывает бета-версию. Имена, сигнатуры, лимиты, коды ошибок и поля манифеста могут меняться между сборками.

## Модель песочницы

- Плагин работает в песочнице хоста. Каждый его вызов к приложению проверяется по разрешениям, выданным пользователем. Подробнее — [Разрешения](#/permissions).
- Экземпляр плагина создаётся на каждую пару «плагин + аккаунт» (`Telegram/plugins_host/src/fgpl/manager.h:440-447`). Событие `init` несёт поля `account`, `plugin`, `version` и `api` (`Telegram/plugins_host/src/fgpl/manager.cpp:1640-1645`).
- Событие, вызов и сообщение относятся к тому аккаунту, из которого пришли (`Telegram/plugins_sdk/README.md:272-278`).

## Два способа написать плагин

- **Python.** Программа, которую запускает CPython, собранный для WASI. Хост запускает её как команду, сообщения передаются через stdin и stdout (`Telegram/plugins_sdk/README.md:9-10`). Пакет `freshgram` описан в [Python SDK: справочник](#/python-sdk-reference).
- **Любой язык, который собирает Wasm-реактор.** Модуль экспортирует `fg_alloc`, `fg_free`, `fg_init` и `fg_on_event` и импортирует `freshgram.call` (`Telegram/plugins_sdk/README.md:11-13`). Валидатор пакета требует экспорт `memory` и либо `fg_alloc`, `fg_init` и `fg_on_event`, либо `_start` (`Telegram/plugins_host/src/fgpl/package.cpp:172-180`). Заголовок `Telegram/plugins_sdk/c/freshgram.h` — автономная (freestanding) реализация протокола на C с хелперами для частых вызовов. Подробнее — в [C-ABI: справочник (`freshgram.h`)](#/c-abi-reference).

> [!WARNING]
> Требование экспорта `fg_free` не подтверждено кодом (OPEN-15): README называет его обязательным, а валидатор пакета и загрузчик его не требуют (`Telegram/plugins_host/src/fgpl/runtime.cpp:766-773`).

## Как выглядит плагин

Фрагмент из `Telegram/plugins_sdk/README.md:464-477` без блока `on_init`:

```python
import freshgram

@freshgram.on("message.*")
def message(event):
    count = freshgram.storage.get("count", 0) + 1
    freshgram.storage.set("count", count)

freshgram.run()
```

Пример целиком, с `on_init`, — на странице [Быстрый старт: Python](#/quickstart-python).

## Формат обмена

Обмен с хостом идёт в формате CBOR (подмножество RFC 8949): целые числа, байтовые и текстовые строки, массивы, словари с текстовыми ключами, булевы значения, `null` и числа с плавающей точкой. Теги и неопределённая длина не поддерживаются (`Telegram/plugins_sdk/README.md:22-23`). Запрос — словарь `{"op": "<имя>", "a": {<аргументы>}}`. Ответ — `{"ok": true, "v": <значение>}` или `{"ok": false, "e": <код>, "m": <текст>}` (`Telegram/plugins_sdk/README.md:25-26`). Python-пакет формирует такие запросы сам (`Telegram/plugins_sdk/python/freshgram/__init__.py:35`), поэтому при работе через него знать этот формат не обязательно.

## Манифест

- В манифесте нет полей ОС и архитектуры (`Telegram/plugins_sdk/README.md:116`).
- Если плагину нужна возможность приложения, её перечисляют в `compat.requires` (`Telegram/plugins_host/src/fgpl/manifest.cpp:610`). Подробнее — [Пакет и манифест](#/package-manifest).

## Базовые параметры

| Параметр | Значение | Источник |
|---|---|---|
| Уровень API | 4 | `Telegram/plugins_host/src/fgpl/manifest.h:196` |
| Версия клиента | 7.5.10 beta | `changelog.txt:1` |
| Платформа хоста и рантайма | Linux, x86_64 и aarch64 | `Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:50-54` |
| Песочница | Landlock; без него состояние `NoSandbox` | `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:214-215` |
| Плагины по умолчанию | выключены | `Telegram/SourceFiles/ayu/ayu_settings.h:1131` |

Текст клиента для случая без Landlock: «Нужен Linux 5.13 или новее с включённым Landlock» (`Telegram/Resources/langs/fresh/ru.strings:91`).

> [!WARNING]
> Поведение плагинов на Windows: не подтверждено кодом (OPEN-21). Исполняемый файл хоста плагинов собирается только для Linux (`Telegram/plugins_host/CMakeLists.txt:98`), а клиентская часть плагинов подключается только под Linux (`Telegram/plugins_host/app.cmake:2-4`).

## Что можно делать

- **Сообщения и чаты** — [События](#/events) и [Исходящие сообщения](#/outgoing-messages).
- **Пользователи и каналы** — [Python SDK: справочник](#/python-sdk-reference).
- **Сеть** — [Сеть и прокси](#/network-proxy).
- **Хранилище и файлы** — [Хранилище и файлы](#/storage-files).
- **Интерфейс клиента** — [Интерфейс клиента](#/client-ui): меню, команды, окна, страница настроек, тосты.

## Карта модулей

| Модуль | Что внутри | Страница |
|---|---|---|
| `freshgram` | декораторы `on_init`, `on`, `on_settings_open`, `on_dialog`, `on_window`, `on_timer`, `on_chat_opened` и другие; функции `run` и `log` | [Python SDK: справочник](#/python-sdk-reference) |
| `freshgram.aio` | асинхронные (awaitable) версии вызовов; плагин продолжает обрабатывать другие события, пока вызов ждёт ответа | [Python SDK: справочник](#/python-sdk-reference) |
| `freshgram.storage` | хранилище плагина | [Хранилище и файлы](#/storage-files) |
| `freshgram.net` | сеть | [Сеть и прокси](#/network-proxy) |
| `freshgram.ui` | интерфейс клиента | [Интерфейс клиента](#/client-ui) |
| `freshgram.messages`, `freshgram.chats`, `freshgram.users`, `freshgram.channels`, `freshgram.timers`, `freshgram.account` и другие namespace-объекты | вызовы приложения по разделам | [Python SDK: справочник](#/python-sdk-reference) |

## Порядок чтения

1. Введение — эта страница.
2. [Быстрый старт: Python](#/quickstart-python)
3. [Пакет и манифест](#/package-manifest)
4. [Разрешения](#/permissions)
5. [Python SDK: справочник](#/python-sdk-reference)
6. [Хранилище и файлы](#/storage-files)
7. [События](#/events)
8. [Интерфейс клиента](#/client-ui)
9. [Исходящие сообщения](#/outgoing-messages)
10. [Ограничения и WIP](#/limits-wip)
11. [FAQ](#/faq)

Для C — [C-ABI: справочник (`freshgram.h`)](#/c-abi-reference).
