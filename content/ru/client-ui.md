---
title: "Интерфейс клиента"
description: "Что плагин может добавить в интерфейс freshGram: пункты меню, команды, кнопки у поля ввода, бейджи, диалоги и окна, страницу настроек и тосты."
section: "Возможности"
order: 13
slug: "client-ui"
status: "экспериментально"
---

Плагин не запускает код в окнах клиента. Он присылает данные: пункты меню, дерево элементов для диалога, окна или страницы настроек, значки рядом с именами. Клиент сам рисует их и подписывает именем плагина. Так плагин может сделать интерфейс, не получая доступа к окнам приложения.

Каждая возможность требует своего разрешения (см. [Разрешения](#/permissions)). Где нужна декларация, она делается в блоке `contributes` манифеста (см. [Пакет и манифест](#/package-manifest)).

| Возможность | Что видит пользователь | Разрешение | Объявление |
|---|---|---|---|
| Пункты меню | пункт в меню сообщения, чата, профиля, в главном меню или в меню трея | `ui.menu` | `contributes.menus` |
| Кнопки у поля ввода | кнопки рядом с полем ввода сообщения | `ui.menu` и `ui.composer_button` | `contributes.menus` с `surface: "composer"` |
| Команды | подсказка в поле ввода и вызов `/имя` | `ui.command` | `contributes.commands` |
| Бейджи | значки рядом с именем пользователя, группы или канала | `ui.badges` | вызов `badges.set` |
| Диалоги и окна | модальный диалог или окно с деревом элементов | `ui.dialog` | вызовы `ui.dialog.show`, `ui.window.show` |
| Страница настроек | страница в деталях плагина | `ui.settings_page` | `contributes.settingsPage: true` |
| Тосты | всплывающее сообщение, в том числе с кнопкой | `ui.toast` | вызов `ui.toast` |

Фрагмент манифеста из `Telegram/plugins_sdk/README.md`: для него нужны `ui.menu` и `ui.composer_button`.

```json
"contributes": {
  "icons": { "spark": "icons/spark.svg" },
  "menus": [
    { "surface": "composer", "id": "tr", "title": "Translate", "icon": "translate" },
    { "surface": "message", "id": "save", "title": "Save note", "icon": "spark" }
  ]
}
```

## Состояние плагинов в настройках

Пользователь включает плагины тумблером «Enable plugins» на странице «Плагины». Текст под тумблером зависит от состояния системы. Проверки идут в таком порядке: плагины выключены, нет Landlock, нет установленных компонентов, клиент заблокирован паролем, всё готово (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:211-222`). Тексты ниже — строки из `Telegram/Resources/langs/lang.strings`, цитируются дословно. Выбор текста по состоянию: `Telegram/SourceFiles/ayu/ui/settings/plugins_settings.cpp:43-57`.

| Состояние | Когда | Что написано на странице |
|---|---|---|
| `Disabled` | плагины выключены | `Plugins run in a separate sandboxed process and can use only what you allow them.` |
| `NoSandbox` | нет Landlock | `Plugins need Landlock to run in their sandbox, and this system does not provide it. Use Linux 5.13 or newer with Landlock enabled.` |
| `NoRuntime` | нет установленных компонентов плагинов | `The plugin components are not installed yet.` |
| `NoKey` | клиент заблокирован паролем | `Plugins start after the app is unlocked.` |
| `Ready` | всё готово | то же, что при `Disabled` |

В сборке без поддержки плагинов состояние `Unavailable`: «Plugins are not supported in this build.» (`Telegram/Resources/langs/lang.strings:8904`).

> [!WARNING]
> Песочница строится на Landlock, который есть в Linux. Поведение страницы на Windows не подтверждено запуском (OPEN-21). В коде состояние `NoSandbox` выбирается через `SandboxSupported()` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:214`), а она возвращает `LandlockAbi() > 0` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:1013`). Условий по платформе (`Q_OS_WIN` и т.п.) в этом файле нет; `LandlockAbi()` реализован только в `Telegram/plugins_host/src/fgpl/sandbox_linux.cpp:330`, а этот файл собирается только для Linux (`Telegram/plugins_host/CMakeLists.txt:60-65`).

Если компоненты нужно установить или обновить, при включении тумблера клиент предлагает их загрузить (окно «Download the plugin components?»). Если проверка не удалась, показывается тост с причиной (`Telegram/SourceFiles/ayu/ui/settings/plugins_settings.cpp:276-321`).

Список «Installed plugins» содержит строку на каждый плагин: версию и статус. Возможные статусы (строки из `Telegram/Resources/langs/lang.strings`): `Running`, `Starts when needed`, `Off`, `Stopped`, `Disabled: {reason}`, `Stopped after an error: {reason}`, `Failed, retry in {seconds} s: {reason}`, `Cannot be read: {reason}`. К строке добавляется `outdated`, если плагин устарел. Выбор статуса: `Telegram/SourceFiles/ayu/ui/settings/plugins_settings.cpp:70-107`. Нажатие на строку открывает детали плагина. Кнопка «Install plugin» открывает выбор файла `*.fgpl`. Если система плагинов не запущена (например, плагины выключены), кнопка показывает тост «Turn on plugins in the settings first.» (`Telegram/SourceFiles/ayu/ui/settings/plugins_settings.cpp:583-594`).

Блок «Advanced» содержит «Plugin components» (компоненты рантайма, без которых состояние не становится `Ready`) и «Network» (сеть плагинов). Код страницы: `Telegram/SourceFiles/ayu/ui/settings/plugins_settings.cpp:498-630`.

Детали плагина (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2129-2348`) содержат переключатель «Enabled», кнопку «Start now» (если плагин включён, но не запущен), «Plugin settings» (если объявлена страница настроек), «Permissions» с числом «N of M», «Menu items» (если есть пункты меню), «Plugin log», «Plugin network» (если плагин ходит в сеть), «Update from file», «Export settings» и «Import settings» (если объявлен экспорт настроек) и «Remove plugin». Удаление спрашивает подтверждение и удаляет плагин вместе с данными.

## Иконки

Иконка задаётся полем `icon` в пункте меню, в значке бейджа, в строке `list` и в элементах страницы `link`, `toggle`, `button`, `chat`, `select` и `page` (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:234`, `:398`, `:427`, `:438`, `:504`, `:519`, `:573`, `:682`). Значение — встроенное имя из списка ниже или имя из `contributes.icons`. Имя состоит из строчных латинских букв, цифр, `_` и `-` и не длиннее 32 символов (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:138-146`).

Встроенные имена (70 штук; набор одинаков в SDK README, в `BuiltinIcons()` и в таблице клиента): `add`, `archive`, `block`, `bot`, `cancel`, `chat`, `chats`, `clear`, `collapse`, `commands`, `copy`, `customize`, `delete`, `devices`, `download`, `edit`, `emoji`, `expand`, `export`, `file`, `folder`, `font`, `forward`, `gif`, `hide`, `hourglass`, `info`, `like`, `link`, `lock`, `mark_read`, `mute`, `network`, `night`, `notifications`, `palette`, `permissions`, `phone`, `photo`, `pin`, `premium`, `profile`, `qr`, `reactions`, `remove`, `reply`, `report`, `restore`, `schedule`, `search`, `select`, `send`, `settings`, `share`, `show`, `silent`, `sound_off`, `sound_on`, `spoiler`, `star`, `stats`, `stickers`, `storage`, `timer`, `translate`, `unmute`, `unpin`, `users`, `zoom_in`, `zoom_out` (`Telegram/plugins_sdk/README.md:322-330`; `Telegram/plugins_host/src/fgpl/ui_tree.cpp:163-178`; `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:159-230`).

В пункте меню неизвестное имя — ошибка манифеста. В элементах страницы и бейджах хост проверяет только формат имени (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:234`, `:320`), а клиент для неизвестного имени рисует стандартный значок (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:321-325`).

> [!WARNING]
> Вывод про стандартный значок сделан по коду: `st::menuIconBot` подставляется как запасной. Как этот значок выглядит на экране, не подтверждено запуском.

## Пункты меню

Пункт объявляется в `contributes.menus`. Поля: `surface` (поверхность, см. таблицу ниже), `id` (токен до 64 символов), `title` (обязательный, до 80 байт, может быть таблицей языков), `icon` (встроенное имя или имя из `contributes.icons`, см. раздел «Иконки» выше) и необязательное условие `when`. Пунктов не больше 32 (`Telegram/plugins_host/src/fgpl/manifest.cpp:736-794`). Пункт с неизвестным именем иконки — ошибка манифеста (`Telegram/plugins_host/src/fgpl/manifest.cpp:1006-1010`). В меню клиента пункт выглядит как «{title} · {имя плагина}» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:527-536`).

Клик приходит событием `menu.click`. В Python обработчик регистрируется так: `freshgram.on_menu(menu_id, surface=None)`.

### Поверхности

| `surface` | Где появляется | Точка вызова в клиенте |
|---|---|---|
| `message` | контекстное меню сообщения | `Telegram/SourceFiles/history/view/history_view_context_menu.cpp:1427` |
| `selection` | меню выделенных сообщений одного чата | `Telegram/SourceFiles/history/view/history_view_context_menu.cpp:1318` |
| `shared_media` | меню элементов общих медиа | `Telegram/SourceFiles/info/media/info_media_list_widget.cpp:1607` |
| `chat` | меню чата | `Telegram/SourceFiles/window/window_peer_menu.cpp:1863` |
| `profile` | меню профиля | `Telegram/SourceFiles/window/window_peer_menu.cpp:1863` |
| `main_menu` | главное меню клиента | `Telegram/SourceFiles/window/window_main_menu.cpp:784` |
| `tray` | меню значка в трее | `Telegram/SourceFiles/tray.cpp:156` |
| `composer` | кнопка у поля ввода | `Telegram/SourceFiles/history/view/controls/history_view_compose_controls.cpp:2862-2895` |

Пункт `tray` работает только там, где есть системный трей. Если трея нет, клиент убирает фичу `menu.tray` из окружения плагина (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:205-207`).

