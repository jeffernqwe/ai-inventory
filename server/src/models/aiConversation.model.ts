import mongoose from 'mongoose';

const { Schema } = mongoose;

const aiConversationSchema = new Schema(
  {
    businessId: {
      type: Schema.Types.ObjectId,
      ref: 'Business',
      required: [true, 'businessId is required'],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    title: {
      type: String,
      trim: true,
    },
  },
  { collection: 'ai_conversations', timestamps: true }
);

aiConversationSchema.index({ businessId: 1, userId: 1, createdAt: 1 });
// Phase 20F (M-5): the conversation list is read most-recently-active first with
// a deterministic tiebreaker — `sort({ updatedAt: -1, _id: -1 })` over
// `{ businessId, userId }` (ai.controller.js). The index above keys on
// `createdAt`, which is not the sort field at all, so it can serve the equality
// match but not the order: the winning plan was `SORT -> FETCH -> IXSCAN`, a
// blocking in-memory sort. (The two fields hold equal values today only because
// a conversation is written once and never updated; the first update path would
// make that difference real.) Declaring the full key shape — both equality keys,
// then the sort keys in order and direction — makes the sort index-ordered. The
// `createdAt` index above is kept unchanged.
aiConversationSchema.index({ businessId: 1, userId: 1, updatedAt: -1, _id: -1 });

const AIConversation = mongoose.model('AIConversation', aiConversationSchema);

export default AIConversation;
