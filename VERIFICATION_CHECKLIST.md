# Cloudflare Setup Verification Checklist

Use this checklist to verify that Cloudflare authentication and data storage are properly configured.

## Backend Infrastructure ✓

### Cloudflare D1 Database

- [ ] D1 database created (`npx wrangler d1 list`)
- [ ] Database ID configured in `worker/wrangler.toml`
- [ ] Schema migrated (`npm run worker:db:migrate:local`)
- [ ] Tables exist: users, customers, estimates, inventory, equipment, settings, logs
  ```bash
  npx wrangler d1 execute rfe-db --local --command "SELECT name FROM sqlite_master WHERE type='table'"
  ```

### Cloudflare R2 Storage

- [ ] Development bucket created (`rfe-app-files`)
- [ ] Production bucket created (`rfe-app-files-prod`) - optional
- [ ] Staging bucket created (`rfe-app-files-staging`) - optional
- [ ] Buckets configured in `worker/wrangler.toml`
- [ ] R2 bucket binding enabled (uncommented in wrangler.toml)

### Cloudflare Workers

- [ ] Wrangler authenticated (`npx wrangler login`)
- [ ] JWT secret set for development
  ```bash
  npx wrangler secret list
  ```
- [ ] JWT secret set for production (if deploying)
- [ ] CORS origin configured for development (`http://localhost:3000`)
- [ ] CORS origin configured for production (your domain)
- [ ] Worker can start locally (`npm run worker:dev`)

## Frontend Configuration ✓

- [ ] Environment variables configured in `.env.local`
- [ ] `VITE_WORKER_URL` points to correct worker URL
- [ ] TypeScript types defined for environment variables (`vite-env.d.ts`)
- [ ] constants.ts uses environment variable for API URL
- [ ] Frontend can start locally (`npm run dev`)

## Authentication ✓

### Admin Login

- [ ] User can sign up with username/password
- [ ] Password is hashed (bcrypt)
- [ ] JWT token is generated on login
- [ ] Token is stored in localStorage
- [ ] Token expires after 7 days
- [ ] Token is sent in Authorization header
- [ ] Protected routes verify JWT token
- [ ] Invalid tokens are rejected

### Crew Login

- [ ] Crew PIN is generated on signup
- [ ] Crew can login with username + PIN
- [ ] Crew login endpoint exists (`/auth/crew-login`)
- [ ] Crew login returns JWT token with role: crew
- [ ] Frontend supports crew login

## Data Storage ✓

### D1 Database Operations

- [ ] User signup stores data in D1
- [ ] User login queries D1
- [ ] Sync down fetches data from D1
- [ ] Sync up saves data to D1
- [ ] Data is scoped by company_name
- [ ] Customer data is stored in D1
- [ ] Estimate data is stored in D1
- [ ] Inventory data is stored in D1
- [ ] Equipment data is stored in D1
- [ ] Settings data is stored in D1
- [ ] Material logs are stored in D1

### R2 File Operations

- [ ] Photos can be uploaded to R2
- [ ] PDFs can be saved to R2
- [ ] Files are organized by company name
- [ ] Files are accessible via worker URL
- [ ] File uploads require authentication
- [ ] File URLs are returned correctly

## API Endpoints ✓

### Authentication Endpoints

- [ ] `POST /auth/login` - works
- [ ] `POST /auth/signup` - works
- [ ] `POST /auth/crew-login` - works

### Sync Endpoints (require auth)

- [ ] `POST /sync/down` - works
- [ ] `POST /sync/up` - works

### Job Management Endpoints (require auth)

- [ ] `POST /jobs/start` - works
- [ ] `POST /jobs/complete` - works
- [ ] `POST /jobs/paid` - works
- [ ] `POST /jobs/delete` - works
- [ ] `POST /jobs/upload-image` - works
- [ ] `POST /jobs/save-pdf` - works

### File Access

- [ ] `GET /files/*` - works (with auth)

### Health Check

- [ ] `GET /` - returns "RFE Backend Worker Running"

## Security ✓

