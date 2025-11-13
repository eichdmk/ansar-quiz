#!/bin/sh
set -eu

TEMPLATE_PATH="/etc/nginx/templates/default.conf.template"
OUTPUT_PATH="/etc/nginx/conf.d/default.conf"

SERVER_NAME="${SERVER_NAME:-_}"
BACKEND_HOST="${BACKEND_HOST:-backend}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
SSL_CERT_PATH="${SSL_CERT_PATH:-/etc/ssl/private/server.crt}"
SSL_KEY_PATH="${SSL_KEY_PATH:-/etc/ssl/private/server.key}"
ACME_CHALLENGE_ROOT="${ACME_CHALLENGE_ROOT:-/var/www/certbot}"
ENABLE_SELF_SIGNED_CERTS="${ENABLE_SELF_SIGNED_CERTS:-false}"

mkdir -p "$ACME_CHALLENGE_ROOT"
mkdir -p "$(dirname "$SSL_CERT_PATH")" "$(dirname "$SSL_KEY_PATH")"

LIVE_CERT_DIR="/etc/letsencrypt/live/${SERVER_NAME}"
if { [ ! -f "$SSL_CERT_PATH" ] || [ ! -f "$SSL_KEY_PATH" ]; } \
  && [ "$SERVER_NAME" != "_" ] \
  && [ -f "${LIVE_CERT_DIR}/fullchain.pem" ] \
  && [ -f "${LIVE_CERT_DIR}/privkey.pem" ]; then
  echo "Using Let's Encrypt certificates from ${LIVE_CERT_DIR}"
  SSL_CERT_PATH="${LIVE_CERT_DIR}/fullchain.pem"
  SSL_KEY_PATH="${LIVE_CERT_DIR}/privkey.pem"
fi

if { [ ! -f "$SSL_CERT_PATH" ] || [ ! -f "$SSL_KEY_PATH" ]; } \
  && [ "${ENABLE_SELF_SIGNED_CERTS}" = "true" ]; then
  echo "Generating self-signed TLS certificate for ${SERVER_NAME}"
  openssl req -x509 -nodes -newkey rsa:4096 \
    -keyout "$SSL_KEY_PATH" \
    -out "$SSL_CERT_PATH" \
    -days 365 \
    -subj "/CN=${SERVER_NAME:-localhost}"
fi

if [ ! -f "$SSL_CERT_PATH" ] || [ ! -f "$SSL_KEY_PATH" ]; then
  echo "WARNING: TLS certificate or key not found at ${SSL_CERT_PATH} / ${SSL_KEY_PATH}."
  echo "Nginx will fail to start unless valid certificates are provided."
else
  chmod 640 "$SSL_CERT_PATH" "$SSL_KEY_PATH" 2>/dev/null || true
fi

export SERVER_NAME BACKEND_HOST BACKEND_PORT SSL_CERT_PATH SSL_KEY_PATH ACME_CHALLENGE_ROOT

if [ -f "$TEMPLATE_PATH" ]; then
  envsubst '${SERVER_NAME} ${BACKEND_HOST} ${BACKEND_PORT} ${SSL_CERT_PATH} ${SSL_KEY_PATH} ${ACME_CHALLENGE_ROOT}' \
    < "$TEMPLATE_PATH" > "$OUTPUT_PATH"
  echo "Rendered Nginx configuration to ${OUTPUT_PATH}"
fi

