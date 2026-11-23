import { z } from 'zod';
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';
import {
  authConfigSchema,
  authMeSchema,
  healthSchema,
  loginDevSchema,
  successEnvelopeSchema,
} from '@whoosh/shared';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'sessionCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: 'whoosh_stay_session',
});


registry.registerPath({
  method: 'get',
  path: '/health/live',
  tags: ['Health'],
  summary: 'Liveness probe',
  responses: {
    200: {
      description: 'Service is alive',
      content: { 'application/json': { schema: successEnvelopeSchema(healthSchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/health/ready',
  tags: ['Health'],
  summary: 'Readiness probe including database connectivity',
  responses: {
    200: {
      description: 'Service is ready',
      content: { 'application/json': { schema: successEnvelopeSchema(healthSchema) } },
    },
    503: { description: 'Service is degraded' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/config',
  tags: ['Auth'],
  summary: 'Public authentication configuration',
  responses: {
    200: {
      description: 'Authentication mode and demo accounts',
      content: { 'application/json': { schema: successEnvelopeSchema(authConfigSchema) } },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  tags: ['Auth'],
  summary: 'Current authenticated principal',
  security: [{ sessionCookie: [] }],
  responses: {
    200: {
      description: 'Authenticated user with effective roles and permissions',
      content: { 'application/json': { schema: successEnvelopeSchema(authMeSchema) } },
    },
    401: { description: 'Authentication required' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/dev-login',
  tags: ['Auth'],
  summary: 'Development-only demo login (disabled in production)',
  request: {
    body: { content: { 'application/json': { schema: loginDevSchema } } },
  },
  responses: {
    200: {
      description: 'Session cookie issued',
      content: { 'application/json': { schema: successEnvelopeSchema(authMeSchema) } },
    },
    404: { description: 'Dev login is disabled' },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  tags: ['Auth'],
  summary: 'Revoke the current session',
  security: [{ sessionCookie: [] }],
  responses: { 200: { description: 'Session revoked' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/users',
  tags: ['Administration'],
  summary: 'Paginated users with role assignments',
  security: [{ sessionCookie: [] }],
  responses: {
    200: { description: 'User list' },
    401: { description: 'Authentication required' },
    403: { description: 'Missing users.read permission' },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/employees',
  tags: ['Employees'],
  summary: 'Paginated employee mirror',
  security: [{ sessionCookie: [] }],
  responses: { 200: { description: 'Employee list' }, 403: { description: 'Forbidden' } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/dashboard/overview',
  tags: ['Dashboard'],
  summary: 'Foundation dashboard counts and integration status',
  security: [{ sessionCookie: [] }],
  responses: { 200: { description: 'Dashboard overview' } },
});

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Whoosh Stay API',
      version: '0.1.0',
      description:
        'Foundation API for the Whoosh Stay internal crew accommodation platform. Development adapters are used where official KCIC integrations are not yet supplied.',
    },
    servers: [{ url: '/', description: 'Same origin' }],
  });
}
