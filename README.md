# PriceOptima

Порівняння цін постачальників, підбір товарів під заявки клієнтів і формування комерційних пропозицій.
Поточний етап — UI-прототип: усе працює в браузері на демо-даних (IndexedDB), сервера й бази даних поки немає.

## Локальний запуск

Потрібен Node.js 22.

```bash
npm install
npm run dev
```

Вхід за замовчуванням: `admin` / `admin`. Інші команди: `npm run build`, `npm run typecheck`, `npm test`.

## Розгортання на сервері (Docker + Traefik)

Потрібні Docker Compose і Traefik із зовнішньою мережею `proxy`, entrypoint `websecure` і certresolver `cf`.

```bash
git clone https://github.com/VasulenkoIllia/priceoptima.git
cd priceoptima
cp .env.example .env
```

У `.env` задайте домен (`APP_DOMAIN`), логін (`AUTH_LOGIN`) і SHA-256 пароля (`AUTH_PASSWORD_SHA256`):

```bash
printf '%s' 'ваш-пароль' | sha256sum
```

Запуск і оновлення:

```bash
docker compose up -d --build
git pull && docker compose up -d --build
```

Перевірка: `docker compose ps` — статус `healthy`; `https://<домен>/health` відповідає `ok`.

- Вхід — лише «ворота» для демо: збірка статична, демо-дані зберігаються в браузері кожного користувача.
  «Скинути демо-дані» в меню користувача повертає початковий стан.
- Реальні реквізити й логотипи (необов'язково) кладуть на сервері в `seed-local/` (`overrides.json`, `*.png`) перед збіркою;
  у git ця папка не потрапляє.
- Після зміни пароля або даних у `seed-local/` демо-дані в браузерах перестворюються автоматично.
