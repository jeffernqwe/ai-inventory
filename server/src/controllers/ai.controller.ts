/**
 * AI controller — conversation persistence and the chat endpoint.
 *
 * Routes under /api/ai (see ai.routes.js). Every handler is scoped by the
 * authenticated user: businessId/userId always come from req.user (Phase 03
 * requireAuth), never from the request body. Conversations are persisted with
 * the Phase 02 AIConversation/AIMessage models — no duplicate collections, no
 * secrets ever stored.
 */

import type { Request, Response } from 'express';
import type mongoose from 'mongoose';

import { AIConversation, AIMessage } from '../models/index.ts';
import { parsePagination, pageResult } from '../utils/pagination.ts';
import { optionalObjectId, requiredString, isObjectId } from '../utils/validate.ts';
import { invalidId, notFound, throwValidation } from '../utils/errors.ts';
import ApiError from '../utils/ApiError.ts';
import { aiConfig } from '../services/ai/aiConfig.ts';
import {
  AiAbandoned,
  AiNotConfigured,
  AiProviderError,
  AiQuotaExceeded,
  AiTimeout,
} from '../services/ai/aiErrors.ts';
import { runAiChat, type ChatTurn } from '../services/ai/ai.service.ts';

/**
 * The request context this controller reads, following `audit.controller.ts`,
 * `auth.controller.ts` and `users.controller.ts`: declaring these fields on
 * Express's global `Request` would let any module read an authoritative-looking
 * `req.user` on a public route.
 *
 * `user` is optional for the same reason it is optional in
 * `middlewares/authenticate.ts`: a handler is registered against Express's
 * `RequestHandler`, whose parameter is a plain `Request`; a required `user`
 * would make that `Request` unassignable and every route registration a type
 * error. The reads below assert it with `!` instead, which is justified by the
 * route table — every route in `routes/ai.routes.ts` is registered
 * `requireAuth, requirePermission(PERMISSIONS.AI_USE), controller`, so the
 * middleware has always run by the time these handlers execute. Optional
 * chaining was NOT used: it would silently pass `undefined` where the code
 * would previously have thrown, which is a behaviour change.
 *
 * `role` is read as well as `id`/`businessId` because `sendMessage` forwards it
 * to the AI service, which passes it to the tool layer's permission check.
 */
type AuthenticatedRequest = Request & { user?: { id: string; businessId: string; role: string } };

/** The stored conversation / message documents, derived from their models. */
type ConversationDoc = mongoose.HydratedDocFromModel<typeof AIConversation>;
type MessageDoc = mongoose.HydratedDocFromModel<typeof AIMessage>;

const TITLE_MAX = 120;

