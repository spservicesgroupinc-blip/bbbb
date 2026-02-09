# Data Storage Verification Guide

This document explains how all data is stored in Cloudflare infrastructure and how to verify the setup.

## Data Storage Architecture

### 1. Cloudflare D1 (Database) - PRIMARY DATA STORAGE

All business data is stored in Cloudflare D1 SQLite database with multi-tenancy support:

#### Tables and Data Scope

Every table (except users) includes a `company_name` field to ensure data isolation:

**users table:**
- `username` (PRIMARY KEY)
- `password_hash` (bcrypt encrypted)
- `company_name`
- `email`
- `role` (admin/crew)
- `crew_pin` (4-digit PIN for crew access)

**customers table:**
- All customer contact information
- Scoped by `company_name`
- Full JSON data stored in `json_data` field

**estimates table:**
- Job estimates and invoices
- Links to customers via `customer_id`
- Scoped by `company_name`
- Includes `pdf_link` for generated PDFs

**inventory table:**
- Material inventory items
- Quantities and unit costs
- Scoped by `company_name`

**equipment table:**
- Equipment tracking
- Status management
- Scoped by `company_name`

**settings table:**
- Company-specific configuration
- Pricing, yields, costs
- Company profile
- Scoped by `company_name` + `config_key`

**logs table:**
- Material usage audit trail
- Job completion logs
- Scoped by `company_name`

### 2. Cloudflare R2 (Object Storage) - FILE STORAGE

All files (images, PDFs) are stored in R2 buckets:

**Bucket Structure:**
```
{bucket-name}/
├── {company-name}/
│   ├── photos/
│   │   └── [job site photos]
│   └── pdfs/
│       └── [estimates and invoices]
```

**Access Control:**
- Files are accessed through the Worker API
- Authentication required via JWT
- Files scoped by company name in path

### 3. Authentication Flow (JWT)

```
User Login → Backend validates credentials
           → Generates JWT token (signed with JWT_SECRET)
           → Token expires in 7 days
           
Protected Request → Frontend sends token in Authorization header
                  → Backend verifies JWT signature
                  → Extracts username from token
                  → Looks up user in D1 database
                  → Returns company_name for data scoping
```

## Verification Steps

### Step 1: Verify D1 Database Setup

```bash
# List all databases
cd worker
npx wrangler d1 list

# Check if your database exists
# Output should include: rfe-db

# Query the database to see tables
npx wrangler d1 execute rfe-db --command "SELECT name FROM sqlite_master WHERE type='table'"

# Expected output: users, customers, estimates, inventory, equipment, settings, logs
```

### Step 2: Verify R2 Buckets

```bash
# List all R2 buckets
npx wrangler r2 bucket list

# Expected output should include:
# - rfe-app-files (development)
# - rfe-app-files-prod (production)
# - rfe-app-files-staging (staging, if created)
```

### Step 3: Verify Authentication Works

Start the local development environment:

```bash
cd ..
npm run dev:all
```

Test authentication:
1. Open http://localhost:3000
2. Click "Sign Up"
3. Create a test account:
   - Username: testuser
   - Password: testpass123
   - Company: Test Company
   - Email: test@example.com
4. After signup, you should be logged in
5. Check browser DevTools → Application → Local Storage
6. Verify `userSession` exists with a JWT token

### Step 4: Verify Data Sync

After logging in:
1. Navigate to Settings
2. Update your company profile
3. Add some inventory items
4. Create a customer
5. Check the browser Network tab
6. You should see:
   - POST to `/sync/up` (saving data)
   - Response: `{"status":"success"}`

Query the database to verify:
```bash
cd worker
npx wrangler d1 execute rfe-db --local --command "SELECT company_name, config_key FROM settings"
npx wrangler d1 execute rfe-db --local --command "SELECT id, name, company_name FROM customers"
```

### Step 5: Verify File Upload (R2)

Test file uploads:
1. Create an estimate
2. Take/upload a job site photo
3. Check browser Network tab
4. You should see: POST to `/jobs/upload-image`
5. Response should include: `{"status":"success","data":{"url":"/files/..."}}`

Check R2 bucket:
```bash
cd worker
npx wrangler r2 object list rfe-app-files --local
```

### Step 6: Verify Crew PIN Login

Test crew authentication:
1. Log out
2. Click "Crew Login" (if available in UI)
3. Enter:
   - Username: testuser (your admin username)
   - PIN: [4-digit PIN shown during signup]
4. Should successfully log in with role: crew

Or test via API:
```bash
curl -X POST http://localhost:8787/auth/crew-login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","pin":"1234"}'
```

## Data Flow Diagram

