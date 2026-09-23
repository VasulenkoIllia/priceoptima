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

## Тести

- `npm test`: розрахунки (зокрема приклад §5.3 ТЗ), інтерфейс, сервер без бази.
- `npm run test:db`: сервіси на справжній PostgreSQL (імпорт прайсу, версії карток, збереження заявки, блокування, КП, статуси).
  Потрібна окрема локальна база з «test» у назві: на неї накочуються міграції й пишуться тестові дані.

```bash
docker run -d --name priceoptima-test-db -p 127.0.0.1:5436:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=priceoptima_test postgres:16-alpine
TEST_DATABASE_URL=postgresql://test:test@127.0.0.1:5436/priceoptima_test npm run test:db
```

Генератор вигаданих даних для перевірки на великому обсязі (мільйон товарів, тисячі заявок): `scripts/fake-catalog.ts`.
Лише для окремої тестової бази.

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

Теки для даних (том бази, файли, резервні копії) — файли мають належати користувачу контейнера:

```bash
mkdir -p data/postgres data/uploads data/backups data/rclone
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
- Дані бази — у `./data/postgres`, завантажені файли (фото товарів, файли заявок, прайси) — у `./data/uploads`.
- Реквізити наших юросіб, логотипи й типові умови КП заповнюють у застосунку (Налаштування).

## Фонові задачі

Виконуються самим застосунком (час київський):

- 05:45: курси НБУ на сьогодні (з повторами, якщо НБУ не відповідає);
- щогодини о :00: прайси за посиланням тих постачальників, у кого в картці задано цю годину; якщо сервер перезапускали
  після години оновлення, пропущене оновлення виконується одразу після старту; невдале оновлення повторюється,
  а на картці постачальника з'являється червона позначка з датою;
- 03:30: прибирання: товари з прайсу, яких немає у прайсі понад 30 днів, переносяться в архів (дані й історія лишаються);
  історія цін старша 3 років (остання ціна кожного товару лишається) і журнал дій старший 1 року видаляються;
  прострочені сесії видаляються.

Резервні копії робить окремий контейнер `backup` (далі).

## Резервні копії

Контейнер `backup` піднімається разом з іншими:

- щодня о 02:30 — копія бази в `data/backups/daily` (зберігаються 14 останніх);
- щонеділі — ще копія бази й архів файлів у `data/backups/weekly` (4 останні);
- 1-го числа — пробне відновлення найсвіжішої копії в тимчасову базу; результат у `data/backups/last-restore-check`;
- якщо копія не вдалася, контейнер стає `unhealthy`, причина — у `data/backups/last-error`.

Копії мають лежати й поза сервером. Для цього налаштуйте сховище (Hetzner Storage Box, Backblaze B2, Cloudflare R2 тощо)
через rclone і вкажіть його в `.env`:

```bash
docker compose run --rm --entrypoint rclone backup config
```

```bash
# .env: BACKUP_REMOTE=<назва сховища з rclone config>:priceoptima
docker compose up -d backup
```

Перевірка вручну: `docker compose exec backup backup.sh` і `docker compose exec backup restore-check.sh`.

Відновлення з копії (застосунок на час відновлення зупиняють; `<користувач>` — `POSTGRES_USER` з `.env`):

```bash
docker compose stop app
docker compose exec -T db pg_restore --clean --if-exists --no-owner -U <користувач> -d priceoptima < data/backups/daily/db-<дата>.dump
tar -xzf data/backups/weekly/uploads-<дата>.tar.gz -C data/uploads
docker compose start app
```

Файли щодня копіюються і в `data/backups/uploads` (дзеркало, у якому нічого не видаляється), тож відновити можна й звідти:
`cp -a data/backups/uploads/. data/uploads/`.

Якщо сервер втрачено повністю, копії беруть зі сховища поза сервером (тека `backups` і `uploads` у `BACKUP_REMOTE`):

```bash
docker compose run --rm --entrypoint rclone backup copy <remote>:priceoptima/backups/daily /backups/daily
docker compose run --rm --entrypoint rclone backup copy <remote>:priceoptima/uploads /uploads
```

## Оновлення і відкат

1. Перед оновленням зробіть копію бази й запам'ятайте поточну версію:

   ```bash
   docker compose exec backup backup.sh
   git rev-parse --short HEAD
   ```

2. Оновіть і перезапустіть: `git pull && docker compose up -d --build`. Міграції бази виконуються при старті контейнера `app`.
   Якщо змінювались параметри бази в `docker-compose.yml`, `docker compose up -d` перезапустить і контейнер `db` (кілька секунд).
3. Перевірте: `docker compose ps` (усі `healthy`), `docker compose logs app --tail 50` (міграції застосовано, помилок немає),
   вхід у застосунок.

Відкат. Міграції змінюють базу лише вперед, тому стара версія коду з новою схемою бази не гарантовано працює.
Надійний відкат: попередня версія коду і копія бази, зроблена перед оновленням:

```bash
docker compose stop app
git checkout <попередня версія>
docker compose exec -T db pg_restore --clean --if-exists --no-owner -U <користувач> -d priceoptima < data/backups/daily/db-<дата>.dump
docker compose up -d --build
```

Відкриті в браузері вкладки після оновлення самі перезавантажуються, коли їм знадобиться нова частина застосунку.
