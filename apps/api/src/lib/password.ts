import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const PARAMS = { N: 16_384, r: 8, p: 1 };
const MAX_MEM = 64 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = await scryptAsync(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts[0] !== 'scrypt') return false;

  let params = PARAMS;
  let salt: string;
  let hash: string;
  if (parts.length === 6) {
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    if (
      !Number.isInteger(N) ||
      !Number.isInteger(r) ||
      !Number.isInteger(p) ||
      N <= 0 ||
      r <= 0 ||
      p <= 0
    ) {
      return false;
    }
    params = { N, r, p };
    salt = parts[4]!;
    hash = parts[5]!;
  } else if (parts.length === 3) {
    // Legacy format written before parameters were recorded.
    salt = parts[1]!;
    hash = parts[2]!;
  } else {
    return false;
  }

  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== KEY_LENGTH) return false;

  const actual = await scryptAsync(password, salt, KEY_LENGTH, { ...params, maxmem: MAX_MEM });
  return timingSafeEqual(actual, expected);
}
