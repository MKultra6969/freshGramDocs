---
title: "Разрешения"
description: "Какие права объявляет плагин, как пользователь их выдаёт и как хост проверяет каждый вызов."
section: "Концепции"
order: 7
slug: "permissions"
status: "экспериментально"
---

## Зачем нужны разрешения

Плагин работает в песочнице и не имеет собственных файлов, сокетов или процессов. Любое действие — это вызов приложения, и хост проверяет его по набору прав, который пользователь выдал плагину. Так пользователь заранее видит, что плагин может делать, и может отказать в лишнем.

Проверку делает хост, независимо от языка, на котором написан плагин.

## Как это работает

1. Плагин перечисляет нужные права в блоке `permissions` манифеста.
2. При установке пользователь видит диалог: обязательные и опциональные права, области чатов и предупреждения об опасных правах.
3. Пользователь выдаёт права. Выдача действует для всех аккаунтов.
4. Хост сохраняет только права, объявленные в манифесте, и перезапускает плагин.
5. На каждый вызов хост проверяет право. Если его нет, вызов возвращает ошибку `denied`.

Установленный плагин не запускается, пока пользователь не выдал права. Если записи о выдаче нет, запуск отказывает с причиной `no permissions were granted` (`Telegram/plugins_host/src/fgpl/manager.cpp:1462-1464`).

## Объявление в манифесте

Блок `permissions` содержит два списка: `required` (обязательные) и `optional` (опциональные). Каждый элемент — объект с полями `id` и `reason`; поле `scope` допускается только у `messages.read`.

Фрагмент:

```json
"permissions": {
  "required": [
    { "id": "messages.read", "reason": "Reads messages.", "scope": "selected" }
  ],
  "optional": [
    { "id": "storage.private", "reason": "Keeps settings." }
  ]
}
```

Правила проверки манифеста:

- `id` — одно из 40 имён из таблицы в конце страницы.
- Неизвестный `id` — ошибка манифеста (`Telegram/plugins_host/src/fgpl/manifest.cpp:684-691`). При переносе плагина из другого API учтите: `net.hosts` и `net.any` манифест отвергает с ошибкой `unknown permission`, так как их нет в списке 40 идентификаторов (`Telegram/plugins_host/tests/test_manifest.cpp:198-209`).
- Одно и то же право нельзя указать дважды, даже в разных списках (`Telegram/plugins_host/src/fgpl/manifest.cpp:688-690`).
- В каждом списке не больше 64 элементов (`Telegram/plugins_host/src/fgpl/manifest.cpp:674`).
- `reason` обязателен. Это строка или словарь текстов по языкам с ключом `default` и кодами языков (`Telegram/plugins_host/src/fgpl/manifest.cpp:232-251`, `:692`). Лимит длины — 500; в коде проверяется размер строки в байтах.
- `scope` принимает значения `selected` или `all` и допустим только у `messages.read` (`Telegram/plugins_host/src/fgpl/manifest.cpp:695-700`).

### Права для событий и возможностей

Если плагин использует событие или возможность, для которой нужно право, это право должно быть объявлено. Иначе манифест не проходит проверку с ошибкой вида `message.new needs the messages.read permission` (`Telegram/plugins_host/src/fgpl/manifest.cpp:956-963`).

| Что объявлено в манифесте | Нужное право |
|---|---|
| события `message.new`, `message.edited`, `message.deleted`, `message.reaction` | `messages.read` |
| событие `chat.opened` | `chats.active` |
| события `chat.typing`, `chat.read`, `chat.member` | `chats.activity` |
| событие `user.status` | `users.presence` |
| события `app.focus`, `app.blur` | `app.activity` |
| `contributes.menus` | `ui.menu`; для поверхности `composer` дополнительно `ui.composer_button` |
| `contributes.commands` | `ui.command` |
| `contributes.settingsPage` | `ui.settings_page` |
| `activation.background` | `background` |
| `contributes.messages` | `plugins.message` |
| `contributes.translator` | `translate.provide` |
| `contributes.outgoing` | `messages.transform_outgoing` |