Пункты `selection` и `shared_media` не предлагаются для секретных чатов и «Избранного» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:496-499`, `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4242`; `Telegram/plugins_sdk/README.md:346`).

### Условия `when`

- `chat_type` — список из `user`, `bot`, `self`, `group`, `supergroup`, `forum`, `channel`. Работает на поверхностях с чатом: `message`, `selection`, `shared_media`, `chat`, `profile`, `composer`.
- `out`, `has_text`, `has_media`, `forwarded` — логические значения; `media` — список видов. Работают только на `message`, `selection` и `shared_media`.
- Значения `media`: `photo`, `video`, `gif`, `round`, `voice`, `audio`, `file`, `sticker`, `poll`, `contact`, `location`, `webpage`, `other`.
- `has_media` ложно для сообщения, у которого есть только превью ссылки.
- Для нескольких сообщений подходить должно каждое из них (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:517-523`).
- Ключ, которого нет на данной поверхности, — ошибка манифеста (`Telegram/plugins_host/src/fgpl/manifest.cpp:767-774`).

Пункты меню не показываются в секретных чатах и «Избранном» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:110-111`; проверка в `:496-500`) и в служебном чате 777000 (там же, `:498`). Если пользователь ограничил плагин списком чатов, пункт не появляется в остальных чатах (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:503-510`). Пользователь может скрыть пункт в деталях плагина, в разделе «Menu items», и скрытый пункт не предлагается (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:515`).

Порядок пунктов: если пользователь задал свой порядок, пункты сортируются по нему (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:540-550`). Пункты, которых в этом порядке нет, идут после остальных в исходном порядке. Порядок без пользовательских настроек на этой странице не описан.

