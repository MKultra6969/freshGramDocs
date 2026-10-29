---
title: "События"
description: "Какие события получает плагин, какие поля они несут, какие разрешения и фильтры действуют и в каком порядке события доставляются."
section: "Возможности"
order: 12
slug: "events"
status: "экспериментально"
---

Событие — это сообщение приложения плагину о том, что произошло: пришло или изменилось сообщение, пользователь открыл чат, собеседник начал печатать, пользователь нажал пункт меню плагина. Плагин получает события и действует через вызовы API, например отправляет сообщение.

Событие доходит до плагина, только если выполнены все условия:

- для событий из списка `contributes.events` (см. таблицу ниже) событие перечислено в манифесте;
- у плагина есть разрешение, которое относится к событию;
- для событий о чатах чат входит в область плагина и не относится к секретным чатам, к «Избранному» (Saved Messages) или к служебному чату 777000.

> [!NOTE]
> Раздел экспериментальный: набор событий, имена полей и детали доставки могут измениться.

## Как подписаться

Событие объявляется в манифесте, а разрешение выдаёт пользователь. Фрагмент манифеста для получения новых сообщений:

```json
{
  "permissions": {
    "required": [
      { "id": "messages.read", "reason": "Читать новые сообщения", "scope": "all" }
    ]
  },
  "contributes": { "events": ["message.new"] }
}
```

Фрагмент. Поля и проверки описаны в `Telegram/plugins_host/src/fgpl/manifest.cpp:670-699`, `:727-735` и `:956-963`. Каждое разрешение требует поле `reason`. Поле `scope` задаётся только для `messages.read` и принимает значения `all` или `selected`. Если `message.new` объявлено без `messages.read`, проверка манифеста выдаёт ошибку `contributes.events: message.new needs the messages.read permission`.

В Python событие получает обработчик, зарегистрированный декоратором. Пример из справки SDK (`Telegram/plugins_sdk/README.md:465-476`):

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

`on(pattern)` принимает точное имя события или шаблон с `*` в конце: `on("message.*")` получает все события, имя которых начинается с `message.` (`Telegram/plugins_sdk/python/freshgram/__init__.py:665-675` и `:905-908`). Обработчик получает содержимое события, а его имя лежит в поле `type` (`Telegram/plugins_sdk/python/freshgram/__init__.py:927-936`).

> [!WARNING]
> Состав конверта кадра на уровне протокола: не подтверждено запуском (OPEN-7). В коде командного режима кадр собирается с полями `t`, `id` и `v` (`Telegram/plugins_host/src/fgpl/runtime.cpp:502-507`). Ниже описано содержимое события, которое получает обработчик.

## Таблица событий

### Из contributes.events

В `contributes.events` принимается не больше 16 записей и только имена из таблицы ниже (`Telegram/plugins_host/src/fgpl/manifest.cpp:727-735`).

| Событие | Python | Разрешение | Полезная нагрузка |
|---|---|---|---|
| `message.new` | `on("message.new")` | `messages.read` | поля сообщения, см. раздел «Поля message.*» |
| `message.edited` | `on("message.edited")` | `messages.read` | поля сообщения, включая `edit_date` |
| `message.deleted` | `on("message.deleted")` | `messages.read` | поля сообщения; без `messages.read_deleted` поля `text` и `old_text` удаляются |
| `message.reaction` | `on("message.reaction")` | `messages.read` | поля сообщения; приходит при новой непрочитанной реакции на сообщение (см. предупреждение в разделе «Фильтры») |
| `chat.opened` | `on_chat_opened` | `chats.active` | `chat`, `chat_title`, `topic` (только в теме форума) |
| `chat.typing` | `on_typing` | `chats.activity` | `chat`, `user`, `action` (вид действия, например `typing` или `record_voice`), `cancelled`, `topic` (в теме форума) |
| `chat.read` | `on_read` | `chats.activity` | `chat`, `read_till`, `outbox` (`true`, если собеседник прочитал ваши сообщения, `false`, если прочитали вы) |
| `chat.member` | `on_member` | `chats.activity` | `chat`, `user`, `joined` |
| `user.status` | `on_user_status` | `users.presence` | `user`, `status`, `last_seen` (если известно) |
| `app.focus`, `app.blur` | `on_app_focus`, `on_app_blur` | `app.activity` | только `type` |

