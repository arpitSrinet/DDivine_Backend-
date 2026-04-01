/**
 * @file auth.helper.ts
 * @description Test helper for generating JWT tokens for authenticated test requests.
 * @module tests/helpers/auth
 */
import { signToken } from '@/shared/utils/token.js';

interface TestUserOptions {
  id?: string;
  email?: string;
  role?: string;
}

export function createTestToken(options: TestUserOptions = {}): string {
  return signToken({
    sub: options.id ?? 'test-user-id',
    email: options.email ?? 'test@example.com',
    role: options.role ?? 'PARENT',
  });
}

export function authHeader(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}
