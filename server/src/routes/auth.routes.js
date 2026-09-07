import { Router } from 'express';

import { register, login, me } from '../controllers/auth.controller.js';
import requireAuth from '../middlewares/authenticate.js';

const router = Router();

// Public
router.post('/register', register);
router.post('/login', login);

// Protected
router.get('/me', requireAuth, me);

export default router;
