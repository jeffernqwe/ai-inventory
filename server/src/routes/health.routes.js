import { Router } from 'express';

import { getDatabaseState } from '../config/db.js';

const router = Router();

router.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    db: getDatabaseState(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
