import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAIRunnerPromptTemplate extends Document {
  name: string;
  content: string;
  description?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerPromptTemplateSchema = new Schema<IAIRunnerPromptTemplate>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    content: { type: String, required: true, maxlength: 100_000 },
    description: { type: String, trim: true, maxlength: 1000 },
    tags: [{ type: String, trim: true, maxlength: 40 }],
  },
  { timestamps: true }
);

AIRunnerPromptTemplateSchema.index({ updatedAt: -1 });
AIRunnerPromptTemplateSchema.index({ tags: 1 });

const AIRunnerPromptTemplate: Model<IAIRunnerPromptTemplate> =
  mongoose.models.AIRunnerPromptTemplate ||
  mongoose.model<IAIRunnerPromptTemplate>('AIRunnerPromptTemplate', AIRunnerPromptTemplateSchema);

export default AIRunnerPromptTemplate;
