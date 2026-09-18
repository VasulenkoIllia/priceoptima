# PriceOptima

Порівняння цін постачальників, підбір товарів під заявки клієнтів і формування комерційних пропозицій.

Сервер — Node + Express + Prisma + PostgreSQL, інтерфейс — React. Усі дані (заявки, КП, файли, номенклатура,
довідники, користувачі) зберігаються на сервері; браузер працює лише через API.

Користувачів запрошує адміністратор разовим посиланням (діє 7 днів). Заявку одночасно редагує лише одна вкладка
одного користувача, інші бачать її в режимі перегляду; адміністратор може забрати редагування собі. Хто що змінив —
в історії заявки й у журналі дій (Налаштування).

## Локальний запуск

Потрібні Node.js 22 і PostgreSQL (найпростіше — контейнером).

```bash
npm install
cp .env.example .env              # задайте DATABASE_URL, SESSION_SECRET, ADMIN_LOGIN, ADMIN_PASSWORD
npm run db:migrate                # створити базу за схемою
npm run db:seed                   # налаштування, одиниці виміру, адміністратор
npm run dev:server                # API на http://localhost:3000
npm run dev                       # інтерфейс на http://localhost:5173 (запити /api йдуть на сервер)
```

База в контейнері для розробки:

```bash
docker run -d --name priceoptima-db -p 127.0.0.1:5433:5432 \
  -e POSTGRES_USER=priceoptima -e POSTGRES_PASSWORD=priceoptima -e POSTGRES_DB=priceoptima postgres:16-alpine
# DATABASE_URL=postgresql://priceoptima:priceoptima@127.0.0.1:5433/priceoptima?schema=public
```

Інші команди: `npm run build` (інтерфейс + сервер), `npm start` (зібраний сервер), `npm run typecheck`, `npm test`,
`npm run db:generate`, `npm run db:studio`.

## Розгортання на сервері (Docker + Traefik)

Потрібні Docker Compose і Traefik із зовнішньою мережею `proxy`, entrypoint `websecure` і certresolver `cf`.
Піднімаються два контейнери: `app` (API + інтерфейс) і `db` (PostgreSQL 16).

```bash
git clone https://github.com/VasulenkoIllia/priceoptima.git
cd priceoptima
cp .env.example .env
```

У `.env` задайте домен (`APP_DOMAIN`), пароль бази (`POSTGRES_PASSWORD` і той самий пароль у `DATABASE_URL`),
ключ сесій (`SESSION_SECRET`) і перший обліковий запис (`ADMIN_LOGIN`, `ADMIN_PASSWORD`):

```bash
openssl rand -base64 32          # SESSION_SECRET
```

Теки для даних (том бази й файли) мають належати користувачу контейнера:

```bash
mkdir -p data/postgres data/uploads
sudo chown -R 1000:1000 data/uploads
```

Запуск і оновлення:

```bash
docker compose up -d --build
git pull && docker compose up -d --build
```

При кожному старті контейнер виконує `prisma migrate deploy` і сід (обидва нічого не перезаписують).

Перевірка: `docker compose ps` — обидва контейнери `healthy`; `https://<домен>/health` відповідає `{"status":"ok","db":true}`.

- Пароль адміністратора з `.env` враховується лише при створенні облікового запису; при першому вході застосунок
  попросить його змінити. Далі користувачів запрошують і блокують у самому застосунку (розділ «Налаштування»).
- Дані бази — у `./data/postgres`, завантажені файли (фото товарів, файли заявок, прайси) — у `./data/uploads`;
  бекап робиться з цих тек (`pg_dump` для бази) і зберігається поза сервером.
- Реквізити наших юросіб, логотипи й типові умови КП заповнюють у застосунку (Налаштування).
