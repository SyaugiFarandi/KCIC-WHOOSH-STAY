import { hashPassword, verifyPassword } from './password.js';

export const DEMO_PASSWORD_DEFAULT = 'WhooshDemo!2026';

export const hashDemoPassword = hashPassword;
export const verifyDemoPassword = verifyPassword;

export function demoUsernameToEmail(username: string): string {
  const normalized = username.trim().toLowerCase();
  return normalized.includes('@')
    ? normalized
    : `${normalized}@demo.whoosh-stay.local`;
}