import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';

describe('database safeguards', () => {
  it('installs the bed allocation exclusion constraint', async () => {
    const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint WHERE conname = 'bed_allocations_no_overlap'
    `;
    expect(rows).toHaveLength(1);
  });

  it('rejects overlapping HELD/ACTIVE allocations for the same bed', async () => {
    const bed = await prisma.bed.findFirstOrThrow({ select: { id: true } });
    const employee = await prisma.employee.findFirstOrThrow({ select: { id: true } });
    const dormitory = await prisma.dormitory.findUniqueOrThrow({
      where: { code: 'DEMO-DORM-01' },
      select: { id: true },
    });
    const bookingCode = `TEST-OVERLAP-${Date.now()}`;

    const reservation = await prisma.reservation.create({
      data: {
        bookingCode,
        primaryEmployeeId: employee.id,
        dormitoryId: dormitory.id,
        source: 'CREW',
        checkInDate: new Date('2027-05-01'),
        checkOutDate: new Date('2027-05-03'),
        occupantCount: 1,
        status: 'CONFIRMED',
      },
    });
    const guest = await prisma.reservationGuest.create({
      data: {
        reservationId: reservation.id,
        employeeId: employee.id,
        guestRole: 'PRIMARY',
      },
    });

    try {
      await prisma.bedAllocation.create({
        data: {
          reservationId: reservation.id,
          reservationGuestId: guest.id,
          bedId: bed.id,
          stayStart: new Date('2027-05-01'),
          stayEnd: new Date('2027-05-03'),
          status: 'HELD',
        },
      });

      await expect(
        prisma.bedAllocation.create({
          data: {
            reservationId: reservation.id,
            reservationGuestId: guest.id,
            bedId: bed.id,
            stayStart: new Date('2027-05-02'),
            stayEnd: new Date('2027-05-04'),
            status: 'ACTIVE',
          },
        }),
      ).rejects.toThrow();

      const activeAllocations = await prisma.bedAllocation.count({
        where: {
          bedId: bed.id,
          status: { in: ['HELD', 'ACTIVE'] },
          stayStart: { gte: new Date('2027-05-01') },
          stayEnd: { lte: new Date('2027-05-05') },
        },
      });
      expect(activeAllocations).toBe(1);
    } finally {
      await prisma.bedAllocation.deleteMany({ where: { reservationId: reservation.id } });
      await prisma.reservationGuest.deleteMany({ where: { reservationId: reservation.id } });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
    }
  });

  it('allows adjacent stays on the same bed (checkout exclusive)', async () => {
    const bed = await prisma.bed.findFirstOrThrow({ select: { id: true } });
    const employee = await prisma.employee.findFirstOrThrow({ select: { id: true } });
    const dormitory = await prisma.dormitory.findUniqueOrThrow({
      where: { code: 'DEMO-DORM-01' },
      select: { id: true },
    });
    const suffix = Date.now();

    const first = await prisma.reservation.create({
      data: {
        bookingCode: `TEST-ADJACENT-A-${suffix}`,
        primaryEmployeeId: employee.id,
        dormitoryId: dormitory.id,
        source: 'CREW',
        checkInDate: new Date('2027-06-01'),
        checkOutDate: new Date('2027-06-03'),
        occupantCount: 1,
        status: 'CONFIRMED',
      },
    });
    const second = await prisma.reservation.create({
      data: {
        bookingCode: `TEST-ADJACENT-B-${suffix}`,
        primaryEmployeeId: employee.id,
        dormitoryId: dormitory.id,
        source: 'CREW',
        checkInDate: new Date('2027-06-03'),
        checkOutDate: new Date('2027-06-05'),
        occupantCount: 1,
        status: 'CONFIRMED',
      },
    });

    const guestA = await prisma.reservationGuest.create({
      data: { reservationId: first.id, employeeId: employee.id, guestRole: 'PRIMARY' },
    });
    const guestB = await prisma.reservationGuest.create({
      data: { reservationId: second.id, employeeId: employee.id, guestRole: 'PRIMARY' },
    });

    try {
      await prisma.bedAllocation.create({
        data: {
          reservationId: first.id,
          reservationGuestId: guestA.id,
          bedId: bed.id,
          stayStart: new Date('2027-06-01'),
          stayEnd: new Date('2027-06-03'),
          status: 'HELD',
        },
      });
      await prisma.bedAllocation.create({
        data: {
          reservationId: second.id,
          reservationGuestId: guestB.id,
          bedId: bed.id,
          stayStart: new Date('2027-06-03'),
          stayEnd: new Date('2027-06-05'),
          status: 'HELD',
        },
      });

      const count = await prisma.bedAllocation.count({
        where: { bedId: bed.id, stayStart: { gte: new Date('2027-06-01') } },
      });
      expect(count).toBe(2);
    } finally {
      await prisma.bedAllocation.deleteMany({
        where: { reservationId: { in: [first.id, second.id] } },
      });
      await prisma.reservationGuest.deleteMany({
        where: { reservationId: { in: [first.id, second.id] } },
      });
      await prisma.reservation.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    }
  });

  it('keeps audit logs append-only', async () => {
    const entry = await prisma.auditLog.create({
      data: { action: 'TEST_APPEND_ONLY', entityType: 'TEST' },
    });

    await expect(
      prisma.auditLog.update({ where: { id: entry.id }, data: { action: 'TAMPERED' } }),
    ).rejects.toThrow(/append-only/i);
  });
});
