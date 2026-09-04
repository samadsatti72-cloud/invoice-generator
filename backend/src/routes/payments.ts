import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { query } from '../database/connection';
import { createError } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

interface CreateCheckoutRequest {
  license_id: string;
  email: string;
}

interface WebhookEvent {
  type: string;
  data: {
    object: {
      id: string;
      customer_email?: string;
      metadata?: Record<string, string>;
      amount: number;
    };
  };
}

// Create payment checkout session
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    const { license_id, email } = req.body as CreateCheckoutRequest;

    if (!license_id || !email) {
      throw createError('Missing required fields', 400);
    }

    // Verify license exists
    const licenseResult = await query(
      'SELECT id FROM licenses WHERE license_key = $1',
      [license_id]
    );

    if (licenseResult.rows.length === 0) {
      throw createError('License not found', 404);
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `License Renewal - ${license_id}`,
              description: 'Annual subscription renewal',
            },
            unit_amount: 9999, // $99.99 in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.RENEWAL_PORTAL_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.RENEWAL_PORTAL_URL}/cancel`,
      customer_email: email,
      metadata: {
        license_id,
        email,
      },
    });

    // Store payment record
    const paymentId = uuidv4();
    await query(
      `INSERT INTO payments (id, license_id, stripe_payment_id, amount, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        paymentId,
        licenseResult.rows[0].id,
        session.id,
        99.99,
        'pending',
      ]
    );

    res.status(200).json({
      status: 'success',
      data: {
        checkout_url: session.url,
        session_id: session.id,
      },
    });
  } catch (error) {
    logger.error('Checkout creation failed:', error);
    throw error;
  }
});

// Webhook handler for Stripe events
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    let event: WebhookEvent;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      ) as WebhookEvent;
    } catch (err) {
      logger.error('Webhook signature verification failed:', err);
      throw createError('Invalid webhook signature', 400);
    }

    // Handle payment.intent.succeeded
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      const licenseId = paymentIntent.metadata?.license_id;

      if (licenseId) {
        // Get license
        const licenseResult = await query(
          'SELECT id, expiration_date FROM licenses WHERE license_key = $1',
          [licenseId]
        );

        if (licenseResult.rows.length > 0) {
          const license = licenseResult.rows[0];
          const currentExpiration = new Date(license.expiration_date);
          
          // Calculate new expiration (add 365 days)
          const newExpiration = new Date(currentExpiration);
          newExpiration.setFullYear(newExpiration.getFullYear() + 1);

          // Update license
          await query(
            `UPDATE licenses SET 
              expiration_date = $1,
              status = 'active',
              renewal_reminder_sent = FALSE,
              updated_at = NOW()
             WHERE id = $2`,
            [newExpiration, license.id]
          );

          // Update payment record
          await query(
            `UPDATE payments SET status = 'completed' WHERE stripe_payment_id = $1`,
            [paymentIntent.id]
          );

          // Log event
          await query(
            `INSERT INTO audit_logs (license_id, event_type, event_data, ip_address)
             VALUES ($1, $2, $3, $4)`,
            [
              license.id,
              'license_renewed',
              JSON.stringify({ payment_id: paymentIntent.id }),
              req.ip,
            ]
          );

          logger.info(`License renewed: ${licenseId}, new expiration: ${newExpiration}`);
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook processing failed:', error);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// Check payment status
router.get('/status/:session_id', async (req: Request, res: Response) => {
  try {
    const { session_id } = req.params;

    const session = await stripe.checkout.sessions.retrieve(session_id);

    res.status(200).json({
      status: 'success',
      data: {
        payment_status: session.payment_status,
        session_id: session.id,
        amount_total: session.amount_total,
        customer_email: session.customer_email,
      },
    });
  } catch (error) {
    logger.error('Payment status check failed:', error);
    throw error;
  }
});

export default router;
