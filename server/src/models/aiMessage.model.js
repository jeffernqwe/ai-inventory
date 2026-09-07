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

const AIMessage = mongoose.model('AIMessage', aiMessageSchema);

export default AIMessage;