Источники: `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:365-501` и `:1098-1128`, `Telegram/plugins_host/src/fgpl/manifest.cpp:430-446`.

### Прочие события

| Событие | Python | Разрешение | Полезная нагрузка |
|---|---|---|---|
| `init` | `on_init(info)` | не нужно | `account`, `plugin`, `version`, `api`; приходит один раз при запуске |
| `message.outgoing` | `on("message.outgoing")` | `messages.transform_outgoing` и `contributes.outgoing` | `chat`, `text`, `chat_type`, `silent`; при наличии `topic`, `reply_to`, `scheduled`. Подробнее: [Исходящие сообщения](#/outgoing-messages) |
| `timer` | `on_timer(timer_id=None)` | не перечисляется в `contributes.events` | `id` таймера (строка) |
| `plugin.message` | `on_plugin_message(sender=None)` | `plugins.message` | `from` (id плагина-отправителя), `data`; Python-обработчик получает их двумя аргументами `(from, data)`, а не объектом события (`Telegram/plugins_sdk/python/freshgram/__init__.py:713-720`) |
| `translate.request` | `on_translate(function=None, markdown=False)` | `translate.provide` | `ticket`, `to`, `format`, `items`; ответ отправляется вызовом `translate.reply`. С `markdown=True` ответы используют разметку, например `**жирный**` (`Telegram/plugins_sdk/python/freshgram/__init__.py:780-788`) |
| `menu.click` | `on_menu(menu_id, surface=None)` | `ui.menu`; для поверхности `composer` дополнительно `ui.composer_button` | `surface`, `id`; `button` = `right` при правом клике; если чат виден плагину — `chat`, `topic`, `reply_to`; `message`, `from`, `text` — только если чат виден и есть `messages.read`. Подробнее: [Интерфейс клиента](#/client-ui) |
| `badge.click` | `on_badge_click(badge_id=None)` | `ui.badges` | `id`, `user`, `surface`; для сообщения — `chat` и `message` |
| `command` | `on_command(name)` | `ui.command` | `name`, `args`, `chat`, `topic`, `reply_to` |
| `toast.click`, `toast.close` | `on_toast`, `on_toast_close` | `ui.toast` | `id` действия; у `toast.close` ещё `reason`: `action` или `timeout` |
| `settings.open` | `on_settings_open` | `ui.settings_page` | полей нет; страницу настроек нужно отправить в ответ |
| `settings.change`, `settings.click` | `on_setting(item_id=None)` | `ui.settings_page` | `id`; у `settings.change` ещё `value` |
| `dialog.change`, `dialog.click`, `dialog.close` | `on_dialog(item_id=None)` | `ui.dialog` | `id` у `dialog.change` и `dialog.click`; у `dialog.change` ещё `value`; `dialog.close` приходит, когда пользователь закрыл диалог, и несёт только `type` |
| `window.change`, `window.click`, `window.close` | `on_window(window_id, item_id=None)` | `ui.dialog` | `window` (id окна) у всех трёх событий; `id` у `window.change` и `window.click` (у `window.close` полей `id` нет). При клике по строке `list` поле `id` — id строки, при смене `tabs` поле `id` — id выбранной вкладки (`Telegram/plugins_sdk/README.md:370`) |

> [!WARNING]
> Расхождение README и кода для `translate.request`: не подтверждено запуском. SDK README относит `translate.request` к событиям, которые «each listed in `contributes.events`» (`Telegram/plugins_sdk/README.md:156-169`), и включает его в свою таблицу. Но в карте `EventPermission` записи для него нет (`Telegram/plugins_host/src/fgpl/manifest.cpp:430-446`), а `contributes.events` отклоняет неизвестные имена (`Telegram/plugins_host/src/fgpl/manifest.cpp:730-731`). Страница относит событие к «Прочим» (вне `contributes.events`), что соответствует коду.

Ответы на асинхронные вызовы (`call.result`) SDK получает сам и обработчикам не передаёт (`Telegram/plugins_sdk/python/freshgram/__init__.py:931-933` и `:954-956`).

Событие `timer` приходит, когда срабатывает таймер, заведённый через `freshgram.timers.set(timer_id, seconds, repeat=True)`. Объявлять его в `contributes.events` не нужно: SDK README прямо пишет, что `timer` не перечисляется в `contributes.events` (`Telegram/plugins_sdk/README.md:170-171`). В карте `EventPermission` имени `timer` нет (`Telegram/plugins_host/src/fgpl/manifest.cpp:430-446`), а манифест на имя вне этой карты выдаёт ошибку `has an unknown event` (`Telegram/plugins_host/src/fgpl/manifest.cpp:730-731`). Постановку события в очередь показывает `Telegram/plugins_host/src/fgpl/manager.cpp:381-389`.

> [!WARNING]
> Одноразовый таймер: не подтверждено запуском (OPEN-1). По коду отсутствующий `repeat` считается `false`: `BoolArg` возвращает значение по умолчанию `false` (`Telegram/plugins_host/src/fgpl/broker.cpp:118-127`, `:2230`). Проверка `!repeat` (`broker.cpp:2231`) срабатывает только на нелогическое значение, а при `false` таймер создаётся одноразовым (`Telegram/plugins_host/src/fgpl/manager.cpp:338`, `repeat ? delayMs : 0`). SDK не передаёт `repeat`, если он ложный (`Telegram/plugins_sdk/python/freshgram/__init__.py:250-251`, `:538-544`), а README показывает `repeat=False` по умолчанию (`Telegram/plugins_sdk/README.md:488`). Диапазон `delay` от 1000 мс до 7 суток проверяется в `broker.cpp:80-81` и `:2231`.

### Поля message.*

Во всех событиях `message.*` есть поля: `type`, `id`, `chat`, `chat_title`, `chat_type`, `from`, `from_kind`, `sender_name`, `date`, `text`, `out`, `forwarded`, `secret`, `self`. Поля `secret` и `self` в SDK README не перечислены; хост не передаёт события с `true` в этих полях, поэтому в доставленных событиях они равны `false` (`Telegram/plugins_host/src/fgpl/broker.cpp:2289-2292`, `Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2777-2778`).

Поля, которые появляются, когда они применимы:

- `reply_to`, `topic`, `grouped` (id альбома), `edit_date`, `via_bot`;
- `local_id` — у собственных исходящих сообщений после подтверждения сервером; `by_plugin: true` — если сообщение отправил плагин, так что плагин может игнорировать свои сообщения;
- `media` — один из видов: `photo`, `sticker`, `round`, `gif`, `video`, `voice`, `audio`, `file`, `poll`, `contact`, `location`, `webpage`, `other` (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:759-788`);
- `sticker` — объект `{id, emoji, set, animated, video}`; `emoji_only` — `true`, если текст состоит только из эмодзи;
- `entities` — список `{type: "custom_emoji", offset, length, id}`;
- `reactions` — список `{count, my}` с одним из полей `emoji`, `custom_emoji` или `paid` (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2813-2840`).

Значения `from_kind` и `chat_type`: `user`, `bot`, `self`, `channel`, `supergroup`, `group`, `forum` (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:244-255`).

## Фильтры

- Событие без разрешения, которое к нему относится, не доставляется (`Telegram/plugins_host/src/fgpl/broker.cpp:2281-2283`).
- Для событий о чатах (`message.*`, `chat.opened`, `chat.typing`, `chat.read`, `chat.member`) чат должен входить в область плагина. Область видна в `meta.info` как `chats`: `"all"` или список id (`Telegram/plugins_sdk/README.md:38`). События с `secret: true` или `self: true` отбрасываются, так же как события чата 777000 (`Telegram/plugins_host/src/fgpl/broker.cpp:2284-2297`).
- Служебные сообщения не передаются (`Telegram/SourceFiles/ayu/features/plugins/plugins_data.cpp:2758-2760`). Сообщение, которому ещё не назначен серверный id, в `message.new` не попадает (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:513-523`). Запланированные, спонсорские и «Недавние действия» не приходят (`Telegram/plugins_sdk/README.md:147-148`).
- `message.new` для собственного сообщения приходит после подтверждения сервером (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:527-539`).
- `message.edited` приходит, если изменились `edit_date` или текст. Для сообщения, которое клиент раньше не видел, — только если правка моложе 300 с (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:66`, `:558-567`).
- `message.deleted` приходит один раз на сообщение (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:551-555` и `:575-580`). Без `messages.read_deleted` поля `text` и `old_text` удаляются из события (`Telegram/plugins_host/src/fgpl/broker.cpp:2299-2306`).
- `message.reaction` приходит при новой непрочитанной реакции (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:548-550`).
- `chat.read` приходит, только если `read_till` вырос. При Ghost Mode входящие чтения не передаются (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:409-419`).
- `chat.typing` приходит не чаще одного раза в 3 с на связку «чат, пользователь, действие, флаг `cancelled`» (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:67` и `:374-381`).
- `chat.member` по README приходит только для групп и супергрупп, не для каналов (`Telegram/plugins_sdk/README.md:166`). Код в `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:435-461` проверяет `WantsEvent`, `Hidden(peer)` и `FiltersController::isBlocked(user)`, проверки типа чата там нет.
- `user.status` не приходит для себя, ботов и пользователей, которые скрыли статус (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:470-477`).
- `app.focus` и `app.blur`: первое состояние после запуска не передаётся; при Ghost Mode события не передаются (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:495-501`).
- Из содержимого `chat.opened`, `chat.typing`, `chat.read` и `chat.member` хост удаляет поля `secret` и `self` (`Telegram/plugins_host/src/fgpl/broker.cpp:2310-2316`). Для `chat.opened` клиент не проверяет блокировку пользователя; секретные чаты, «Избранное» и 777000 отсекает хост (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:1098-1128`, `Telegram/plugins_host/src/fgpl/broker.cpp:2289-2297`).
- Клиент не передаёт `chat.typing`, `chat.member` и `user.status` для заблокированного пользователя (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:371`, `:441`, `:470`). `chat.read` не передаётся, если заблокирован собеседник чата: `Hidden(history->peer)` включает `FiltersController::isBlocked(peer)` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:405`).
- Для `chat.typing`, `chat.read` и `chat.member` клиент отсекает скрытые чаты проверкой `Hidden(peer)` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:341-346`, `:371`, `:405`, `:440`): секретные чаты, «Избранное», служебный чат 777000 и чат с заблокированным собеседником. Для `chat.opened` такой проверки в клиенте нет (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:1098-1128`).
- Целевые UI-события (`menu.click`, `badge.click`, `command`, `settings.*`, `toast.*`, `dialog.*`, `window.*`) проходят фильтр `filterTargeted` (`Telegram/plugins_host/src/fgpl/broker.cpp:2237-2266`, `Telegram/plugins_host/src/fgpl/manager.cpp:1261-1337`): поля `chat`, `topic` и `reply_to` убираются, если чат не виден плагину (секретный, служебный 777000 или вне области); поля `message`, `from`, `ids`, `text` и `old_text` убираются, если чат не виден или нет `messages.read`; `secret` и `self` убираются всегда.

> [!WARNING]
> Поведение событий `message.*` для заблокированных пользователей: не подтверждено запуском (OPEN-5). README сообщает, что о заблокированных пользователях ничего не передаётся (`Telegram/plugins_sdk/README.md:157-158`), но в коде проверки блокировки для `message.*` нет: ни в обработчиках клиента (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:291-296`, `:511-582`), ни в `FilterEvent` (`Telegram/plugins_host/src/fgpl/broker.cpp:2281-2297`).

> [!WARNING]
> Не подтверждено запуском: по README `chat.member` не приходит для каналов (`Telegram/plugins_sdk/README.md:166`), а докстринг `on_member` в SDK пишет «joins or leaves a group or channel» (`Telegram/plugins_sdk/python/freshgram/__init__.py:875`). Это расхождение SDK и README; код типа чата не проверяет (см. выше).

> [!WARNING]
> Расхождение README и кода для `message.reaction`: не подтверждено запуском. SDK README описывает событие как реакцию на «your message» (`Telegram/plugins_sdk/README.md:151`), то есть на сообщение владельца аккаунта: исходящие сообщения владельца описаны в `Telegram/plugins_sdk/README.md:145-148`. Код проверяет только `Reportable` (обычное сообщение с серверным id, не служебное, не в «Избранном») и флаг `NewUnreadReaction` (`Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:291-296`, `:548-550`). Отправителя реакции и автора сообщения код не проверяет, поэтому до проверки на запуске не стоит полагаться на `message.reaction` как на событие только для сообщений владельца аккаунта.

## Порядок доставки

1. Событие попадает в очередь экземпляра плагина для аккаунта. Очередь хранит до 256 событий и до 256 МиБ; при переполнении удаляются самые старые (`Telegram/plugins_host/src/fgpl/manager.h:111-112`, `Telegram/plugins_host/src/fgpl/manager.cpp:1344-1350`).
2. Из очереди события берутся по порядку, но раньше всех берутся `message.outgoing` и результаты асинхронных вызовов `call.result`, и только потом обычные события (`Telegram/plugins_host/src/fgpl/manager.cpp:1786-1797`, `:1618-1623`, `:2494`).
3. Доставка каждого события выполняется под мьютексом записи плагина `record.serial`, общим для всех экземпляров этого плагина: экземпляр получает его при создании (`Telegram/plugins_host/src/fgpl/manager.cpp:1472`), а сам мьютекс объявлен как `shared_ptr<mutex>` в `Telegram/plugins_host/src/fgpl/manager.h:409`. Блокировка берётся на время доставки одного события (`Telegram/plugins_host/src/fgpl/manager.cpp:1800-1804`), поэтому события разных аккаунтов одного плагина обрабатываются по одному, и их обновления хранилища не перемешиваются (`Telegram/plugins_sdk/README.md:275-278`).
4. `init` приходит первым и один раз. Остальные события приходят после него (`Telegram/plugins_sdk/README.md:129`).
5. В Python на одно событие вызываются все подходящие обработчики в порядке регистрации. Исключение в одном обработчике записывается в журнал, остальные обработчики всё равно вызываются (`Telegram/plugins_sdk/python/freshgram/__init__.py:916-936`).
6. Асинхронный обработчик (`async def`) выполняется до первого `await`, остальная его часть — после ответов на вызовы. Пока он ждёт, плагин получает другие события (`Telegram/plugins_sdk/python/freshgram/__init__.py:665-671`).
7. Формулировка SDK README (`Telegram/plugins_sdk/README.md:94-105`): при обработке одного события плагин может сделать не больше 256 вызовов API. `runtime.limits.eventTimeoutMs` — собственное время плагина на событие: время, которое он ждёт приложение (загрузку, чтение из сокета), не учитывается, но все вызовы одного события вместе могут ждать не больше 60 с.

> [!WARNING]
> Не подтверждено запуском: по коду лимиты действуют на отрезок между соседними доставками, а не на всё событие с его await. Счётчик вызовов и дедлайн сбрасываются на каждую доставку кадра. Для плагинов, не работающих в командном режиме, это путь `plugin.deliver` → `Invoke`: `callsLeft = maxCallsPerDispatch` и `SetDeadline` в `Telegram/plugins_host/src/fgpl/runtime.cpp:348-349` (и `:360`), вызов идёт из `Telegram/plugins_host/src/fgpl/host_main.cpp:305` и `:436-437`. В командном режиме (`RunCommand`, `Telegram/plugins_host/src/fgpl/host_main.cpp:433-434`) то же делает `CommandInput` в `runtime.cpp:501` и `:513`; обнуление `hostMs` происходит в `SetDeadline` (`runtime.cpp:140`). Результаты асинхронных вызовов приходят тем же путём: `call.result` формируется в `Telegram/plugins_host/src/fgpl/manager.cpp:1611-1614`, берётся из очереди в `manager.cpp:1790-1792`, доставляется в `manager.cpp:1804`, отправляется кадром `event` в `Telegram/plugins_host/src/fgpl/host_client.cpp:545-548` и в командном режиме читается как `Dispatch::Kind::Event` в `Telegram/plugins_host/src/fgpl/host_main.cpp:243-252`. В коде 256 задаёт `maxCallsPerDispatch` (`Telegram/plugins_host/src/fgpl/runtime.h:23`), а 60 с — `maxHostCallMs` (`runtime.h:24`), которое сравнивается с накопленным `hostMs` (`runtime.cpp:149`, накопление в `runtime.cpp:163`). Поэтому при нескольких `await` подряд суммарное число вызовов и время ожидания по коду могут превышать эти значения.

## Связанные разделы

- [Разрешения](#/permissions) — какие разрешения нужны для каждого события.
- [Исходящие сообщения](#/outgoing-messages) — перехват `message.outgoing` и изменение или отмена отправки.
- [Интерфейс клиента](#/client-ui) — меню, команды, бейджи, диалоги, окна и страница настроек.
- [Python SDK: справочник](#/python-sdk-reference) — декораторы, модули и исключения.
- [Жизненный цикл, логи и отладка](#/lifecycle) — установка, активация, `init` и `event`, журналы.
- [C-ABI: справочник (`freshgram.h`)](#/c-abi-reference) — экспорты и импорт wasm, коды, helper-функции.
