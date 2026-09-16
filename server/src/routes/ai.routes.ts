import { Router } from 'express';

import requireAuth from '../middlewares/authenticate.ts';
import { requirePermission } from '../middlewares/authorize.ts';
import aiController from '../controllers/ai.controller.ts';
import { aiRateLimiter } from '../services/ai/rateLimiter.ts';
import { PERMISSIONS } from '../constants/roles.ts';

const router = Router();

// Chat is the only cost-bearing route, so it is rate-limited per user.
router.post('/chat', requireAuth, requirePermission(PERMISSIONS.AI_USE), aiRateLimiter, aiController.sendMessage);

// Conversation/message retrieval.
router.get('/conversations', requireAuth, requirePermission(PERMISSIONS.AI_USE), aiController.listConversations);
router.post('/conversations', requireAuth, requirePermission(PERMISSIONS.AI_USE), aiController.createConversation);
router.get('/conversations/:id/messages', requireAuth, requirePermission(PERMISSIONS.AI_USE), aiController.listMessages);

export default router;
