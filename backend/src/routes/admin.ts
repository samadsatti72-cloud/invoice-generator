import { Router, Request, Response } from 'express';
import { query } from '../database/connection';
import { createError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const router = Router();

// Get all licenses (admin)
router.get('/licenses', async (req: Request, res: Response) => {
  try {
    const result = await query(`
      SELECT 
        l.id,
        l.license_key,
        l.status,
        l.expiration_date,
        l.created_at,
        c.email,
        c.name
      FROM licenses l
      JOIN customers c ON l.customer_id = c.id
      ORDER BY l.created_at DESC
    `);

    res.status(200).json({
      status: 'success',
      data: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    logger.error('Failed to fetch licenses:', error);
    throw error;
  }
});

// Get license details
router.get('/licenses/:license_key', async (req: Request, res: Response) => {
  try {
    const { license_key } = req.params;

    const result = await query(`
      SELECT 
        l.*,
        c.email,
        c.name
      FROM licenses l
      JOIN customers c ON l.customer_id = c.id
      WHERE l.license_key = $1
    `, [license_key]);

    if (result.rows.length === 0) {
      throw createError('License not found', 404);
    }

    res.status(200).json({
      status: 'success',
      data: result.rows[0],
    });
  } catch (error) {
    logger.error('Failed to fetch license details:', error);
    throw error;
  }
});

// Get audit logs
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await query(`
      SELECT 
        al.*,
        l.license_key,
        c.email
      FROM audit_logs al
      LEFT JOIN licenses l ON al.license_id = l.id
      LEFT JOIN customers c ON al.customer_id = c.id
      ORDER BY al.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.status(200).json({
      status: 'success',
      data: result.rows,
      limit,
      offset,
    });
  } catch (error) {
    logger.error('Failed to fetch audit logs:', error);
    throw error;
  }
});

// Get dashboard statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const statsResult = await query(`
      SELECT
        (SELECT COUNT(*) FROM customers) as total_customers,
        (SELECT COUNT(*) FROM licenses) as total_licenses,
        (SELECT COUNT(*) FROM licenses WHERE status = 'active') as active_licenses,
        (SELECT COUNT(*) FROM licenses WHERE status = 'expired') as expired_licenses,
        (SELECT SUM(amount) FROM payments WHERE status = 'completed') as total_revenue
    `);

    const stats = statsResult.rows[0];

    res.status(200).json({
      status: 'success',
      data: {
        total_customers: parseInt(stats.total_customers),
        total_licenses: parseInt(stats.total_licenses),
        active_licenses: parseInt(stats.active_licenses),
        expired_licenses: parseInt(stats.expired_licenses),
        total_revenue: stats.total_revenue || 0,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch statistics:', error);
    throw error;
  }
});

export default router;
