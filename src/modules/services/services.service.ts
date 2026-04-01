/**
 * @file services.service.ts
 * @description Business logic for the public services catalog.
 * @module src/modules/services/services.service
 */
import { SERVICE_KEY_MAP } from './services.schema.js';
import { servicesRepository } from './services.repository.js';
import type { IServiceResponse } from './services.schema.js';

export const servicesService = {
  async getServices(): Promise<IServiceResponse[]> {
    const services = await servicesRepository.findAllActive();

    return services.map((service) => ({
      id: service.id,
      key: SERVICE_KEY_MAP[service.key] as IServiceResponse['key'],
      title: service.title,
      summary: service.summary,
      imageSrc: service.imageSrc,
      imageAlt: service.imageAlt,
    }));
  },
};
