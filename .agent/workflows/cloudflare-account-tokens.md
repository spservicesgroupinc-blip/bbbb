---
description: How to create and manage Cloudflare Account API tokens for durable integrations
---

# Cloudflare Account API Tokens Workflow

Account API tokens are ideal for CI/CD pipelines, external service integrations (like SIEMs), and scenarios where the integration should persist beyond individual user tenure.

## When to Use Account Tokens vs User Tokens

| Use Case | Token Type |
|----------|------------|
| CI/CD pipelines | Account Token ✅ |
| External service integrations | Account Token ✅ |
| Long-running automations | Account Token ✅ |
| Ad-hoc scripting | User Token |
| One-time tasks | User Token |

## Create an Account API Token (Dashboard)

> [!IMPORTANT]
> Creating an account owned token requires **Super Administrator** permission on the account.

1. Log into the [Cloudflare dashboard](https://dash.cloudflare.com)
2. Go to **Manage Account** > **Account API Tokens**
3. Select **Create Token**
4. Fill in:
   - Token name
   - Permissions (select appropriate scopes)
   - Expiration date (optional but recommended)
5. Select **Continue to summary** and review
6. Select **Create Token**
7. **Copy and securely store the token** - it won't be shown again

## Create via API

Use the [Account API Token Creation API](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/create/):

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/{account_id}/tokens" \
  -H "Authorization: Bearer {existing_token}" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "my-service-token",
    "policies": [
      {
        "effect": "allow",
        "resources": {
          "com.cloudflare.api.account.*": "*"
        },
        "permission_groups": [
          {"id": "{permission_group_id}"}
        ]
      }
    ]
  }'
```

## Compatible Services

The following Cloudflare products support Account API tokens:

### ✅ Fully Compatible
- Access, Account Analytics, Account Management
- AI Gateway, API Shield, Argo, Billing
- Cache, Tiered Cache, Cloud Connector
- Configuration Rules, Custom Lists, Custom Pages
- D1, Data Loss Prevention, DEX, Distributed Web
- DNS, Durable Objects, Email Relay
- Secure Web Gateway, Healthchecks, Hyperdrive
- Images, Load Balancing, Log Explorer
- Magic Network Monitoring, Magic Transit, Magic WAN
- Managed Rules, Network Error Logging
- Page Shield, Pages, R2, Radar
- Rulesets, Spectrum, Speed, SSL/TLS
- Stream, Trace, Tunnels
- Vectorize, Waiting Room
- Workers, Workers AI, Workers KV, Workers Observability
- Workers Queues, Workflows, Zaraz
- Zero Trust Devices and Services
- Zone/Domain Management

### ❌ Not Yet Compatible
- Intel Data Platform
- Page Rules
- Registrar
- Super Bot Fight Mode
- Turnstile
- Zero Trust Client Platform

## Best Practices

1. **Use descriptive names** - Include purpose, environment, and owner team
2. **Set expiration dates** - Rotate tokens periodically for security
3. **Principle of least privilege** - Only grant necessary permissions
4. **Store securely** - Use environment variables or secret managers
5. **Audit regularly** - Review active tokens and revoke unused ones

## Environment Variable Setup

```bash
# .env or CI/CD secrets
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_account_token
```

## Using with Wrangler

```bash
# Set token for wrangler CLI
export CLOUDFLARE_API_TOKEN=your_account_token

# Or use wrangler login for interactive setup
wrangler login
```

## References

- [Cloudflare Account API Tokens Documentation](https://developers.cloudflare.com/fundamentals/api/get-started/account-owned-tokens/)
- [Account Owned Tokens Blog Post](https://blog.cloudflare.com/account-owned-tokens-automated-actions-zaraz/)
- [API Token Creation API](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/create/)
