import { Router, Request, Response } from 'express';
import { query } from '../database/connection';
import { createError } from '../middleware/errorHandler';
import { encryptionService } from '../utils/encryption';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger';

const router = Router();

interface LicenseVerifyRequest {
  license_id: string;
  activation_key: string;
  device_fingerprint: string;
}

interface LicenseActivateRequest {
  email: string;
  license_key: string;
  device_fingerprint: string;
}

// Verify License
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { license_id, activation_key, device_fingerprint } = req.body as LicenseVerifyRequest;

    if (!license_id || !activation_key || !device_fingerprint) {
      throw createError('Missing required fields', 400);
    }

    // Query license from database
    const result = await query(
      `SELECT l.*, c.email FROM licenses l
       JOIN customers c ON l.customer_id = c.id
       WHERE l.license_key = $1`,
      [license_id]
    );

    if (result.rows.length === 0) {
      throw createError('License not found', 404);
    }

    const license = result.rows[0];

    // Verify activation key
    if (license.activation_key !== activation_key) {
      logger.warn(`Invalid activation key for license: ${license_id}`);
      throw createError('Invalid activation key', 401);
    }

    // Check device fingerprint
    if (license.device_fingerprint && license.device_fingerprint !== device_fingerprint) {
      logger.warn(`Device fingerprint mismatch for license: ${license_id}`);
      throw createError('Device not authorized for this license', 403);
    }

    // Check expiration
    const now = new Date();
    const expirationDate = new Date(license.expiration_date);
    const daysRemaining = Math.floor((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const isExpired = now > expirationDate;
    const gracePeriodEnded = daysRemaining < -license.grace_period_days;

    // Update last verified online
    await query(
      `UPDATE licenses SET last_verified_online = NOW() WHERE id = $1`,
      [license.id]
    );

    res.status(200).json({
      status: 'success',
      data: {
        license_id: license.license_key,
        customer_email: license.email,
        expiration_date: license.expiration_date,
        days_remaining: Math.max(0, daysRemaining),
        is_expired: isExpired,
        grace_period_active: isExpired && !gracePeriodEnded,
        grace_period_ended: gracePeriodEnded,
        auto_renewal_enabled: license.auto_renewal,
        status: license.status
      }
    });
  } catch (error) {
    logger.error('License verification failed:', error);
    throw error;
  }
});

// Activate License
router.post('/activate', async (req: Request, res: Response) => {
  try {
    const { email, license_key, device_fingerprint } = req.body as LicenseActivateRequest;

    if (!email || !license_key || !device_fingerprint) {
      throw createError('Missing required fields', 400);
    }

    // Check if customer exists
    let customerResult = await query(
      'SELECT id FROM customers WHERE email = $1',
      [email]
    );

    let customerId: string;
    if (customerResult.rows.length === 0) {
      customerId = uuidv4();
      await query(
        'INSERT INTO customers (id, email) VALUES ($1, $2)',
        [customerId, email]
      );
    } else {
      customerId = customerResult.rows[0].id;
    }

    // Find license by key
    const licenseResult = await query(
      `SELECT id, customer_id FROM licenses WHERE license_key = $1`,
      [license_key]
    );

    if (licenseResult.rows.length === 0) {
      throw createError('License key not found', 404);
    }

    const license = licenseResult.rows[0];

    // Verify license belongs to customer
    if (license.customer_id !== customerId) {
      throw createError('License not associated with this email', 403);
    }

    // Generate activation key
    const activationKey = encryptionService.hash(
      `${license_key}${device_fingerprint}${Date.now()}`
    );

    // Update license
    await query(
      `UPDATE licenses SET 
        activation_key = $1,
        device_fingerprint = $2,
        activation_date = NOW(),
        status = 'active'
       WHERE id = $3`,
      [activationKey, device_fingerprint, license.id]
    );

    // Log activation
    await query(
      `INSERT INTO audit_logs (license_id, customer_id, event_type, event_data, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        license.id,
        customerId,
        'license_activated',
        JSON.stringify({ device_fingerprint }),
        req.ip
      ]
    );

    res.status(200).json({
      status: 'success',
      data: {
        license_id: license_key,
        activation_key: activationKey,
        message: 'License activated successfully'
      }
    });
  } catch (error) {
    logger.error('License activation failed:', error);
    throw error;
  }
});

export default router;
