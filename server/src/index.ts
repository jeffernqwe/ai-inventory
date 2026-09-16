// Load environment variables first (before any module reads process.env).
import 'dotenv/config';

import { startServer } from './config/startup.ts';

// Phase 07D boot: production config fail-fast, DB connect before listen,
// graceful shutdown. See config/startup.ts for the full ordering.
startServer();
