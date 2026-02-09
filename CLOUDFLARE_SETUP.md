# Cloudflare Setup Guide

This guide walks you through setting up the complete Cloudflare infrastructure for the Spray Foam Business Management App.

## Overview

The application uses three Cloudflare services:
1. **Cloudflare Workers** - Backend API
2. **Cloudflare D1** - Database (SQLite)
3. **Cloudflare R2** - File storage (Images & PDFs)
4. **Cloudflare Pages** - Frontend hosting (optional)

## Prerequisites

- A Cloudflare account (free tier works for development)
- Node.js v18 or later installed
- Git installed

## Step-by-Step Setup

### Step 1: Initial Installation

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd bbbb

# Install all dependencies
npm run setup
```

### Step 2: Authenticate with Cloudflare

```bash
cd worker
npx wrangler login
```

This will open a browser window to authenticate with your Cloudflare account.

### Step 3: Create D1 Database

```bash
# Create the database
npx wrangler d1 create rfe-db
```

This command will output something like:
```
✅ Successfully created DB 'rfe-db'

[[d1_databases]]
binding = "DB"
database_name = "rfe-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Copy the `database_id`** and update it in `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "rfe-db"
database_id = "YOUR-DATABASE-ID-HERE"
```

### Step 4: Run Database Migrations

```bash
# For local development
npm run db:migrate:local

# For remote database
npm run db:migrate
```

This creates all necessary tables: users, customers, estimates, inventory, equipment, settings, and logs.

### Step 5: Create R2 Buckets

```bash
# Development bucket
npx wrangler r2 bucket create rfe-app-files

# Production bucket
npx wrangler r2 bucket create rfe-app-files-prod

# Staging bucket (optional)
npx wrangler r2 bucket create rfe-app-files-staging
```

The R2 buckets are already configured in `wrangler.toml` with these names.

### Step 6: Set JWT Secret

For security, set a strong JWT secret:

```bash
# Generate a random secret (example)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Set the secret for development
npm run secret:jwt
# When prompted, paste the generated secret

# Set the secret for production
npm run secret:jwt:prod
# When prompted, paste a DIFFERENT generated secret
```

### Step 7: Configure Environment Variables

#### Backend (worker/wrangler.toml)

Update the CORS origins for your environments:

```toml
[vars]
ALLOWED_ORIGIN = "http://localhost:3000"

[env.production.vars]
ALLOWED_ORIGIN = "https://your-production-domain.com"
```

#### Frontend (.env.local)

Create a `.env.local` file in the project root:

```env
# For local development
VITE_WORKER_URL=http://localhost:8787

# Optional: Gemini API key for AI features
GEMINI_API_KEY=your-gemini-api-key
```

### Step 8: Test Local Development

```bash
# From project root
cd ..
npm run dev:all
```

This starts:
- Frontend: http://localhost:3000
- Backend: http://localhost:8787

Test the setup by:
1. Opening http://localhost:3000 in your browser
2. Creating a new account (signup)
3. Verifying you can log in

### Step 9: Deploy to Production

#### Deploy Backend Worker

```bash
# Deploy to production
npm run worker:deploy:prod
```

Take note of the deployed URL, e.g.:
```
https://rfe-backend-prod.your-subdomain.workers.dev
```

#### Run Production Database Migration

```bash
npm run worker:db:migrate:prod
```

#### Deploy Frontend

**Option A: Cloudflare Pages (Automatic)**

1. Go to Cloudflare Dashboard → Pages
2. Click "Create a project"
3. Connect your Git repository
4. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
5. Add environment variables:
   - `VITE_WORKER_URL`: Your production worker URL
   - `GEMINI_API_KEY`: (optional)
6. Deploy!

**Option B: Manual Deployment**

```bash
# Build with production worker URL
VITE_WORKER_URL=https://rfe-backend-prod.your-subdomain.workers.dev npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name=rfe-foam-app
```

#### Update CORS Settings

After deploying frontend, update `worker/wrangler.toml`:

```toml
[env.production.vars]
ALLOWED_ORIGIN = "https://rfe-foam-app.pages.dev"
```

Then redeploy the worker:
```bash
npm run worker:deploy:prod
```

## Verification Checklist

- [ ] D1 database created and migrated
- [ ] R2 buckets created for all environments
- [ ] JWT secrets set for dev and production
- [ ] Worker deployed successfully
- [ ] Frontend can connect to worker
- [ ] User signup works
- [ ] User login works
- [ ] Data sync works (save/load)
- [ ] File uploads work (images/PDFs)

## Architecture Diagram

```
┌─────────────────────────────────────────────────┐
│                   Browser                       │
│         (React App on Cloudflare Pages)        │
└────────────────┬────────────────────────────────┘
                 │ HTTPS (JWT Auth)
                 ▼
