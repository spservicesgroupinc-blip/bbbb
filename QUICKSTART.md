# Quick Start Guide

Get up and running in 5 minutes for local development.

## Prerequisites

- Node.js v18+ installed
- A Cloudflare account (free tier is fine)

## Quick Setup

### 1. Install Dependencies

```bash
npm run setup
```

This installs all frontend and backend dependencies.

### 2. Authenticate with Cloudflare

```bash
cd worker
npx wrangler login
```

Opens browser to authenticate with Cloudflare.

### 3. Create Database

```bash
# Create D1 database
npx wrangler d1 create rfe-db
```

Copy the `database_id` from output and update `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "rfe-db"
database_id = "paste-your-id-here"
```

Then migrate:

```bash
npm run db:migrate:local
```

### 4. Create R2 Bucket

```bash
npx wrangler r2 bucket create rfe-app-files
```

### 5. Set JWT Secret

```bash
npm run secret:jwt
```

When prompted, enter any secure random string (at least 32 characters). You can generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 6. Configure Environment

Create `.env.local` in project root:

```env
VITE_WORKER_URL=http://localhost:8787
```

### 7. Start Development

```bash
cd ..
npm run dev:all
```

This starts:
- Frontend: http://localhost:3000
- Backend: http://localhost:8787

### 8. Test It Out

1. Open http://localhost:3000
2. Click "Sign Up"
3. Create an account
4. Start using the app!

## What Just Happened?

✅ **Cloudflare Workers** - Your backend API is running locally  
✅ **Cloudflare D1** - SQLite database is running locally  
✅ **Cloudflare R2** - File storage is configured  
✅ **JWT Authentication** - Secure login is working  

All your data is stored in Cloudflare infrastructure:
- User accounts → D1 database
- Customers → D1 database  
- Estimates → D1 database
- Inventory → D1 database
- Photos/PDFs → R2 storage

## Next Steps

- Read [README.md](README.md) for full documentation
- Read [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) for production deployment
- Read [DATA_STORAGE_VERIFICATION.md](DATA_STORAGE_VERIFICATION.md) to understand data flow

## Common Issues

### "Database not found"
Run: `npm run worker:db:migrate:local`

### "Bucket not found"  
Run: `npx wrangler r2 bucket create rfe-app-files`

### "Invalid token"
Run: `npm run worker:secret:jwt`

### Port already in use
- Frontend (3000): Edit `vite.config.ts` to use different port
- Backend (8787): Edit `worker/wrangler.toml` to use different port

## Need Help?

Check the full documentation:
- [README.md](README.md) - Complete setup guide
- [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) - Detailed Cloudflare configuration
- [DATA_STORAGE_VERIFICATION.md](DATA_STORAGE_VERIFICATION.md) - How data storage works
