/**
 * @file stripe.ts
 * @description Stripe client factory. Throws if STRIPE_SECRET_KEY is not configured.
 * @module src/shared/utils/stripe
 */
import Stripe from 'stripe';

import { env } from '@/config/env.js';
import { AppError } from '@/shared/errors/AppError.js';

export function getStripeClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new AppError('SERVER_ERROR', 'Stripe is not configured.', 500);
  }
  return new Stripe(env.STRIPE_SECRET_KEY);
}
