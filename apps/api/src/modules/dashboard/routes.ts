import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../lib/http.js';
import { requirePermission } from '../auth/middleware.js';
import { employeeSyncMode } from '../employees/service.js';
import { ForbiddenError } from '../../middleware/errors.js';
import { readableReservationWhere, readableRoomWhere } from '../../lib/scope.js';
import { addDays, formatDateOnly, todayDateOnly } from '../../lib/dates.js';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/dashboard/overview',
  requirePermission('dashboard.read'),
  async (req, res) => {
    const now = new Date();
    const [users, employees, roles, activeSessions] = await Promise.all([
      prisma.user.count(),
      prisma.employee.count(),
      prisma.role.count(),
      prisma.session.count({
        where: { revokedAt: null, expiresAt: { gt: now } },
      }),
    ]);

    const scoped = req.auth!.roles.some((role) => role.scopeType === 'GLOBAL');

    sendSuccess(res, {
      counts: scoped
        ? { users, employees, roles, activeSessions }
        : { users: 0, employees: 0, roles: 0, activeSessions: 0 },
      integrations: {
        authMode: env.AUTH_MODE,
        employeeSync: employeeSyncMode(),
        rosterSync: env.ROSTER_SYNC_ENABLED ? 'CONFIGURED' : 'DISABLED',
      },
      generatedAt: new Date().toISOString(),
    });
  },
);

dashboardRouter.get(
  '/dashboard/operations',
  requirePermission('dashboard.read'),
  async (req, res) => {
    const access = req.access!;
    if (access.selfOnly) {
      throw new ForbiddenError('Operational dashboard is limited to management roles');
    }
    const today = todayDateOnly();
    const weekAhead = addDays(today, 7);
    const threeDaysAhead = addDays(today, 3);

    const reservationScope: Prisma.ReservationWhereInput = access.global
      ? {}
      : readableReservationWhere(access);
    const roomScope: Prisma.RoomWhereInput = readableRoomWhere(access);
    const housekeepingScope: Prisma.HousekeepingTaskWhereInput = access.global
      ? {}
      : { room: roomScope };
    const ticketScope: Prisma.MaintenanceTicketWhereInput = access.global
      ? {}
      : { OR: [{ room: roomScope }, { bed: { room: roomScope } }] };

    const [
      reservationsByStatus,
      pendingApproval,
      totalBeds,
      occupied,
      housekeepingByStatus,
      maintenanceByStatus,
      upcomingCheckIns,
      upcomingCheckOuts,
      arrivalRows,
      departureRows,
    ] = await Promise.all([
      prisma.reservation.groupBy({
        by: ['status'],
        where: reservationScope,
        _count: { _all: true },
      }),
      prisma.reservation.count({
        where: { ...reservationScope, approvalStatus: 'PENDING', status: 'PENDING_APPROVAL' },
      }),
      prisma.bed.count({
        where: { status: 'ACTIVE', room: { operationalStatus: 'ACTIVE', ...roomScope } },
      }),
      prisma.bedAllocation.findMany({
        where: {
          status: { in: ['HELD', 'ACTIVE'] },
          stayStart: { lte: today },
          stayEnd: { gt: today },
          bed: { room: roomScope },
        },
        distinct: ['bedId'],
        select: { bedId: true },
      }),
      prisma.housekeepingTask.groupBy({
        by: ['status'],
        where: housekeepingScope,
        _count: { _all: true },
      }),
      prisma.maintenanceTicket.groupBy({
        by: ['status'],
        where: ticketScope,
        _count: { _all: true },
      }),
      prisma.reservation.count({
        where: {
          ...reservationScope,
          status: 'CONFIRMED',
          checkInDate: { gte: today, lte: weekAhead },
        },
      }),
      prisma.reservation.count({
        where: {
          ...reservationScope,
          status: 'CHECKED_IN',
          checkOutDate: { lte: threeDaysAhead },
        },
      }),
      prisma.reservation.groupBy({
        by: ['checkInDate'],
        where: {
          ...reservationScope,
          checkInDate: { gte: addDays(today, -6), lte: today },
          status: { notIn: ['CANCELLED', 'REJECTED'] },
        },
        _count: { _all: true },
      }),
      prisma.reservation.groupBy({
        by: ['checkOutDate'],
        where: {
          ...reservationScope,
          checkOutDate: { gte: addDays(today, -6), lte: today },
          status: { notIn: ['CANCELLED', 'REJECTED'] },
        },
        _count: { _all: true },
      }),
    ]);

    const statusCount = (status: string) =>
      reservationsByStatus.find((row) => row.status === status)?._count._all ?? 0;
    const hkCount = (status: string) =>
      housekeepingByStatus.find((row) => row.status === status)?._count._all ?? 0;
    const mtCount = (status: string) =>
      maintenanceByStatus.find((row) => row.status === status)?._count._all ?? 0;
    const totalReservations = reservationsByStatus.reduce((sum, row) => sum + row._count._all, 0);
    const occupiedBeds = occupied.length;
    const arrivalMap = new Map(
      arrivalRows.map((row) => [formatDateOnly(row.checkInDate), row._count._all]),
    );
    const departureMap = new Map(
      departureRows.map((row) => [formatDateOnly(row.checkOutDate), row._count._all]),
    );
    const trend = Array.from({ length: 7 }, (_, index) => {
      const date = formatDateOnly(addDays(today, index - 6));
      return {
        date,
        arrivals: arrivalMap.get(date) ?? 0,
        departures: departureMap.get(date) ?? 0,
      };
    });

    sendSuccess(res, {
      reservations: {
        total: totalReservations,
        pending: pendingApproval,
        confirmed: statusCount('CONFIRMED'),
        checkedIn: statusCount('CHECKED_IN'),
        cancelled: statusCount('CANCELLED') + statusCount('REJECTED'),
      },
      occupancy: {
        totalBeds,
        occupiedBeds,
        availableBeds: Math.max(0, totalBeds - occupiedBeds),
        occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 1000) / 10 : 0,
      },
      housekeeping: {
        pending: hkCount('PENDING'),
        inProgress: hkCount('IN_PROGRESS'),
        completed: hkCount('COMPLETED') + hkCount('VERIFIED'),
      },
      maintenance: {
        open: mtCount('OPEN') + mtCount('IN_REVIEW'),
        inProgress: mtCount('IN_PROGRESS'),
        resolved: mtCount('RESOLVED') + mtCount('CLOSED'),
      },
      upcomingCheckIns,
      upcomingCheckOuts,
      trend,
      generatedAt: new Date().toISOString(),
    });
  },
);

