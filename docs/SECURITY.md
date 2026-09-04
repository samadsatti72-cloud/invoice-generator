# Security Implementation Guide

## Encryption

### Local License File Encryption

**Algorithm**: AES-256-GCM (Galois/Counter Mode)
- Provides authenticated encryption
- Protects confidentiality AND integrity
- Resistant to tampering

**Key Derivation**:
```
Key = PBKDF2(password=device_id+username, salt="", iterations=100000)
```

**Storage**:
```
EncryptedFile = Base64(Salt + IV + AuthTag + EncryptedData)
```

### Implementation

```typescript
// Encrypt
const iv = crypto.randomBytes(16);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
let encrypted = cipher.update(plaintext, 'utf8', 'hex');
encrypted += cipher.final('hex');
const authTag = cipher.getAuthTag();

// Decrypt
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);
let decrypted = decipher.update(encrypted, 'hex', 'utf8');
decrypted += decipher.final('utf8');
```

## Device Fingerprinting

### Components
1. Operating System (Windows/macOS/Linux)
2. Machine ID (hostname hash)
3. Username

### Calculation
```
fingerprint = SHA256("Windows::machine123::john_doe")
```

### Verification
- Validates device hasn't changed
- Prevents license sharing across machines
- Binds license to specific hardware

## API Security

### HTTPS/TLS
- **Minimum**: TLS 1.2
- **Recommended**: TLS 1.3
- Force HTTPS with HSTS header

### Request Signing
```
Signature = HMAC-SHA256(request_body, API_SECRET)
Header: X-Signature: <signature>
```

### Rate Limiting
```
100 requests/minute per IP
429 Too Many Requests response
Exponential backoff client-side
```

### JWT Tokens
```typescript
const token = jwt.sign(
  { licenseId, customerId, exp: Math.floor(Date.now() / 1000) + 3600 },
  JWT_SECRET,
  { algorithm: 'HS256' }
);
```

## Database Security

### SQL Injection Prevention
```typescript
// Always use parameterized queries
const result = await pool.query(
  'SELECT * FROM licenses WHERE license_key = $1',
  [userInput] // Safely escaped
);

// Never do this:
const result = await pool.query(
  `SELECT * FROM licenses WHERE license_key = '${userInput}'` // VULNERABLE
);
```

### Password Hashing
```typescript
// Hash with bcrypt
const hash = await bcrypt.hash(password, 10);

// Verify
const match = await bcrypt.compare(password, hash);
```

### Audit Logging
```sql
INSERT INTO audit_logs (license_id, event_type, event_data, ip_address, user_agent)
VALUES ($1, $2, $3, $4, $5);
```

Log all:
- License activations
- License verifications
- Payment attempts
- License renewals
- Failed authentication attempts

## Webhook Security

### Signature Verification
```typescript
// Stripe provides timestamp and signature
const event = stripe.webhooks.constructEvent(
  req.body,
  req.headers['stripe-signature'],
  STRIPE_WEBHOOK_SECRET
);

// Verify timestamp to prevent replay attacks
const timestamp = parseInt(event.created);
if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
  throw new Error('Webhook too old');
}
```

### Idempotency
```typescript
// Store processed webhook IDs
const processed = await cache.get(`webhook:${event.id}`);
if (processed) {
  return { received: true }; // Don't reprocess
}

// Process webhook...
await cache.set(`webhook:${event.id}`, true, 86400); // 24 hours
```

## Environment Variables Security

```bash
# ✅ DO
export STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxx
export ENCRYPTION_KEY=32-character-key-here
export JWT_SECRET=super-secret-key

# ❌ DON'T
echo "sk_live_xxxxxxxxxxxx" in code
commit .env to git
share secrets in chat/email
log secrets in error messages
```

### Using Secrets Manager
```typescript
// AWS Secrets Manager
const secret = await secretsManager.getSecretValue({
  SecretId: 'license-server/stripe-key'
});

// Vault
const secret = await vault.read('secret/stripe-key');
```

## Frontend Security

### Content Security Policy
```typescript
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'stripe.com'],
    connectSrc: ["'self'", 'api.stripe.com'],
    imgSrc: ["'self'", 'data:', 'https:']
  }
}));
```

### XSS Protection
```typescript
// Helmet provides X-XSS-Protection header
app.use(helmet.xssFilter());

// Sanitize output in templates
const sanitized = DOMPurify.sanitize(userInput);
```

### CSRF Protection
```typescript
// Ensure POST/PUT/DELETE require CSRF token
app.use(csrf());
```

## Data Privacy

### PII Handling
- Encrypt customer emails at rest
- Implement data retention policies
- GDPR: Right to delete, data export
- Log access to sensitive data

### Payment Data
- **Never** log credit card numbers
- Use Stripe's tokenization
- Implement PCI compliance
- Regular PCI audits

## Monitoring & Alerting

### Security Events
```
Alert on:
- Multiple failed license verifications
- Device fingerprint mismatches
- Failed webhook signatures
- SQL injection attempts
- Unusual API traffic patterns
```

### Logging
```typescript
logger.warn('Failed license verification', {
  license_id: licenseId,
  ip_address: req.ip,
  reason: 'Invalid activation key'
});
```

## Compliance Checklist

- [ ] HTTPS/TLS 1.3 enabled
- [ ] Encryption keys rotated quarterly
- [ ] Security headers (HSTS, CSP, etc.)
- [ ] CORS properly configured
- [ ] Rate limiting implemented
- [ ] SQL injection protection
- [ ] XSS protection
- [ ] CSRF protection
- [ ] Audit logging enabled
- [ ] PCI compliance verified
- [ ] Regular security audits
- [ ] Penetration testing done
- [ ] Vulnerability scanning enabled
- [ ] Incident response plan
- [ ] Data backup encryption

---

**For more information:**
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Stripe Security](https://stripe.com/docs/security)
- [Node.js Security](https://nodejs.org/en/docs/guides/security/)
