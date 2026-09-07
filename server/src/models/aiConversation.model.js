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

const AIConversation = mongoose.model('AIConversation', aiConversationSchema);

export default AIConversation;
