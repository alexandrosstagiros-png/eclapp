# Подготовка входа через MAX

**Статус: поддержка MAX установлена на сервере.** Этот файл описывает независимый прототип валидатора. Его производственная версия находится в `recovered/apps/api/src/modules/identity-access/infrastructure/max-auth.adapter.js`; актуальный отчёт — `docs/MAX_DEPLOYMENT.md`.

`max-auth.cjs` проверяет подписанные параметры `window.WebApp.initData` по [протоколу MAX](https://dev.max.ru/docs/webapps/validation) и возвращает идентификатор пользователя в пространстве `max`, время истечения и ключ защиты от повторного использования.

Поддерживается Node.js 20+. Внешние зависимости не нужны.

```sh
node --test integrations/max/max-auth.test.cjs
```

Пример вызова после подключения к серверному коду:

```js
const { MaxAuthAdapter } = require('./max-auth.cjs');
const adapter = new MaxAuthAdapter(process.env.MAX_BOT_TOKEN, 300);
const identity = adapter.verify(initData);
```

Успешная проверка подписи подтверждает личность в MAX, но **не даёт права войти в приложение**. Сервер должен в одной транзакции погасить `replayHash`, найти или явно привязать существующего сотрудника, проверить его активность, одобрение и роль, затем выдать сессию. Числовые ID MAX и Telegram не взаимозаменяемы. Повторные запросы адаптер сам не запоминает; это обязанность БД. `MaxAuthError` необходимо преобразовывать в штатный ответ HTTP 401, без раскрытия исходных параметров.

Пяти минут достаточно для существующего короткого сценария входа; конструктор поддерживает 60–3600 секунд. Исходная строка `initData`, имя и другие поля профиля в результат не включаются. Токен хранится только на сервере и не должен попадать в браузер, Git или журналы.

Для полного запуска осталось привязать URL Mini App в кабинете бота и проверить реальный вход сотрудника из MAX. Исходный JavaScript восстановлен в `recovered/`, API, БД, клиент и CSP обновлены. Подробности — `docs/MAX_IMPLEMENTATION.md`.

Официальные материалы: [подключение Mini App](https://dev.max.ru/docs/webapps/introduction), [MAX Bridge](https://dev.max.ru/docs/webapps/bridge), [валидация](https://dev.max.ru/docs/webapps/validation).
