# 🚀 Getting Started Guide - Subscription License System

## 5-Minute Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Docker (optional, for containerization)
- Stripe account (for payments)

### Step 1: Clone & Install Backend (2 min)
```bash
cd backend
npm install
cp .env.example .env
```

### Step 2: Configure Environment (1 min)
Edit `.env`:
```env
DATABASE_HOST=localhost
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=license_db
PORT=3000

STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here

JWT_SECRET=your-super-secret-key
ENCRYPTION_KEY=32-character-encryption-key-here
```

### Step 3: Start Backend (2 min)
```bash
npm run db:migrate  # Create database schema
npm run dev         # Start server (http://localhost:3000)
```

✅ **Done!** Backend is running. Test it:
```bash
curl http://localhost:3000/api/v1/health
```

---

## 15-Minute Docker Setup

### One Command to Start Everything
```bash
docker-compose up -d
```

This starts:
- ✅ License API Server (port 3000)
- ✅ PostgreSQL Database
- ✅ Redis Cache
- ✅ Frontend Portal (port 3001)

**Verify**:
```bash
docker-compose logs license-server
curl http://localhost:3000/api/v1/health
```

---

## 30-Minute Integration Into Your Desktop App

### 1. Copy License Manager to Your Project
```bash
# From this repo
cp client/src/modules/LicenseManager.ts your-app/src/modules/
cp client/src/ui/LicenseDialogs.tsx your-app/src/ui/
cp client/src/ui/LicenseDialogs.css your-app/src/ui/
```

### 2. Initialize on App Startup
```typescript
import DesktopLicenseManager from './modules/LicenseManager';

const licenseManager = new DesktopLicenseManager();

async function initializeApp() {
  const license = licenseManager.loadLicense();
  
  if (!license) {
    // Show activation dialog
    showActivationDialog();
  } else {
    // Verify license
    try {
      const status = await licenseManager.verifyLicenseOnline(
        license.license_id,
        license.activation_key
      );
      
      if (status.is_expired && status.grace_period_ended) {
        showBlockingDialog(status);
      } else {
        startApplication();
      }
    } catch (error) {
      // Offline mode - check local cache
      startApplication();
    }
  }
}
```

### 3. Show UI Components
```typescript
<LicenseActivationDialog 
  onActivate={handleActivate}
  isVisible={showActivation}
/>

<LicenseBlockingDialog 
  license={license}
  daysRemaining={daysRemaining}
  onRenew={handleRenewal}
/>

<LicenseWarningBanner
  daysRemaining={daysRemaining}
  onRenew={handleRenewal}
/>
```

### 4. Handle Renewal
```typescript
async function handleRenewal(licenseId: string) {
  // Create payment session
  const response = await fetch('http://localhost:3000/api/v1/payments/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      license_id: licenseId,
      email: userEmail
    })
  });

  const { checkout_url } = await response.json();
  
  // Open in browser
  shell.openExternal(checkout_url);
}
```

✅ **Done!** Your app now has licensing.

---

## Complete API Reference

### Activate License (First Launch)
```bash
POST http://localhost:3000/api/v1/licenses/activate
Content-Type: application/json

{
  "email": "user@example.com",
  "license_key": "LIC-2024-ABC123",
  "device_fingerprint": "device-hash-here"
}

Response:
{
  "status": "success",
  "data": {
    "license_id": "LIC-2024-ABC123",
    "activation_key": "encrypted-key"
  }
}
```

### Verify License (On Each Launch)
```bash
POST http://localhost:3000/api/v1/licenses/verify
Content-Type: application/json

{
  "license_id": "LIC-2024-ABC123",
  "activation_key": "encrypted-key",
  "device_fingerprint": "device-hash"
}

Response:
{
  "status": "success",
  "data": {
    "is_expired": false,
    "days_remaining": 365,
    "grace_period_active": false,
    "status": "active"
  }
}
```

### Create Payment Session
```bash
POST http://localhost:3000/api/v1/payments/checkout
Content-Type: application/json

{
  "license_id": "LIC-2024-ABC123",
  "email": "user@example.com"
}

Response:
{
  "status": "success",
  "data": {
    "checkout_url": "https://checkout.stripe.com/pay/cs_...",
    "session_id": "cs_test_..."
  }
}
```

### Check Payment Status
```bash
GET http://localhost:3000/api/v1/payments/status/cs_test_...

Response:
{
  "status": "success",
  "data": {
    "payment_status": "paid|unpaid",
    "amount_total": 9999
  }
}
```

**For complete API docs, see: docs/API.md**

---

## Testing the Flow

### 1. Activate a License
```bash
curl -X POST http://localhost:3000/api/v1/licenses/activate \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "license_key": "TEST-KEY-123",
    "device_fingerprint": "abc123def456"
  }'
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "license_id": "TEST-KEY-123",
    "activation_key": "some_hash_value"
  }
}
```

### 2. Verify the License
```bash
curl -X POST http://localhost:3000/api/v1/licenses/verify \
  -H "Content-Type: application/json" \
  -d '{
    "license_id": "TEST-KEY-123",
    "activation_key": "some_hash_value",
    "device_fingerprint": "abc123def456"
  }'
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "is_expired": false,
    "days_remaining": 365,
    "status": "active"
  }
}
```