```
┌──────────────┐
│   Browser    │
│  (Frontend)  │
└──────┬───────┘
       │ 1. POST /auth/login
       │    {username, password}
       ▼
┌──────────────────────┐
│  Cloudflare Worker   │
│                      │
│  2. Query D1:        │
│     SELECT * FROM    │──────┐
│     users WHERE      │      │
│     username = ?     │      │
│                      │      │
│  3. Verify password  │      │
│     (bcrypt.compare) │      │
│                      │      │
│  4. Generate JWT     │      │
│     (sign with       │      │
│      JWT_SECRET)     │      │
└──────┬───────────────┘      │
       │                       │
       │ 5. Return token       │
       │    {token, username,  │
       │     companyName}      │
       ▼                       ▼
┌──────────────┐      ┌──────────────┐
│   Browser    │      │  D1 Database │
│  (Frontend)  │      │              │
│              │      │ - users      │
│ Store token  │      │ - customers  │
│ in localStorage     │ - estimates  │
└──────┬───────┘      │ - inventory  │
       │              │ - equipment  │
       │              │ - settings   │
       │              │ - logs       │
       │              └──────────────┘
       │ 6. POST /sync/down
       │    Header: Authorization: Bearer <token>
       ▼
┌──────────────────────┐
│  Cloudflare Worker   │
│                      │
│  7. Verify JWT       │
│     Extract username │
│                      │
│  8. Query D1:        │
│     Get companyName  │
│                      │
│  9. Query D1:        │──────┐
│     SELECT * FROM    │      │
│     customers WHERE  │      │
│     company_name = ? │      │
│                      │      │
│  10. Query D1:       │      │
│     SELECT * FROM    │      │
│     estimates WHERE  │      │
│     company_name = ? │      │
│                      │      │
│  (Same for all other │      │
│   tables)            │      │
└──────┬───────────────┘      │
       │                       │
       │ 11. Return all data   │
       │     scoped to company │
       ▼                       ▼
┌──────────────┐      ┌──────────────┐
│   Browser    │      │  D1 Database │
│  (Frontend)  │      └──────────────┘
│              │
│ Update state │
└──────────────┘
```

## Security Features

### 1. Password Security
- Passwords hashed with bcrypt (cost factor: 10)
- Never stored in plain text
- Never transmitted to frontend

### 2. JWT Security
- Tokens signed with secret key
- 7-day expiration
- Verified on every request
- Secret stored in Cloudflare Workers environment

### 3. Data Isolation
- All data scoped by `company_name`
- SQL queries always include company_name filter
- No cross-company data leakage possible

### 4. CORS Protection
- Restricted to specific origins per environment
- Development: http://localhost:3000
- Production: Your deployed domain

### 5. R2 File Security
- Files not publicly accessible
- Must go through Worker API
- JWT authentication required
- Files organized by company name

## Common Issues and Solutions

### Issue: "Database not found"
**Solution:**
```bash
# Verify database exists
npx wrangler d1 list

# If missing, create it
npx wrangler d1 create rfe-db

# Update database_id in wrangler.toml
# Then migrate
npm run db:migrate:local
```

### Issue: "Bucket not found"
**Solution:**
```bash
# Create the bucket
npx wrangler r2 bucket create rfe-app-files

# Verify it exists
npx wrangler r2 bucket list
```

### Issue: "Invalid token" errors
**Solution:**
```bash
# Verify JWT_SECRET is set
npx wrangler secret list

# If not set, create one
npm run secret:jwt
```

### Issue: "CORS error"
**Solution:**
Update `ALLOWED_ORIGIN` in `worker/wrangler.toml` to match your frontend URL, then redeploy:
```bash
npm run worker:deploy
```

### Issue: Data not persisting
**Solution:**
Verify you're using the correct database:
- Local development: Uses `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/` 
- Remote: Uses Cloudflare D1 production database

For local issues, try:
```bash
# Reset local database
rm -rf .wrangler/state
npm run db:migrate:local
```

## Monitoring Data Storage

### Check D1 Storage Usage

Visit: https://dash.cloudflare.com → D1 → Your database → Metrics

Shows:
- Database size
- Rows written
- Rows read
- Query performance

### Check R2 Storage Usage

Visit: https://dash.cloudflare.com → R2 → Your bucket → Metrics

Shows:
- Storage used
- Number of objects
- Bandwidth used
- Class A/B operations

### View Worker Logs

```bash
# Development
npm run worker:tail

# Production
npm run worker:tail:prod
```

Shows real-time logs of:
- API requests
- Database queries
- Authentication attempts
- Errors

## Production Checklist

Before going live, verify:

- [ ] D1 production database created and migrated
- [ ] R2 production bucket created
- [ ] JWT_SECRET set for production (different from dev)
- [ ] ALLOWED_ORIGIN set to production frontend URL
- [ ] Worker deployed to production
- [ ] Frontend deployed with correct VITE_WORKER_URL
- [ ] Test signup and login in production
- [ ] Test data sync in production
- [ ] Test file upload in production
- [ ] Verify CORS working in production
- [ ] Check error logs for any issues

## Summary

✅ **All authentication is handled by Cloudflare Workers with JWT**
✅ **All business data is stored in Cloudflare D1 database**
✅ **All files are stored in Cloudflare R2 buckets**
✅ **Data is automatically scoped by company for multi-tenancy**
✅ **Passwords are securely hashed with bcrypt**
✅ **Access is controlled via JWT tokens with 7-day expiration**

The application is fully configured to use Cloudflare infrastructure with no external dependencies for data storage or authentication.
