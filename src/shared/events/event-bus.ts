/**
 * @file event-bus.ts
 * @description BullMQ-backed event bus (Phase 6 swap from EventEmitter).
 * The emit/on interface is identical to Phase 1–5 — calling code in modules does not change.
 * All events go through the 'ddivine-events' queue. A single in-process Worker dispatches
 * to all registered handlers by job name.
 * @module src/shared/events/event-bus
 */
import { Queue, Worker } from 'bullmq';

import {
  assertValidQueueName,
  getBullMQConnection,
} from '@/shared/infrastructure/bullmq.js';
import { logger } from '@/shared/infrastructure/logger.js';

import type { EventName, EventPayloadMap } from './event-types.js';

const QUEUE_NAME = assertValidQueueName('ddivine-events');

const eventsQueue = new Queue(QUEUE_NAME, {
  connection: getBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  },
});

type AnyHandler = (payload: unknown) => void | Promise<void>;
const handlerRegistry = new Map<EventName, AnyHandler[]>();
let worker: Worker | null = null;

function ensureWorker(): void {
  if (worker) return;
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const handlers = handlerRegistry.get(job.name as EventName) ?? [];
      if (handlers.length === 0) {
        logger.warn({ jobName: job.name }, 'Event received but no handler registered');
        return;
      }
      await Promise.all(handlers.map((h) => h(job.data)));
    },
    { connection: getBullMQConnection() },
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, jobName: job?.name, err }, 'Event worker job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Event worker error');
  });
}

class AppEventBus {
  emit<E extends EventName>(event: E, payload: EventPayloadMap[E]): void {
    logger.info({ event, payload }, 'Event emitted');
    eventsQueue.add(event, payload).catch((err: unknown) => {
      logger.error({ err, event }, 'Failed to enqueue event — falling back silently');
    });
  }

  on<E extends EventName>(
    event: E,
    handler: (payload: EventPayloadMap[E]) => void | Promise<void>,
  ): void {
    if (!handlerRegistry.has(event)) {
      handlerRegistry.set(event, []);
    }
    handlerRegistry.get(event)!.push(handler as AnyHandler);
    ensureWorker();
  }

  async close(): Promise<void> {
    await worker?.close();
    await eventsQueue.close();
  }
}

export const eventBus = new AppEventBus();