> [!WARNING]
> Условие «язык и аккаунт совпадают» в проверенном коде отдельно не найдено. Пункты берутся из снимка менеджера для текущего аккаунта и языка (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:503`; `Telegram/plugins_host/src/fgpl/manager.cpp:1140-1144`). Как отдельное условие показа это не подтверждено кодом.

### Событие `menu.click`

- `surface` и `id` приходят всегда.
- `chat` — для поверхностей с чатом. `topic` — если пункт вызван в теме форума или в ветке комментариев.
- `message`, `from`, `text` — для `message`. Поля `message`, `from` и `text` приходят только при разрешении `messages.read`: без него брокер их отбрасывает (`Telegram/plugins_host/src/fgpl/broker.cpp:2252-2259`; поля добавляются в `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:602-604`).
- `chat` и `ids` — для `selection` и `shared_media`. Поле `ids` тоже только при `messages.read`. Меню `selection` появляется, если выделено от 1 до 100 обычных сообщений одного чата (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4224-4241`).
- `reply_to` и `button` — для `composer`. Подробнее в разделе про кнопки у поля ввода.

Поля `chat`, `topic` и `reply_to` доходят только до чатов, которые плагин может видеть: не секретных, не «Избранного», не 777000 и входящих в область плагина (`Telegram/plugins_host/src/fgpl/broker.cpp:590-596`, `Telegram/plugins_host/src/fgpl/broker.cpp:2237-2252`). Служебные поля `secret` и `self` плагину не передаются (`Telegram/plugins_host/src/fgpl/broker.cpp:2260-2261`).

Если событие отклонено (пункта нет в манифесте, нет `ui.menu` или нет `ui.composer_button` для `composer`), клиент показывает тост «The plugin is not running.» (`Telegram/plugins_host/src/fgpl/manager.cpp:1261-1270`; `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:554-570`). Тот же тост появляется, если плагин не запущен и в `activation.on` нет `menu` (`Telegram/plugins_host/src/fgpl/manager.cpp:2002`, `Telegram/plugins_host/src/fgpl/manager.cpp:2012-2020`).

