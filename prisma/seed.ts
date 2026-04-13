/**
 * @file seed.ts
 * @description Development seed data for local testing.
 * @module prisma/seed
 */
import {
  BookingStatus,
  CalendarEventType,
  ContactInquiryStatus,
  MatchStatus,
  PaymentStatus,
  PrismaClient,
  RefundStatus,
  ServiceKey,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // ─── Admin users ────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin123!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@ddivine.co.uk' },
    update: {},
    create: {
      email: 'admin@ddivine.co.uk',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      firstName: 'Admin',
      lastName: 'User',
    },
  });

  await prisma.user.upsert({
    where: { email: 'superadmin@ddivine.co.uk' },
    update: {},
    create: {
      email: 'superadmin@ddivine.co.uk',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      firstName: 'Super',
      lastName: 'Admin',
    },
  });

  // ─── Parent customers ────────────────────────────────────────────────────────
  const parentHash = await bcrypt.hash('parent123!', 12);

  const parent1 = await prisma.user.upsert({
    where: { email: 'sarah.johnson@example.com' },
    update: {},
    create: {
      email: 'sarah.johnson@example.com',
      passwordHash: parentHash,
      role: UserRole.PARENT,
      firstName: 'Sarah',
      lastName: 'Johnson',
      phone: '07700 900111',
      addressLine1: '14 Maple Street',
      town: 'Manchester',
      county: 'Greater Manchester',
      postcode: 'M1 1AA',
    },
  });

  const parent2 = await prisma.user.upsert({
    where: { email: 'david.smith@example.com' },
    update: {},
    create: {
      email: 'david.smith@example.com',
      passwordHash: parentHash,
      role: UserRole.PARENT,
      firstName: 'David',
      lastName: 'Smith',
      phone: '07700 900222',
      addressLine1: '8 Oak Avenue',
      town: 'Salford',
      county: 'Greater Manchester',
      postcode: 'M5 2BB',
    },
  });

  const parent3 = await prisma.user.upsert({
    where: { email: 'emma.williams@example.com' },
    update: {},
    create: {
      email: 'emma.williams@example.com',
      passwordHash: parentHash,
      role: UserRole.PARENT,
      firstName: 'Emma',
      lastName: 'Williams',
      phone: '07700 900333',
      addressLine1: '22 Birch Road',
      town: 'Stockport',
      county: 'Cheshire',
      postcode: 'SK1 3CC',
    },
  });

  const parent4 = await prisma.user.upsert({
    where: { email: 'james.brown@example.com' },
    update: {},
    create: {
      email: 'james.brown@example.com',
      passwordHash: parentHash,
      role: UserRole.PARENT,
      firstName: 'James',
      lastName: 'Brown',
      phone: '07700 900444',
      addressLine1: '5 Cedar Close',
      town: 'Bolton',
      county: 'Greater Manchester',
      postcode: 'BL1 4DD',
    },
  });

  const parent5 = await prisma.user.upsert({
    where: { email: 'lisa.taylor@example.com' },
    update: {},
    create: {
      email: 'lisa.taylor@example.com',
      passwordHash: parentHash,
      role: UserRole.PARENT,
      firstName: 'Lisa',
      lastName: 'Taylor',
      phone: '07700 900555',
      addressLine1: '31 Elm Drive',
      town: 'Oldham',
      county: 'Greater Manchester',
      postcode: 'OL1 5EE',
    },
  });

  // ─── Children ────────────────────────────────────────────────────────────────
  const child1 = await prisma.child.upsert({
    where: { id: 'seed-child-1' },
    update: {},
    create: {
      id: 'seed-child-1',
      userId: parent1.id,
      firstName: 'Oliver',
      lastName: 'Johnson',
      dateOfBirth: new Date('2015-04-12'),
      gender: 'Male',
      yearGroup: 'Year 4',
      schoolName: 'Northside Primary School',
    },
  });

  const child2 = await prisma.child.upsert({
    where: { id: 'seed-child-2' },
    update: {},
    create: {
      id: 'seed-child-2',
      userId: parent2.id,
      firstName: 'Ava',
      lastName: 'Smith',
      dateOfBirth: new Date('2014-09-22'),
      gender: 'Female',
      yearGroup: 'Year 5',
      schoolName: 'Greenfield Primary School',
    },
  });

  const child3 = await prisma.child.upsert({
    where: { id: 'seed-child-3' },
    update: {},
    create: {
      id: 'seed-child-3',
      userId: parent3.id,
      firstName: 'Noah',
      lastName: 'Williams',
      dateOfBirth: new Date('2016-01-08'),
      gender: 'Male',
      yearGroup: 'Year 3',
      schoolName: 'Hillcrest Junior School',
    },
  });

  const child4 = await prisma.child.upsert({
    where: { id: 'seed-child-4' },
    update: {},
    create: {
      id: 'seed-child-4',
      userId: parent4.id,
      firstName: 'Isla',
      lastName: 'Brown',
      dateOfBirth: new Date('2013-07-19'),
      gender: 'Female',
      yearGroup: 'Year 6',
      schoolName: 'Brookside Academy',
    },
  });

  const child5 = await prisma.child.upsert({
    where: { id: 'seed-child-5' },
    update: {},
    create: {
      id: 'seed-child-5',
      userId: parent5.id,
      firstName: 'Liam',
      lastName: 'Taylor',
      dateOfBirth: new Date('2015-11-30'),
      gender: 'Male',
      yearGroup: 'Year 4',
      schoolName: 'Parkview Primary School',
    },
  });

  // ─── Services ────────────────────────────────────────────────────────────────
  const serviceCurricular = await prisma.service.upsert({
    where: { key: ServiceKey.CURRICULAR },
    update: {},
    create: {
      key: ServiceKey.CURRICULAR,
      title: 'Curricular Activities',
      summary: 'In-school sports coaching delivered during curriculum time.',
      imageSrc: '/assets/coaching-session.svg',
      imageAlt: 'Children in a coaching session',
    },
  });

  const serviceExtra = await prisma.service.upsert({
    where: { key: ServiceKey.EXTRA_CURRICULAR },
    update: {},
    create: {
      key: ServiceKey.EXTRA_CURRICULAR,
      title: 'Extra Curricular Activities',
      summary: 'After-school clubs and sports programmes.',
      imageSrc: '/assets/club-session.svg',
      imageAlt: 'Children in an after-school club',
    },
  });

  const serviceHoliday = await prisma.service.upsert({
    where: { key: ServiceKey.HOLIDAY_CAMPS },
    update: {},
    create: {
      key: ServiceKey.HOLIDAY_CAMPS,
      title: 'Holiday Football Camps',
      summary: 'Multi-day football camps during school holidays.',
      imageSrc: '/assets/holiday-camp.svg',
      imageAlt: 'Children at a holiday football camp',
    },
  });

  const serviceWraparound = await prisma.service.upsert({
    where: { key: ServiceKey.WRAPAROUND },
    update: {},
    create: {
      key: ServiceKey.WRAPAROUND,
      title: 'Wraparound Childcare',
      summary: 'Before and after school childcare with sports activities.',
      imageSrc: '/assets/wraparound-care.svg',
      imageAlt: 'Children in wraparound care',
    },
  });

  // ─── Sessions ────────────────────────────────────────────────────────────────
  const session1 = await prisma.session.upsert({
    where: { id: 'seed-session-1' },
    update: {},
    create: {
      id: 'seed-session-1',
      serviceId: serviceCurricular.id,
      date: new Date('2026-04-15'),
      time: '09:00',
      location: 'Northside Primary School, Manchester',
      coachName: 'Coach Marcus Reid',
      maxCapacity: 20,
      currentCapacity: 12,
      minAgeYears: 5,
      maxAgeYears: 11,
      price: 25.0,
      isActive: true,
    },
  });

  const session2 = await prisma.session.upsert({
    where: { id: 'seed-session-2' },
    update: {},
    create: {
      id: 'seed-session-2',
      serviceId: serviceExtra.id,
      date: new Date('2026-04-18'),
      time: '15:30',
      location: 'Greenfield Primary School, Salford',
      coachName: 'Coach Priya Patel',
      maxCapacity: 15,
      currentCapacity: 8,
      minAgeYears: 6,
      maxAgeYears: 12,
      price: 18.5,
      isActive: true,
    },
  });

  const session3 = await prisma.session.upsert({
    where: { id: 'seed-session-3' },
    update: {},
    create: {
      id: 'seed-session-3',
      serviceId: serviceHoliday.id,
      date: new Date('2026-04-22'),
      time: '10:00',
      location: 'Heaton Park Sports Ground, Manchester',
      coachName: 'Coach Daniel Osei',
      maxCapacity: 30,
      currentCapacity: 22,
      minAgeYears: 7,
      maxAgeYears: 14,
      price: 45.0,
      isActive: true,
    },
  });

  const session4 = await prisma.session.upsert({
    where: { id: 'seed-session-4' },
    update: {},
    create: {
      id: 'seed-session-4',
      serviceId: serviceWraparound.id,
      date: new Date('2026-04-16'),
      time: '07:45',
      location: 'Brookside Academy, Bolton',
      coachName: 'Coach Sarah Nkosi',
      maxCapacity: 25,
      currentCapacity: 18,
      minAgeYears: 5,
      maxAgeYears: 11,
      price: 12.0,
      isActive: true,
    },
  });

  const session5 = await prisma.session.upsert({
    where: { id: 'seed-session-5' },
    update: {},
    create: {
      id: 'seed-session-5',
      serviceId: serviceCurricular.id,
      date: new Date('2026-03-10'),
      time: '11:00',
      location: 'Hillcrest Junior School, Stockport',
      coachName: 'Coach Marcus Reid',
      maxCapacity: 18,
      currentCapacity: 18,
      minAgeYears: 5,
      maxAgeYears: 11,
      price: 25.0,
      isActive: false,
    },
  });

  // ─── Bookings + Payments ──────────────────────────────────────────────────────
  const booking1 = await prisma.booking.upsert({
    where: { id: 'seed-booking-1' },
    update: {},
    create: {
      id: 'seed-booking-1',
      userId: parent1.id,
      childId: child1.id,
      sessionId: session1.id,
      status: BookingStatus.CONFIRMED,
      price: 25.0,
    },
  });
  await prisma.payment.upsert({
    where: { bookingId: booking1.id },
    update: {},
    create: {
      bookingId: booking1.id,
      stripePaymentIntentId: 'pi_seed_001',
      amount: 25.0,
      currency: 'gbp',
      status: PaymentStatus.PAID,
    },
  });

  const booking2 = await prisma.booking.upsert({
    where: { id: 'seed-booking-2' },
    update: {},
    create: {
      id: 'seed-booking-2',
      userId: parent2.id,
      childId: child2.id,
      sessionId: session2.id,
      status: BookingStatus.CONFIRMED,
      price: 18.5,
    },
  });
  await prisma.payment.upsert({
    where: { bookingId: booking2.id },
    update: {},
    create: {
      bookingId: booking2.id,
      stripePaymentIntentId: 'pi_seed_002',
      amount: 18.5,
      currency: 'gbp',
      status: PaymentStatus.PAID,
    },
  });

  const booking3 = await prisma.booking.upsert({
    where: { id: 'seed-booking-3' },
    update: {},
    create: {
      id: 'seed-booking-3',
      userId: parent3.id,
      childId: child3.id,
      sessionId: session3.id,
      status: BookingStatus.CONFIRMED,
      price: 45.0,
    },
  });
  await prisma.payment.upsert({
    where: { bookingId: booking3.id },
    update: {},
    create: {
      bookingId: booking3.id,
      stripePaymentIntentId: 'pi_seed_003',
      amount: 45.0,
      currency: 'gbp',
      status: PaymentStatus.PAID,
    },
  });

  const booking4 = await prisma.booking.upsert({
    where: { id: 'seed-booking-4' },
    update: {},
    create: {
      id: 'seed-booking-4',
      userId: parent4.id,
      childId: child4.id,
      sessionId: session4.id,
      status: BookingStatus.PENDING,
      price: 12.0,
    },
  });
  await prisma.payment.upsert({
    where: { bookingId: booking4.id },
    update: {},
    create: {
      bookingId: booking4.id,
      stripePaymentIntentId: 'pi_seed_004',
      amount: 12.0,
      currency: 'gbp',
      status: PaymentStatus.PENDING,
    },
  });

  const booking5 = await prisma.booking.upsert({
    where: { id: 'seed-booking-5' },
    update: {},
    create: {
      id: 'seed-booking-5',
      userId: parent5.id,
      childId: child5.id,
      sessionId: session1.id,
      status: BookingStatus.CANCELLED,
      price: 25.0,
      cancelledAt: new Date('2026-04-10'),
    },
  });
  const payment5 = await prisma.payment.upsert({
    where: { bookingId: booking5.id },
    update: {},
    create: {
      bookingId: booking5.id,
      stripePaymentIntentId: 'pi_seed_005',
      amount: 25.0,
      currency: 'gbp',
      status: PaymentStatus.REFUNDED,
    },
  });
  await prisma.refund.upsert({
    where: { id: 'seed-refund-1' },
    update: {},
    create: {
      id: 'seed-refund-1',
      paymentId: payment5.id,
      amount: 25.0,
      reason: 'Customer requested cancellation more than 48 hours before session.',
      status: RefundStatus.COMPLETED,
    },
  });

  const booking6 = await prisma.booking.upsert({
    where: { id: 'seed-booking-6' },
    update: {},
    create: {
      id: 'seed-booking-6',
      userId: parent1.id,
      childId: child1.id,
      sessionId: session3.id,
      status: BookingStatus.CONFIRMED,
      price: 45.0,
    },
  });
  await prisma.payment.upsert({
    where: { bookingId: booking6.id },
    update: {},
    create: {
      bookingId: booking6.id,
      stripePaymentIntentId: 'pi_seed_006',
      amount: 45.0,
      currency: 'gbp',
      status: PaymentStatus.PAID,
    },
  });

  const booking7 = await prisma.booking.upsert({
    where: { id: 'seed-booking-7' },
    update: {},
    create: {
      id: 'seed-booking-7',
      userId: parent2.id,
      childId: child2.id,
      sessionId: session5.id,
      status: BookingStatus.CONFIRMED,
      price: 25.0,
    },
  });
  await prisma.payment.upsert({
    where: { bookingId: booking7.id },
    update: {},
    create: {
      bookingId: booking7.id,
      stripePaymentIntentId: 'pi_seed_007',
      amount: 25.0,
      currency: 'gbp',
      status: PaymentStatus.PAID,
    },
  });

  // ─── Calendar events ─────────────────────────────────────────────────────────
  await prisma.calendarEvent.upsert({
    where: { id: 'seed-event-1' },
    update: {
      title: 'Spring Football Tournament 2026',
      description: 'An exciting one-day U10 and U12 football tournament. Teams from across Greater Manchester compete for the DDivine Trophy.',
      type: CalendarEventType.TOURNAMENT,
      date: new Date('2026-05-10'),
      time: '09:00',
      location: 'Heaton Park Sports Complex, Manchester',
      category: 'Football Tournament',
      startDate: new Date('2026-05-10'),
      endDate: new Date('2026-05-10'),
      startTime: '09:00',
      endTime: '17:00',
      minAgeYears: 9,
      maxAgeYears: 12,
      maxCapacity: 120,
      currentCapacity: 64,
      currency: 'GBP',
      subtotal: 18.0,
      serviceFee: 2.0,
      requirements: ['Football boots or trainers', 'Shin pads', 'Packed lunch', 'Water bottle'],
      addons: [
        { key: 'medal_pack', label: 'Tournament Medal Pack', price: 4.5 },
        { key: 'early_dropoff', label: 'Early Drop-off (08:15)', price: 3.0 },
      ],
      isPublic: true,
    },
    create: {
      id: 'seed-event-1',
      title: 'Spring Football Tournament 2026',
      description: 'An exciting one-day U10 and U12 football tournament. Teams from across Greater Manchester compete for the DDivine Trophy.',
      type: CalendarEventType.TOURNAMENT,
      date: new Date('2026-05-10'),
      time: '09:00',
      location: 'Heaton Park Sports Complex, Manchester',
      category: 'Football Tournament',
      startDate: new Date('2026-05-10'),
      endDate: new Date('2026-05-10'),
      startTime: '09:00',
      endTime: '17:00',
      minAgeYears: 9,
      maxAgeYears: 12,
      maxCapacity: 120,
      currentCapacity: 64,
      currency: 'GBP',
      subtotal: 18.0,
      serviceFee: 2.0,
      requirements: ['Football boots or trainers', 'Shin pads', 'Packed lunch', 'Water bottle'],
      addons: [
        { key: 'medal_pack', label: 'Tournament Medal Pack', price: 4.5 },
        { key: 'early_dropoff', label: 'Early Drop-off (08:15)', price: 3.0 },
      ],
      isPublic: true,
    },
  });

  await prisma.calendarEvent.upsert({
    where: { id: 'seed-event-2' },
    update: {
      title: 'Open Day – Holiday Camp Preview',
      description: 'Come and meet our coaches, try a free taster session and find out more about our Summer Holiday Camps.',
      type: CalendarEventType.OPEN_DAY,
      date: new Date('2026-04-26'),
      time: '10:00',
      location: 'Greenfield Primary School, Salford',
      category: 'Community',
      startDate: new Date('2026-04-26'),
      endDate: new Date('2026-04-26'),
      startTime: '10:00',
      endTime: '13:00',
      minAgeYears: 5,
      maxAgeYears: 14,
      maxCapacity: 80,
      currentCapacity: 36,
      currency: 'GBP',
      subtotal: 0,
      serviceFee: 0,
      requirements: ['Parent/guardian attendance required', 'Sportswear recommended'],
      addons: [{ key: 'trial_pack', label: '3-Session Trial Pack', price: 15.0 }],
      isPublic: true,
    },
    create: {
      id: 'seed-event-2',
      title: 'Open Day – Holiday Camp Preview',
      description: 'Come and meet our coaches, try a free taster session and find out more about our Summer Holiday Camps.',
      type: CalendarEventType.OPEN_DAY,
      date: new Date('2026-04-26'),
      time: '10:00',
      location: 'Greenfield Primary School, Salford',
      category: 'Community',
      startDate: new Date('2026-04-26'),
      endDate: new Date('2026-04-26'),
      startTime: '10:00',
      endTime: '13:00',
      minAgeYears: 5,
      maxAgeYears: 14,
      maxCapacity: 80,
      currentCapacity: 36,
      currency: 'GBP',
      subtotal: 0,
      serviceFee: 0,
      requirements: ['Parent/guardian attendance required', 'Sportswear recommended'],
      addons: [{ key: 'trial_pack', label: '3-Session Trial Pack', price: 15.0 }],
      isPublic: true,
    },
  });

  await prisma.calendarEvent.upsert({
    where: { id: 'seed-event-3' },
    update: {
      title: 'Easter Holiday Football Camp',
      description: 'Three days of intensive football training, mini-matches and fun activities. Ages 6–14.',
      type: CalendarEventType.CAMP,
      date: new Date('2026-04-22'),
      time: '09:30',
      location: 'Heaton Park Sports Ground, Manchester',
      category: 'Holiday Camp',
      startDate: new Date('2026-04-22'),
      endDate: new Date('2026-04-24'),
      startTime: '09:30',
      endTime: '15:30',
      minAgeYears: 6,
      maxAgeYears: 14,
      maxCapacity: 60,
      currentCapacity: 41,
      currency: 'GBP',
      subtotal: 45.0,
      serviceFee: 3.5,
      requirements: ['Packed lunch', 'Football kit', 'Water bottle'],
      addons: [
        { key: 'late_pickup', label: 'Late Pick-up (until 16:30)', price: 6.0 },
        { key: 'camp_tshirt', label: 'Camp T-shirt', price: 9.99 },
      ],
      isPublic: true,
    },
    create: {
      id: 'seed-event-3',
      title: 'Easter Holiday Football Camp',
      description: 'Three days of intensive football training, mini-matches and fun activities. Ages 6–14.',
      type: CalendarEventType.CAMP,
      date: new Date('2026-04-22'),
      time: '09:30',
      location: 'Heaton Park Sports Ground, Manchester',
      category: 'Holiday Camp',
      startDate: new Date('2026-04-22'),
      endDate: new Date('2026-04-24'),
      startTime: '09:30',
      endTime: '15:30',
      minAgeYears: 6,
      maxAgeYears: 14,
      maxCapacity: 60,
      currentCapacity: 41,
      currency: 'GBP',
      subtotal: 45.0,
      serviceFee: 3.5,
      requirements: ['Packed lunch', 'Football kit', 'Water bottle'],
      addons: [
        { key: 'late_pickup', label: 'Late Pick-up (until 16:30)', price: 6.0 },
        { key: 'camp_tshirt', label: 'Camp T-shirt', price: 9.99 },
      ],
      isPublic: true,
    },
  });

  await prisma.calendarEvent.upsert({
    where: { id: 'seed-event-4' },
    update: {
      title: 'School Visit – Brookside Academy',
      description: 'DDivine coaches visit Brookside Academy to demonstrate our curricular programme.',
      type: CalendarEventType.SCHOOL_VISIT,
      date: new Date('2026-04-16'),
      time: '14:00',
      location: 'Brookside Academy, Bolton',
      category: 'School Programme',
      startDate: new Date('2026-04-16'),
      endDate: new Date('2026-04-16'),
      startTime: '14:00',
      endTime: '15:30',
      minAgeYears: 7,
      maxAgeYears: 11,
      maxCapacity: 32,
      currentCapacity: 28,
      currency: 'GBP',
      subtotal: 0,
      serviceFee: 0,
      requirements: ['School PE kit', 'Indoor hall access', 'Class teacher present'],
      addons: [{ key: 'teacher_workshop', label: 'Teacher CPD Workshop', price: 35.0 }],
      isPublic: false,
    },
    create: {
      id: 'seed-event-4',
      title: 'School Visit – Brookside Academy',
      description: 'DDivine coaches visit Brookside Academy to demonstrate our curricular programme.',
      type: CalendarEventType.SCHOOL_VISIT,
      date: new Date('2026-04-16'),
      time: '14:00',
      location: 'Brookside Academy, Bolton',
      category: 'School Programme',
      startDate: new Date('2026-04-16'),
      endDate: new Date('2026-04-16'),
      startTime: '14:00',
      endTime: '15:30',
      minAgeYears: 7,
      maxAgeYears: 11,
      maxCapacity: 32,
      currentCapacity: 28,
      currency: 'GBP',
      subtotal: 0,
      serviceFee: 0,
      requirements: ['School PE kit', 'Indoor hall access', 'Class teacher present'],
      addons: [{ key: 'teacher_workshop', label: 'Teacher CPD Workshop', price: 35.0 }],
      isPublic: false,
    },
  });

  await prisma.calendarEvent.upsert({
    where: { id: 'seed-event-5' },
    update: {
      title: 'Summer League Kick-Off',
      description: 'The start of the DDivine Summer League. All registered teams compete in their first fixtures.',
      type: CalendarEventType.TOURNAMENT,
      date: new Date('2026-06-07'),
      time: '10:00',
      location: 'Wythenshawe Park, Manchester',
      category: 'League',
      startDate: new Date('2026-06-07'),
      endDate: new Date('2026-06-07'),
      startTime: '10:00',
      endTime: '16:00',
      minAgeYears: 8,
      maxAgeYears: 13,
      maxCapacity: 96,
      currentCapacity: 52,
      currency: 'GBP',
      subtotal: 22.0,
      serviceFee: 2.5,
      requirements: ['Team registration', 'Medical consent form', 'Water bottle'],
      addons: [
        { key: 'match_video', label: 'Match Video Package', price: 12.0 },
        { key: 'vip_seating', label: 'VIP Parent Seating', price: 7.5 },
      ],
      isPublic: true,
    },
    create: {
      id: 'seed-event-5',
      title: 'Summer League Kick-Off',
      description: 'The start of the DDivine Summer League. All registered teams compete in their first fixtures.',
      type: CalendarEventType.TOURNAMENT,
      date: new Date('2026-06-07'),
      time: '10:00',
      location: 'Wythenshawe Park, Manchester',
      category: 'League',
      startDate: new Date('2026-06-07'),
      endDate: new Date('2026-06-07'),
      startTime: '10:00',
      endTime: '16:00',
      minAgeYears: 8,
      maxAgeYears: 13,
      maxCapacity: 96,
      currentCapacity: 52,
      currency: 'GBP',
      subtotal: 22.0,
      serviceFee: 2.5,
      requirements: ['Team registration', 'Medical consent form', 'Water bottle'],
      addons: [
        { key: 'match_video', label: 'Match Video Package', price: 12.0 },
        { key: 'vip_seating', label: 'VIP Parent Seating', price: 7.5 },
      ],
      isPublic: true,
    },
  });

  await prisma.calendarEvent.upsert({
    where: { id: 'seed-event-6' },
    update: {
      title: 'Girls Football Development Camp',
      description: 'A focused development day for girls aged 8-13 with technical, tactical and confidence-building sessions.',
      type: CalendarEventType.CAMP,
      date: new Date('2026-07-05'),
      time: '10:00',
      location: 'Etihad Campus Community Pitches, Manchester',
      category: 'Girls Development',
      startDate: new Date('2026-07-05'),
      endDate: new Date('2026-07-05'),
      startTime: '10:00',
      endTime: '15:00',
      minAgeYears: 8,
      maxAgeYears: 13,
      maxCapacity: 48,
      currentCapacity: 19,
      currency: 'GBP',
      subtotal: 30.0,
      serviceFee: 2.0,
      requirements: ['Football boots', 'Shin pads', 'Packed lunch'],
      addons: [{ key: 'goalkeeper_module', label: 'Goalkeeper Masterclass Add-on', price: 8.0 }],
      isPublic: true,
    },
    create: {
      id: 'seed-event-6',
      title: 'Girls Football Development Camp',
      description: 'A focused development day for girls aged 8-13 with technical, tactical and confidence-building sessions.',
      type: CalendarEventType.CAMP,
      date: new Date('2026-07-05'),
      time: '10:00',
      location: 'Etihad Campus Community Pitches, Manchester',
      category: 'Girls Development',
      startDate: new Date('2026-07-05'),
      endDate: new Date('2026-07-05'),
      startTime: '10:00',
      endTime: '15:00',
      minAgeYears: 8,
      maxAgeYears: 13,
      maxCapacity: 48,
      currentCapacity: 19,
      currency: 'GBP',
      subtotal: 30.0,
      serviceFee: 2.0,
      requirements: ['Football boots', 'Shin pads', 'Packed lunch'],
      addons: [{ key: 'goalkeeper_module', label: 'Goalkeeper Masterclass Add-on', price: 8.0 }],
      isPublic: true,
    },
  });

  await prisma.calendarEvent.upsert({
    where: { id: 'seed-event-7' },
    update: {
      title: 'Parent & Child Skills Evening',
      description: 'An evening skills clinic where parents and children train together through guided drills and games.',
      type: CalendarEventType.OPEN_DAY,
      date: new Date('2026-07-17'),
      time: '18:00',
      location: 'Northside Primary School, Manchester',
      category: 'Family Session',
      startDate: new Date('2026-07-17'),
      endDate: new Date('2026-07-17'),
      startTime: '18:00',
      endTime: '20:00',
      minAgeYears: 5,
      maxAgeYears: 12,
      maxCapacity: 40,
      currentCapacity: 14,
      currency: 'GBP',
      subtotal: 12.0,
      serviceFee: 1.0,
      requirements: ['Parent/guardian must attend', 'Comfortable sports clothing'],
      addons: [{ key: 'family_photo', label: 'Professional Family Action Photo', price: 6.5 }],
      isPublic: true,
    },
    create: {
      id: 'seed-event-7',
      title: 'Parent & Child Skills Evening',
      description: 'An evening skills clinic where parents and children train together through guided drills and games.',
      type: CalendarEventType.OPEN_DAY,
      date: new Date('2026-07-17'),
      time: '18:00',
      location: 'Northside Primary School, Manchester',
      category: 'Family Session',
      startDate: new Date('2026-07-17'),
      endDate: new Date('2026-07-17'),
      startTime: '18:00',
      endTime: '20:00',
      minAgeYears: 5,
      maxAgeYears: 12,
      maxCapacity: 40,
      currentCapacity: 14,
      currency: 'GBP',
      subtotal: 12.0,
      serviceFee: 1.0,
      requirements: ['Parent/guardian must attend', 'Comfortable sports clothing'],
      addons: [{ key: 'family_photo', label: 'Professional Family Action Photo', price: 6.5 }],
      isPublic: true,
    },
  });

  // ─── League teams ────────────────────────────────────────────────────────────
  const teamA = await prisma.team.upsert({
    where: { id: 'seed-team-a' },
    update: {},
    create: { id: 'seed-team-a', name: 'Northside FC' },
  });
  const teamB = await prisma.team.upsert({
    where: { id: 'seed-team-b' },
    update: {},
    create: { id: 'seed-team-b', name: 'Southgate Rovers' },
  });
  const teamC = await prisma.team.upsert({
    where: { id: 'seed-team-c' },
    update: {},
    create: { id: 'seed-team-c', name: 'Eastfield United' },
  });
  const teamD = await prisma.team.upsert({
    where: { id: 'seed-team-d' },
    update: {},
    create: { id: 'seed-team-d', name: 'Parkview Panthers' },
  });
  const teamE = await prisma.team.upsert({
    where: { id: 'seed-team-e' },
    update: {},
    create: { id: 'seed-team-e', name: 'Hillcrest Hawks' },
  });

  // League standings
  await prisma.leagueStanding.upsert({
    where: { teamId: teamA.id },
    update: { matchesPlayed: 8, wins: 6, draws: 1, losses: 1, points: 19 },
    create: { teamId: teamA.id, matchesPlayed: 8, wins: 6, draws: 1, losses: 1, points: 19 },
  });
  await prisma.leagueStanding.upsert({
    where: { teamId: teamB.id },
    update: { matchesPlayed: 8, wins: 5, draws: 2, losses: 1, points: 17 },
    create: { teamId: teamB.id, matchesPlayed: 8, wins: 5, draws: 2, losses: 1, points: 17 },
  });
  await prisma.leagueStanding.upsert({
    where: { teamId: teamC.id },
    update: { matchesPlayed: 8, wins: 3, draws: 2, losses: 3, points: 11 },
    create: { teamId: teamC.id, matchesPlayed: 8, wins: 3, draws: 2, losses: 3, points: 11 },
  });
  await prisma.leagueStanding.upsert({
    where: { teamId: teamD.id },
    update: { matchesPlayed: 8, wins: 2, draws: 1, losses: 5, points: 7 },
    create: { teamId: teamD.id, matchesPlayed: 8, wins: 2, draws: 1, losses: 5, points: 7 },
  });
  await prisma.leagueStanding.upsert({
    where: { teamId: teamE.id },
    update: { matchesPlayed: 8, wins: 1, draws: 0, losses: 7, points: 3 },
    create: { teamId: teamE.id, matchesPlayed: 8, wins: 1, draws: 0, losses: 7, points: 3 },
  });

  // Matches
  await prisma.match.upsert({
    where: { id: 'seed-match-1' },
    update: {},
    create: {
      id: 'seed-match-1',
      homeTeamId: teamA.id,
      awayTeamId: teamB.id,
      homeScore: 3,
      awayScore: 1,
      date: new Date('2026-03-15'),
      status: MatchStatus.COMPLETED,
    },
  });
  await prisma.match.upsert({
    where: { id: 'seed-match-2' },
    update: {},
    create: {
      id: 'seed-match-2',
      homeTeamId: teamC.id,
      awayTeamId: teamD.id,
      homeScore: 2,
      awayScore: 2,
      date: new Date('2026-03-15'),
      status: MatchStatus.COMPLETED,
    },
  });
  await prisma.match.upsert({
    where: { id: 'seed-match-3' },
    update: {},
    create: {
      id: 'seed-match-3',
      homeTeamId: teamB.id,
      awayTeamId: teamC.id,
      homeScore: 4,
      awayScore: 0,
      date: new Date('2026-03-22'),
      status: MatchStatus.COMPLETED,
    },
  });
  await prisma.match.upsert({
    where: { id: 'seed-match-4' },
    update: {},
    create: {
      id: 'seed-match-4',
      homeTeamId: teamA.id,
      awayTeamId: teamE.id,
      homeScore: 5,
      awayScore: 1,
      date: new Date('2026-03-29'),
      status: MatchStatus.COMPLETED,
    },
  });
  await prisma.match.upsert({
    where: { id: 'seed-match-5' },
    update: {},
    create: {
      id: 'seed-match-5',
      homeTeamId: teamD.id,
      awayTeamId: teamA.id,
      homeScore: 0,
      awayScore: 2,
      date: new Date('2026-04-05'),
      status: MatchStatus.COMPLETED,
    },
  });
  await prisma.match.upsert({
    where: { id: 'seed-match-6' },
    update: {},
    create: {
      id: 'seed-match-6',
      homeTeamId: teamA.id,
      awayTeamId: teamC.id,
      date: new Date('2026-04-19'),
      status: MatchStatus.SCHEDULED,
    },
  });
  await prisma.match.upsert({
    where: { id: 'seed-match-7' },
    update: {},
    create: {
      id: 'seed-match-7',
      homeTeamId: teamB.id,
      awayTeamId: teamE.id,
      date: new Date('2026-04-19'),
      status: MatchStatus.SCHEDULED,
    },
  });

  // ─── Knowledge – Case Studies ─────────────────────────────────────────────────
  await prisma.caseStudy.upsert({
    where: { id: 'seed-cs-1' },
    update: {},
    create: {
      id: 'seed-cs-1',
      title: 'How Northside Primary Improved PE Engagement by 40%',
      body: '<p>By partnering with DDivine Training, Northside Primary saw a <strong>40% increase</strong> in pupil engagement with physical education over one term. Our coaches worked alongside class teachers to deliver structured, curriculum-aligned sessions.</p><p>Key outcomes included improved pupil confidence, better teamwork skills, and sustained interest in physical activity outside of school.</p>',
      tag: 'Education',
      order: 1,
    },
  });

  await prisma.caseStudy.upsert({
    where: { id: 'seed-cs-2' },
    update: {},
    create: {
      id: 'seed-cs-2',
      title: 'Holiday Camp Success: 200+ Children Across 5 Locations',
      body: '<p>Over <strong>200 children</strong> attended our Summer Holiday Camps across 5 locations in Greater Manchester. Parents reported significant improvements in confidence, coordination and teamwork.</p><p>92% of parents said they would book again, and 78% of children showed measurable skill improvement by the end of camp week.</p>',
      tag: 'Holiday Camps',
      order: 2,
    },
  });

  await prisma.caseStudy.upsert({
    where: { id: 'seed-cs-3' },
    update: {},
    create: {
      id: 'seed-cs-3',
      title: 'Wraparound Care That Works: Brookside Academy',
      body: '<p>Brookside Academy partnered with DDivine to provide structured before and after-school childcare for 25 children aged 5-11. The programme reduced stress for working parents and gave children a safe, active environment.</p><p>Staff praised the coaches for their professionalism and the childrens improved behaviour in class.</p>',
      tag: 'Wraparound Care',
      order: 3,
    },
  });

  // ─── Knowledge – FAQs ────────────────────────────────────────────────────────
  const faqGroup1 = await prisma.faqGroup.upsert({
    where: { id: 'seed-faq-g1' },
    update: {},
    create: { id: 'seed-faq-g1', title: 'Bookings & Payments', order: 1 },
  });

  await prisma.faqItem.upsert({
    where: { id: 'seed-faq-1' },
    update: {},
    create: {
      id: 'seed-faq-1',
      groupId: faqGroup1.id,
      question: 'How do I book a session for my child?',
      answer: 'Log in to your account, browse available sessions, select one that suits your child and complete the booking and payment process. You will receive a confirmation email immediately.',
      order: 1,
    },
  });
  await prisma.faqItem.upsert({
    where: { id: 'seed-faq-2' },
    update: {},
    create: {
      id: 'seed-faq-2',
      groupId: faqGroup1.id,
      question: 'Can I get a refund if I cancel?',
      answer: 'Yes. Cancellations made more than 48 hours before the session are eligible for a full refund, processed within 5–10 business days.',
      order: 2,
    },
  });
  await prisma.faqItem.upsert({
    where: { id: 'seed-faq-3' },
    update: {},
    create: {
      id: 'seed-faq-3',
      groupId: faqGroup1.id,
      question: 'What payment methods do you accept?',
      answer: 'We accept all major credit and debit cards via Stripe. We do not accept cash or cheques for online bookings.',
      order: 3,
    },
  });

  const faqGroup2 = await prisma.faqGroup.upsert({
    where: { id: 'seed-faq-g2' },
    update: {},
    create: { id: 'seed-faq-g2', title: 'Sessions & Coaching', order: 2 },
  });

  await prisma.faqItem.upsert({
    where: { id: 'seed-faq-4' },
    update: {},
    create: {
      id: 'seed-faq-4',
      groupId: faqGroup2.id,
      question: 'What should my child bring to a session?',
      answer: 'Children should wear comfortable sports clothing and trainers or football boots. Please bring a water bottle and a light snack. All equipment is provided by our coaches.',
      order: 1,
    },
  });
  await prisma.faqItem.upsert({
    where: { id: 'seed-faq-5' },
    update: {},
    create: {
      id: 'seed-faq-5',
      groupId: faqGroup2.id,
      question: 'Are your coaches DBS checked?',
      answer: 'Yes. All DDivine coaches hold enhanced DBS certificates and are First Aid trained. Safeguarding is our highest priority.',
      order: 2,
    },
  });

  // ─── Knowledge – Free Activities ──────────────────────────────────────────────
  const activityGroup1 = await prisma.freeActivityGroup.upsert({
    where: { id: 'seed-ag-1' },
    update: {},
    create: {
      id: 'seed-ag-1',
      title: 'Fun Warm-Up Drills for Ages 5–8',
      description: 'A set of fun and engaging warm-up activities designed for younger children.',
      order: 1,
    },
  });
  await prisma.freeActivityDownload.upsert({
    where: { id: 'seed-ad-1' },
    update: {},
    create: {
      id: 'seed-ad-1',
      groupId: activityGroup1.id,
      url: '/downloads/warm-up-drills-5-8.pdf',
    },
  });

  const activityGroup2 = await prisma.freeActivityGroup.upsert({
    where: { id: 'seed-ag-2' },
    update: {},
    create: {
      id: 'seed-ag-2',
      title: 'Ball Mastery Skills for Ages 9–12',
      description: 'Intermediate ball control and dribbling exercises for primary and lower secondary age groups.',
      order: 2,
    },
  });
  await prisma.freeActivityDownload.upsert({
    where: { id: 'seed-ad-2' },
    update: {},
    create: {
      id: 'seed-ad-2',
      groupId: activityGroup2.id,
      url: '/downloads/ball-mastery-9-12.pdf',
    },
  });

  const activityGroup3 = await prisma.freeActivityGroup.upsert({
    where: { id: 'seed-ag-3' },
    update: {},
    create: {
      id: 'seed-ag-3',
      title: 'Small-Sided Games & Tactics for Ages 10+',
      description: 'Tactical small-sided game formats to develop decision making and team play.',
      order: 3,
    },
  });
  await prisma.freeActivityDownload.upsert({
    where: { id: 'seed-ad-3' },
    update: {},
    create: {
      id: 'seed-ad-3',
      groupId: activityGroup3.id,
      url: '/downloads/small-sided-games-10plus.pdf',
    },
  });

  // ─── Contact Inquiries ────────────────────────────────────────────────────────
  await prisma.contactInquiry.upsert({
    where: { id: 'seed-inquiry-1' },
    update: {},
    create: {
      id: 'seed-inquiry-1',
      name: 'Helen Marsh',
      email: 'helen.marsh@northsideprimary.co.uk',
      phone: '0161 555 1234',
      message: 'We are a primary school of 320 pupils in Manchester and are interested in your curricular coaching programme. Could you please send us more information and a pricing guide?',
      status: ContactInquiryStatus.UNREAD,
    },
  });
  await prisma.contactInquiry.upsert({
    where: { id: 'seed-inquiry-2' },
    update: {},
    create: {
      id: 'seed-inquiry-2',
      name: 'Robert Hughes',
      email: 'r.hughes@example.com',
      phone: '07911 234567',
      message: 'Hi, I am organising a group of 10 children for your Easter Holiday Camp. Is there a group discount available? We are all from the same street and would like to attend together.',
      status: ContactInquiryStatus.READ,
    },
  });
  await prisma.contactInquiry.upsert({
    where: { id: 'seed-inquiry-3' },
    update: {},
    create: {
      id: 'seed-inquiry-3',
      name: 'Angela Foster',
      email: 'angela.foster@example.com',
      message: 'Our school council is looking for a partner to run after-school football sessions on Tuesdays and Thursdays. Please get in touch to discuss.',
      status: ContactInquiryStatus.UNREAD,
    },
  });

  // ─── Testimonials ─────────────────────────────────────────────────────────────
  await prisma.testimonial.upsert({
    where: { id: 'seed-testimonial-1' },
    update: {},
    create: {
      id: 'seed-testimonial-1',
      speaker: 'Sarah Johnson',
      role: 'Parent',
      quote: 'Oliver absolutely loves his DDivine sessions. His confidence on and off the pitch has transformed. The coaches are brilliant — professional, fun, and genuinely invested in the children.',
      order: 1,
    },
  });
  await prisma.testimonial.upsert({
    where: { id: 'seed-testimonial-2' },
    update: {},
    create: {
      id: 'seed-testimonial-2',
      speaker: 'Ms. Helen Marsh',
      role: 'PE Coordinator, Northside Primary',
      quote: 'The curricular coaching DDivine delivered was outstanding. Our pupils were engaged, challenged and motivated throughout. We saw a real improvement in physical literacy across all year groups.',
      order: 2,
    },
  });
  await prisma.testimonial.upsert({
    where: { id: 'seed-testimonial-3' },
    update: {},
    create: {
      id: 'seed-testimonial-3',
      speaker: 'James Brown',
      role: 'Parent',
      quote: 'The holiday camp was worth every penny. Isla came home tired and happy every day. The structure and quality of coaching is fantastic for the price.',
      order: 3,
    },
  });

  // ─── Partners ─────────────────────────────────────────────────────────────────
  await prisma.partner.upsert({
    where: { id: 'seed-partner-1' },
    update: {},
    create: {
      id: 'seed-partner-1',
      name: 'Manchester City Council',
      description: 'Local authority supporting community sport and youth activities across Greater Manchester.',
      type: 'Local Authority',
    },
  });
  await prisma.partner.upsert({
    where: { id: 'seed-partner-2' },
    update: {},
    create: {
      id: 'seed-partner-2',
      name: 'Sport England',
      description: 'National body investing in sport and physical activity to help people get active.',
      type: 'National Body',
    },
  });
  await prisma.partner.upsert({
    where: { id: 'seed-partner-3' },
    update: {},
    create: {
      id: 'seed-partner-3',
      name: 'Youth Sport Trust',
      description: 'Charity dedicated to improving childrens lives through sport and physical activity.',
      type: 'Charity',
    },
  });
}

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('✅  Seed complete');
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
