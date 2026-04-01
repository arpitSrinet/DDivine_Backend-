/**
 * @file event-bus.ts
 * @description In-process event bus using Node EventEmitter. Will be swapped to BullMQ in Phase 6.
 * @module src/shared/events/event-bus
 */
import { EventEmitter } from 'node:events';

import { logger } from '@/shared/infrastructure/logger.js';

import type { EventName, EventPayloadMap } from './event-types.js';

class AppEventBus {
  private emitter = new EventEmitter();

  emit<E extends EventName>(event: E, payload: EventPayloadMap[E]): void {
    logger.info({ event, payload }, 'Event emitted');
    this.emitter.emit(event, payload);
  }

  on<E extends EventName>(
    event: E,
    handler: (payload: EventPayloadMap[E]) => void | Promise<void>,
  ): void {
    this.emitter.on(event, (payload: EventPayloadMap[E]) => {
      Promise.resolve(handler(payload)).catch((err) => {
        logger.error({ err, event }, 'Event handler failed');
      });
    });
  }

  off<E extends EventName>(
    event: E,
    handler: (payload: EventPayloadMap[E]) => void | Promise<void>,
  ): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }
}

export const eventBus = new AppEventBus();
