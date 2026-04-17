/**
 * @file test-v2-booking-flow.ts
 * @description End-to-end test for V2 cart-style event booking API.
 *   Tests all three booking scenarios:
 *   1. Single slot booking
 *   2. Single day, multiple slots
 *   3. Multiple days, multiple slots (multi-day)
 *
 * Run: npx tsx --env-file=.env scripts/test-v2-booking-flow.ts
 */

const BASE = 'http://localhost:3000';

// ─── Colour helpers ───────────────────────────────────────────────────────────
const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;

async function req(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function assert(label: string, condition: boolean, hint?: string) {
  if (condition) {
    console.log(`  ${c.green('✓')} ${label}`);
    passed++;
  } else {
    console.log(`  ${c.red('✗')} ${label}${hint ? c.dim(` (${hint})`) : ''}`);
    failed++;
  }
}

function section(title: string) {
  console.log(`\n${c.bold(c.cyan(`── ${title} ──`))}`);
}

function printJSON(label: string, data: unknown) {
  console.log(c.dim(`  [${label}] ${JSON.stringify(data, null, 2).slice(0, 300)}`));
}

// ─── Setup helpers ────────────────────────────────────────────────────────────

let adminToken = '';
let parentToken = '';
let testEventId = '';
let testChildId = '';

// Unique suffix to avoid conflicts across test runs
const RUN = Date.now().toString().slice(-6);

async function setup() {
  section('Setup — Admin login');
  const adminLogin = await req('POST', '/api/v1/admin/auth/login', {
    email: 'admin@ddivine.co.uk',
    password: 'admin123!',
  });
  assert('Admin login 200', adminLogin.status === 200, `got ${adminLogin.status} — ${JSON.stringify(adminLogin.data)}`);
  adminToken = (adminLogin.data as { accessToken?: string })?.accessToken ?? '';
  assert('Admin token received', !!adminToken);

  section('Setup — Parent signup + child');
  const parentEmail = `test_parent_${RUN}@test.com`;
  const signupRes = await req('POST', '/api/v1/auth/signup/parent', {
    email: parentEmail,
    password: 'Parent1234!',
    fullName: 'Test Parent',
    phoneNumber: '07700000000',
    emergencyPhoneNumber: '07700000099',
    addressLine1: '1 Test Street',
    town: 'London',
    postCode: 'SW1A 1AA',
    childProfile: null,
  });
  assert('Parent signup 201', signupRes.status === 201, `got ${signupRes.status}`);

  const loginRes = await req('POST', '/api/v1/auth/login', {
    email: parentEmail,
    password: 'Parent1234!',
    role: 'parent',
  });
  assert('Parent login 200', loginRes.status === 200, `got ${loginRes.status} — ${JSON.stringify(loginRes.data)}`);
  parentToken = (loginRes.data as { accessToken?: string })?.accessToken ?? '';
  assert('Parent token received', !!parentToken);

  const childRes = await req(
    'POST',
    '/api/v1/users/me/children',
    {
      firstName: 'Junior',
      lastName: 'Test',
      dateOfBirth: '2018-05-15',
      gender: 'Male',
      yearGroup: 'Year 2',
      emergencyContacts: [
        {
          name: 'Emergency Contact',
          phone: '07700000111',
          relationship: 'Parent',
        },
      ],
    },
    parentToken,
  );
  assert('Child created 201', childRes.status === 201, `got ${childRes.status}`);
  testChildId = (childRes.data as { id?: string })?.id ?? '';
  assert('Child ID received', !!testChildId);

  section('Setup — Create test event (admin)');
  const evRes = await req(
    'POST',
    '/api/v1/admin/events',
    {
      title: `V2 Test Event ${RUN}`,
      type: 'camp',
      date: '2026-08-01',
      time: '09:00',
      location: 'London Test Venue',
      currency: 'GBP',
      subtotal: 20,
      serviceFee: 2,
      isPublic: true,
    },
    adminToken,
  );
  assert('Event created 201', evRes.status === 201, `got ${evRes.status}`);
  testEventId = (evRes.data as { id?: string })?.id ?? '';
  assert('Event ID received', !!testEventId);
  if (!testEventId) {
    printJSON('event create error', evRes.data);
  }
}

// ─── Scenario 1: Single slot booking ─────────────────────────────────────────

async function scenario1() {
  section('Scenario 1 — Single slot booking');

  // 1a. Create one date
  const dateRes = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates`,
    { date: '2026-08-10', isClosed: false },
    adminToken,
  );
  assert('Date created 201', dateRes.status === 201, `got ${dateRes.status}`);
  const dateId = (dateRes.data as { id?: string })?.id ?? '';
  assert('Date ID received', !!dateId);

  // 1b. Create one slot
  const slotRes = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates/${dateId}/slots`,
    { startTime: '09:00', endTime: '11:00', capacity: 10, price: 20, serviceFee: 2 },
    adminToken,
  );
  assert('Slot created 201', slotRes.status === 201, `got ${slotRes.status}`);
  const slotId = (slotRes.data as { id?: string })?.id ?? '';
  assert('Slot ID received', !!slotId);

  // 1c. Verify slot visible on public V2 event endpoint
  const eventDetail = await req('GET', `/api/v2/events/${testEventId}`);
  assert('V2 event detail 200', eventDetail.status === 200, `got ${eventDetail.status}`);
  const evData = eventDetail.data as { dates?: { slots?: { id: string }[] }[] };
  const slotFound = evData.dates?.some((d) => d.slots?.some((s) => s.id === slotId));
  assert('Slot visible in V2 event detail', !!slotFound);

  // 1d. Create cart intent
  const intentRes = await req('POST', '/api/v2/bookings/intents', {}, parentToken);
  assert('Cart intent created', intentRes.status === 201, `got ${intentRes.status}`);
  const intentId = (intentRes.data as { data?: { intentId?: string } })?.data?.intentId ?? '';
  assert('Intent ID received', !!intentId);

  // 1e. Add one item (single slot)
  const addItemRes = await req(
    'POST',
    `/api/v2/bookings/intents/${intentId}/items`,
    { slotId, childId: testChildId },
    parentToken,
  );
  assert('Item added 201', addItemRes.status === 201, `got ${addItemRes.status}`);
  const cartAfterAdd = addItemRes.data as { data?: { items?: unknown[]; summary?: { total?: number } } };
  assert('Cart has 1 item', cartAfterAdd.data?.items?.length === 1);
  assert('Cart total > 0', (cartAfterAdd.data?.summary?.total ?? 0) > 0);

  // 1f. Save contact
  const contactRes = await req(
    'PATCH',
    `/api/v2/bookings/intents/${intentId}/contact`,
    { fullName: 'Test Parent', email: `test_parent_${RUN}@test.com`, phone: '07700000001' },
    parentToken,
  );
  assert('Contact saved 200', contactRes.status === 200, `got ${contactRes.status}`);

  // 1g. Select payment (tax_free_childcare — no Stripe needed)
  const paymentRes = await req(
    'PATCH',
    `/api/v2/bookings/intents/${intentId}/payment`,
    { method: 'tax_free_childcare', taxFreeChildcareRef: 'TFC123456' },
    parentToken,
  );
  assert('Payment selected 200', paymentRes.status === 200, `got ${paymentRes.status}`);

  // 1h. Confirm booking
  const confirmRes = await req(
    'POST',
    `/api/v2/bookings/intents/${intentId}/confirm`,
    {},
    parentToken,
  );
  assert('Booking confirmed 200', confirmRes.status === 200, `got ${confirmRes.status}`);
  const booking = (confirmRes.data as { data?: { status?: string; items?: unknown[]; bookingReference?: string } })?.data;
  assert('Booking status government_payment_pending', booking?.status === 'government_payment_pending');
  assert('Booking has 1 item', booking?.items?.length === 1);
  assert('Booking reference present', !!booking?.bookingReference);
  console.log(c.green(`  ➜ Booking ref: ${booking?.bookingReference}`));

  // 1i. Verify slot capacity incremented
  const slotsRes = await req(
    'GET',
    `/api/v1/admin/events/${testEventId}/dates/${dateId}/slots`,
    undefined,
    adminToken,
  );
  const updatedSlot = (slotsRes.data as { data?: { id: string; bookedCount: number }[] })?.data?.find(
    (s) => s.id === slotId,
  );
  assert('Slot bookedCount incremented to 1', updatedSlot?.bookedCount === 1);

  return { dateId, slotId };
}

