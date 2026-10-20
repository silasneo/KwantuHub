# KwantuHub Production Operations & Incident Runbook

## 1. System Architecture Overview
- **Compute / Frontend / API**: Node.js 22 runtime serving Express 4 + Vite-bundled React 19 SPA + tRPC 11 + OpenAPI / Swagger at `/api-docs` + REST at `/api/v1/*`.
- **Database**: Cloud TiDB / MySQL cluster accessed exclusively via Drizzle ORM through connection pooling.
- **Background Worker**: Self-healing outbox worker in `server/notificationWorker.ts` processing queued transactional emails with exponential backoff and lease locks.
- **External Integrations**:
  - Email: SendPulse Transactional REST API & Webhooks
  - Bot Protection: Cloudflare Turnstile
  - Phone Verification: Twilio Verify
  - Identity Verification: Veriff / Sumsub / Manual Evidence

---

## 2. Database Backup & Disaster Recovery Runbook
### 2.1 Automated Snapshots
- Managed database provider retains automated continuous daily snapshots with point-in-time recovery (PITR) up to 7 days.

### 2.2 Manual Schema & Data Export
```bash
# Dump complete schema and table definitions
mysqldump -h $DB_HOST -u $DB_USER -p$DB_PASSWORD --no-data $DB_NAME > kwantuhub_schema_$(date +%F).sql

# Dump full data excluding ephemeral notification deliveries
mysqldump -h $DB_HOST -u $DB_USER -p$DB_PASSWORD $DB_NAME > kwantuhub_full_$(date +%F).sql
```

### 2.3 Verified Restoration Procedure
1. Create a fresh target staging/recovery database instance.
2. Apply migrations sequentially:
   ```bash
   pnpm drizzle-kit push  # or run migrations 0000 through 0016
   ```
3. Import exported datasets:
   ```bash
   mysql -h $TARGET_HOST -u $DB_USER -p$DB_PASSWORD $TARGET_DB < kwantuhub_full_backup.sql
   ```
4. Verify record counts for `users`, `vendorProfiles`, `listings`, and `categories`.
5. Point `DATABASE_URL` to target instance and verify `/api/v1/health` returns status `healthy`.

---

## 3. Worker Monitoring & Incident Response
### 3.1 Unhealthy Worker Detection
- **Symptom**: `notificationOutbox` rows remain in `queued` or `failed` state with `attempts >= 6`.
- **Admin Action**: Open Admin Control Room → **Notifications** tab.
  - Review failed delivery errors and SendPulse rejection codes.
  - Click **Retry** on resolved recipient email addresses.
  - Unblock any active recipient email in the **Suppressions** subpanel.

### 3.2 High-Risk Abuse / Spam Incident
- **Symptom**: Spikes in review submissions or inquiries from a single IP/account.
- **Automated Shield**: Cloudflare Turnstile rejects bots at the edge; rate limiters enforce cooldowns on inquiry creation and contact reveals.
- **Admin Action**: Open Admin Control Room → **Conversation Reports** tab.
  - Click **Suspend User** or **Hide Message** to immediately remove abusive content from the marketplace without code deploys.