### 3. Create a Checkout Session
```bash
curl -X POST http://localhost:3000/api/v1/payments/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "license_id": "TEST-KEY-123",
    "email": "test@example.com"
  }'
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "checkout_url": "https://checkout.stripe.com/pay/cs_...",
    "session_id": "cs_test_123..."
  }
}
```

---

## Database Inspection

### Connect to Database
```bash
# If using docker-compose
docker-compose exec postgres psql -U postgres -d license_db

# Or directly
psql -h localhost -U postgres -d license_db
```

### View All Licenses
```sql
SELECT license_key, status, expiration_date, created_at 
FROM licenses 
ORDER BY created_at DESC;
```

### View Audit Log
```sql
SELECT event_type, event_data, created_at 
FROM audit_logs 
ORDER BY created_at DESC 
LIMIT 20;
```

### View Payments
```sql
SELECT stripe_payment_id, amount, status, created_at 
FROM payments 
ORDER BY created_at DESC;
```

---

## Production Deployment

### Option 1: Docker Compose (Staging)
```bash
docker-compose up -d
# Wait for services to start
docker-compose ps
```

### Option 2: Kubernetes (Production)
```bash
# Create secrets
kubectl create secret generic postgres-credentials \
  --from-literal=username=postgres \
  --from-literal=password=secure-password \
  -n license-system

# Deploy
kubectl apply -f deployment/kubernetes/

# Verify
kubectl get pods -n license-system
```

**For detailed deployment info, see: docs/DEPLOYMENT.md**

---

## Monitoring

### View Dashboard Stats
```bash
curl http://localhost:3000/api/v1/admin/stats
```

**Response**:
```json
{
  "status": "success",
  "data": {
    "total_customers": 10,
    "total_licenses": 12,
    "active_licenses": 10,
    "expired_licenses": 2,
    "total_revenue": 1200.00
  }
}
```

### View All Licenses
```bash
curl http://localhost:3000/api/v1/admin/licenses
```

### View Audit Logs
```bash
curl http://localhost:3000/api/v1/admin/audit-logs?limit=50
```

---

## Troubleshooting

### Connection Refused
```bash
# Check if services are running
docker-compose ps

# Restart services
docker-compose restart
```

### Database Connection Error
```bash
# Check database logs
docker-compose logs postgres

# Verify credentials in .env
cat .env | grep DATABASE
```

### Payment Webhook Not Working
```bash
# Verify webhook secret in .env
grep STRIPE_WEBHOOK_SECRET .env

# Check webhook in Stripe Dashboard
# https://dashboard.stripe.com/test/webhooks
```

### License Verification Fails
```bash
# Check that license exists in database
psql -h localhost -U postgres -d license_db
SELECT * FROM licenses WHERE license_key = 'YOUR-KEY';

# Verify device fingerprint matches
# Device fingerprint should be consistent for same device
```

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `backend/src/index.ts` | Entry point |
| `backend/src/routes/licenses.ts` | License endpoints |
| `backend/src/routes/payments.ts` | Payment endpoints |
| `backend/src/utils/encryption.ts` | Encryption logic |
| `client/src/modules/LicenseManager.ts` | Desktop license manager |
| `docs/API.md` | Complete API reference |
| `docs/DEPLOYMENT.md` | Deployment guide |
| `docs/INTEGRATION.md` | Integration guide |
| `PRODUCTION_READY_CHECKLIST.md` | Pre-launch checklist |

---

## Next Steps

### Immediate (Today)
- [ ] Clone repository
- [ ] Run `docker-compose up -d`
- [ ] Test API endpoints
- [ ] Review documentation

### Short Term (This Week)
- [ ] Integrate client into your app
- [ ] Configure Stripe account
- [ ] Set up environment variables
- [ ] Run automated tests

### Medium Term (This Month)
- [ ] Deploy to staging
- [ ] Perform security audit
- [ ] Load test the system
- [ ] Train support team

### Before Launch
- [ ] Complete PRODUCTION_READY_CHECKLIST.md
- [ ] Verify all endpoints working
- [ ] Test payment flow end-to-end
- [ ] Document procedures
- [ ] Set up monitoring

---

## Support Resources

**Documentation**:
- API Reference: `docs/API.md`
- Deployment Guide: `docs/DEPLOYMENT.md`
- Integration Guide: `docs/INTEGRATION.md`
- Security Guide: `docs/SECURITY.md`

**Quick Commands**:
```bash
# Start everything
docker-compose up -d

# Test API
curl http://localhost:3000/api/v1/health

# View logs
docker-compose logs -f

# Run tests
cd backend && npm run test

# Build for production
cd backend && npm run build
```

---

## Timeline

- **Now**: Everything is ready to use
- **5 minutes**: Backend running locally
- **15 minutes**: Docker setup complete
- **30 minutes**: Integrated into your app
- **Tomorrow**: Testing payment flows
- **This week**: Deployed to staging
- **This month**: Production launch

---

**You're ready to launch! Start with `docker-compose up -d` 🚀**
