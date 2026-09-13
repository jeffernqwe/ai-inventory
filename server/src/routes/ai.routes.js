import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.js';
import { requirePermission } from '../middlewares/authorize.js';
import aiController from '../controllers/ai.controller.js';
import { aiRateLimiter } from '../services/ai/rateLimiter.js';
import { PERMISSIONS } from '../constants/roles.ts';

const router = Router();

// Chat is the only cost-bearing route, so it is rate-limited per user.
router.post('/chat', requireAuth, requirePermission(PERMISSIONS.AI_USE), aiRateLimiter, aiController.sendMessage);

// Conversation/message retrieval.
router.get('/conversations', requireAuth, requirePermission(PERMISSIONS.AI_USE), aiController.listConversations);
router.post('/conversations', requireAuth, requirePermission(PERMISSIONS.AI_USE), aiController.createConversation);
router.get('/conversations/:id/messages', requireAuth, requirePermission(PERMISSIONS.AI_USE), aiController.listMessages);

export default router;