- [ ] Passwords are hashed with bcrypt (never plain text)
- [ ] JWT secrets are not committed to git
- [ ] JWT tokens have expiration (7 days)
- [ ] All protected routes verify JWT
- [ ] CORS is configured (not `*` in production)
- [ ] Data is scoped by company (multi-tenancy)
- [ ] R2 files require authentication
- [ ] No SQL injection vulnerabilities (using parameterized queries)

## Testing ✓

### Manual Testing

- [ ] Create a new account
- [ ] Log in with username/password
- [ ] Log out and log back in
- [ ] Create a customer
- [ ] Create an estimate
- [ ] Add inventory items
- [ ] Upload a photo
- [ ] Generate and save a PDF
- [ ] Complete a job
- [ ] Mark job as paid
- [ ] Delete an estimate
- [ ] Sync data (save/load)
- [ ] Log in with crew PIN

### Database Verification

```bash
# Check user was created
npx wrangler d1 execute rfe-db --local --command "SELECT username, company_name, role FROM users"

# Check customer was created
npx wrangler d1 execute rfe-db --local --command "SELECT id, name, company_name FROM customers"

# Check estimate was created
npx wrangler d1 execute rfe-db --local --command "SELECT id, company_name, status FROM estimates"

# Check inventory
npx wrangler d1 execute rfe-db --local --command "SELECT id, name, quantity, company_name FROM inventory"
```

### R2 Verification

```bash
# List files in bucket
npx wrangler r2 object list rfe-app-files --local

# Should see files organized like:
# {company-name}/photos/photo_*.jpg
# {company-name}/pdfs/*.pdf
```

### API Verification

```bash
# Test health check
curl http://localhost:8787

# Test login (replace with your credentials)
curl -X POST http://localhost:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass"}'

# Should return token and user info
```

## Production Deployment ✓

### Backend (Worker)

- [ ] Production D1 database created
- [ ] Production D1 database migrated
- [ ] Production R2 bucket created
- [ ] Production JWT secret set
- [ ] Production CORS origin configured
- [ ] Worker deployed to production
- [ ] Production worker URL noted

### Frontend

- [ ] Production build configured with worker URL
- [ ] Frontend deployed (Pages or other)
- [ ] Frontend can reach worker
- [ ] CORS allows frontend domain
- [ ] Authentication works in production
- [ ] Data sync works in production
- [ ] File upload works in production

## Documentation ✓

- [ ] README.md updated with Cloudflare setup
- [ ] CLOUDFLARE_SETUP.md created with detailed guide
- [ ] DATA_STORAGE_VERIFICATION.md created
- [ ] QUICKSTART.md created
- [ ] .env.example updated
- [ ] Comments in code explain Cloudflare usage

## Monitoring ✓

- [ ] Can view worker logs (`npm run worker:tail`)
- [ ] Can view D1 metrics (Cloudflare dashboard)
- [ ] Can view R2 metrics (Cloudflare dashboard)
- [ ] Error handling in place
- [ ] Logging in place for debugging

## Final Verification

Run through complete user journey:

1. [ ] Open app in browser
2. [ ] Sign up new account
3. [ ] Verify data saved to D1
4. [ ] Log out
5. [ ] Log back in
6. [ ] Add customer, inventory, equipment
7. [ ] Create estimate
8. [ ] Upload photo
9. [ ] Generate PDF
10. [ ] Complete job
11. [ ] Mark as paid
12. [ ] Verify all data persists
13. [ ] Verify files in R2
14. [ ] Log in with crew PIN
15. [ ] All features work

## All Systems Go? 🚀

If all items are checked:

✅ **Cloudflare authentication is fully configured**  
✅ **All data is stored in Cloudflare (D1 + R2)**  
✅ **Multi-tenancy is working (data scoped by company)**  
✅ **Security is in place (JWT, bcrypt, CORS)**  
✅ **Documentation is complete**  

**The app is ready for use!**

## Need Help?

If any items are not checked:
- Review [CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md) for detailed setup
- Review [DATA_STORAGE_VERIFICATION.md](DATA_STORAGE_VERIFICATION.md) for troubleshooting
- Check worker logs: `npm run worker:tail`
- Verify wrangler.toml configuration
- Ensure all secrets are set
