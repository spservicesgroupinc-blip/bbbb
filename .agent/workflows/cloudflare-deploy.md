---
description: Deploy Cloudflare Worker with D1 database and R2 storage
---

# Cloudflare Worker Deployment Workflow

## Prerequisites

- Cloudflare account with Workers plan
- Wrangler CLI installed (`npm install -g wrangler`)
- Authenticated with Cloudflare (`wrangler login`)

---

## Initial Setup (First Time Only)

### 1. Create D1 Database

```bash
cd worker
npx wrangler d1 create rfe-db
```

Copy the `database_id` from the output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "rfe-db"
database_id = "YOUR_ACTUAL_DATABASE_ID"
```

### 2. Apply Database Schema

```bash
cd worker
npx wrangler d1 execute rfe-db --file=schema.sql --remote
```

### 3. Create R2 Bucket

```bash
npx wrangler r2 bucket create rfe-app-files
```

### 4. Set Production Secrets

```bash
npx wrangler secret put JWT_SECRET --env production
```

Enter a secure random string when prompted.

---

## Git Integration Setup

### Option A: Cloudflare Dashboard (Recommended)

1. Go to **Workers & Pages** in Cloudflare dashboard
2. Select the `rfe-backend` Worker (or create new)
3. Go to **Settings** → **Builds**
4. Click **Connect** and select your GitHub/GitLab repo
5. Configure build settings:
   - **Root directory**: `worker`
   - **Build command**: `npm install && npm run build`
   - **Deploy command**: `npx wrangler deploy`

> ⚠️ **Important**: Worker name in dashboard must match `name` in `wrangler.toml` (`rfe-backend`)

### Option B: GitHub Actions

Create `.github/workflows/deploy-worker.yml`:

```yaml
name: Deploy Worker

on:
  push:
    branches: [main]
    paths:
      - 'worker/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        working-directory: ./worker
        run: npm ci
      
      - name: Deploy to Cloudflare
        working-directory: ./worker
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Add `CLOUDFLARE_API_TOKEN` to GitHub repository secrets.

---

## Manual Deployment

### Deploy to Production

```bash
cd worker
// turbo
npm run deploy
```

Or directly:

```bash
cd worker
npx wrangler deploy --env production
```

### Deploy Preview Version (No Auto-Deploy)

```bash
cd worker
npx wrangler versions upload
```

---

## Verification

### Check Worker Status

```bash
npx wrangler deployments list
```

### Test API Endpoint

```bash
curl https://rfe-backend.YOUR_SUBDOMAIN.workers.dev/api/health
```

### View Logs

```bash
npx wrangler tail
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails with name mismatch | Ensure `name` in `wrangler.toml` matches Worker name in dashboard |
| D1 connection fails | Verify `database_id` is correct and database exists |
| CORS errors | Update `ALLOWED_ORIGIN` in `wrangler.toml` for your frontend URL |
| Secret not found | Run `wrangler secret put <NAME>` for each required secret |

---

## Environment Configuration

Update `wrangler.toml` before production:

```toml
[env.production.vars]
ALLOWED_ORIGIN = "https://your-actual-frontend-domain.com"
```