// ─── Scenario 2: Single day, multiple slots ───────────────────────────────────

async function scenario2() {
  section('Scenario 2 — Single day, multiple slots');

  // Use a new date on the same event
  const dateRes = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates`,
    { date: '2026-08-11', isClosed: false },
    adminToken,
  );
  assert('Date created 201', dateRes.status === 201, `got ${dateRes.status}`);
  const dateId = (dateRes.data as { id?: string })?.id ?? '';

  // Two slots on the same day
  const slot1Res = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates/${dateId}/slots`,
    { startTime: '09:00', endTime: '11:00', capacity: 10, price: 20, serviceFee: 2 },
    adminToken,
  );
  assert('Slot 1 created 201', slot1Res.status === 201, `got ${slot1Res.status}`);
  const slot1Id = (slot1Res.data as { id?: string })?.id ?? '';

  const slot2Res = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates/${dateId}/slots`,
    { startTime: '13:00', endTime: '15:00', capacity: 10, price: 15, serviceFee: 1.5 },
    adminToken,
  );
  assert('Slot 2 created 201', slot2Res.status === 201, `got ${slot2Res.status}`);
  const slot2Id = (slot2Res.data as { id?: string })?.id ?? '';

  // Check date has 2 slots on public endpoint
  const dateDetail = await req('GET', `/api/v2/events/${testEventId}/dates/${dateId}/slots`);
  assert('Date slots endpoint 200', dateDetail.status === 200, `got ${dateDetail.status}`);
  const slots = (dateDetail.data as { slots?: unknown[] })?.slots ?? [];
  assert('Date has 2 active slots', slots.length === 2);

  // Create intent
  const intentRes = await req('POST', '/api/v2/bookings/intents', {}, parentToken);
  assert('Cart intent created', intentRes.status === 201, `got ${intentRes.status}`);
  const intentId = (intentRes.data as { data?: { intentId?: string } })?.data?.intentId ?? '';

  // Add both slots for the same child on the same day
  const add1 = await req(
    'POST',
    `/api/v2/bookings/intents/${intentId}/items`,
    { slotId: slot1Id, childId: testChildId },
    parentToken,
  );
  assert('Slot 1 added to cart', add1.status === 201, `got ${add1.status}`);

  const add2 = await req(
    'POST',
    `/api/v2/bookings/intents/${intentId}/items`,
    { slotId: slot2Id, childId: testChildId },
    parentToken,
  );
  assert('Slot 2 added to cart', add2.status === 201, `got ${add2.status}`);

  const cartState = add2.data as { data?: { items?: unknown[]; summary?: { subtotal?: number; total?: number } } };
  assert('Cart has 2 items', cartState.data?.items?.length === 2);
  // 20 + 15 = 35 subtotal
  assert(
    'Cart subtotal = 35',
    cartState.data?.summary?.subtotal === 35,
    `got ${cartState.data?.summary?.subtotal}`,
  );

  // Duplicate add should fail
  const dupAdd = await req(
    'POST',
    `/api/v2/bookings/intents/${intentId}/items`,
    { slotId: slot1Id, childId: testChildId },
    parentToken,
  );
  assert('Duplicate slot+child rejected 409', dupAdd.status === 409, `got ${dupAdd.status}`);

  // Contact
  await req(
    'PATCH',
    `/api/v2/bookings/intents/${intentId}/contact`,
    { fullName: 'Test Parent', email: `test_parent_${RUN}@test.com`, phone: '07700000002' },
    parentToken,
  );

  // Payment
  await req(
    'PATCH',
    `/api/v2/bookings/intents/${intentId}/payment`,
    { method: 'tax_free_childcare', taxFreeChildcareRef: 'TFC999111' },
    parentToken,
  );

  // Confirm
  const confirmRes = await req('POST', `/api/v2/bookings/intents/${intentId}/confirm`, {}, parentToken);
  assert('Multi-slot booking confirmed 200', confirmRes.status === 200, `got ${confirmRes.status}`);
  const booking = (confirmRes.data as { data?: { items?: unknown[]; payment?: { subtotal?: number } } })?.data;
  assert('Booking has 2 items', booking?.items?.length === 2);
  assert('Payment subtotal = 35', booking?.payment?.subtotal === 35, `got ${booking?.payment?.subtotal}`);
  console.log(c.green(`  ➜ 2-slot booking confirmed`));

  return { dateId, slot1Id, slot2Id };
}

// ─── Scenario 3: Multiple days, multiple slots ────────────────────────────────

async function scenario3() {
  section('Scenario 3 — Multiple days, multiple slots (multi-day booking)');

  // Day A
  const dayARes = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates`,
    { date: '2026-08-20', isClosed: false },
    adminToken,
  );
  assert('Day A created 201', dayARes.status === 201, `got ${dayARes.status}`);
  const dayAId = (dayARes.data as { id?: string })?.id ?? '';

  const slotARes = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates/${dayAId}/slots`,
    { startTime: '09:00', endTime: '12:00', capacity: 5, price: 25, serviceFee: 2.5 },
    adminToken,
  );
  assert('Slot A created 201', slotARes.status === 201, `got ${slotARes.status}`);
  const slotAId = (slotARes.data as { id?: string })?.id ?? '';

  // Day B
  const dayBRes = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates`,
    { date: '2026-08-21', isClosed: false },
    adminToken,
  );
  assert('Day B created 201', dayBRes.status === 201, `got ${dayBRes.status}`);
  const dayBId = (dayBRes.data as { id?: string })?.id ?? '';

  const slotB1Res = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates/${dayBId}/slots`,
    { startTime: '09:00', endTime: '11:00', capacity: 5, price: 20, serviceFee: 2 },
    adminToken,
  );
  assert('Slot B1 created 201', slotB1Res.status === 201, `got ${slotB1Res.status}`);
  const slotB1Id = (slotB1Res.data as { id?: string })?.id ?? '';

  const slotB2Res = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates/${dayBId}/slots`,
    { startTime: '14:00', endTime: '16:00', capacity: 5, price: 15, serviceFee: 1.5 },
    adminToken,
  );
  assert('Slot B2 created 201', slotB2Res.status === 201, `got ${slotB2Res.status}`);
  const slotB2Id = (slotB2Res.data as { id?: string })?.id ?? '';

  // Verify V2 event now has 3+ dates
  const evDetail = await req('GET', `/api/v2/events/${testEventId}`);
  const evData = evDetail.data as { dates?: unknown[] };
  assert('Event has multiple dates', (evData.dates?.length ?? 0) >= 3);

  // Create intent
  const intentRes = await req('POST', '/api/v2/bookings/intents', {}, parentToken);
  assert('Cart intent created', intentRes.status === 201, `got ${intentRes.status}`);
  const intentId = (intentRes.data as { data?: { intentId?: string } })?.data?.intentId ?? '';

  // Add 3 items across 2 days
  const addA = await req(
    'POST',
    `/api/v2/bookings/intents/${intentId}/items`,
    { slotId: slotAId, childId: testChildId },
    parentToken,
  );
  assert('Day A slot added', addA.status === 201, `got ${addA.status}`);

  const addB1 = await req(
    'POST',
    `/api/v2/bookings/intents/${intentId}/items`,
    { slotId: slotB1Id, childId: testChildId },
    parentToken,
  );
  assert('Day B slot 1 added', addB1.status === 201, `got ${addB1.status}`);

  const addB2 = await req(
    'POST',
    `/api/v2/bookings/intents/${intentId}/items`,
    { slotId: slotB2Id, childId: testChildId },
    parentToken,
  );
  assert('Day B slot 2 added', addB2.status === 201, `got ${addB2.status}`);

  const cart = addB2.data as { data?: { items?: unknown[]; summary?: { subtotal?: number; total?: number } } };
  assert('Cart has 3 items', cart.data?.items?.length === 3);
  // 25 + 20 + 15 = 60 subtotal
  assert('Cart subtotal = 60', cart.data?.summary?.subtotal === 60, `got ${cart.data?.summary?.subtotal}`);
  // 2.5 + 2 + 1.5 = 6 service fee
  assert(
    'Cart total = 66 (subtotal + fees)',
    cart.data?.summary?.total === 66,
    `got ${cart.data?.summary?.total}`,
  );

  // Test removing an item
  const items = (cart.data?.items ?? []) as { itemId: string }[];
  const itemToRemove = items[1]?.itemId;
  if (itemToRemove) {
    const removeRes = await req(
      'DELETE',
      `/api/v2/bookings/intents/${intentId}/items/${itemToRemove}`,
      undefined,
      parentToken,
    );
    assert('Item removed 200', removeRes.status === 200, `got ${removeRes.status}`);
    const cartAfterRemove = removeRes.data as { data?: { items?: unknown[] } };
    assert('Cart now has 2 items after remove', cartAfterRemove.data?.items?.length === 2);

    // Re-add item
    await req(
      'POST',
      `/api/v2/bookings/intents/${intentId}/items`,
      { slotId: slotB1Id, childId: testChildId },
      parentToken,
    );
    assert('Item re-added to cart', true);
  }

  // Contact
  await req(
    'PATCH',
    `/api/v2/bookings/intents/${intentId}/contact`,
    { fullName: 'Test Parent', email: `test_parent_${RUN}@test.com`, phone: '07700000003' },
    parentToken,
  );

  // Payment
  await req(
    'PATCH',
    `/api/v2/bookings/intents/${intentId}/payment`,
    { method: 'tax_free_childcare', taxFreeChildcareRef: 'TFC777888' },
    parentToken,
  );

  // Confirm
  const confirmRes = await req('POST', `/api/v2/bookings/intents/${intentId}/confirm`, {}, parentToken);
  assert('Multi-day booking confirmed 200', confirmRes.status === 200, `got ${confirmRes.status}`);
  const booking = (confirmRes.data as { data?: { items?: { slot?: { startTime?: string }; date?: string }[]; bookingReference?: string; payment?: { totalPaid?: number } } })?.data;
  assert('Booking has 3 items', booking?.items?.length === 3);
  assert('Booking reference present', !!booking?.bookingReference);
  assert('Total paid = 66', booking?.payment?.totalPaid === 66, `got ${booking?.payment?.totalPaid}`);

  // Show each booked slot
  for (const item of booking?.items ?? []) {
    console.log(c.green(`  ➜ Booked: ${item.date} ${item.slot?.startTime}`));
  }

  // Idempotency: confirm again should return same booking
  const confirmAgain = await req('POST', `/api/v2/bookings/intents/${intentId}/confirm`, {}, parentToken);
  assert('Confirm idempotent (same booking returned)', confirmAgain.status === 200, `got ${confirmAgain.status}`);
}

