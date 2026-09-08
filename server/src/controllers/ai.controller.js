/**
 * AI controller — conversation persistence and the chat endpoint.
 *
 * Routes under /api/ai (see ai.routes.js). Every handler is scoped by the
 * authenticated user: businessId/userId always come from req.user (Phase 03
 * requireAuth), never from the request body. Conversations are persisted with
 * the Phase 02 AIConversation/AIMessage models — no duplicate collections, no
 * secrets ever stored.
 */

import { AIConversation, AIMessage } from '../models/index.js';
import { parsePagination, pageResult } from '../utils/pagination.js';
import { optionalObjectId, requiredString, isObjectId } from '../utils/validate.js';
import { invalidId, notFound, throwValidation } from '../utils/errors.js';
import ApiError from '../utils/ApiError.js';
import { aiConfig } from '../services/ai/aiConfig.js';
import { AiNotConfigured, AiProviderError } from '../services/ai/aiErrors.js';
import { runAiChat } from '../services/ai/ai.service.js';

const TITLE_MAX = 120;

function conversationPublic(conv) {
  return {
    id: String(conv._id),
    title: conv.title || null,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

function messagePublic(msg) {
  const usage = msg.usage
    ? { inputTokens: msg.usage.inputTokens ?? undefined, outputTokens: msg.usage.outputTokens ?? undefined }
    : undefined;
  return {
    id: String(msg._id),
    conversationId: String(msg.conversationId),
    role: msg.role,
    content: msg.content,
    model: msg.model || undefined,
    toolsUsed: Array.isArray(msg.toolsUsed) && msg.toolsUsed.length ? msg.toolsUsed : undefined,
    usage,
    createdAt: msg.createdAt,
  };
}

function titleFrom(message) {
  const trimmed = message.trim();
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 57)}…`;
}

/** Map AI-layer failures to safe, secret-free client responses. */
function mapAiFailure(err) {
  if (err instanceof AiNotConfigured) {
    return new ApiError(
      503,
      'The AI assistant is not configured on this server yet. Ask an administrator to enable it.',
      'AI_NOT_CONFIGURED'
    );
  }
  if (err instanceof AiProviderError) {
    return new ApiError(502, 'The AI service is temporarily unavailable. Please try again in a moment.', 'AI_UNAVAILABLE');
  }
  return err;
}

const aiController = {
  /** POST /api/ai/conversations -> start an (empty) conversation. */
  async createConversation(req, res) {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, TITLE_MAX) : '';
    const conversation = await AIConversation.create({
      businessId: req.user.businessId,
      userId: req.user.id,
      title: title || undefined,
    });
    res.status(201).json({ conversation: conversationPublic(conversation) });
  },

  /** GET /api/ai/conversations -> the user's conversations, newest first. */
  async listConversations(req, res) {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { businessId: req.user.businessId, userId: req.user.id };
    const [total, docs] = await Promise.all([
      AIConversation.countDocuments(filter),
      AIConversation.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit),
    ]);
    res.json(pageResult(docs.map(conversationPublic), total, page, limit));
  },

  /** GET /api/ai/conversations/:id/messages -> one conversation's messages. */
  async listMessages(req, res) {
    const id = req.params.id;
    if (!isObjectId(id)) invalidId();
    const conversation = await AIConversation.findOne({
      _id: id,
      businessId: req.user.businessId,
      userId: req.user.id,
    });
    if (!conversation) notFound('Conversation not found');
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { conversationId: conversation._id };
    const [total, docs] = await Promise.all([
      AIMessage.countDocuments(filter),
      AIMessage.find(filter).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit),
    ]);
    res.json(pageResult(docs.map(messagePublic), total, page, limit));
  },

  /**
   * POST /api/ai/chat -> run one user message through the AI service and store
   * the user + assistant messages. When conversationId is omitted a new
   * conversation is started (title derived from the first message).
   */
  async sendMessage(req, res) {
    const cfg = aiConfig();
    const problems = [];
    const convId = optionalObjectId(req.body?.conversationId, 'conversationId');
    problems.push(...convId.problems);
    const msg = requiredString(req.body?.message, 'message', cfg.maxMessageChars);
    problems.push(...msg.problems);
    if (problems.length) throwValidation(problems);
    const message = msg.value;

    // Resolve or create the conversation — always under the session's user.
    let conversation;
    if (convId.value) {
      conversation = await AIConversation.findOne({
        _id: convId.value,
        businessId: req.user.businessId,
        userId: req.user.id,
      });
      if (!conversation) notFound('Conversation not found');
    } else {
      conversation = await AIConversation.create({
        businessId: req.user.businessId,
        userId: req.user.id,
        title: titleFrom(message),
      });
    }

    const userMessage = await AIMessage.create({
      conversationId: conversation._id,
      role: 'USER',
      content: message,
    });

    // Recent history (text turns only) to give the provider conversation context.
    const historyFilter = { conversationId: conversation._id, role: { $in: ['USER', 'ASSISTANT'] } };
    const historyCount = await AIMessage.countDocuments(historyFilter);
    const historySkip = Math.max(0, historyCount - cfg.contextMessages);
    const recent = await AIMessage.find(historyFilter)
      .sort({ createdAt: 1, _id: 1 })
      .skip(historySkip)
      .limit(cfg.contextMessages);
    const history = recent.map((m) => ({ role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content }));

    let result;
    try {
      result = await runAiChat({
        businessId: req.user.businessId,
        userId: req.user.id,
        role: req.user.role,
        history,
        message,
      });
    } catch (err) {
      throw mapAiFailure(err);
    }

    const assistantMessage = await AIMessage.create({
      conversationId: conversation._id,
      role: 'ASSISTANT',
      content: result.content,
      model: result.model || undefined,
      toolsUsed: result.toolsUsed?.length ? result.toolsUsed : undefined,
      usage: result.usage || undefined,
    });

    res.status(201).json({
      conversation: conversationPublic(conversation),
      userMessage: messagePublic(userMessage),
      assistantMessage: messagePublic(assistantMessage),
    });
  },
};

export default aiController;