> [!NOTE]
> Для запуска плагина по клику в `activation.on` указывается `menu`. Список триггеров описан в разделе [Жизненный цикл](#/lifecycle).

Пример на Python (составлен по API из `Telegram/plugins_sdk/python/freshgram/__init__.py`; это не выдержка из README или тестов):

```python
@freshgram.on_menu("save", surface="message")
def save(event):
    freshgram.ui.toast("Заметка сохранена")
```

## Кнопки у поля ввода

Каждая запись с `surface: "composer"` становится отдельной кнопкой рядом с полем ввода. Если записей не больше трёх, каждая получает свою кнопку. Если записей больше трёх, две первые остаются кнопками, а третья кнопка открывает меню с остальными (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3579-3610`).

Клик приходит как `menu.click` с `surface: "composer"`, полями `chat`, `topic` (в теме) и `reply_to` (если пользователь отвечал на сообщение). Если отвечал, ответ снимается с поля ввода после клика (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3565-3577`). Правый клик по обычной кнопке приходит с полем `button: "right"`. Кнопка меню с остальными реагирует только на левый клик (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3586-3608`).

## Команды

Команда объявляется в `contributes.commands`: поля `name` и `description` (до 200 байт, может быть таблицей языков). Для команд нужно разрешение `ui.command`.

Пример (составлен по полям из `Telegram/plugins_host/src/fgpl/manifest.cpp:796-815`; в SDK такого примера нет):

```json
"contributes": {
  "commands": [
    { "name": "board", "description": "Открыть доску" }
  ]
}
```

- Команда попадает в подсказки поля ввода. Подсказка показывается для запущенного плагина или для плагина, который запускается командой (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4386-4424`; подсказки — `Telegram/SourceFiles/chat_helpers/field_autocomplete.cpp:818`).
- Команда срабатывает, если текст начинается с `/`. Аргументы — текст после имени.
- `/имя@plugin.id` адресует конкретный плагин; сравнение идёт без учёта регистра (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4441-4450`).
- Если у бота в этом чате есть команда с тем же именем и без адреса, сообщение уходит боту (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4462-4463`).
- При установке плагина клиент предупреждает, если имя команды уже занято другим установленным плагином (`Telegram/SourceFiles/ayu/ui/boxes/plugin_install_box.cpp:236-259`).
- Если плагин не запущен и не может быть запущен командой (в `activation.on` нет `command`), сообщение не отправляется и показывается тост «The plugin is not running.» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4465-4472`; `Telegram/SourceFiles/history/history_widget.cpp:6109`).
- Команды не выполняются при отложенной и тихой отправке и при редактировании сообщения (`Telegram/SourceFiles/history/history_widget.cpp:6090`; `Telegram/SourceFiles/history/view/history_view_chat_section.cpp:2391-2393`).
- В ветке комментариев `topic` равен корню ветки (`Telegram/SourceFiles/history/view/history_view_chat_section.cpp:2398-2403`).

Событие `command` несёт поля `name`, `args` (текст после имени), `chat`, `topic` (если есть) и `reply_to` (если пользователь отвечал на сообщение). Ответ на сообщение снимается с поля ввода, как при обычной отправке.

## Бейджи

Бейдж — это значок рядом с именем пользователя, группы или канала. Он показывается в списке чатов, в шапке открытого чата, в шапке профиля и у имени отправителя в сообщении (`Telegram/SourceFiles/dialogs/ui/dialogs_layout.cpp:1013`; `Telegram/SourceFiles/history/view/history_view_top_bar_widget.cpp:804`; `Telegram/SourceFiles/info/profile/info_profile_top_bar.cpp:1959`; `Telegram/SourceFiles/history/view/history_view_message.cpp:516-528`).

Python-интерфейс: `freshgram.badges.set(user, items)` и `freshgram.badges.clear()`. Нужно разрешение `ui.badges`.

- `user` — id пользователя, группы или канала в том виде, в каком его показывает API. У каналов и групп старшие биты задают тип (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3879-3881`).
- `items` — список не больше 4 элементов (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:207-210`). У каждого элемента: `id` (токен до 32 символов), ровно одно из полей `icon` (встроенное имя или имя из `contributes.icons`) и `image` (PNG не больше 128×128 и 64 KiB или JPEG не больше 64 KiB; у JPEG хост проверяет только сигнатуру и размер файла, `Telegram/plugins_host/src/fgpl/ui_tree.cpp:106-113`, `:240`, `:243-247`), необязательный `tooltip` (до 80 байт). Элемент с обоими полями или без них отклоняется (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:225-229`).

