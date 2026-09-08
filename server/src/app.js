import express from 'express';

import env from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import authRoutes from './routes/auth.routes.js';
import categoryRoutes from './routes/categories.routes.js';
import locationRoutes from './routes/locations.routes.js';
import productRoutes from './routes/products.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import aiRoutes from './routes/ai.routes.js';
import notFound from './middlewares/notFound.js';
import errorHandler from './middlewares/errorHandler.js';

const app = express();

// Only trust a known number of reverse-proxy hops when explicitly configured
// (TRUST_PROXY). The default — trust nobody — keeps X-Forwarded-For spoofing
// from bypassing the auth rate limiters. See config/env.js parseTrustProxy.
if (env.trustProxy > 0) {
  app.set('trust proxy', env.trustProxy);
}

// Parse JSON request bodies
app.use(express.json());

// Service info
app.get('/', (req, res) => {
  res.json({ service: 'inventory-ai-server', status: 'ok' });
});

// API routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/ai', aiRoutes);

// Unknown routes -> structured 404
app.use(notFound);

// Centralized error handler (must be registered last)
app.use(errorHandler);

export default app;
