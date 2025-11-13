# Quiz Ansar Deployment Guide

This project contains a Fastify + PostgreSQL backend and a React/Vite frontend that are packaged for production behind an Nginx reverse proxy with automatic HTTPS (Let's Encrypt / Certbot).

## Prerequisites
- Docker Engine ≥ 24 and Docker Compose plugin.
- Domain name pointing to the host (required for Let's Encrypt).
- Ports `80` and `443` available on the host.

## Directory Layout
- `backend/` — Fastify API and Socket.IO server.
- `frontend/` — React SPA built with Vite.
- `infra/nginx/` — Multi-stage Dockerfile for building the SPA and serving it via Nginx.
- `ops/nginx/` — Parametrised Nginx configuration template.
- `infra/certs/` — Mounted volume where TLS certificates are stored inside the Nginx container.

## Configuration
1. Copy the example environment files and edit them to match your environment:
   ```bash
   cp env.example .env
   cp backend/env.example backend/.env
   # Optional: used only for local Vite development
   cp frontend/env.example frontend/.env
   ```
2. Update `.env`:
   - `SERVER_NAME` — your public domain (e.g. `quiz.example.com`).
   - `LETSENCRYPT_EMAIL` — email used for Let's Encrypt registration.
   - `PUBLIC_API_URL` — public URL that the frontend should call (e.g. `https://quiz.example.com/api`).
   - If you already have certificates, set `SSL_CERT_PATH` and `SSL_KEY_PATH` to the mounted paths inside the container (default `/etc/ssl/private/server.crt` and `/etc/ssl/private/server.key`).
3. Update `backend/.env` as needed:
   - Change `JWT_SECRET` and default admin credentials.
   - Adjust database credentials when deploying to a managed PostgreSQL instance (set `DB_SSL=true` and provide CA bundle if necessary).

## Building and Running
```bash
docker compose build
docker compose up -d db
docker compose up -d backend
docker compose up -d web
```

The backend waits for PostgreSQL, applies connection retries, and exposes `/healthz` for container health checks. Nginx serves the built frontend, proxies `/api`, `/uploads`, and `/socket.io` to the backend, and enforces HTTPS.

## Database Bootstrap
To initialise the schema using `backend/init.sql`:
```bash
docker compose exec -T db psql -U "${DB_USER}" -d "${DB_NAME}" < backend/init.sql
```
You can load seed data the same way.

## Obtaining HTTPS Certificates
Run Certbot using the dedicated profile once the `web` service is online and your domain points to the host:
```bash
docker compose --profile certbot run --rm certbot
docker compose restart web
```

The Certbot container shares volumes with Nginx and copies the generated certificates into `infra/certs/`. Nginx automatically reloads the rendered configuration on restart. To renew certificates, repeat the command above (Let's Encrypt recommends automating this via cron).

### Self-signed Certificates (Optional)
For staging environments without public DNS you can enable self-signed certificates:
```bash
echo "ENABLE_SELF_SIGNED_CERTS=true" >> .env
docker compose up -d web
```

## Logs and Monitoring
- Backend logs: `docker compose logs -f backend`
- Nginx logs: `docker compose logs -f web`
- Database logs: `docker compose logs -f db`

## Shutdown
```bash
docker compose down
```
Add `--volumes` if you want to remove PostgreSQL data and uploaded files.

## Troubleshooting
- **Backend cannot connect to PostgreSQL** — check the `.env` credentials and ensure the database is healthy (`docker compose ps`).
- **TLS certificate missing** — verify the files in `infra/certs/` or regenerate with Certbot; enable self-signed certs for local testing.
- **Frontend API calls fail** — confirm `PUBLIC_API_URL` matches the public domain and that the Nginx container proxies to the backend (`docker compose logs web`).