// ─── Scenario 4: Receipt + bookings list ──────────────────────────────────────

async function scenario4() {
  section('Scenario 4 — Bookings list + receipt');

  const mineRes = await req('GET', '/api/v2/bookings/mine', undefined, parentToken);
  assert('GET /bookings/mine 200', mineRes.status === 200, `got ${mineRes.status}`);
  const bookings = (mineRes.data as { data?: unknown[] })?.data ?? [];
  assert('At least 3 bookings in history', bookings.length >= 3, `got ${bookings.length}`);

  // Download receipt for last booking
  const lastBooking = bookings[0] as { bookingId?: string };
  if (lastBooking?.bookingId) {
    const receiptRes = await fetch(`${BASE}/api/v2/bookings/${lastBooking.bookingId}/receipt`, {
      headers: { Authorization: `Bearer ${parentToken}` },
    });
    assert('Receipt PDF 200', receiptRes.status === 200, `got ${receiptRes.status}`);
    assert('Content-Type is PDF', receiptRes.headers.get('content-type') === 'application/pdf');
    const buf = await receiptRes.arrayBuffer();
    assert('PDF has content', buf.byteLength > 0);
    console.log(c.green(`  ➜ PDF size: ${buf.byteLength} bytes`));
  }
}

// ─── Scenario 5: Capacity enforcement ────────────────────────────────────────

