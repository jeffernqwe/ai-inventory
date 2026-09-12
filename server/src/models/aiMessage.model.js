import mongoose from 'mongoose';

const { Schema } = mongoose;

const aiMessageRoles = ['USER', 'ASSISTANT', 'TOOL'];

const aiMessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'AIConversation',
      required: [true, 'conversationId is required'],
      index: true,
    },
    role: {
      type: String,
      enum: aiMessageRoles,
      required: [true, 'role is required'],
    },
    content: {
      type: String,
      required: [true, 'content is required'],
    },
    model: {
      type: String,
      trim: true,
    },
    toolsUsed: [
      {
        type: String,
        trim: true,
      },
    ],
    usage: {
      type: Schema.Types.Mixed,
    },
  },
  { collection: 'ai_messages', timestamps: true }
);

aiMessageSchema.index({ conversationId: 1, createdAt: 1 });
// Phase 20C (H-1): conversation messages are read oldest-first with a deterministic
// tiebreaker — `sort({ createdAt: 1, _id: 1 })` (ai.controller.js). The index above
// matches the equality + `createdAt` prefix but not the `_id` key, so the sort was
// executed in memory. Declaring the full key shape makes it index-ordered.
aiMessageSchema.index({ conversationId: 1, createdAt: 1, _id: 1 });

const AIMessage = mongoose.model('AIMessage', aiMessageSchema);

export default AIMessage;
