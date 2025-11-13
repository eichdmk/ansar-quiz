FROM node:20-bookworm-slim AS base

WORKDIR /usr/src/app

# Install system dependencies required for native modules such as sharp
RUN rm -f /etc/apt/sources.list.d/* \
  && echo "deb http://mirror.yandex.ru/debian bookworm main contrib non-free non-free-firmware" > /etc/apt/sources.list \
  && echo "deb http://mirror.yandex.ru/debian bookworm-updates main contrib non-free non-free-firmware" >> /etc/apt/sources.list \
  && echo "deb http://mirror.yandex.ru/debian-security bookworm-security main contrib non-free non-free-firmware" >> /etc/apt/sources.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    libvips \
    postgresql-client \
    curl \
    ca-certificates \
  && update-ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY backend/package.json ./
COPY backend/package-lock.json ./

RUN npm ci --omit=dev

COPY backend/. .

ENV PORT=3000

EXPOSE 3000

RUN chmod +x ./docker-entrypoint.sh

ENTRYPOINT ["./docker-entrypoint.sh"]