Источники: `Telegram/plugins_host/src/fgpl/manifest.cpp:430-446` и `:956-991`.

## Выдача пользователем

### Диалог установки

- Права делятся на обязательные и опциональные. Внутри каждой группы сначала идут права высокого уровня опасности (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3060-3064`).
- Обязательное право нельзя снять: его переключатель скрыт (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3045-3047`). Опциональное можно снять.
- При первой установке отмечены все права, включая опциональные (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3014-3018`). Это наблюдение по коду; запуском не проверено.

### Области чатов

- Переключатель «все чаты» или «выбранные». В списке выбора не больше 100 чатов (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:107`, `:2956`).
- Переключатель показывается, если объявлено хотя бы одно право, которое работает с конкретными чатами (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2923-2934`).
- Если хотя бы одно право объявлено с `scope: "selected"`, по умолчанию выбрано «выбранные», а «все» недоступно (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3089-3112`).
- Пустой выбор не даёт установить плагин (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3172-3176`).
- Право с `scope: "selected"` без выбранных чатов не выдаётся (`Telegram/plugins_host/src/fgpl/permissions.cpp:53-54`).

### Что сохраняется

- Итоговый набор — пересечение «объявлено» и «выдано» (`Telegram/plugins_host/src/fgpl/permissions.cpp:45-59`).
- Выдача одна для всех аккаунтов: она хранится под ключом `*` (`Telegram/plugins_host/src/fgpl/manager.cpp:27`, `:916-924`).
- Сохраняются только права из текущего манифеста (`Telegram/plugins_host/src/fgpl/manager.cpp:917-921`). После выдачи плагин перезапускается (`Telegram/plugins_host/src/fgpl/manager.cpp:925-928`).

> [!NOTE]
> Обязательность права обеспечивает диалог установки. Функция `PluginManager::grant` (`Telegram/plugins_host/src/fgpl/manager.cpp:903-929`) сама наличие обязательных прав не проверяет.

### Обновление плагина

- Диалог обновления помечает «new» только права, id которых не было в предыдущем манифесте (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3014`, `:3023-3024`). Список новых прав строит `NewRequests` (`Telegram/plugins_host/src/fgpl/permissions.cpp:114-134`), вызов — в `Telegram/SourceFiles/ayu/ui/boxes/plugin_install_box.cpp:172`.
- Расширение `messages.read` до `all` не помечается: `NewRequests` добавляет для него токен `messages.read:all` (`Telegram/plugins_host/src/fgpl/permissions.cpp:127-131`), а диалог сверяет этот список только с id права (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3014`).
- По умолчанию отмечены обязательные права, уже выданные права и новые права (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3014-3018`).
- Новые права отмечены в диалоге, но не выдаются автоматически: выдача сохраняется только после подтверждения (`Telegram/SourceFiles/ayu/ui/boxes/plugin_install_box.cpp:131`; `Telegram/plugins_host/src/fgpl/manager.cpp:903-929`).
- Права, которых нет в новом манифесте, удаляются из выданных (`Telegram/plugins_host/src/fgpl/manager.cpp:803-811`).

## Проверка на каждый вызов

Брокер проверяет право в двух местах:

- `has(...)` сверяет право с набором выданных прав (`Telegram/plugins_host/src/fgpl/broker.cpp:586-588`);
- `need(...)` возвращает ошибку, если права нет (`Telegram/plugins_host/src/fgpl/broker.cpp:1372-1379`).

Ответ при отказе (фрагмент):

```json
{"ok": false, "e": "denied", "m": "messages.send"}
```

В поле `m` стоит имя права (`Telegram/plugins_host/src/fgpl/broker.cpp:1374`). Вызовы `chat.info` и `messages.history` для чата вне выбранной области и для служебного чата `777000` получают `denied` с текстом `this chat` (`Telegram/plugins_host/src/fgpl/broker.cpp:1403-1404`; id служебного чата — `Telegram/plugins_host/src/fgpl/broker.h:23`).