┌─────────────────────────────────────────────────┐
│         Cloudflare Workers (Hono API)          │
│              - Auth (JWT)                       │
│              - Sync endpoints                   │
│              - Job management                   │
└────┬────────────────────────────────────┬───────┘
     │                                     │
     │ SQL Queries                         │ File Storage
     ▼                                     ▼
┌─────────────────┐               ┌────────────────┐
│  Cloudflare D1  │               │ Cloudflare R2  │
│   (Database)    │               │ (File Storage) │
│                 │               │                │
│ - users         │               │ - photos/      │
│ - customers     │               │ - pdfs/        │
│ - estimates     │               │                │
│ - inventory     │               │                │
│ - equipment     │               │                │
│ - settings      │               │                │
│ - logs          │               │                │
└─────────────────┘               └────────────────┘
```

## Data Storage Details

### D1 Database Tables

All tables include a `company_name` field for multi-tenancy:

- **users**: Authentication and company info
- **customers**: Customer contact information
- **estimates**: Job estimates and invoices
- **inventory**: Material inventory tracking
- **equipment**: Equipment management
- **settings**: Company-specific configuration
- **logs**: Material usage audit logs

### R2 Bucket Structure

```
rfe-app-files/
├── {company-name}/
│   ├── photos/
│   │   ├── photo_123456.jpg
│   │   └── ...
│   └── pdfs/
│       ├── estimate-123.pdf
│       └── invoice-456.pdf
```

## Security Best Practices

1. **JWT Secrets**: Use different secrets for dev/staging/prod
2. **CORS**: Always restrict to specific domains in production
3. **Database**: D1 data is automatically encrypted at rest
4. **R2 Files**: Access controlled through worker authentication
5. **Secrets**: Never commit secrets to git - use `wrangler secret put`

## Cost Estimation

Cloudflare Free Tier includes:
- **Workers**: 100,000 requests/day
- **D1**: 5GB storage, 5 million reads/day, 100k writes/day
- **R2**: 10GB storage, 1 million Class A operations/month
- **Pages**: Unlimited bandwidth, unlimited requests

These limits are typically sufficient for small to medium businesses.

## Monitoring

### View Worker Logs

```bash
# Development
npm run worker:tail

# Production
npm run worker:tail:prod
```

### Check Database

```bash
# Query database
npx wrangler d1 execute rfe-db --command "SELECT COUNT(*) FROM users"

# Production database
npx wrangler d1 execute rfe-db --env production --command "SELECT COUNT(*) FROM users"
```

### Monitor R2 Usage

Visit: https://dash.cloudflare.com → R2 → Your bucket → Analytics

## Troubleshooting

### "Database not found" errors
```bash
# Verify database exists
npx wrangler d1 list

# Check database_id in wrangler.toml matches
```

### "Bucket not found" errors
```bash
# Verify bucket exists
npx wrangler r2 bucket list

# Check bucket names in wrangler.toml match
```

### CORS errors
- Verify ALLOWED_ORIGIN in wrangler.toml matches your frontend domain
- Ensure you've redeployed the worker after changing CORS settings

### Authentication errors
- Verify JWT_SECRET is set: `npx wrangler secret list`
- Check token expiration (7 days by default)
- Clear browser localStorage and try fresh login

## Additional Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)

## Support

For issues specific to this application, contact the development team.
For Cloudflare platform issues, visit the [Cloudflare Community](https://community.cloudflare.com/).
