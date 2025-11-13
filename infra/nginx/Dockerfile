FROM node:20-alpine AS frontend-build

WORKDIR /app

RUN sed -i 's|//dl-cdn.alpinelinux.org/alpine|//mirror.yandex.ru/mirrors/alpine|g' /etc/apk/repositories

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./

ARG VITE_API_URL=https://localhost/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

FROM nginx:1.27-alpine AS runtime

RUN sed -i 's|//dl-cdn.alpinelinux.org/alpine|//mirror.yandex.ru/mirrors/alpine|g' /etc/apk/repositories
RUN apk add --no-cache bash curl gettext openssl

ENV SERVER_NAME=_ \
    BACKEND_HOST=backend \
    BACKEND_PORT=3000 \
    SSL_CERT_PATH=/etc/ssl/private/server.crt \
    SSL_KEY_PATH=/etc/ssl/private/server.key \
    ACME_CHALLENGE_ROOT=/var/www/certbot \
    ENABLE_SELF_SIGNED_CERTS=false

COPY infra/nginx/entrypoint.sh /docker-entrypoint.d/20-configure-nginx.sh
RUN chmod +x /docker-entrypoint.d/20-configure-nginx.sh

COPY ops/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=frontend-build /app/dist /usr/share/nginx/html

RUN mkdir -p /var/cache/nginx /var/www/certbot \
  && chown -R nginx:nginx /var/cache/nginx /var/www/certbot /usr/share/nginx/html

EXPOSE 80
EXPOSE 443

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

