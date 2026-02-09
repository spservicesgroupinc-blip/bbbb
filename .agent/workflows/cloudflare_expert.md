---
description: Build and deploy Cloudflare Workers backends
---
# Cloudflare Workers Backend Workflow

This workflow guides you through creating, developing, testing, and deploying Cloudflare Workers. It covers project initialization, resource integration (D1, KV, R2), and deployment best practices.

## 1. Prerequisites and Setup
Ensure you have `wrangler` installed and authenticated.

// turbo
npm install -g wrangler

// turbo
wrangler whoami

If not authenticated, run `wrangler login`.

## 2. Project Initialization
Initialize a new Cloudflare Workers project. Use the `c3` CLI for the most up-to-date templates.

```bash
npm create cloudflare@latest my-backend-worker -- --template=hello-world --ts
cd my-backend-worker
```

Or initialize within an existing directory:
```bash
npm create cloudflare@latest . -- --type=hello-world --ts --yes
```

## 3. Local Development
Start the local development server to test your changes. This emulates Cloudflare's environment locally.

```bash
npm run dev
# or
npx wrangler dev
```

During development:
- Use `console.log` for debugging (logs appear in terminal).
- Edit `src/index.ts` to modify worker logic.

## 4. Resource Integration
### D1 Database (SQLite)
Create a database:
// turbo
npx wrangler d1 create my-db

Add the binding to `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "my-db"
database_id = "<your-db-id>"
```
Create schema:
```bash
npx wrangler d1 execute my-db --local --file=./schema.sql
```

### KV Namespace (Key-Value Store)
Create a namespace:
// turbo
npx wrangler kv:namespace create MY_KV

Add the binding to `wrangler.toml`:
```toml
[[kv_namespaces]]
binding = "MY_KV"
id = "<your-kv-id>"
```

### R2 Bucket (Object Storage)
Create a bucket:
// turbo
npx wrangler r2 bucket create my-bucket

Add the binding to `wrangler.toml`:
```toml
[[r2_buckets]]
binding = "MY_BUCKET"
bucket_name = "my-bucket"
```

## 5. Deployment
Deploy your worker to the Cloudflare global network.

```bash
npm run deploy
# or
npx wrangler deploy
```

## 6. production Logs
View live logs from your deployed worker to debug issues in production.

```bash
npx wrangler tail
```