function conversationPublic(conv: ConversationDoc) {
  return {
    id: String(conv._id),
    title: conv.title || null,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
}

function messagePublic(msg: MessageDoc) {
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

function titleFrom(message: string) {
  const trimmed = message.trim();
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 57)}…`;
}

/** Map AI-layer failures to safe, secret-free client responses. */
function mapAiFailure(err: unknown) {
  if (err instanceof AiNotConfigured) {
    return new ApiError(
      503,
      'The AI assistant is not configured on this server yet. Ask an administrator to enable it.',
      'AI_NOT_CONFIGURED'
    );
  }
  // AI-1 — the turn outlasted its own deadline. Deliberately its own status and
  // code: before this, a turn cut short and a provider outage were reported to
  // the user as the same thing. 504 rather than 502 because nothing upstream
  // failed — we stopped waiting, and the client should retry rather than
  // investigate a service it cannot see.
  if (err instanceof AiTimeout) {
    return new ApiError(504, 'The assistant took too long to answer. Please try again.', 'AI_TIMEOUT');
  }
  // AI-1 — the caller left. 499 is the conventional "client closed request", and
  // it is deliberately NOT a 502: nothing failed, and the socket this would be
  // written to is already gone. Its reason for existing is the log line, since a
  // request the client aborted used to leave no server-side trace whatsoever.
  if (err instanceof AiAbandoned) {
    return new ApiError(499, 'The request was cancelled before the assistant answered.', 'AI_ABANDONED');
  }
  // AI-6 — the gateway refused because a LIMIT was reached, not because anything
  // failed. 429 (not 502) and its own code and sentence, because the correct
  // action is the opposite of the one a 502 asks for: a 502 says "try again in a
  // moment", and a spent allowance cannot be waited out that way. This is the
  // case the device run measured as the DOMINANT failure at this tier (§27BF),
  // and it used to arrive as a provider outage.
  //
  // It is deliberately distinct from the route's own `429 AI_RATE_LIMITED`: that
  // one says *this member* is sending too fast and clears in seconds, while this
  // one says the assistant's allowance is spent and does not.
  if (err instanceof AiQuotaExceeded) {
    return new ApiError(
      429,
      'The AI assistant has reached its usage limit. Please try again later.',
      'AI_QUOTA_EXCEEDED'
    );
  }
  if (err instanceof AiProviderError) {
    return new ApiError(502, 'The AI service is temporarily unavailable. Please try again in a moment.', 'AI_UNAVAILABLE');
  }
  return err;
}

/**
 * Load the text turns already stored for a conversation (USER/ASSISTANT only) as
 * prior provider context. Called BEFORE the current turn is persisted, so the
 * result can never include the in-flight user message — the provider service
 * appends that message itself, and persisting/loading it first would send it
 * twice (Phase 07E / M6).
 */
async function priorTurnHistory(conversationId: ConversationDoc['_id'], limit: number): Promise<ChatTurn[]> {
  const historyFilter = { conversationId, role: { $in: ['USER', 'ASSISTANT'] } };
  const historyCount = await AIMessage.countDocuments(historyFilter);
  const skip = Math.max(0, historyCount - limit);
  const recent = await AIMessage.find(historyFilter)
    .sort({ createdAt: 1, _id: 1 })
    .skip(skip)
    .limit(limit);
  return recent.map((m) => ({ role: m.role === 'ASSISTANT' ? 'assistant' : 'user', content: m.content }));
}

const aiController = {
  /** POST /api/ai/conversations -> start an (empty) conversation. */
  async createConversation(req: AuthenticatedRequest, res: Response) {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, TITLE_MAX) : '';
    const conversation = await AIConversation.create({
      businessId: req.user!.businessId,
      userId: req.user!.id,
      title: title || undefined,
    });
    res.status(201).json({ conversation: conversationPublic(conversation) });
  },

  /** GET /api/ai/conversations -> the user's conversations, newest first. */
  async listConversations(req: AuthenticatedRequest, res: Response) {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = { businessId: req.user!.businessId, userId: req.user!.id };
    const [total, docs] = await Promise.all([
      AIConversation.countDocuments(filter),
      AIConversation.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(skip).limit(limit),
    ]);
    res.json(pageResult(docs.map(conversationPublic), total, page, limit));
  },

  /** GET /api/ai/conversations/:id/messages -> one conversation's messages. */
  async listMessages(req: AuthenticatedRequest, res: Response) {
    const id = req.params.id;
    if (!isObjectId(id)) invalidId();
    const conversation = await AIConversation.findOne({
      _id: id,
      businessId: req.user!.businessId,
      userId: req.user!.id,
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
   * POST /api/ai/chat -> run one user message through the AI service.
   *
   * Persistence semantics (Phase 07E / M7):
   *   * An existing conversationId is resolved up front and ownership-checked
   *     (business + user); an unknown/foreign id is a 404 and nothing is written.
   *   * A brand-new conversation is NOT created until the provider has produced a
   *     final answer, and the USER + ASSISTANT messages are persisted together
   *     only after that success. A provider failure therefore writes nothing:
   *     no empty conversation, no orphaned USER message, no misleading ASSISTANT
   *     reply — and retrying the same request is a fresh, predictable attempt.
   *   * On success the current user message appears exactly once in the provider
   *     request: prior history is loaded BEFORE this turn exists, and the AI
   *     service appends the current message once (Phase 07E / M6).
   */
  async sendMessage(req: AuthenticatedRequest, res: Response) {
    const cfg = aiConfig();
    const problems = [];
    const convId = optionalObjectId(req.body?.conversationId, 'conversationId');
    problems.push(...convId.problems);
    const msg = requiredString(req.body?.message, 'message', cfg.maxMessageChars);
    problems.push(...msg.problems);
    if (problems.length) throwValidation(problems);
    // `requiredString` reports a problem instead of a value when the input is
    // unusable, and the throw above has already fired on that path, so the value
    // is a string here. The assertion is erased at runtime.
    const message = msg.value as string;

    const { businessId, id: userId, role } = req.user!;

    // Resolve an existing conversation (never created client-side, always under
    // the authenticated session). A new conversation is created lazily below.
    let conversation: ConversationDoc | null = null;
    let history: ChatTurn[] = [];
    if (convId.value) {
      conversation = await AIConversation.findOne({
        _id: convId.value,
        businessId,
        userId,
      });
      if (!conversation) notFound('Conversation not found');
      history = await priorTurnHistory(conversation._id, cfg.contextMessages);
    }

    // AI-1 — the caller's continued interest, as a signal the model call can be
    // cancelled with.
    //
    // `close` on the RESPONSE fires both when a response has finished normally
    // and when the connection was dropped before it could, so `writableEnded` is
    // what tells the two apart — and only the second means the client is gone.
    // (`req.on('close')` cannot be used for this: since Node 16 it also fires on
    // ordinary completion, which would abort every successful turn.)
    const clientGone = new AbortController();
    const onResponseClose = () => {
      if (!res.writableEnded) clientGone.abort();
    };
    res.on('close', onResponseClose);
    // The caller may ALREADY be gone: a connection can be dropped while auth and
    // validation are still running, before this listener exists, and 'close' is
    // not replayed for a response that has already closed. Measured, not
    // assumed — `res close (writableEnded=false, destroyed=true)` is what an
    // abort looks like when the listener is attached in time, and the listener
    // simply never fires when it is not. Without this check that turn would run
    // to its deadline and pay for a model call nobody will ever read.
    if (res.destroyed) clientGone.abort();

    let result;
    try {
      result = await runAiChat({ businessId, userId, role, history, message, signal: clientGone.signal });
    } catch (err) {
      // Nothing was persisted yet, so a failed request leaves no trace and a
      // retry is deterministic — the same conversation is reused when an id was
      // given, or a fresh attempt starts cleanly when there was none.
      throw mapAiFailure(err);
    } finally {
      res.off('close', onResponseClose);
    }

    // Provider succeeded — persist the turn durably now.
    if (!conversation) {
      conversation = await AIConversation.create({
        businessId,
        userId,
        title: titleFrom(message),
      });
    }
    const userMessage = await AIMessage.create({
      conversationId: conversation._id,
      role: 'USER',
      content: message,
    });
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
      // AI-2 — a degraded turn is a COMPLETED turn: the member did read an answer,
      // so it stays a 201 and is marked rather than turned into an error. The mark
      // is what makes the failure countable at the boundary for the first time.
      // Deliberately NOT persisted: it describes this turn's provider behaviour,
      // not the stored message, and adding a field to AIMessage would be a schema
      // change this increment does not have. `JSON.stringify` drops `undefined`, so
      // a healthy turn carries no `degraded` key at all rather than a null.
      degraded: result.degraded,
    });
  },
};

export default aiController;
