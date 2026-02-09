# Cloudflare Infrastructure Overview

## Current State: Fully Configured for Cloudflare

This document provides a visual overview of the Cloudflare infrastructure setup.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│          USER'S BROWSER                     │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  React App (Frontend)               │   │
│  │  - TypeScript                       │   │
│  │  - Vite                             │   │
│  │  - Tailwind CSS                     │   │
│  │  - JWT Token Storage (localStorage) │   │
│  └───────────────┬─────────────────────┘   │
│                  │                          │
└──────────────────┼──────────────────────────┘
                   │
                   │ HTTPS Request
                   │ Authorization: Bearer <JWT>
                   │
                   ▼
┌─────────────────────────────────────────────┐
│     CLOUDFLARE WORKERS (Backend API)        │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │  Hono Framework                     │   │
│  │                                     │   │
│  │  Authentication:                    │   │
│  │  ✓ POST /auth/login                │   │
│  │  ✓ POST /auth/signup               │   │
│  │  ✓ POST /auth/crew-login (NEW)    │   │
│  │                                     │   │
│  │  Data Sync:                        │   │
│  │  ✓ POST /sync/down                 │   │
│  │  ✓ POST /sync/up                   │   │
│  │                                     │   │
│  │  Job Management:                   │   │
│  │  ✓ POST /jobs/start                │   │
│  │  ✓ POST /jobs/complete             │   │
│  │  ✓ POST /jobs/paid                 │   │
│  │  ✓ POST /jobs/delete               │   │
│  │  ✓ POST /jobs/upload-image         │   │
│  │  ✓ POST /jobs/save-pdf             │   │
│  │                                     │   │
│  │  File Access:                      │   │
│  │  ✓ GET /files/*                    │   │
│  └───────────┬─────────────┬───────────┘   │
│              │             │                │
└──────────────┼─────────────┼────────────────┘
               │             │
               │             │
      ┌────────▼────────┐   └────────▼────────┐
      │                 │                      │
      │  CLOUDFLARE D1  │      CLOUDFLARE R2   │
      │   (Database)    │     (File Storage)   │
      │                 │                      │
      │  SQLite DB with │   Object Storage for │
      │  7 Tables:      │   files organized by │
      │                 │   company:           │
      │  ✓ users        │                      │
      │  ✓ customers    │   ✓ photos/          │
      │  ✓ estimates    │   ✓ pdfs/           │
      │  ✓ inventory    │                      │
      │  ✓ equipment    │   Buckets:          │
      │  ✓ settings     │   • rfe-app-files    │
      │  ✓ logs         │   • rfe-app-files-   │
      │                 │     prod             │
      │  All scoped by  │   • rfe-app-files-   │
      │  company_name   │     staging          │
      └─────────────────┘                      │
                        └──────────────────────┘
```

## 📊 Data Flow

### 1. User Signup Flow
```
User fills form → Frontend sends to /auth/signup
                         ↓
              Worker hashes password (bcrypt)
                         ↓
              Store in D1 users table
                         ↓
              Generate JWT token
                         ↓
              Return token + user info to frontend
                         ↓
              Frontend stores token in localStorage
```

### 2. User Login Flow
```
User enters credentials → Frontend sends to /auth/login
                                 ↓
                     Worker queries D1 users table
                                 ↓
                     Compare password hash (bcrypt)
                                 ↓
                     Generate JWT token
                                 ↓
                     Return token + user info
                                 ↓
                     Frontend stores token
```

### 3. Crew PIN Login Flow (NEW)
```
User enters username + PIN → Frontend sends to /auth/crew-login
                                    ↓
                        Worker queries D1 users table
                                    ↓
                        Constant-time PIN comparison
                                    ↓
                        Generate JWT token with role=crew
                                    ↓
                        Return token + user info
                                    ↓
                        Frontend stores token
```

### 4. Data Sync Flow
```
User makes changes → Frontend sends to /sync/up
                            ↓
                 Worker verifies JWT token
                            ↓
                 Extract company_name from user
                            ↓
                 Update/Insert records in D1
                 (customers, estimates, inventory, etc.)
                 All scoped by company_name
                            ↓
                 Return success
                            ↓
                 Frontend updates local state
```

### 5. File Upload Flow
```
User uploads photo → Frontend encodes to base64
                            ↓
                 Send to /jobs/upload-image
                            ↓
                 Worker verifies JWT token
                            ↓
                 Extract company_name
                            ↓
                 Store in R2: {company}/photos/{filename}
                            ↓
                 Return file URL
                            ↓
                 Frontend displays/stores URL
```

## 🔒 Security Layers

### Layer 1: CORS
```
Browser → Makes request to Worker
            ↓
        Worker checks Origin header
            ↓
        If Origin matches ALLOWED_ORIGIN:
            Allow request
        Else:
            Block request (CORS error)
```

### Layer 2: JWT Authentication
```
Frontend → Sends request with Authorization header
                    ↓
        Worker extracts JWT token
                    ↓
        Verify signature with JWT_SECRET
                    ↓
        Check expiration (7 days)
                    ↓
        Extract username from payload
                    ↓
        Query D1 to verify user exists
                    ↓
        Get company_name for data scoping
                    ↓
        Allow request
```

### Layer 3: Data Isolation
```
Request authenticated → Get company_name from user
                              ↓
                   All D1 queries include:
                   WHERE company_name = ?
                              ↓
                   Users can only access their
                   own company's data
                              ↓
                   Multi-tenancy enforced at DB level
```

## 💾 Data Storage Breakdown

### Cloudflare D1 Tables

| Table       | Purpose                      | Scoped By     | Size Est. |
|-------------|------------------------------|---------------|-----------|
| users       | Authentication & accounts    | N/A (primary) | ~1KB/user |
| customers   | Customer records             | company_name  | ~2KB/cust |
| estimates   | Job estimates & invoices     | company_name  | ~5KB/est  |
| inventory   | Material inventory           | company_name  | ~1KB/item |
| equipment   | Equipment tracking           | company_name  | ~1KB/item |
| settings    | Company configuration        | company_name  | ~10KB/co  |
| logs        | Material usage audit trail   | company_name  | ~500B/log |

**D1 Free Tier Limits:**
- 5 GB storage
- 5 million reads/day
- 100,000 writes/day

### Cloudflare R2 Storage

**Bucket Structure:**
```
rfe-app-files/
├── company-a/
│   ├── photos/
│   │   ├── photo_123456.jpg (~500KB each)
│   │   └── photo_789012.jpg
│   └── pdfs/
│       ├── estimate-001.pdf (~100KB each)
│       └── invoice-002.pdf
├── company-b/
│   ├── photos/
│   └── pdfs/
└── company-c/
    ├── photos/
    └── pdfs/
```

**R2 Free Tier Limits:**
- 10 GB storage
- 1 million Class A operations/month (list, put)
- 10 million Class B operations/month (get, head)

## 🔐 Secrets Management

### Environment Secrets (via wrangler secret)

```
JWT_SECRET
    ├── Development: Set with `npm run worker:secret:jwt`
    └── Production:  Set with `npm run worker:secret:jwt:prod`
    
Purpose: Sign and verify JWT tokens
Security: Never committed to git, stored in Cloudflare
```

### Environment Variables (via wrangler.toml)

```
ALLOWED_ORIGIN
    ├── Development: http://localhost:3000
    ├── Staging:     https://staging-domain.com
    └── Production:  https://production-domain.com
    
Purpose: CORS protection
```

## 📍 Deployment Locations

### Development Environment
```
Frontend:  localhost:3000
Backend:   localhost:8787
Database:  .wrangler/state/v3/d1/... (local SQLite)
R2:        Local R2 emulation
```

### Production Environment
```
Frontend:  Cloudflare Pages (or custom domain)
Backend:   rfe-backend-prod.{subdomain}.workers.dev
Database:  Cloudflare D1 (global, replicated)
R2:        Cloudflare R2 (global, replicated)
```

## ⚡ Performance Characteristics

### Cloudflare Workers
- **Cold Start:** ~10-50ms
- **Warm Request:** ~1-5ms
- **Global:** Runs at Cloudflare edge (200+ locations)

### Cloudflare D1
- **Read Query:** ~10-30ms
- **Write Query:** ~20-50ms
- **Location:** Single region with automatic replication

### Cloudflare R2
- **File Upload:** ~100-500ms (depends on size)
- **File Download:** ~50-200ms (depends on size)
- **CDN:** Can be configured for faster access

## 📊 Monitoring

### Available Metrics

**Worker Analytics:**
- Requests per second
- Request duration (P50, P95, P99)
- Error rate
- CPU time
- Subrequests

**D1 Analytics:**
- Queries per second
- Query duration
- Rows read/written
- Database size

**R2 Analytics:**
- Storage used
- Class A operations (writes)
- Class B operations (reads)
- Egress bandwidth

### Access Monitoring

```bash
# View live Worker logs
npm run worker:tail          # Development
npm run worker:tail:prod     # Production

# Query D1 database
npx wrangler d1 execute rfe-db --command "SELECT ..."

# List R2 objects
npx wrangler r2 object list rfe-app-files
```

## 🎯 Key Features Enabled

✅ **Authentication**
- Admin username/password login
- Crew 4-digit PIN login
- JWT tokens (7-day expiration)
- Secure password hashing (bcrypt)

✅ **Data Storage**
- All business data in D1
- All files in R2
- Multi-company support
- Data isolation

✅ **Security**
- CORS protection
- JWT verification
- Data scoping
- Constant-time comparisons
- SQL parameterization

✅ **Scalability**
- Global edge network
- Automatic replication
- No servers to manage
- Pay-per-use pricing

## 🚀 What This Means

1. **No External Dependencies:** Everything runs on Cloudflare
2. **Global Performance:** Runs at edge locations worldwide
3. **High Availability:** Cloudflare's 99.99%+ uptime SLA
4. **Scalable:** Handles traffic spikes automatically
5. **Cost Effective:** Free tier sufficient for small/medium businesses
6. **Secure:** Multiple layers of security
7. **Multi-Tenant:** Supports multiple companies in same deployment

## 📝 Documentation References

- [README.md](README.md) - Complete setup guide
- [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) - Detailed Cloudflare setup
- [DATA_STORAGE_VERIFICATION.md](DATA_STORAGE_VERIFICATION.md) - Verify data storage
- [QUICKSTART.md](QUICKSTART.md) - 5-minute quick start
- [VERIFICATION_CHECKLIST.md](VERIFICATION_CHECKLIST.md) - Complete checklist

## ✅ Status: Ready for Production

All Cloudflare infrastructure is configured and ready for use.