> [!WARNING]
> Габариты JPEG хост не проверяет, поэтому JPEG проходит проверку при любом размере. Клиент декодирует значок, только если его ширина и высота не больше 512 (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3655`). Что показывается вместо значка при большем размере, не подтверждено запуском.

- Пустой список `items` убирает бейджи этого плагина у пользователя (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3818-3851`).
- `badges.clear()` убирает все бейджи плагина (`Telegram/plugins_host/src/fgpl/broker.cpp:949-961`).
- Пользователей с бейджами у плагина — до 256 (`Telegram/plugins_host/src/fgpl/broker.cpp:53`, `Telegram/plugins_host/src/fgpl/broker.cpp:980-982`).
- Бейджи не показываются, если плагин выключен, у него нет `ui.badges`, клиент заблокирован паролем, установлен флаг `hidden` снимка менеджера (`Telegram/plugins_host/src/fgpl/manager.h:265`) или это служебный чат 777000 (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3884-3898`). Для 777000 вызов `badges.set` отклоняется (`Telegram/plugins_host/src/fgpl/broker.cpp:966-967`).

> [!WARNING]
> Что выставляет флаг `hidden` в клиенте, не подтверждено запуском. `PluginManager::setHidden` (`Telegram/plugins_host/src/fgpl/manager.cpp:2811`) в продуктивном коде не вызывается: его вызывают только тесты (`Telegram/plugins_host/tests/test_manager.cpp:417` и `:421`). Условие приведено по коду, но сценарий, при котором флаг становится истинным, не подтверждён.

- Ограничение «до 4» действует на один вызов `badges.set`. Если несколько плагинов поставили бейджи одному пользователю, клиент показывает все их, общего лимита клиент не применяет (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3891-3917`).
- Ключ хранения бейджей — пара «аккаунт и id пользователя, группы или канала» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3827`, `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3881-3882`).
- `badge.click` требует `menu` в `activation.on`: если плагин не запущен, клик запускает его только при этом триггере (`Telegram/plugins_host/src/fgpl/manager.cpp:1320-1321`, `Telegram/plugins_host/src/fgpl/manager.cpp:2002`; `Telegram/plugins_sdk/README.md:362`).
- Бейджи живут, пока работает клиент. После перезапуска их выставляют заново в `init`; для этого в `activation.on` нужен `startup` (`Telegram/plugins_sdk/README.md:433-434`; `Telegram/plugins_host/src/fgpl/manager.cpp:1991-2000`).

Клик по бейджу приходит событием `badge.click` с полями `id`, `user` и `surface` (`message`, `chat`, `profile` или `chats`). Для бейджа у сообщения приходят также `chat` и `message` (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3988-4007`). Python: `freshgram.on_badge_click(badge_id=None)`.

Фрагмент на Python из `Telegram/plugins_sdk/README.md`:

```python
freshgram.badges.set(user_id, [
    {"id": "vip", "icon": "star", "tooltip": "VIP"},
    {"id": "logo", "image": png_bytes},
])

@freshgram.on_badge_click("vip")
def vip(event):
    freshgram.ui.toast("VIP user " + str(event["user"]))
```

## Диалоги и окна

Диалог — модальный бокс. Окно — то же дерево элементов, но с идентификатором `id`: плагин может держать несколько окон и обновлять каждое из них отдельно.

- `ui.dialog.show {page}` открывает диалог; `ui.dialog.close` его закрывает. Python: `freshgram.ui.dialog(title, items, buttons=None)` и `freshgram.ui.close_dialog()`.
- `ui.window.show {id, page, mode}` открывает окно. `id` — токен до 32 символов. `mode`: `layer` (по умолчанию) — поверх окна клиента, как диалог; `window` — отдельная панель (`Telegram/plugins_host/src/fgpl/broker.cpp:1308-1314`; `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4105-4111`).
- Повторный `ui.window.show` с тем же `id` обновляет открытое окно и сохраняет его режим (`Telegram/plugins_host/src/fgpl/broker.cpp:1319-1321`). `ui.window.update {id, page}` обновляет окно, которое открыто; если окна нет, вызов возвращает ошибку (`Telegram/plugins_host/src/fgpl/broker.cpp:1327-1328`). Частота обновления одного окна — не чаще раза в 100 мс (`Telegram/plugins_host/src/fgpl/broker.cpp:54`, `Telegram/plugins_host/src/fgpl/broker.cpp:1322-1326`).
- Одновременно открыто не больше трёх окон (`Telegram/plugins_host/src/fgpl/broker.cpp:52`, `Telegram/plugins_host/src/fgpl/broker.cpp:1332-1333`). `ui.window.close {id}` закрывает окно.
- Python: `freshgram.ui.window(window_id, title, items, buttons=None, mode="layer")`, `freshgram.ui.update_window(...)`, `freshgram.ui.close_window(window_id)`.

События: `dialog.change`, `dialog.click`, `dialog.close` для диалога; `window.change`, `window.click`, `window.close` для окна. Окно передаётся полем `window`. Щелчок по строке `list` приходит с `id` строки, смена вкладки `tabs` — с `id` выбранной вкладки.

Закрытие:

