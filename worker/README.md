# RFE Foam App - Cloudflare Deployment Guide

## Prerequisites
- Cloudflare account with Workers enabled
- Wrangler CLI installed globally or via `npx`
- Node.js 18+ installed

## Quick Start

### 1. Install Dependencies
```bash
npm run setup
```

### 2. Create D1 Database
```bash
npm run worker:db:create
```
Copy the `database_id` from the output and update `worker/wrangler.toml`.

### 3. Apply Database Schema (Local)
```bash
npm run worker:db:migrate:local
```

### 4. Set JWT Secret
```bash
npm run worker:secret:jwt
# Enter a strong secret when prompted
```

### 5. Run Development Servers
```bash
npm run dev:all
```
This starts both frontend (port 3000) and worker (port 8787).

## Production Deployment

### 1. Deploy Worker
```bash
npm run worker:deploy:prod
```

### 2. Apply Schema to Production D1
```bash
npm run worker:db:migrate:prod
```

### 3. Set Production JWT Secret
```bash
npm run worker:secret:jwt:prod
```

### 4. Update Frontend Environment
Create `.env.production` with your worker URL:
```
VITE_WORKER_URL=https://rfe-backend-prod.your-subdomain.workers.dev
```

### 5. Build and Deploy Frontend
```bash
npm run deploy:frontend
```

## Configuration

### Environment Variables (wrangler.toml)
- `JWT_SECRET`: Set via `wrangler secret put` for security
- `ALLOWED_ORIGIN`: Update to your production domain

### Frontend Variables (.env)
- `VITE_WORKER_URL`: Cloudflare Worker URL
