import type { Request } from 'express';
import type { AccessScope, Principal } from '../modules/auth/types.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: Principal;
      access?: AccessScope;
    }
  }
}

export type { Request };
