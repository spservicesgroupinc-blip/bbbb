<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Spray Foam Business Management App

A full-stack spray foam business management application with calculations, estimates, invoicing, crew tracking, and inventory management. Built with React and deployed on Cloudflare infrastructure.

## Architecture

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **Backend**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (for images & PDFs)
- **Authentication**: JWT-based with bcrypt password hashing

## Prerequisites

- Node.js (v18 or later)
- npm or yarn
- A Cloudflare account
- wrangler CLI (installed automatically with backend dependencies)

## Initial Setup

### 1. Clone and Install Dependencies

```bash
# Install all dependencies (frontend + backend)
npm run setup
```

### 2. Backend Setup (Cloudflare Workers)

#### a. Configure Cloudflare Account

```bash
cd worker
npx wrangler login
```

#### b. Create D1 Database

```bash
# Create the database (this returns a database_id)
npm run db:create

# Update wrangler.toml with the database_id returned above
# Then migrate the schema
npm run db:migrate:local  # For local development
npm run db:migrate        # For remote dev database
```

#### c. Create R2 Buckets for File Storage

```bash
# Development bucket
npx wrangler r2 bucket create rfe-app-files

# Production bucket (optional)
npx wrangler r2 bucket create rfe-app-files-prod

# Staging bucket (optional)
npx wrangler r2 bucket create rfe-app-files-staging
```

#### d. Set JWT Secret

```bash
# Generate a strong random secret for JWT signing
npm run secret:jwt
# When prompted, enter a secure random string (at least 32 characters)

# For production:
npm run secret:jwt:prod
```

#### e. Configure CORS Origins

Edit `worker/wrangler.toml` and update the `ALLOWED_ORIGIN` values for each environment:

```toml
[vars]
ALLOWED_ORIGIN = "http://localhost:3000"  # For local development

[env.production.vars]
ALLOWED_ORIGIN = "https://your-production-domain.com"
```

### 3. Frontend Setup

#### a. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env.local

# Edit .env.local with your configuration
```

**For local development**, `.env.local` should contain:
```env
VITE_WORKER_URL=http://localhost:8787
GEMINI_API_KEY=your-gemini-api-key  # Optional
```

**For production builds**, set:
```env
VITE_WORKER_URL=https://rfe-backend.your-subdomain.workers.dev
```

## Running Locally

### Option 1: Run Everything (Recommended)

```bash
# From project root - runs both frontend and backend
npm run dev:all
```

This will start:
- Frontend dev server on `http://localhost:3000`
- Backend worker on `http://localhost:8787`

### Option 2: Run Separately

**Terminal 1 - Backend:**
```bash
npm run worker:dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

## Deployment

### Deploy Backend (Cloudflare Workers)

```bash
# Deploy to development
npm run worker:deploy

# Deploy to production
npm run worker:deploy:prod
```

After deployment, note the worker URL (e.g., `https://rfe-backend.your-subdomain.workers.dev`)

### Deploy Frontend (Cloudflare Pages)

#### Option 1: Automatic Deployment via GitHub

1. Connect your GitHub repository to Cloudflare Pages
2. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables**: 
     - `VITE_WORKER_URL`: Your deployed worker URL

#### Option 2: Manual Deployment

```bash
# Build the frontend
npm run build

# Deploy to Cloudflare Pages
npm run deploy:frontend
```

## Database Migrations

```bash
# Local development database
npm run worker:db:migrate:local

# Remote development database
npm run worker:db:migrate

# Production database
npm run worker:db:migrate:prod
```

## Authentication

The app supports two types of authentication:

1. **Admin Login**: Username + password authentication
2. **Crew Login**: Username + 4-digit PIN authentication

### Creating Users

Users can sign up through the app UI, which will:
- Create an admin account with full access
- Generate a unique 4-digit crew PIN
- Store encrypted passwords using bcrypt

### API Endpoints

- `POST /auth/login` - Admin login
- `POST /auth/signup` - Create new account
- `POST /auth/crew-login` - Crew PIN login

All authenticated requests require a JWT token in the `Authorization: Bearer <token>` header.

## Data Storage

All data is stored in Cloudflare infrastructure:

### D1 Database (SQLite)
- **users**: User accounts and authentication
- **customers**: Customer records
- **estimates**: Job estimates and invoices
- **inventory**: Material inventory tracking
- **equipment**: Equipment management
- **settings**: Company configuration
- **logs**: Material usage logs

### R2 Storage (Object Storage)
- Job site photos
- Generated PDF estimates/invoices
- Company documents

Data is automatically scoped by company name to support multi-tenancy.

## API Documentation

### Sync Endpoints
- `POST /sync/down` - Download all company data
- `POST /sync/up` - Upload/sync company data

### Job Management
- `POST /jobs/start` - Start a job
- `POST /jobs/complete` - Complete a job and process inventory
- `POST /jobs/paid` - Mark job as paid and calculate P&L
- `POST /jobs/delete` - Delete an estimate
- `POST /jobs/upload-image` - Upload job site photo
- `POST /jobs/save-pdf` - Save PDF estimate/invoice

## Development Scripts

```bash
# Frontend
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build

# Backend
npm run worker:dev       # Start local worker
npm run worker:deploy    # Deploy to Cloudflare
npm run worker:tail      # View live logs

# Database
npm run worker:db:create        # Create new D1 database
npm run worker:db:migrate:local # Migrate local database
npm run worker:db:migrate:prod  # Migrate production database
```

## Monitoring & Logs

View live worker logs:
```bash
npm run worker:tail          # Development environment
npm run worker:tail:prod     # Production environment
```

## Security

- All passwords are hashed using bcrypt (cost factor: 10)
- JWT tokens expire after 7 days
- CORS is configured per environment
- All API routes (except auth) require valid JWT
- Data is isolated by company name
- Rate limiting should be configured in Cloudflare dashboard

## Troubleshooting

### Worker not connecting
- Verify `VITE_WORKER_URL` in `.env.local` matches your worker URL
- Check CORS settings in `worker/wrangler.toml`
- Ensure worker is running (`npm run worker:dev`)

### Database errors
- Run migrations: `npm run worker:db:migrate:local`
- Verify database_id in `wrangler.toml`
- Check D1 dashboard in Cloudflare

### R2 file uploads failing
- Verify R2 buckets are created
- Check bucket names in `wrangler.toml`
- Ensure BUCKET binding is uncommented

## License

Private - All Rights Reserved

## Support

For issues or questions, please contact the development team.
