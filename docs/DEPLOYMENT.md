#!/bin/bash

# License Server Deployment Guide

## Prerequisites
- Docker & Docker Compose installed
- Kubernetes cluster (for K8s deployment)
- PostgreSQL 15+
- Node.js 18+
- Stripe account with API keys
- SendGrid account (for email)

## Local Development Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Run Database Migrations
```bash
npm run db:migrate
```

### 4. Start Development Server
```bash
npm run dev
```

Server runs on `http://localhost:3000`

## Docker Compose Deployment

### 1. Build Images
```bash
docker-compose build
```

### 2. Configure Environment
Create `.env` file with all required variables:
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=32-character-key
```

### 3. Start Services
```bash
docker-compose up -d
```

Access:
- API: http://localhost:3000
- Frontend Portal: http://localhost:3001

### 4. View Logs
```bash
docker-compose logs -f license-server
```

### 5. Stop Services
```bash
docker-compose down
```

## Kubernetes Deployment

### 1. Create Namespace
```bash
kubectl apply -f deployment/kubernetes/postgres-redis-deployment.yaml
```

### 2. Create Secrets
```bash
kubectl create secret generic postgres-credentials \
  --from-literal=username=postgres \
  --from-literal=password=your-secure-password \
  -n license-system

kubectl create secret generic stripe-keys \
  --from-literal=secret=sk_test_... \
  -n license-system

kubectl create secret generic jwt-secret \
  --from-literal=secret=your-jwt-secret \
  -n license-system

kubectl create secret generic encryption-key \
  --from-literal=key=your-32-char-key \
  -n license-system
```

### 3. Deploy Application
```bash
kubectl apply -f deployment/kubernetes/license-server-deployment.yaml
```

### 4. Verify Deployment
```bash
kubectl get pods -n license-system
kubectl get svc -n license-system
```

### 5. Scale Replicas
```bash
kubectl scale deployment license-server --replicas=5 -n license-system
```

## Production Checklist

- [ ] Enable HTTPS with SSL certificates
- [ ] Configure firewall rules
- [ ] Set up monitoring (Prometheus, Grafana)
- [ ] Enable logging aggregation (ELK Stack)
- [ ] Configure backups for PostgreSQL
- [ ] Set up CI/CD pipeline
- [ ] Enable rate limiting on API
- [ ] Configure CORS properly
- [ ] Enable audit logging
- [ ] Set up health checks
- [ ] Configure auto-scaling
- [ ] Enable database replication
- [ ] Set up Redis persistence
- [ ] Configure webhook signing verification
- [ ] Enable API request signing

## Monitoring & Maintenance

### Check Service Health
```bash
curl http://localhost:3000/api/v1/health
```

### Database Backups
```bash
# Backup
docker-compose exec postgres pg_dump -U postgres license_db > backup.sql

# Restore
docker-compose exec -T postgres psql -U postgres license_db < backup.sql
```

### View License Statistics
```bash
curl http://localhost:3000/api/v1/admin/stats
```

### Clean Expired Licenses (Maintenance)
```bash
# Add to cron job for daily cleanup
curl -X POST http://localhost:3000/api/v1/admin/cleanup-expired
```

## Troubleshooting

### Connection Refused
- Check if services are running: `docker-compose ps`
- Check logs: `docker-compose logs`

### Database Connection Error
- Verify DATABASE_URL in .env
- Check PostgreSQL is running: `docker-compose logs postgres`

### Payment Webhook Not Working
- Verify STRIPE_WEBHOOK_SECRET is correct
- Check webhook signature in Stripe dashboard
- Review server logs for webhook events

### High Memory Usage
- Reduce connection pool size in `database/connection.ts`
- Enable caching strategy
- Monitor query performance

## Support

For issues and questions:
- GitHub Issues: https://github.com/your-org/license-server
- Email: support@yourdomain.com
- Documentation: https://docs.yourdomain.com
