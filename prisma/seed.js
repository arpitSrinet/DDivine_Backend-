/**
 * @file seed.ts
 * @description Development seed data for local testing.
 * @module prisma/seed
 */
import { PrismaClient, ServiceKey, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();
async function main() {
    // --- Default admin user (dev only) ---
    const adminPasswordHash = await bcrypt.hash('admin123!', 12);
    await prisma.user.upsert({
        where: { email: 'admin@ddivine.co.uk' },
        update: {},
        create: {
            email: 'admin@ddivine.co.uk',
            passwordHash: adminPasswordHash,
            role: UserRole.ADMIN,
            firstName: 'Admin',
            lastName: 'User',
        },
    });
    // --- Services ---
    await prisma.service.upsert({
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
    await prisma.service.upsert({
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
    await prisma.service.upsert({
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
    await prisma.service.upsert({
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
}
main()
    .then(() => {
    // eslint-disable-next-line no-console
    console.log('Seed complete');
})
    .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
})
    .finally(() => {
    void prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map