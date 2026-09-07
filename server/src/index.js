// Load environment variables first (before any module reads process.env).
import 'dotenv/config';

import app from './app.js';
import env from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';

async function start() {
  // Connect to MongoDB when a URI is configured. A failed or absent connection
  // must not take the HTTP server down: /api/health reports database state and
  // the app stays reachable. Errors are logged (sanitized) inside connectDatabase().
  try {
    await connectDatabase();
  } catch {
    // handled in connectDatabase(); keep the server available
  }

  const server = app.listen(env.port, () => {
    console.log(
      `[server] environment=${env.nodeEnv} listening on http://localhost:${env.port}`
    );
  });

  const shutdown = async () => {
    console.log('[server] shutting down...');
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
