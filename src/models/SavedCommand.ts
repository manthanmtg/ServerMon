import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ISavedCommand extends Document {
  name: string;
  command: string;
  description?: string;
  category?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const SavedCommandSchema: Schema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    command: { type: String, required: true, trim: true, maxlength: 2000 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    category: { type: String, default: 'General', trim: true, maxlength: 50 },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

SavedCommandSchema.index({ name: 1 });
SavedCommandSchema.index({ category: 1 });

const SavedCommand: Model<ISavedCommand> =
  mongoose.models.SavedCommand || mongoose.model<ISavedCommand>('SavedCommand', SavedCommandSchema);

export default SavedCommand;
