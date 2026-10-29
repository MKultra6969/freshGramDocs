---
title: "Жизненный цикл, логи и отладка"
description: "Как freshGram устанавливает, включает, запускает, обновляет, откатывает и удаляет плагин и где искать причину сбоя в журнале."
section: "Концепции"
order: 6
slug: "lifecycle"
status: "экспериментально"
---

Плагином управляет приложение: оно решает, когда установить, включить, запустить, остановить, обновить или откатить плагин. Код плагина на этот порядок не влияет, поэтому полезно знать, что происходит на каждом этапе. Тогда проще написать плагин, который переживает обновления, перезапуски и блокировку, и быстрее найти причину сбоя.

Коротко:

- Новая установка не включает плагин: запись получает `enabled = false`.
- Обновление не меняет `enabled`, но остаётся ожидающим подтверждения, пока плагин не доставит первое событие. Сбой до подтверждения, который хост регистрирует как ошибку, откатывает версию.
- Плагин запускается по событиям из `activation.on`. Без события стартуют только плагины, для которых выполнено условие `startup`: `startup` есть в `activation.on`, либо задано `activation.background: true` и выдано право `background`, либо объявлен `contributes.outgoing` и выдано право `messages.transform_outgoing`.
- Основной инструмент отладки — журнал плагина. В него попадают `print()`, `freshgram.log()` и исключения.

## Установка и включение

Установка проверяет пакет по шагам и останавливается на первом отказе (`Telegram/plugins_host/src/fgpl/manager.cpp:682-819`):

1. Менеджер заблокирован или скрыт: отказ `InstallError::Locked`.
2. Пакет открывается.
3. Проверяется совместимость с версией приложения.
4. Неподписанный пакет отклоняется, если приложение не разрешило установку без подписи (`acceptUnsigned`, `InstallError::UnsignedRefused`).
5. Проверяются зависимости и конфликты из манифеста.
6. Если плагин уже установлен:
   - та же версия: `InstallError::SameVersion`;
   - понижение версии без `allowDowngrade`: `InstallError::DowngradeRefused`;
   - смена издателя без `acceptNewPublisher`: `InstallError::PublisherChanged`.
7. Архив атомарно записывается в `<корень>/<id>/<версия>/package.fgpl`.
8. Для новой записи ставится `enabled = false`. Плагин не стартует, пока его не включат через `setEnabled(id, true)`.

Флаги `allowDowngrade`, `acceptUnsigned` и `acceptNewPublisher` задаются в `InstallOptions` (`Telegram/plugins_host/src/fgpl/manager.h:117-121`). Их выбирает приложение при установке.

Архив проверяется при каждом открытии: приложение сравнивает хэш файла с сохранённым `archiveHash`. Отказы: `the package file is missing`, `the package file was changed after it was installed`. Если парсер пакета не назвал причину, выводится `the package is damaged`, иначе выводится первая причина от парсера (`Telegram/plugins_host/src/fgpl/manager.cpp:135-152`).

Включение (`setEnabled(id, true)`, `Telegram/plugins_host/src/fgpl/manager.cpp:846-879`) снова проверяет хэш и пытается запустить плагин во всех аккаунтах с триггером `startup` (`Telegram/plugins_host/src/fgpl/manager.cpp:877`, `:897-901`). Запуск проходит только при выполнении условия `startup` (см. раздел «Активация: что запускает плагин» ниже). Если условия нет, плагин после включения не стартует и ждёт события из `activation.on`. Выключение (`setEnabled(id, false)`) останавливает экземпляры и сбрасывает таймеры (`Telegram/plugins_host/src/fgpl/manager.cpp:852-858`).

