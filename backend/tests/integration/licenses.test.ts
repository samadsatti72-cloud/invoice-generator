import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import licenseRoutes from '../../src/routes/licenses';

describe('License API Integration Tests', () => {
  let app: express.Application;
  let pool: Pool;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/licenses', licenseRoutes);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  describe('POST /activate', () => {
    it('should activate a license with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/licenses/activate')
        .send({
          email: 'test@example.com',
          license_key: 'TEST-KEY-123',
          device_fingerprint: 'abc123def456'
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.activation_key).toBeDefined();
    });

    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/api/v1/licenses/activate')
        .send({
          email: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.status).toBe('error');
    });

    it('should return 404 for invalid license key', async () => {
      const response = await request(app)
        .post('/api/v1/licenses/activate')
        .send({
          email: 'test@example.com',
          license_key: 'INVALID-KEY',
          device_fingerprint: 'abc123'
        });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /verify', () => {
    it('should verify a valid license', async () => {
      // First activate
      await request(app)
        .post('/api/v1/licenses/activate')
        .send({
          email: 'verify@example.com',
          license_key: 'VERIFY-KEY',
          device_fingerprint: 'fp123'
        });

      // Then verify
      const response = await request(app)
        .post('/api/v1/licenses/verify')
        .send({
          license_id: 'VERIFY-KEY',
          activation_key: expect.any(String),
          device_fingerprint: 'fp123'
        });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('success');
    });
  });
});