- Если пользователь закрыл диалог или окно, плагин получает `dialog.close` или `window.close` (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2419-2428`, `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2537-2542`).
- Если плагин закрыл окно сам, события закрытия нет (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2505-2508`).
- Если плагин остановлен или выключен, окно закрывается без события (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2519-2527`).
- Закрытие без страницы. `ui.window.close` и `ui.dialog.close` не передают страницу: брокер шлёт `window.close` и `dialog.close` без поля `page` (`Telegram/plugins_host/src/fgpl/broker.cpp:1281`, `:1295`), менеджер передаёт `nullptr` (`Telegram/plugins_host/src/fgpl/manager.cpp:1522`, `:1538`), а клиент трактует отсутствие страницы как закрытие и не отправляет событие закрытия (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4070-4073`, `:2513-2514`, `:2537-2542`).
- Если клиент заблокирован паролем или аккаунт не найден, окно не открывается, и плагин получает событие закрытия (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4075-4083`).

Что считается действием пользователя: каждое доставленное плагину событие клиента — нажатие пункта меню, команда, событие страницы настроек, диалога, окна или тоста (`Telegram/plugins_host/src/fgpl/manager.cpp:1336`; `Telegram/plugins_host/src/fgpl/broker.cpp:713-722`). Такое действие разрешает открыть диалог или окно в течение 10 с (`Telegram/plugins_host/src/fgpl/broker.cpp:51`; для диалога — `Telegram/plugins_host/src/fgpl/broker.cpp:756-757`, для окна — `Telegram/plugins_host/src/fgpl/broker.cpp:1330-1331`).

> [!WARNING]
> Документация SDK (`Telegram/plugins_sdk/README.md`) требует для `ui.dialog.show` действие пользователя или уже открытый диалог. Код (`Telegram/plugins_host/src/fgpl/broker.cpp:755-765`) пропускает первый диалог без действия пользователя, а повторный открывает не чаще раза в 60 с (`kDialogEachMs`). Для `ui.window.show` код применяет то же ограничение через общий с диалогами `_lastDialog`, без исключения для уже открытого диалога (`Telegram/plugins_host/src/fgpl/broker.cpp:1332-1337`). Что фиксировать как контракт, не подтверждено кодом (OPEN-2).

Фрагмент на Python из `Telegram/plugins_sdk/README.md`:

```python
@freshgram.on_command("board")
def board(event):
    freshgram.ui.window("board", "Board", [
        {"type": "tabs", "id": "tabs", "tabs": [
            {"id": "todo", "label": "To do", "items": [
                {"type": "list", "items": [{"id": "t1", "title": "Write docs"}]}]},
            {"id": "info", "label": "Info", "items": [{"type": "text", "text": "Hello"}]},
        ]},
    ], mode="window")

@freshgram.on_window("board", "t1")
def clicked(event):
    freshgram.ui.close_window("board")
```

## Страница настроек

Страница объявляется в манифесте (`contributes.settingsPage: true`, `Telegram/plugins_host/src/fgpl/manifest.cpp:816`) и требует разрешения `ui.settings_page`. Сама страница отправляется вызовом `ui.settings.set {page}`; в Python это `freshgram.ui.settings_page(title, items, buttons=None)`.

Кнопка «Plugin settings» есть в деталях плагина, если страница объявлена (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2223-2231`). Клиент отправляет плагину событие `settings.open`, и плагин должен прислать страницу. Пока её нет, окно показывает «Loading the settings…»; если через 5 с страницы всё ещё нет, появляется «This plugin has not shown its settings yet.» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:108`, `Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:1713-1766`). Страница, пришедшая позже, появляется в открытом окне.

- Если плагин выключен, страница не открывается, показывается тост «The plugin is not running.» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4493-4502`).
- Если плагин включён, но не запущен и в `activation.on` нет `settings`, событие отбрасывается, тост тот же, а окно ждёт страницу (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:4504-4509`; `Telegram/plugins_host/src/fgpl/manager.cpp:2002`).

### Элементы

| Группа | Типы |
|---|---|
| Текст | `text` (поле `style`: `title`, `subtitle`, `muted`, `accent`, `danger`), `header`, `divider`, `code` |
| Ссылка | `link` (поле `url` — только `https://`) |
| Значения | `toggle`, `input`, `select`, `slider`, `chat`, `progress` |
| Действия | `button` (поле `style`: `default`, `primary`, `danger`), `page` (строка, открывающая вложенную страницу) |
| Раскладка | `row`, `column`, `card`, `tabs`, `list`, `table`, `image` |

Поля интерактивных элементов: `id` (уникален на странице), `label`, `hint` (до 300 байт), `disabled`, `icon`.

- `toggle` — `value` (логическое).
- `input` — `value`, `placeholder`, `multiline`, `password`, `max` (от 1 до 4096 байт; по умолчанию 1000).
- `select` — `value`, `options` (от 1 до 16 вариантов вида `{value, label}`; значения уникальны, `value` должен быть одним из них).
- `slider` — `min` (по умолчанию 0), `max` (по умолчанию 100), `step` (по умолчанию 1), `value`. Не больше 1000 шагов.
- `chat` — `value`: id чата или 0.
- `button` — `label` (до 120 байт).
- `page` — `label`, `items`.
- `row` — от 1 до 4 элементов. `column` — не меньше одного элемента. `card` — `title` и `items`.
- `tabs` — `value` (по умолчанию первая вкладка), `tabs` из 1–8 вкладок с `id`, `label` (до 40 байт) и `items`.
- `list` — от 1 до 64 строк с `id`, `title` (обязательный), `subtitle` и необязательным `icon` (встроенное имя, имя из `contributes.icons` или `peer:<id>` и `emoji:<id>`; `Telegram/plugins_host/src/fgpl/ui_tree.cpp:680`, `:682`, `:309-323`).
- `table` — `columns` (от 1 до 6, заголовки до 40 байт), `rows` (до 32 строк; каждая строка имеет столько ячеек, сколько колонок; ячейка до 120 байт).
- `image` — `data` (PNG до 2048×2048 или JPEG, до 256 KiB; габариты JPEG хост не проверяет), `width` и `height` (до 512), `alt` (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:644-660`).
- `text` и `code` — `text` (до 1000 байт); в `text` и `code` можно переводить строку; `header` — заголовок в поле `text` до 120 байт без переводов строк, например `{"type": "header", "text": "Настройки"}` (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:368-373`).
- `link` — `label` (до 120 байт) и `url`.

> [!WARNING]
> Клиент декодирует картинку страницы, только если это PNG или JPEG не больше 4 × 1024 × 1024 пикселей (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:848-862`). Хост пропускает JPEG любых габаритов, а для картинок крупнее предела клиент возвращает пустое изображение. Что выводится вместо картинки, не подтверждено запуском.

Иконки: встроенное имя из раздела «Иконки» выше или имя из `contributes.icons`. Значения `peer:<id>` (аватар чата) и `emoji:<id>` (пользовательский эмодзи) тоже допустимы, но их не больше 32 на страницу (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:309-323`).

### Ограничения

- Список верхнего уровня и каждый вложенный список — до 64 элементов.
- Вложенность — до 4 уровней; всего на странице до 256 элементов (`Telegram/plugins_host/src/fgpl/ui_tree.h:11-37`; `Telegram/plugins_host/src/fgpl/ui_tree.cpp:336-357`).
- Кнопок внизу страницы — до 3, подписи до 40 байт (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:739-762`).
- Управляющие символы и bidi-переопределения в тексте запрещены (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:180-205`).
- `id` — от 1 до 64 символов из `a-z`, `0-9`, `_`, `.`, `-` (`Telegram/plugins_host/src/fgpl/ui_tree.cpp:13-22`).

### События страницы

- `settings.open` — пользователь открыл страницу. Плагину нужно прислать страницу.
- `settings.change` — поля `id` и `value` (новое значение элемента; тип зависит от элемента).
- `settings.click` — поле `id` нажатой кнопки или кнопки из `buttons`.

Пример на Python (составлен по API из `Telegram/plugins_sdk/python/freshgram/__init__.py`; это не выдержка из README или тестов):

```python
@freshgram.on_settings_open
def open_settings(event):
    freshgram.ui.settings_page("Настройки", [
        {"type": "toggle", "id": "notify", "label": "Уведомлять", "value": True},
        {"type": "button", "id": "reset", "label": "Сбросить", "style": "danger"},
    ])

@freshgram.on_setting("notify")
def notify_changed(event):
    freshgram.storage.set("notify", event["value"])
```

## Тосты

Тост вызывается через `ui.toast {text, action, style, duration}`. Python: `freshgram.ui.toast(text, action=None, label=None, undo=False, duration=None)`. Нужно разрешение `ui.toast`.

- Текст не длиннее 200 байт. Клиент показывает его с префиксом `<id плагина>: ` (`Telegram/plugins_host/src/fgpl/broker.cpp:44`, `Telegram/plugins_host/src/fgpl/broker.cpp:1697-1702`).
- `duration` — от 1 до 8 секунд. Если `duration` не указан, тост с кнопкой живёт 5 секунд; обычный тост без кнопки показывается стандартным тостом клиента (`Telegram/plugins_host/src/fgpl/broker.cpp:1691-1699`).
- Кнопка задаётся полем `action` с `id` (до 32 байт) и `label` (до 40 байт). Пустая подпись допустима только при `style: "undo"`; тогда кнопка подписана «Undo» (`Telegram/plugins_host/src/fgpl/broker.cpp:1709-1712`; `Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2049-2051`).
- Не чаще одного тоста в 2 секунды. Чаще — вызов отклоняется с ошибкой лимита (`Telegram/plugins_host/src/fgpl/broker.cpp:49`, `Telegram/plugins_host/src/fgpl/broker.cpp:740-744`).
- Нажатие кнопки приходит событием `toast.click` с полем `id`. Закрытие приходит `toast.close` с `id` и `reason`: `action`, если нажата кнопка, иначе `timeout` (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2052-2057`).
- События приходят только для тех `id`, которые плагин предложил; клиент помнит последние 16 (`Telegram/plugins_host/src/fgpl/manager.cpp:1554-1562`, `Telegram/plugins_host/src/fgpl/manager.cpp:1288-1306`).
- Если плагин не запущен, `toast.click` и `toast.close` запускают его только при `toast` в `activation.on`; иначе событие не доставляется (`Telegram/plugins_host/src/fgpl/manager.cpp:1326-1327`, `Telegram/plugins_host/src/fgpl/manager.cpp:2002`, `Telegram/plugins_host/src/fgpl/manager.cpp:2020`). Если плагин запущен, это условие не применяется. В README это требование записано без такого различия (`Telegram/plugins_sdk/README.md:364`).
- Python: `freshgram.on_toast(action_id=None)` и `freshgram.on_toast_close(action_id=None)`.

> [!WARNING]
> Документация SDK (`Telegram/plugins_sdk/README.md`) говорит, что подпись «Undo» подставляется для `style: "undo"`. Клиент подставляет «Undo» при любой пустой подписи и поле `style` сам не читает; хост проверяет его и пропускает пустую подпись только для `undo`. Что фиксировать как контракт, не подтверждено кодом (OPEN-6).

Пример на Python (составлен по API из `Telegram/plugins_sdk/python/freshgram/__init__.py`; это не выдержка из README или тестов):

```python
@freshgram.on_menu("delete", surface="message")
def delete(event):
    freshgram.ui.toast("Заметка удалена", action="restore", label="Отменить", duration=6)

@freshgram.on_toast("restore")
def restore(event):
    freshgram.log("restore")
```

Из C-ABI (`Telegram/plugins_sdk/c/freshgram.h`) для интерфейса доступны только тосты (сигнатуры, фрагмент; тела функций опущены, см. `Telegram/plugins_sdk/c/freshgram.h:612-617` и `Telegram/plugins_sdk/c/freshgram.h:672`):

```c
static int fg_toast(const char *text) {
	/* тело опущено */
}

static int fg_toast_action(
		const char *text,
		const char *id,
		const char *label,
		int undo,
		fg_i64 seconds) {
	/* тело опущено */
}
```

Нажатие на кнопку `fg_toast_action` приходит в `fg_plugin_event` событием `toast.click` с `id`. Подробнее — [C-ABI: справочник](#/c-abi-reference).

## Локализация и официальность

- В манифесте можно задать `name`, `description`, `title` пунктов меню и `description` команд строкой или таблицей «язык → текст». В таблице обязателен ключ `default` (`Telegram/plugins_host/src/fgpl/manifest.cpp:218-257`).
- Клиент выбирает текст так: точный код языка, затем базовый код до дефиса, затем `default` (`Telegram/plugins_host/src/fgpl/manifest.cpp:354-368`).
- Тексты страниц, окон, диалогов и тостов присылает сам плагин. Клиент их не переводит.
- Официальность: если издатель плагина совпадает с ключом freshGram, в деталях плагина указано «Official plugin». Иначе указано «Unofficial plugin» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:3300-3303`; `Telegram/SourceFiles/ayu/features/plugins/plugins_runtime.cpp:314-320`).
- При установке неофициального плагина показывается предупреждение: «Unofficial plugin. Install it only if you trust its source.» (`Telegram/SourceFiles/ayu/ui/boxes/plugin_install_box.cpp:195-200`).

## Связанные страницы

- [События](#/events) — полный список событий, поля и порядок доставки.
- [Разрешения](#/permissions) — какие `ui.*` разрешения нужны и как их выдаёт пользователь.
- [Пакет и манифест](#/package-manifest) — блок `contributes`, поля `menus`, `commands`, `settingsPage`, `icons`.
- [Жизненный цикл](#/lifecycle) — триггеры запуска из `activation.on`.
- [Python SDK: справочник](#/python-sdk-reference) — модули `ui`, `badges` и декораторы.
- [C-ABI: справочник](#/c-abi-reference) — функции `freshgram.h`.
- [Ограничения и WIP](#/limits-wip) — сводка лимитов и известных расхождений.
- [Примеры](#/examples) — рабочие плагины, в том числе с бейджами и значками.
