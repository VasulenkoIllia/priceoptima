# PriceOptima: один контейнер — API і зібраний застосунок (поруч контейнер PostgreSQL).

# ── залежності для збірки ───────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
# схема потрібна тут: postinstall генерує клієнт Prisma
COPY package.json package-lock.json ./
COPY server/prisma ./server/prisma
RUN npm ci

# ── збірка інтерфейсу й сервера ─────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── лише те, що треба для запуску ───────────────────────────────────
FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY server/prisma ./server/prisma
RUN npm ci --omit=dev

# ── робочий образ ───────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV PORT=3000
# розбір великої вигрузки (до 200 МБ) потребує до ~1,5 ГБ; на сервері 4 ГБ задайте в .env NODE_OPTIONS=--max-old-space-size=1536
ENV NODE_OPTIONS=--max-old-space-size=3072

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server/prisma ./server/prisma

# файли прайсів і фото (том ./data/uploads)
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

USER node
EXPOSE 3000

# міграції й початкове наповнення виконуються при кожному старті (обидва — ідемпотентні)
CMD ["sh", "-c", "npx prisma migrate deploy --schema server/prisma/schema.prisma && node dist/server/seed.js && node dist/server/index.js"]