Python (фрагмент):

```python
import freshgram
from freshgram import Denied

granted = freshgram.info()["granted"]  # список выданных прав

try:
    chats = freshgram.chats.list(limit=10)
except Denied as error:
    print(error.code, error.message)  # denied chats.list
```

Что видит плагин в событиях:

- Событие, для которого нет права, не доставляется (`Telegram/plugins_host/src/fgpl/broker.cpp:2281-2283`).
- Событие, относящееся к чату вне выбранной области, не доставляется (`Telegram/plugins_host/src/fgpl/broker.cpp:2293-2297`).
- Без `messages.read_deleted` событие `message.deleted` приходит без полей `text` и `old_text` (`Telegram/plugins_host/src/fgpl/broker.cpp:2299-2306`).

Вызовы без права:

- `meta.info` (`freshgram.info()`), `log`, `plugin.unload` и `time.sleep` не требуют права (`Telegram/plugins_host/src/fgpl/broker.cpp:897-921`, `:676`).
- `timers.*` тоже не проверяет права (`Telegram/plugins_host/src/fgpl/broker.cpp:2211-2228`).
- `meta.info` возвращает `granted` (список выданных прав) и `chats`: строку `"all"` или список id чатов в области (`Telegram/plugins_host/src/fgpl/broker.cpp:902-920`).

> [!TIP]
> Объявляйте только нужные права. Перед работой с опциональным правом проверьте `granted` через `freshgram.info()`. Если вызов вернул `denied`, покажите пользователю понятное сообщение.

## Уровни опасности

