# Optional Docker Desktop Runbook

Docker is **not required** for KwantuHub development; the app only needs Node.js 22, pnpm, and PostgreSQL. Docker Desktop is useful when you want a reproducible local stack or to move the project to Manus Desktop/My Computer.

## Run the full stack

```bash
cp .env.example .env
# Replace SESSION_SECRET and POSTGRES_PASSWORD before any shared deployment.
docker compose up --build -d
docker compose exec app pnpm run db:seed
```

Open `http://localhost:3000` and verify:

```bash
curl http://localhost:3000/api/v1/health
BASE_URL=http://localhost:3000 docker compose exec app pnpm run test:acceptance
```

## Stop or reset

```bash
docker compose down
# Destructive local reset (removes PostgreSQL and upload volumes):
docker compose down -v
```

## Manus Desktop handoff

1. Install and connect [Manus Desktop](https://manus.im/desktop).
2. Mount the cloned `KwantuHub` repository directory.
3. Keep Docker Desktop running.
4. Ask Manus to continue in that mounted directory and run the commands above.

Your local machine must remain online while Manus Desktop is working. Moving is optional; the current sandbox already runs the same Next.js/PostgreSQL stack successfully without Docker.
