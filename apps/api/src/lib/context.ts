import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function setContextUser(userId: string, sessionId: string): void {
  const context = storage.getStore();
  if (context) {
    context.userId = userId;
    context.sessionId = sessionId;
  }
}