Уровень опасности задаёт цвет фона значка права в диалоге (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3006-3012`, `:3036`; `Telegram/plugins_host/src/fgpl/permissions.cpp:21-43`). Предупреждения от уровня не зависят: они строятся по набору выбранных прав (`Telegram/plugins_host/src/fgpl/permissions.cpp:61-112`; `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3152-3163`).

| Уровень | Права |
|---|---|
| Высокий | `messages.send`, `messages.transform_outgoing`, `messages.read_deleted`, `net.tcp`, `net.udp`, `background`, `fs.user_selected`, `clipboard`, `messages.edit`, `messages.delete`; `messages.read` с `scope: "all"` |
| Низкий | `storage.private`, `settings.read`, `ui.menu`, `ui.command`, `ui.settings_page`, `ui.composer_button`, `ui.dialog`, `ui.toast`, `ui.badges`, `notifications`, `messages.ids` |
| Средний | все остальные права |

Предупреждения в диалоге (`Telegram/plugins_host/src/fgpl/permissions.cpp:61-112`):

- право на чтение данных вместе с сетью: данные могут уйти в интернет;
- сеть (`net.https` или сокеты): обращения к любым публичным серверам;
- `net.tcp` и `net.udp`: собственные TCP- и UDP-соединения;
- `messages.read_deleted`: удалённые сообщения, сохранённые на устройстве;
- `messages.send`: отправка сообщений от имени пользователя;
- `messages.transform_outgoing`: изменение отправляемых сообщений;
- `messages.edit` и `messages.delete`: правка и удаление сообщений пользователя;
- `background`: работа в фоне;
- `clipboard`: буфер обмена;
- `fs.user_selected`: чтение и сохранение файлов, которые выбрал пользователь;
- `plugins.message`: обмен данными с другими плагинами.

## Квота хранилища

Квота задаётся `runtime.limits.storageMb` в манифесте: по умолчанию 10, допустимо от 0 до 1024 (`Telegram/plugins_host/src/fgpl/manifest.cpp:647`). В байтах квота равна `storageMb`, умноженному на 2^20 (`Telegram/plugins_host/src/fgpl/permissions.cpp:49`). Подробнее — на странице [Хранилище и файлы](#/storage-files).

> [!WARNING]
> Ожидаемое поведение при `storageMb: 0` не определено (OPEN-25).

При `storageMb: 0` манифест принимает значение, а по коду любая непустая запись в хранилище возвращает `quota` (`Telegram/plugins_host/src/fgpl/broker.cpp:1064`).

## Полный список прав

Все 40 идентификаторов, которые принимает манифест (`Telegram/plugins_host/src/fgpl/manifest.cpp:484-498`).

| Право | Что открывает | Опасность |
|---|---|---|
| `messages.read` | события `message.*`, текст и отправитель сообщений, `messages.reactions` | Средний (высокий при `scope: "all"`) |
| `messages.read_deleted` | удалённые сообщения, сохранённые клиентом | Высокий |
| `messages.send` | `messages.send`, `send_media`, `stickers.*`, `chats.mark_read`, `chats.action` | Высокий |
| `messages.transform_outgoing` | `messages.set_outgoing`, `drop_outgoing`, событие `message.outgoing` | Высокий |
| `media.read` | `media.get`, `media.list` | Средний |
| `chats.list` | `chats.list` | Средний |
| `chat.info` | `chat.info`, `channels.info/photo/resolve` | Средний |
| `messages.history` | `messages.history`, `messages.search` | Средний |
| `account.info` | `account.info` (без телефона) | Средний |
| `stars.balance` | `stars.balance` | Средний |
| `composer.draft` | `composer.draft`, `composer.set_draft` | Средний |
| `contacts.list` | `contacts.list` (без телефонов) | Средний |
| `settings.read` | `settings.read` (`language`, `theme`, `streamerMode`) | Низкий |
| `folders.list` | `folders.list` | Средний |
| `ui.menu` | `contributes.menus` | Низкий |
| `ui.command` | `contributes.commands` | Низкий |
| `ui.settings_page` | `ui.settings.set`; `contributes.settingsPage` | Низкий |
| `ui.composer_button` | меню с поверхностью `composer` | Низкий |
| `ui.dialog` | `ui.dialog.*`, `ui.window.*` | Низкий |
| `ui.toast` | `ui.toast`; события `toast.*` | Низкий |
| `ui.badges` | `badges.set`, `badges.clear`; `badge.click` | Низкий |
| `notifications` | `notify.show` | Низкий |
| `net.https` | `net.fetch` | Средний |
| `net.tcp` | `net.tcp.connect` и операции с TCP-сокетом | Высокий |
| `net.udp` | `net.udp.connect` и операции с UDP-сокетом | Высокий |
| `storage.private` | `storage.*` | Низкий |
| `plugins.message` | `plugins.send`, `plugins.peers` | Средний |
| `fs.user_selected` | `files.pick`, `files.save` (только после действия пользователя) | Высокий |
| `clipboard` | `clipboard.read`, `clipboard.write` (только после действия пользователя) | Высокий |
| `background` | `activation.background`, запуск при старте клиента | Высокий |
| `messages.edit` | `messages.edit`, `messages.edit_media` | Высокий |
| `messages.delete` | `messages.delete` | Высокий |
| `messages.react` | `messages.react` | Средний |
| `users.info` | `users.info`, `users.resolve`, `users.photo` | Средний |
| `chats.active` | событие `chat.opened` | Средний |
| `messages.ids` | ожидание серверного id после отправки | Низкий |
| `chats.activity` | `chat.typing`, `chat.read`, `chat.member` | Средний |
| `users.presence` | событие `user.status` | Средний |
| `app.activity` | `app.focus`, `app.blur` | Средний |
| `translate.provide` | `translate.request`, `translate.reply`; `contributes.translator` | Средний |

## Связанные страницы

- [Пакет и манифест](#/package-manifest): где лежит блок `permissions` и как он упаковывается.
- [Жизненный цикл](#/lifecycle): установка, обновление и перезапуск после выдачи прав.
- [События](#/events): какие события требуют право.
- [Хранилище и файлы](#/storage-files) и [Сеть и прокси](#/network-proxy): возможности, которые открывают права.
- [Python SDK: справочник](#/python-sdk-reference) и [C-ABI: справочник](#/c-abi-reference).
