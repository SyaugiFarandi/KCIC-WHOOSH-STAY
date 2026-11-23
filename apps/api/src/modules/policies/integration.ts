import { parseDateOnly } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';

export async function employeeCategoryTags(employeeIds: string[]): Promise<string[]> {
  const ids = [...new Set(employeeIds)];
  if (!ids.length) return [];
  const employees = await prisma.employee.findMany({
    where: { id: { in: ids } },
    select: { departmentCode: true, divisionCode: true, positionCode: true },
  });
  const tags = new Set<string>();
  for (const employee of employees) {
    if (employee.departmentCode) tags.add(`dept:${employee.departmentCode}`);
    if (employee.divisionCode) tags.add(`div:${employee.divisionCode}`);
    if (employee.positionCode) tags.add(`pos:${employee.positionCode}`);
  }
  return [...tags];
}

export async function rosterShiftSignal(
  employeeIds: string[],
  checkIn: string,
  checkOut: string,
): Promise<boolean> {
  const ids = [...new Set(employeeIds)];
  if (!ids.length) return false;
  const count = await prisma.rosterAssignment.count({
    where: {
      employeeId: { in: ids },
      dutyDate: { gte: parseDateOnly(checkIn), lt: parseDateOnly(checkOut) },
    },
  });
  return count > 0;
}

export function hoursUntilJakartaStartOfDay(date: string): number {
  const target = new Date(`${date}T00:00:00+07:00`).getTime();
  return Math.round((target - Date.now()) / 3_600_000);
}

export function minutesSinceJakartaStartOfDay(date: string): number {
  const start = new Date(`${date}T00:00:00+07:00`).getTime();
  return Math.max(0, Math.round((Date.now() - start) / 60_000));
}
