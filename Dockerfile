# PriceOptima — UI-прототип: статична збірка (демо-дані живуть у браузері), віддає nginx.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Вхід у прототип (docker compose передає з .env): логін і SHA-256 пароля
ARG VITE_AUTH_LOGIN=
ARG VITE_AUTH_PASSWORD_SHA256=
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
