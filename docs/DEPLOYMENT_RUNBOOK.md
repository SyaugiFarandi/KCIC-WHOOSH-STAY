# Deployment and Backup Runbook

**Date:** 2026-11-21
**Scope:** local demo stack, CI pipeline, production-oriented Compose profile, database and object-storage backup/restore.

> **Verification status.** The restore drill below was **executed** on 2026-11-21 against the local demo data.
> The CI workflow and production profile were authored and syntax-validated (`docker compose config`) but
> **have not been executed** in this environment: the workspace is not a git repository and no production
> OIDC issuer, TLS edge or hosted runner exists here. Do not treat them as verified deployment evidence.

---

## 1. Environments

| Environment | Compose file | Purpose | Data |
|---|---|---|---|
| Local demo | `docker-compose.yml` | Development and automated tests | Synthetic demo data (`SEED_DEMO=true`) |
| Test (integration) | same Postgres container | `whoosh_stay_test` database | Seeded by integration global setup |
| CI | `.github/workflows/ci.yml` | Typecheck, lint, unit, integration, E2E, build | Ephemeral Docker services |
| Production | `docker-compose.prod.yml` | Single-node deployment behind reverse proxy | Real data, `SEED_DEMO=false` |

## 2. Local demo stack

```bash
docker compose up -d postgres minio minio-init
cp .env.example .env
npm ci
npm run build -w @whoosh/shared
npm run db:generate -w @whoosh/api
npm run db:migrate
npm run db:seed
npm run dev:api   # :4000
npm run dev:web   # :5174 (proxies /api and /health)
```

Health: `GET http://localhost:4000/health/live` and `/health/ready` (ready checks the database).

## 3. CI pipeline

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:

1. `npm ci`, copy `.env.example` to `.env`, build `@whoosh/shared`, `prisma generate`.
2. `npm run typecheck`, `npm run lint`, `npm run test:unit`.
3. Start `postgres` + `minio` from `docker-compose.yml`, wait for `pg_isready`, run `minio-init` for buckets.
4. `npm run test:integration` (global setup refuses any database other than `whoosh_stay_test`).
5. `npm run db:migrate && npm run db:seed && npm run db:verify` on the demo database.
6. Install Chromium and run `npm run test:e2e` (Playwright starts API and web dev servers; `CI` disables server reuse).
7. `npm run build`; upload `test-results`/`playwright-report` on failure and print Compose logs.

No test is skipped, retried into green or filtered in CI. The workflow requires Docker (available on GitHub-hosted Ubuntu runners).

## 4. Production profile

### 4.1 Prerequisites and blockers

- **Blocked by external dependency:** `NODE_ENV=production` refuses mock auth. A real deployment requires an
  official OIDC issuer, client ID/secret and redirect URI (`apps/api/src/config/env.ts`). Until KCIC provides them,
  only the demo/mock environment can run.
- TLS is terminated upstream (load balancer or ingress). The bundled nginx container listens on plain HTTP `:8080`.
- Single node only; no orchestrator, autoscaling or multi-replica support is provided or tested.

### 4.2 Configuration

```bash
cp infrastructure/docker/production.env.example infrastructure/docker/production.env
# Replace every CHANGE_ME value. Keep the password inside DATABASE_URL identical to POSTGRES_PASSWORD.
# production.env is gitignored; never commit it.
```

Startup guards reject: mock auth, missing OIDC settings, `SEED_DEMO=true`, enabled employee/roster sync,
development session secret. `TRUST_PROXY=true` is set because the API only receives traffic from the nginx container.

### 4.2.1 Optional outbound integrations (off by default)

Adapters for SMTP email, Telegram and HTTP employee sync are implemented; the shipped configuration keeps all
three inactive, so `notification_deliveries` stay `MOCK_DELIVERED`, employee sync uses the DEMO provider and
dashboard labels stay `MOCK`/`DISABLED`.

| Capability | Activate by | Notes |
|---|---|---|
| SMTP email | `EMAIL_PROVIDER=smtp` + `SMTP_HOST` + `SMTP_FROM` (+ `SMTP_USER`/`SMTP_PASSWORD` if the relay authenticates) and the `notifications.emailEnabled` system setting | Startup rejects incomplete SMTP config; users need an email address. |
| Telegram | `TELEGRAM_BOT_TOKEN` and the `notifications.telegramEnabled` system setting | Each user binds their own chat ID under Profil → Notifikasi Telegram (`PUT /api/v1/auth/me/telegram`); missing binding records a FAILED delivery. |
| HTTP employee sync | `EMPLOYEE_SYNC_ENABLED=true` + `EMPLOYEE_SYNC_BASE_URL` + auth (`EMPLOYEE_SYNC_AUTH_TYPE` + token or username/password) | Response contract: array or `{items|data|employees}` with `externalEmployeeId`, `employeeCode`, `fullName` (camelCase or snake_case accepted); other fields optional. **Production startup still refuses this flag** until the official contract is approved, so enable it only in approved non-production environments. |

`GET /api/v1/admin/notification-deliveries` reports the actual delivery mode, and
`/dashboard/overview` + `/admin/employees/sync-runs` report `CONFIGURED` once the relevant credentials are present.

