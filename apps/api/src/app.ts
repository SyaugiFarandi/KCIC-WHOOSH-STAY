import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { ERROR_CODES } from '@whoosh/shared';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { requestContext, cors } from './middleware/platform.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { optionalAuth } from './modules/auth/middleware.js';
import { authRouter } from './modules/auth/routes.js';
import { adminUsersRouter } from './modules/admin/users.js';
import { employeesRouter } from './modules/employees/routes.js';
import { employeeImportRouter } from './modules/employees/import.js';
import { dashboardRouter } from './modules/dashboard/routes.js';
import { healthRouter } from './modules/health/routes.js';
import { inventoryRouter } from './modules/inventory/routes.js';
import { availabilityRouter } from './modules/availability/routes.js';
import { occupancyRouter } from './modules/occupancy/routes.js';
import { calendarRouter } from './modules/calendar/routes.js';
import { reservationsRouter } from './modules/reservations/routes.js';
import { exceptionsRouter } from './modules/exceptions/routes.js';
import { policyEngineRouter } from './modules/policies/routes.js';
import { staysRouter } from './modules/stays/routes.js';
import { housekeepingRouter } from './modules/housekeeping/routes.js';
import { maintenanceRouter } from './modules/maintenance/routes.js';
import { rosterRouter } from './modules/roster/routes.js';
import { reportsRouter } from './modules/reports/routes.js';
import { settingsRouter } from './modules/settings/routes.js';
import { notificationsRouter } from './modules/notifications/routes.js';
import { masterDataRouter } from './modules/master-data/routes.js';
import { masterImportRouter } from './modules/master-data/import.js';
import { attachmentsRouter } from './modules/attachments/routes.js';
import { accommodationRouter } from './modules/accommodation/routes.js';
import { researchRouter } from './modules/research/routes.js';
import { buildOpenApiDocument } from './openapi/document.js';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(requestContext);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { requestId: string }).requestId,
      autoLogging: {
        ignore: (req) => req.url?.startsWith('/health') ?? false,
      },
    }),
  );
  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'none'"],
                frameAncestors: ["'none'"],
                baseUri: ["'none'"],
                formAction: ["'none'"],
              },
            }
          : false,
    }),
  );
  app.use(cors);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());

  app.use(healthRouter);

  const authLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many authentication attempts' },
        meta: { requestId: 'rate-limited' },
      });
    },
  });
  app.use('/api/v1/auth/dev-login', authLimiter);
  app.use('/api/v1/auth/demo-login', authLimiter);
  app.use('/api/v1/auth/login', authLimiter);
  app.use('/api/v1/auth/callback', authLimiter);
  app.use('/api/v1/auth/change-password', authLimiter);
  app.use('/api/v1/auth/me/telegram', authLimiter);

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: env.API_RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many requests' },
        meta: { requestId: 'rate-limited' },
      });
    },
  });
  app.use('/api/v1', apiLimiter);

  app.use('/api/v1', optionalAuth);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminUsersRouter);
  app.use('/api/v1', employeeImportRouter);
  app.use('/api/v1', employeesRouter);
  app.use('/api/v1', dashboardRouter);
  app.use('/api/v1', inventoryRouter);
  app.use('/api/v1', availabilityRouter);
  app.use('/api/v1', occupancyRouter);
  app.use('/api/v1', calendarRouter);
  app.use('/api/v1', reservationsRouter);
  app.use('/api/v1', exceptionsRouter);
  app.use('/api/v1/policy-engine', policyEngineRouter);
  app.use('/api/v1', staysRouter);
  app.use('/api/v1', housekeepingRouter);
  app.use('/api/v1', maintenanceRouter);
  app.use('/api/v1', rosterRouter);
  app.use('/api/v1', reportsRouter);
  app.use('/api/v1', settingsRouter);
  app.use('/api/v1', notificationsRouter);
  app.use('/api/v1', masterImportRouter);
  app.use('/api/v1', masterDataRouter);
  app.use('/api/v1', attachmentsRouter);
  app.use('/api/v1', accommodationRouter);
  app.use('/api/v1', researchRouter);

  if (env.NODE_ENV !== 'production') {
    const document = buildOpenApiDocument();
    app.get('/api/openapi.json', (_req, res) => res.json(document));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(document));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
