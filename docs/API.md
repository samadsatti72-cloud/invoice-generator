# API Documentation - License Server

## Base URL
```
https://api.yourdomain.com/api/v1
```

## Authentication

All requests (except health check) require no authentication in basic mode. For production, implement JWT:

```
Authorization: Bearer <jwt_token>
```

## Response Format

All responses follow this format:

```json
{
  "status": "success|error",
  "data": {},
  "statusCode": 200,
  "message": "optional message"
}
```

---

## Endpoints

### 1. Health Check

**Endpoint**: `GET /health`

**Description**: Check server health and uptime

**Request**:
```bash
curl https://api.yourdomain.com/api/v1/health
```

**Response** (200):
```json
{
  "status": "ok",
  "timestamp": "2024-08-22T16:30:00Z",
  "uptime": 3600.5,
  "environment": "production"
}
```

---

### 2. Activate License

**Endpoint**: `POST /licenses/activate`

**Description**: Activate a license on first launch (device-specific)

**Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "email": "user@example.com",
  "license_key": "LIC-2024-ABC123",
  "device_fingerprint": "sha256_hash_of_device_info"
}
```

**Response** (200):
```json
{
  "status": "success",
  "data": {
    "license_id": "LIC-2024-ABC123",
    "activation_key": "encrypted_hash_value",
    "message": "License activated successfully"
  }
}
```

**Error Responses**:

| Status | Error | Reason |
|--------|-------|--------|
| 400 | Missing required fields | email, license_key, or device_fingerprint is empty |
| 404 | License not found | License key doesn't exist in database |
| 403 | License not associated with this email | Email doesn't match license owner |

**Example**:
```bash
curl -X POST https://api.yourdomain.com/api/v1/licenses/activate \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "license_key": "LIC-2024-ABC123",
    "device_fingerprint": "abc123def456..."
  }'
```

---

### 3. Verify License

**Endpoint**: `POST /licenses/verify`

**Description**: Check if license is valid and get expiration info

**Request Body**:
```json
{
  "license_id": "LIC-2024-ABC123",
  "activation_key": "encrypted_hash_value",
  "device_fingerprint": "sha256_hash_of_device_info"
}
```

**Response** (200):
```json
{
  "status": "success",
  "data": {
    "license_id": "LIC-2024-ABC123",
    "customer_email": "user@example.com",
    "expiration_date": "2025-08-22T23:59:59Z",
    "days_remaining": 365,
    "is_expired": false,
    "grace_period_active": false,
    "grace_period_ended": false,
    "auto_renewal_enabled": true,
    "status": "active"
  }
}
```

**Field Descriptions**:
- `days_remaining`: Days until license expires (0 if expired)
- `is_expired`: True if expiration date has passed
- `grace_period_active`: True if expired but within grace period
- `grace_period_ended`: True if grace period has ended

**Error Responses**:

| Status | Error | Reason |
|--------|-------|--------|
| 400 | Missing required fields | license_id, activation_key, or device_fingerprint is empty |
| 404 | License not found | License key doesn't exist |
| 401 | Invalid activation key | Activation key doesn't match |
| 403 | Device not authorized for this license | Device fingerprint mismatch |

**Example**:
```bash
curl -X POST https://api.yourdomain.com/api/v1/licenses/verify \
  -H "Content-Type: application/json" \
  -d '{
    "license_id": "LIC-2024-ABC123",
    "activation_key": "encrypted_hash...",
    "device_fingerprint": "abc123..."
  }'
```

---

### 4. Create Checkout Session

**Endpoint**: `POST /payments/checkout`

**Description**: Create Stripe checkout session for renewal payment

**Request Body**:
```json
{
  "license_id": "LIC-2024-ABC123",
  "email": "user@example.com"
}
```

**Response** (200):
```json
{
  "status": "success",
  "data": {
    "checkout_url": "https://checkout.stripe.com/pay/cs_...",
    "session_id": "cs_test_..."
  }
}
```

**Error Responses**:

| Status | Error | Reason |
|--------|-------|--------|
| 400 | Missing required fields | license_id or email is empty |
| 404 | License not found | License key doesn't exist |

**Example**:
```bash
curl -X POST https://api.yourdomain.com/api/v1/payments/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "license_id": "LIC-2024-ABC123",
    "email": "user@example.com"
  }'
```

---

### 5. Check Payment Status

**Endpoint**: `GET /payments/status/:session_id`

**Description**: Check if payment was successful

**URL Parameters**:
- `session_id` (string, required): Stripe checkout session ID

**Response** (200):
```json
{
  "status": "success",
  "data": {
    "payment_status": "paid|unpaid|no_payment_required",
    "session_id": "cs_test_...",
    "amount_total": 9999,
    "customer_email": "user@example.com"
  }
}
```

**Payment Status Values**:
- `paid`: Payment successful
- `unpaid`: Payment pending or failed
- `no_payment_required`: No payment session found

**Example**:
```bash
curl https://api.yourdomain.com/api/v1/payments/status/cs_test_123
```

---

### 6. Webhook Handler

**Endpoint**: `POST /payments/webhook`

**Description**: Stripe webhook handler - updates license on successful payment

**Headers Required**:
```
stripe-signature: t=...,v1=...
Content-Type: application/json
```

**Webhook Events Handled**:
- `payment_intent.succeeded`: Update license expiration date

**Webhook Flow**:
1. Customer completes payment
2. Stripe sends webhook
3. Server verifies webhook signature
4. License expiration date extended by 365 days
5. Customer email sent with confirmation
6. Event logged in audit table

**Response** (200):
```json
{
  "received": true
}
```

**Note**: This endpoint is called automatically by Stripe. Configure webhook URL in Stripe Dashboard:
```
https://api.yourdomain.com/api/v1/payments/webhook
```

---

### 7. Admin: List All Licenses

**Endpoint**: `GET /admin/licenses`

**Description**: Get list of all licenses (admin only)

**Query Parameters**:
- None (optional: add pagination in future)

**Response** (200):
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "license_key": "LIC-2024-001",
      "status": "active",
      "expiration_date": "2025-08-22T23:59:59Z",
      "created_at": "2024-08-22T10:00:00Z",
      "email": "user@example.com",
      "name": "John Doe"
    }
  ],
  "total": 42
}
```