Перед запуском проверяется совместимость и наличие выданных разрешений. Отказы: `the plugin is not compatible with this version` и `no permissions were granted` (`Telegram/plugins_host/src/fgpl/manager.cpp:1459-1464`). Разрешения объявляются в манифесте, см. [Разрешения](#/permissions).

## Активация: что запускает плагин

Поле `activation.on` в манифесте задаёт, какие события могут запустить остановленный плагин. Фрагмент манифеста:

```json
{
  "activation": {
    "on": ["startup", "message", "timer"],
    "background": false
  }
}
```

Допустимые значения: `startup`, `command`, `event`, `menu`, `settings`, `message`, `timer`, `translate`, `toast` (`Telegram/plugins_host/src/fgpl/manifest.cpp:651-668`). Если `activation.on` указан, действуют только перечисленные значения. Если поле не задано, действуют все значения, кроме `startup` (`Telegram/plugins_host/src/fgpl/manifest.h:169`).

Что запускает плагин по каждому значению:

- `timer`: таймер, поставленный через `timers.set`, запускает остановленный плагин (`Telegram/plugins_sdk/README.md:85`).
- `message`: сообщение от другого плагина (`plugin.message`) запускает плагин. Значение входит в список по умолчанию (`Telegram/plugins_sdk/README.md:262-263`).
- `translate`: запрос перевода запускает плагин, если в списке есть `translate` (`Telegram/plugins_sdk/README.md:196-200`).
- `menu`: клик по пункту меню запускает плагин. Клик по бейджу (`badge.click`) тоже запускает остановленный плагин, но для этого нужен `menu` (`Telegram/plugins_sdk/README.md:362-363`).
- `toast`: события `toast.click` и `toast.close` доставляются, если в списке есть `toast` (`Telegram/plugins_sdk/README.md:364`).
- `command`: команда из `contributes.commands`, которую пользователь вызвал как `/name`, запускает плагин, если в списке есть `command` (`Telegram/plugins_host/src/fgpl/manager.cpp:1322-1323`; `Telegram/plugins_sdk/README.md:363`).
- `event`: событие из `contributes.events`, которое проходит проверку выданных прав и области чатов, запускает плагин, если в списке есть `event` (`Telegram/plugins_host/src/fgpl/manager.cpp:2235-2247`).
- `settings`: события `settings.*`, в том числе `settings.open`, запускают плагин, если в списке есть `settings` (`Telegram/plugins_host/src/fgpl/manager.cpp:1324-1325`; `Telegram/plugins_sdk/README.md:365`).

> [!WARNING]
> Одноразовый таймер (`timers.set` без `repeat: true`), который запускает остановленный плагин: не подтверждено кодом (OPEN-1). Не полагайтесь на него, пока поведение не проверено на сборке.

Значение `startup` устроено иначе. При вызове `startEnabled(account)` и при включении плагина (`setEnabled(id, true)`) плагин стартует, если выполняется хотя бы одно условие (`Telegram/plugins_host/src/fgpl/manager.cpp:1987-2003`):

- в `activation.on` есть `startup`;
- в `activation` задано `background: true`, и плагин получил право `background`;
- в манифесте объявлен `contributes.outgoing` (он требует право `messages.transform_outgoing`, `Telegram/plugins_host/src/fgpl/manifest.cpp:982-983`), и плагин получил право `messages.transform_outgoing`.

Метод `startEnabled` вызывается, например, после разблокировки (`Telegram/plugins_host/src/fgpl/manager.cpp:2804-2808`), после установки (`Telegram/SourceFiles/ayu/ui/boxes/plugin_install_box.cpp:135`) и после импорта настроек (см. раздел «Импорт настроек»).

Каждый аккаунт получает свой экземпляр плагина. Экземпляры одного плагина обрабатывают события по одному. Хранилище и настройки при этом общие для всех аккаунтов (`Telegram/plugins_host/src/fgpl/manager.cpp:1800-1804`; `Telegram/plugins_sdk/README.md:274-278`).

События ставятся в очередь экземпляра. Очередь ограничена 256 событиями и 256 MiB: это лимит хоста (`maxQueuedEvents`, `maxQueuedBytes` в `Telegram/plugins_host/src/fgpl/manager.h:111-112`), плагин его не настраивает. При переполнении удаляется самое старое событие, а в статистике растёт счётчик `dropped` (`Telegram/plugins_host/src/fgpl/manager.cpp:290-295`).

## Обновление и откат

Установка новой версии с тем же `id` считается обновлением (`Telegram/plugins_host/src/fgpl/manager.cpp:789-815`):

- Работающий экземпляр останавливается. Текущая версия становится `previous`, новая помечается как `pendingUpdate`.
- Разрешения, которых нет в новом манифесте, снимаются. Новые разрешения автоматически не выдаются.
- Поле `enabled` не меняется. Новый манифест читается при следующем запуске: кэш манифестов привязан к версии и хэшу архива (`Telegram/plugins_host/src/fgpl/manager.cpp:1012-1034`, `1449-1452`).

### Подтверждение

Обновление подтверждается, когда плагин без ошибки доставит первое событие. `init` для этого не считается. Ошибкой здесь считается сбой доставки события. Для Python исключение в обработчике даёт статус `-1`, который приходит хосту как обычный ответ `done`, поэтому обновление всё равно подтверждается (`Telegram/plugins_host/src/fgpl/manager.cpp:1825-1834`; `Telegram/plugins_host/src/fgpl/runtime.cpp:467-473`; `Telegram/plugins_host/src/fgpl/host_client.cpp:524-525`). После подтверждения каталог предыдущей версии удаляется (`Telegram/plugins_host/src/fgpl/manager.cpp:2079-2091`).

> [!NOTE]
> Подтверждение привязано к событиям, а не к `init`. Плагин, который обновился и не получил ни одного события, остаётся в ожидании подтверждения, а откат без сбоя не происходит.

> [!NOTE]
> Для Python исключение в обработчике не откатывает обновление, потому что код `-1` доставляется как обычный ответ. Откат происходит при сбоях, которые хост фиксирует как ошибку: например, плагин не запустился или перестал отвечать.

> [!WARNING]
> Смысл возвращаемого `int` в C: не подтверждено кодом (OPEN-14). Код `-1`, описанный выше, относится к Python.

### Откат до подтверждения

Сбой до подтверждения, который хост регистрирует как ошибку, сразу откатывает версию. Текущая версия удаляется, восстанавливается `previous`, в журнал пишется `rolled back to <версия>` (`Telegram/plugins_host/src/fgpl/manager.cpp:2058-2070`).

Такие сбои записываются в журнал с префиксом `failure:` при регистрации ошибки (`Telegram/plugins_host/src/fgpl/manager.cpp:2041-2046`). К ним относятся:

- `the host did not start: <причина>`;
- `the module did not load: <причина>`;
- `the plugin failed to start: <причина>`;
- `the plugin stopped answering` (или текст ошибки от хоста), если плагин перестал отвечать (`Telegram/plugins_host/src/fgpl/manager.cpp:1711-1755`, `1842-1844`);
- ошибки подготовки запуска, например несовместимость версии или отсутствие выданных прав (`Telegram/plugins_host/src/fgpl/manager.cpp:2028-2031`).

Строка `failure: the start handler returned <код>` тоже начинается с `failure:`, но откат не делает: она пишется напрямую в журнал (`Telegram/plugins_host/src/fgpl/manager.cpp:1739-1741`). Строки о повреждении хранилища (см. раздел «Сообщения о хранилище») тоже не запускают откат.

### Сбои после подтверждения

После подтверждения откат не выполняется. Сбои учитываются в окне `failureWindowMs` = 600000 мс (`Telegram/plugins_host/src/fgpl/manager.h:109`):

- следующий запуск на аккаунте откладывается на `1000 << (streak - 1)` мс, то есть 1000, 2000, 4000, 8000, 16000 и 32000 мс. Счётчик `streak` ограничен шестью и сбрасывается после первого доставленного события (`Telegram/plugins_host/src/fgpl/manager.cpp:2054-2056`, `2024-2026`, `2129`). Задержки относятся только к подряд идущим сбоям;
- после 3 сбоев за окно (`maxFailures`, `Telegram/plugins_host/src/fgpl/manager.h:108`) плагин выключается. Причина сохраняется как `stopped after repeated failures: <причина>` (`Telegram/plugins_host/src/fgpl/manager.cpp:2071-2075`).

Причина выключения попадает в `disabledReason`, а не в журнал. В журнал пишется строка `failure: <причина>`.

## Работа: init и event

`init` приходит один раз при запуске экземпляра, затем приходят `event` (`Telegram/plugins_sdk/README.md:129-130`). В `init` передаются `account`, `plugin`, `version` и `api` (`Telegram/plugins_host/src/fgpl/manager.cpp:1640-1645`). Фрагмент Python-плагина:

```python
import freshgram

@freshgram.on_init
def start(info):
    freshgram.storage.set("started", True)

freshgram.run()
```

Что важно помнить:

- Бейджи, которые нужны после перезапуска, выставляются заново в `init`. Для этого в `activation.on` должен быть `startup` (`Telegram/plugins_sdk/README.md:432-434`).
- Если `init` завершился ненулевым кодом, приложение пишет `failure: the start handler returned <код>`, но плагин продолжает работать (`Telegram/plugins_host/src/fgpl/manager.cpp:1739-1741`). В Python исключение в обработчике `init` даёт код `-1` (`Telegram/plugins_sdk/python/freshgram/__init__.py:916-924`, `:961-963`).
- Вызовы, которые плагин ждал через `await`, сбрасываются при остановке (`Telegram/plugins_sdk/README.md:222-223`).
- В Python исключение в обработчике события записывается в журнал через `freshgram.log` с трассировкой. Статус обработчика равен `-1`, остальные обработчики этого события всё равно вызываются (`Telegram/plugins_sdk/python/freshgram/__init__.py:63-65`, `:916-924`, `:961-963`).

> [!WARNING]
> Смысл ненулевого кода `init` и возвращаемого `int` для C (`fg_plugin_init`, `fg_plugin_event`): не подтверждено кодом (OPEN-14). Описанные выше коды относятся только к Python.

## Остановка, выгрузка и удаление

Плагин останавливается в нескольких случаях:

- `plugin.unload`: плагин сам сообщает, что он не нужен. Он останавливается после текущего события, а следующая активация запускает его заново (`Telegram/plugins_sdk/README.md:57`, `:302-305`). В журнал пишется `unloaded itself for <аккаунт>` (`Telegram/plugins_host/src/fgpl/manager.cpp:2143-2146`).
- Выключение: `setEnabled(id, false)` (см. выше).
- Выход аккаунта: экземпляры этого аккаунта останавливаются, его таймеры сбрасываются (`Telegram/plugins_host/src/fgpl/manager.cpp:2818-2828`; вызов из `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:286`).
- Блокировка паролем: `onLock` останавливает все плагины (`Telegram/plugins_host/src/fgpl/manager.cpp:2799-2802`; `Telegram/SourceFiles/ayu/features/plugins/plugins_service.cpp:687-694`).

При остановке освобождаются ресурсы плагина (`Telegram/plugins_sdk/README.md:46`, `:432-433`, `:443-444`):

- закрываются сокеты;
- закрываются окна;
- скрываются бейджи;
- сбрасываются ожидающие вызовы.

Таймеры при остановке не сбрасываются: они работают, пока приложение запущено, и могут запустить остановленный плагин (`Telegram/plugins_host/src/fgpl/manager.cpp:381`). Таймеры сбрасываются при выключении (`setEnabled(id, false)`), удалении (`uninstall`) и выходе аккаунта (`Telegram/plugins_host/src/fgpl/manager.cpp:827`, `:855`, `:2820`). README описывает это как «dropped when the plugin is disabled» (`Telegram/plugins_sdk/README.md:85`).

### Экспорт настроек

Кнопка «Экспорт настроек» (`Telegram/Resources/langs/fresh/ru.strings:217`) находится в деталях плагина (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2299`). Она записывает значения ключей, которые попали в `storage.export`, в файл `<id>.fgpls`. Набор ключей задаёт секция `storage` манифеста. Фрагмент (`Telegram/plugins_sdk/README.md:286`):

```json
"storage": { "schema": 2, "export": { "prefixes": ["settings."], "exclude": ["settings.token"] } }
```

- `prefixes` — от 1 до 32 префиксов ключей, хотя бы один обязателен; `exclude` — до 32 префиксов, ключи с которыми не выгружаются (`Telegram/plugins_host/src/fgpl/manifest.cpp:881-903`, `Telegram/plugins_host/src/fgpl/manifest.cpp:383-387`).
- `storage.schema` — версия схемы хранилища, по умолчанию 1 (`Telegram/plugins_host/src/fgpl/manifest.cpp:882`).

Файл — CBOR с полями `format` (`freshgram.plugin-settings`), `v` (1), `plugin`, `pluginVersion`, `storageSchema`, `exported` и `items` (`Telegram/plugins_host/src/fgpl/manager.cpp:2548-2556`). Если секции `storage.export` нет, выгрузка отвечает `unavailable` (`Telegram/plugins_host/src/fgpl/manager.cpp:2527-2533`).

### Импорт настроек

Кнопка «Импорт настроек» (`Telegram/Resources/langs/fresh/ru.strings:218`) открывает выбор файла `.fgpls`. После подтверждения пользователем приложение останавливает плагин и заменяет значения ключей, которые есть в файле (`Telegram/plugins_host/src/fgpl/manager.cpp:2620-2624`). Ключи, которых нет в файле, не меняются (`Telegram/plugins_sdk/README.md:296`).

При успехе приложение вызывает `startEnabled` для аккаунта (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2029-2031`). Но запускается не каждый плагин: `startEnabled` стартует плагин только при выполнении условия `startup` (см. раздел «Активация: что запускает плагин»). Плагин с активацией по умолчанию сам не перезапускается, он стартует при следующей своей активации (`Telegram/plugins_host/src/fgpl/manager.cpp:2298-2322`, `1987-2003`). README пишет, что после импорта плагин «starts again» (`Telegram/plugins_sdk/README.md:295-296`). По коду это верно только для плагинов с условием `startup`.

Импорт отклоняется с кодом ответа (`Telegram/plugins_host/src/fgpl/manager.cpp:2562-2619`):

- `unavailable` — плагин не найден или у него нет секции `storage.export`;
- `invalid` — файл не разбирается, не совпадают `format`, `v` или `storageSchema`, либо значение ключа не проходит проверку: пустой ключ, ключ длиннее 128 байт, ключ, не прошедший проверку текста, ключ вне `export`, значение, которое не кодируется, или значение больше 1 MiB;
- `wrong_plugin` — файл выгружен для другого плагина;
- `newer` — `storageSchema` в файле новее установленного `storage.schema`;
- `quota` — после импорта больше 4096 ключей или больше квоты хранилища `storageMb` (`Telegram/plugins_host/src/fgpl/manifest.cpp:647`).

### Удаление

`uninstall(id, removeData)` останавливает плагин, сбрасывает его таймеры и отпускает хранилище (`Telegram/plugins_host/src/fgpl/manager.cpp:821-844`). Хранилище отпускается вызовом `SharedStorage::discard()` (`Telegram/plugins_host/src/fgpl/manager.cpp:828-830`, `:1913-1916`): файловое хранилище уничтожается, а его деструктор записывает несохранённые изменения, если они есть (`Telegram/plugins_host/src/fgpl/file_storage.cpp:116-118`, `:175-178`):

- `removeData = true`: удаляется весь каталог `<корень>/<id>/`, включая данные;
- `removeData = false`: удаляются только каталоги версий, данные плагина сохраняются.

## Состояние приложения

Список плагинов хранится в файле `state.json` в корне каталога плагинов. В нём записаны включённость, версии, хэши архивов, причины отключения, выданные разрешения и статистика. Файл подписан HMAC-SHA256 (`Telegram/plugins_host/src/fgpl/manager.cpp:154-205`).

Если подпись не совпадает, все плагины выключаются с причиной `the plugin list was changed outside the app` (`Telegram/plugins_host/src/fgpl/manager.cpp:451-457`).

## Логи и отладка

Интерактивного отладчика и dev-сервера в SDK и хосте плагинов не найдено. Инструмента для запуска плагина без клиента тоже не найдено. Единственная проверка пакета здесь — `fgpl_tool verify <package.fgpl>` (`Telegram/plugins_host/src/fgpl/tool_main.cpp:96-111`): он печатает ошибки пакета и завершается с кодом 2, если пакет не проходит проверку.

### Что попадает в журнал

- `print()` и всё, что пишется в stderr, попадает в журнал плагина. SDK перенаправляет `sys.stdout` на `sys.stderr` (`Telegram/plugins_sdk/python/freshgram/_channel.py:6-8`).
- Вывод режется по символу `\n`. Строка длиной 4096 байт и больше разрезается (`Telegram/plugins_host/src/fgpl/runtime.cpp:68`, `:187-204`).
- `freshgram.log(text)` пишет строку в журнал. Текст длиннее 4000 байт обрезается с начала: сохраняются последние 4000 байт (`_fit` в `Telegram/plugins_sdk/python/freshgram/__init__.py:52-56`, вызов из `log()` в `:59-60`). Если граница попадает внутрь многобайтового символа, неполный символ в начале отбрасывается.
- Журнал хранит последние 200 строк на плагин. Старые строки удаляются (`Telegram/plugins_host/src/fgpl/manager.h:110`, `Telegram/plugins_host/src/fgpl/manager.cpp:519-526`).
- Каждая строка журнала, и от приложения, и от плагина, обрезается до первых 500 байт (`Telegram/plugins_host/src/fgpl/manager.cpp:523`). Строка длиннее 500 байт видна в журнале только в начале, поэтому длинные строки трейсбека могут быть обрезаны.

> [!TIP]
> Держите сообщение для `freshgram.log` короче 4000 байт: при обрезке теряется его начало.

Приложение тоже пишет в журнал. Примеры строк (`Telegram/plugins_host/src/fgpl/manager.cpp`):

```text
started for <аккаунт>
failure: the plugin failed to start: <причина>
failure: the start handler returned -1
rolled back to <версия>
unloaded itself for <аккаунт>
settings imported (<число> values)
```

### Сообщения о хранилище

Если файл хранилища повреждён, приложение пишет одну из двух строк (`Telegram/plugins_host/src/fgpl/manager.cpp:1943-1946`):

- `failure: the storage file was damaged, restored the previous copy, the latest changes may be lost` — хранилище восстановлено из копии, последние изменения могут быть потеряны;
- `failure: the storage file was damaged and there was no copy, started with empty storage` — копии не было, плагин стартует с пустым хранилищем.

Запись хранилища на диск выполняется с интервалом `storageFlushMs` = 2000 мс (`Telegram/plugins_host/src/fgpl/manager.h:114`).

> [!WARNING]
> Гарантии записи хранилища при остановке или сбое приложения не подтверждены кодом (OPEN-24).

### Журнал в клиенте

В окне деталей плагина есть кнопка «Журнал плагина» (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2270-2277`; `Telegram/Resources/langs/fresh/ru.strings:164`). Журнал разделён на две вкладки:

- «Все» (`Telegram/Resources/langs/fresh/ru.strings:252`);
- «Проблемы» (`Telegram/Resources/langs/fresh/ru.strings:253`). Сюда попадают строки, которые создало приложение, с префиксом `failure:` или `rolled back`, а также строки, похожие на начало трейсбека (`Traceback (most recent call last)`) или на `…Error` и `…Exception`, независимо от того, кто их напечатал (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:1768-1775`). Строка с `failure:`, напечатанная самим плагином, на вкладку «Проблемы» не попадает.

Журнал можно очистить кнопкой очистки (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:1826-1830`). Журнал сети открывается отдельным окном (`Telegram/SourceFiles/ayu/features/plugins/plugins_ui.cpp:2701-2717`, кнопка в `:2849-2850`).

### Сообщение о песочнице

Если при полном наборе слоёв изоляции не включился один из слоёв (rlimits, Landlock или seccomp), хост возвращает ошибку `the sandbox is incomplete` (`Telegram/plugins_host/src/fgpl/host_main.cpp:374-381`).

> [!TIP]
> Чтобы найти причину сбоя, откройте журнал плагина и перейдите на вкладку «Проблемы». Строка с `failure:` укажет, сломался ли плагин при старте или при обработке события. Строка `rolled back to <версия>` означает, что обновление откатилось.

## См. также

- [Пакет и манифест](#/package-manifest) — формат `.fgpl` и поля `activation`.
- [Разрешения](#/permissions) — выдача и проверка прав.
- [Хранилище и файлы](#/storage-files) — `storage.*`, квота и экспорт настроек.
- [Python SDK: справочник](#/python-sdk-reference) — `freshgram.on_init`, `freshgram.log` и `freshgram.run`.
- [События](#/events) — таблица событий, фильтры и порядок доставки.
- [Продвинутое: WASM/WASI и сборка рантайма](#/advanced-internals) — механизм запуска и песочница.
