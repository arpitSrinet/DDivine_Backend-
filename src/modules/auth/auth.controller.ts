/**
 * @file auth.controller.ts
 * @description HTTP request handlers for auth endpoints. Validates input, calls service, returns response.
 * @module src/modules/auth/auth.controller
 */
import type { FastifyReply, FastifyRequest } from 'fastify';

import { authService } from './auth.service.js';
import type {
  ILogin,
  IParentSignup,
  ISchoolSignup,
  ISendOtp,
  IVerifyOtp,
  IVerifySignupOtp,
} from './auth.schema.js';

export const authController = {
  async signupParent(
    request: FastifyRequest<{ Body: IParentSignup }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await authService.signupParent(request.body);
    await reply.status(201).send(result);
  },

  async signupSchool(
    request: FastifyRequest<{ Body: ISchoolSignup }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await authService.signupSchool(request.body);
    await reply.status(201).send(result);
  },

  async login(
    request: FastifyRequest<{ Body: ILogin }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await authService.login(request.body);
    await reply.status(200).send(result);
  },

  async sendOtp(
    request: FastifyRequest<{ Body: ISendOtp }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await authService.sendOtp(request.body);
    await reply.status(200).send(result);
  },

  async verifyOtp(
    request: FastifyRequest<{ Body: IVerifyOtp }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await authService.verifyOtp(request.body);
    await reply.status(200).send(result);
  },

  async verifySignupOtp(
    request: FastifyRequest<{ Body: IVerifySignupOtp }>,
    reply: FastifyReply,
  ): Promise<void> {
    const result = await authService.verifySignupOtp(request.body);
    await reply.status(200).send(result);
  },

  async logout(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = request.headers.authorization!.slice(7);
    const result = await authService.logout(token);
    await reply.status(200).send(result);
  },
};