**Example**:
```bash
curl https://api.yourdomain.com/api/v1/admin/licenses
```

---

### 8. Admin: Get License Details

**Endpoint**: `GET /admin/licenses/:license_key`

**Description**: Get detailed info for specific license

**URL Parameters**:
- `license_key` (string, required): License key

**Response** (200):
```json
{
  "status": "success",
  "data": {
    "id": "uuid",
    "license_key": "LIC-2024-001",
    "customer_id": "uuid",
    "product_id": "PRODUCT-001",
    "activation_key": "hash",
    "device_fingerprint": "hash",
    "activation_date": "2024-08-22T10:00:00Z",
    "expiration_date": "2025-08-22T23:59:59Z",
    "status": "active",
    "grace_period_days": 14,
    "last_verified_online": "2024-08-22T16:30:00Z",
    "auto_renewal": true,
    "renewal_reminder_sent": false,
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

**Error Responses**:

| Status | Error | Reason |
|--------|-------|--------|
| 404 | License not found | License key doesn't exist |

---

### 9. Admin: Get Audit Logs

**Endpoint**: `GET /admin/audit-logs`

**Description**: Get audit trail of all license operations

**Query Parameters**:
- `limit` (number, optional): Max records to return (default: 100)
- `offset` (number, optional): Pagination offset (default: 0)

**Response** (200):
```json
{
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "license_key": "LIC-2024-001",
      "email": "user@example.com",
      "event_type": "license_activated|license_renewed|license_expired",
      "event_data": {
        "device_fingerprint": "hash"
      },
      "ip_address": "192.168.1.1",
      "created_at": "2024-08-22T10:00:00Z"
    }
  ],
  "limit": 100,
  "offset": 0
}
```

**Example**:
```bash
curl "https://api.yourdomain.com/api/v1/admin/audit-logs?limit=50&offset=0"
```

---

### 10. Admin: Get Dashboard Statistics

**Endpoint**: `GET /admin/stats`

**Description**: Get summary statistics for dashboard

**Response** (200):
```json
{
  "status": "success",
  "data": {
    "total_customers": 150,
    "total_licenses": 180,
    "active_licenses": 165,
    "expired_licenses": 15,
    "total_revenue": 16500.00
  }
}
```

**Example**:
```bash
curl https://api.yourdomain.com/api/v1/admin/stats
```

---

## Error Handling

All errors return appropriate HTTP status codes:

```json
{
  "status": "error",
  "statusCode": 400,
  "message": "Detailed error message"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Invalid credentials |
| 403 | Forbidden - Access denied |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable |

---

## Rate Limiting

All endpoints are rate-limited to 100 requests per minute per IP address.

Response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1692720660
```

---

## Webhooks

### Stripe Webhook Signature Verification

Configure in code:
```typescript
const event = stripe.webhooks.constructEvent(
  req.body,
  req.headers['stripe-signature'],
  process.env.STRIPE_WEBHOOK_SECRET
);
```

Supported events:
- `payment_intent.succeeded`: Payment successful → Update license
- `payment_intent.payment_failed`: Payment failed → Log event
- `charge.refunded`: Refund issued → Log event

---

## Code Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

const apiClient = axios.create({
  baseURL: 'https://api.yourdomain.com/api/v1',
  timeout: 5000
});

// Verify license
async function verifyLicense(licenseId, activationKey, deviceFingerprint) {
  try {
    const response = await apiClient.post('/licenses/verify', {
      license_id: licenseId,
      activation_key: activationKey,
      device_fingerprint: deviceFingerprint
    });
    return response.data.data;
  } catch (error) {
    console.error('License verification failed:', error.response.data);
    throw error;
  }
}
```

### Python
```python
import requests

API_URL = 'https://api.yourdomain.com/api/v1'

def verify_license(license_id, activation_key, device_fingerprint):
    response = requests.post(
        f'{API_URL}/licenses/verify',
        json={
            'license_id': license_id,
            'activation_key': activation_key,
            'device_fingerprint': device_fingerprint
        },
        timeout=5
    )
    response.raise_for_status()
    return response.json()['data']
```

### cURL
```bash
curl -X POST https://api.yourdomain.com/api/v1/licenses/verify \
  -H "Content-Type: application/json" \
  -d '{
    "license_id": "LIC-2024-ABC123",
    "activation_key": "...",
    "device_fingerprint": "..."
  }'
```

---

## Changelog

### v1.0.0 (2024-08-22)
- Initial release
- License activation and verification
- Payment processing
- Admin dashboard APIs
- Audit logging

---

**Last Updated**: August 22, 2024  
**API Version**: 1.0.0
