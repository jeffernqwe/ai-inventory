import express from 'express';
import helmet from 'helmet';

import env from './config/env.ts';
import { createCors } from './middlewares/cors.ts';
import requestId from './middlewares/requestId.ts';
import requestLogger from './middlewares/httpLogger.ts';
import healthRoutes from './routes/health.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import userRoutes from './routes/users.routes.js';
import categoryRoutes from './routes/categories.routes.js';
import locationRoutes from './routes/locations.routes.js';
import supplierRoutes from './routes/suppliers.routes.js';
import purchaseOrderRoutes from './routes/purchase-orders.routes.js';
import productRoutes from './routes/products.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import aiRoutes from './routes/ai.routes.js';
import auditRoutes from './routes/audit.routes.js';
import notFound from './middlewares/notFound.ts';
import errorHandler from './middlewares/errorHandler.ts';

/**
 * Build a fully wired Express app. Exported as a factory so tests can exercise
 * the real middleware chain (headers, CORS, body limit, trust proxy, auth rate
 * limiters) deterministically, without mutating process.env. The module's
 * default export is the singleton the server boots (see index.js).
 *
 * @param {object}  [options]
 * @param {number}  [options.trustProxy]    Reverse-proxy hops (Phase 07B/M4).
 * @param {string[]} [options.corsOrigins]  Explicit CORS allow-list (M3).
 * @param {string}  [options.jsonBodyLimit] express.json() body limit (L2).
 * @param {object}  [options.authLimits]    Auth rate-limiter overrides (tests).
 * @param {boolean} [options.requestLogging] Structured per-request access log
 *                                            (Phase 08A). Default: on unless
 *                                            LOG_REQUESTS=0.
 */
export function createApp({
  trustProxy = env.trustProxy,
  corsOrigins = env.corsOrigins,
  jsonBodyLimit = env.jsonBodyLimit,
  authLimits,
  requestLogging = process.env.LOG_REQUESTS !== '0',
} = {}) {
  const app = express();

  // H6: never advertise the framework. Express-level config, not per-route
  // header deletion (which Express would re-add on the next response anyway).
  app.disable('x-powered-by');

  // Phase 08A: correlation id FIRST so every downstream layer (rate limiters,
  // body parser, routes, error handler) runs under a stable req.requestId, and
  // every response — success or error — echoes X-Request-ID. The request access
  // log then records one structured line per completed request.
  app.use(requestId);
  app.use(requestLogger({ enabled: requestLogging }));

  // M4: only trust a known number of reverse-proxy hops when explicitly
  // configured (TRUST_PROXY, numeric hop count). Default 0 = trust no proxy:
  // forwarded headers are ignored, so spoofed X-Forwarded-For cannot bypass
  // the IP-based auth rate limiters. See config/env.js parseTrustProxy.
  if (trustProxy > 0) {
    app.set('trust proxy', trustProxy);
  }

  // H6: defense-in-depth security headers. This is a JSON API for native mobile
  // clients — no HTML documents are served, so the document-oriented controls
  // (Content-Security-Policy, Cross-Origin-Embedder-Policy) are disabled. The
  // remaining headers (nosniff, frame/opener isolation, HSTS, etc.) apply to
  // every response, health and auth included.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // M3: explicit browser CORS allow-list (see middlewares/cors.js). Native
  // mobile sends no Origin and is unaffected; browsers only get a grant for
  // allow-listed origins — never '*'.
  app.use(createCors(corsOrigins));

  // L2: explicit JSON body-size cap. Oversized bodies are rejected with a
  // clean 413 before any route logic runs (see errorHandler bodyError mapping).
  app.use(express.json({ limit: jsonBodyLimit }));

  // Service info
  app.get('/', (req, res) => {
    res.json({ service: 'inventory-ai-server', status: 'ok' });
  });

  // API routes
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', createAuthRouter({ limits: authLimits }));
  app.use('/api/users', userRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/locations', locationRoutes);
  app.use('/api/suppliers', supplierRoutes);
  app.use('/api/purchase-orders', purchaseOrderRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/audit', auditRoutes);

  // Unknown routes -> structured 404
  app.use(notFound);

  // Centralized error handler (must be registered last)
  app.use(errorHandler);

  return app;
}

const app = createApp();

export default app;