### 4.3 Deploy

```bash
docker compose --env-file infrastructure/docker/production.env \
  -f docker-compose.prod.yml up -d --build
```

Services:

- `postgres` — internal only, named volume `whoosh_prod_pgdata`.
- `minio` + `minio-init` — internal only; buckets created and set to private.
- `migrate` — one-shot `prisma migrate deploy`; must exit 0 before the API starts.
- `api` — `node dist/server.js`, health check on `/health/ready`.
- `web` — nginx serving the SPA and reverse-proxying `/api` and `/health` to `api:4000`.

Verify:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://localhost:8080/health/ready
```

The reverse proxy config is `infrastructure/nginx/whoosh-stay.conf` (SPA fallback, static asset caching,
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, 30 MB upload limit).

### 4.4 Seeding policy

Never run `db:seed` against production. Production seeding is blocked by `SEED_DEMO=false`; the seed command is
for demo/test databases only.

## 5. Backup

### 5.1 Database

```bash
infrastructure/scripts/pg-backup.sh ./backups
# or for the production profile:
COMPOSE_FILE=docker-compose.prod.yml infrastructure/scripts/pg-backup.sh ./backups
```

The script writes a custom-format archive with a UTC timestamp, verifies the `PGDMP` signature and prints the
SHA-256 checksum. It only reads the source database.

### 5.2 Object storage

```bash
infrastructure/scripts/minio-backup.sh ./backups
```

Mirrors `whoosh-stay-assets` and `whoosh-stay-evidence` to a timestamped host directory using the MinIO client
inside the container. The buckets are not modified. Database and object backups must be taken together and
retained with the same timestamp; a database restore without matching objects leaves gallery and evidence
references dangling.

### 5.3 Scheduling (not implemented)

No scheduler ships with the project. Configure an external cron/systemd timer that runs both scripts nightly,
copies the output off-host, and alerts on failure. Retention and encryption at rest are operator decisions and
were not implemented or tested.

## 6. Restore

### 6.1 Executed drill (2026-11-21)

Command:

```bash
infrastructure/scripts/pg-backup.sh ./backups/drill
infrastructure/scripts/pg-restore-drill.sh ./backups/drill/whoosh_stay-20261121T082504Z.dump
infrastructure/scripts/minio-backup.sh ./backups/drill
```

Results:

| Check | Source | Restored | Result |
|---|---|---|---|
| Public tables | 41 | 41 | match |
| Rows in `reservations` + `audit_logs` + `beds` | 832 | 832 | match |
| Exclusion constraints / non-internal triggers | 1 / 1 | 1 / 1 | match |
| Applied migrations | 3 | 3 | match |
| `UPDATE audit_logs` attempt | rejected (append-only) | rejected (append-only) | pass |
| Object storage | 700 assets / 33 MiB, 8 evidence / 442 B | temporary bucket: 700 / 33 MiB | match |

The drill restores into a throw-away database (`whoosh_restore_drill_<timestamp>_<pid>`), compares counts,
attempts the forbidden `audit_logs` update, then drops the drill database and the copied archive. The temporary
MinIO bucket and staging directory were deleted after the comparison. Neither `whoosh_stay` nor
`whoosh_stay_test` was modified, and the drill backup was removed afterwards.

### 6.2 Restoring a real database

1. Take a **fresh** backup before recovery work.
2. Restore into a new database first, never over the live one:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T postgres \
     createdb -U whoosh whoosh_stay_restore
   docker compose -f docker-compose.prod.yml exec -T postgres \
     pg_restore -U whoosh -d whoosh_stay_restore --no-owner --no-privileges --exit-on-error <archive>
   ```
   (Copy the archive into the container or pipe it with `cat archive | docker compose exec -T postgres pg_restore ...`.)
3. Validate the restored database with the same comparisons used by `pg-restore-drill.sh`.
4. During a maintenance window, stop `api`, rename the live database aside, promote the restored database
   (rename it to `whoosh_stay`), start `api`, and confirm `/health/ready` plus login. Keep the old database until
   acceptance.
5. Restore objects with `mc mirror` from the matching object backup into the original buckets. Verify gallery and
   attachment downloads before closing the incident.

These promotion steps were not executed against production data; only the isolated drill above was executed.

## 7. Rollback

- Application: redeploy the previous image tag (`whoosh-stay-api:local` / `whoosh-stay-web:local` are placeholders;
  use your registry tags). Images are built from the repository, so keep the previous checkout/tag.
- Database: migrations are forward-only. Restore the pre-deploy backup with the procedure above; do not hand-edit
  migrations or drop constraints.
- Object storage: restore the matching bucket backup.

## 8. Known gaps

- CI workflow not yet run on a hosted runner.
- Production profile not executed (no OIDC issuer, TLS edge or production credentials).
- No automated backup scheduling, off-site replication, encryption or retention tooling.
- No monitoring/alerting stack, no log shipping and no API CSP (documented limitation in `IMPLEMENTATION_STATUS.md`).
- No point-in-time recovery (WAL archiving) configuration; the provided drill uses logical `pg_dump` backups.
- No load, soak or failover testing beyond the local latency measurements recorded in `IMPLEMENTATION_STATUS.md`.