async function scenario5() {
  section('Scenario 5 — Capacity enforcement (capacity = 1)');

  // Create a date + slot with capacity 1
  const dateRes = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates`,
    { date: '2026-08-30', isClosed: false },
    adminToken,
  );
  const dateId = (dateRes.data as { id?: string })?.id ?? '';
  const slotRes = await req(
    'POST',
    `/api/v1/admin/events/${testEventId}/dates/${dateId}/slots`,
    { startTime: '10:00', endTime: '11:00', capacity: 1, price: 10, serviceFee: 1 },
    adminToken,
  );
  const slotId = (slotRes.data as { id?: string })?.id ?? '';

  // First user books the slot
  const i1 = await req('POST', '/api/v2/bookings/intents', {}, parentToken);
  const i1Id = (i1.data as { data?: { intentId?: string } })?.data?.intentId ?? '';
  await req('POST', `/api/v2/bookings/intents/${i1Id}/items`, { slotId, childId: testChildId }, parentToken);
  await req('PATCH', `/api/v2/bookings/intents/${i1Id}/contact`, { fullName: 'P1', email: `test_parent_${RUN}@test.com`, phone: '07700000010' }, parentToken);
  await req('PATCH', `/api/v2/bookings/intents/${i1Id}/payment`, { method: 'tax_free_childcare', taxFreeChildcareRef: 'TFC_CAP1' }, parentToken);
  const c1 = await req('POST', `/api/v2/bookings/intents/${i1Id}/confirm`, {}, parentToken);
  assert('First booking of 1-capacity slot succeeds', c1.status === 200, `got ${c1.status}`);

  // Second user tries to book same slot — should be blocked
  // (Create a second parent for this test)
  const p2Email = `test_parent2_${RUN}@test.com`;
  await req('POST', '/api/v1/auth/signup/parent', {
    email: p2Email,
    password: 'Parent1234!',
    fullName: 'P2 Test',
    phoneNumber: '07700000020',
    emergencyPhoneNumber: '07700000021',
    addressLine1: '2 Test Street',
    town: 'London',
    postCode: 'SW1A 2AA',
    childProfile: null,
  });
  const p2Login = await req('POST', '/api/v1/auth/login', {
    email: p2Email,
    password: 'Parent1234!',
    role: 'parent',
  });
  const p2Token = (p2Login.data as { accessToken?: string })?.accessToken ?? '';

  const p2Child = await req(
    'POST',
    '/api/v1/users/me/children',
    {
      firstName: 'Kid2',
      lastName: 'Test',
      dateOfBirth: '2018-06-10',
      gender: 'Female',
      yearGroup: 'Year 2',
      emergencyContacts: [
        {
          name: 'Emergency Contact 2',
          phone: '07700000222',
          relationship: 'Parent',
        },
      ],
    },
    p2Token,
  );
  const p2ChildId = (p2Child.data as { id?: string })?.id ?? '';

  const i2 = await req('POST', '/api/v2/bookings/intents', {}, p2Token);
  const i2Id = (i2.data as { data?: { intentId?: string } })?.data?.intentId ?? '';
  await req('POST', `/api/v2/bookings/intents/${i2Id}/items`, { slotId, childId: p2ChildId }, p2Token);
  await req('PATCH', `/api/v2/bookings/intents/${i2Id}/contact`, { fullName: 'P2', email: p2Email, phone: '07700000011' }, p2Token);
  await req('PATCH', `/api/v2/bookings/intents/${i2Id}/payment`, { method: 'tax_free_childcare', taxFreeChildcareRef: 'TFC_CAP2' }, p2Token);
  const c2 = await req('POST', `/api/v2/bookings/intents/${i2Id}/confirm`, {}, p2Token);
  assert(
    'Second booking of full slot blocked (409 EVENT_FULL)',
    c2.status === 409,
    `got ${c2.status} — ${JSON.stringify(c2.data)}`,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(c.bold(c.cyan('\n══════════════════════════════════════════')));
  console.log(c.bold(c.cyan(' V2 Event Booking Flow — End-to-End Tests')));
  console.log(c.bold(c.cyan('══════════════════════════════════════════\n')));

  try {
    await setup();
    await scenario1();
    await scenario2();
    await scenario3();
    await scenario4();
    await scenario5();
  } catch (err) {
    console.error(c.red(`\n[FATAL] Unhandled error: ${(err as Error).message}`));
    console.error(err);
  }

  console.log(c.bold(c.cyan('\n══════════════════════════════════════════')));
  console.log(
    `  ${c.green(`${passed} passed`)}  ${failed > 0 ? c.red(`${failed} failed`) : c.dim('0 failed')}`,
  );
  console.log(c.bold(c.cyan('══════════════════════════════════════════\n')));

  if (failed > 0) process.exit(1);
}

main();
