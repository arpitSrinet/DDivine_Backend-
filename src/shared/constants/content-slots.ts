/**
 * @file content-slots.ts
 * @description Named CMS image slot keys for the public site (admin content module).
 * @module src/shared/constants/content-slots
 */

/** Fixed slots referenced by the marketing site. Dynamic slots use keys like `sessions.{id}.photo`. */
export const NAMED_CONTENT_SLOTS = [
  'home.hero.background',
  'home.intro.primary',
  'home.services.curricular',
  'home.services.extraCurricular',
  'home.services.holidayCamps',
  'home.services.wraparound',
  'home.additionalNeeds',
  'home.supportFamilies',
  'about.hero',
  'about.photoStrip.0',
  'about.photoStrip.1',
  'about.photoStrip.2',
  'about.photoStrip.3',
  'about.photoStrip.4',
  'events.upcomingBanner',
] as const;

export type NamedContentSlot = (typeof NAMED_CONTENT_SLOTS)[number];
