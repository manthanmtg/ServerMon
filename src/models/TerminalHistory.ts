import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITerminalHistory extends Document {
  sessionId: string;
  label: string;
  createdAt: Date;
  createdBy: string;
  closedAt?: Date;
  closedBy?: string;
  exitCode?: number;
  signal?: string;
  durationMinutes?: number;
  pid?: number;
}

const TerminalHistorySchema: Schema = new Schema(
  {
    sessionId: { type: String, required: true, index: true },
    label: { type: String, required: true },
    createdBy: { type: String, required: true },
    closedAt: { type: Date },
    closedBy: { type: String },
    exitCode: { type: Number },
    signal: { type: String },
    durationMinutes: { type: Number },
    pid: { type: Number },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Calculate duration on save if closedAt is provided
TerminalHistorySchema.pre('save', function (this: ITerminalHistory) {
  if (this.closedAt && this.createdAt) {
    const diffMs = new Date(this.closedAt).getTime() - new Date(this.createdAt).getTime();
    this.durationMinutes = Math.round(diffMs / (1000 * 60));
  }
});

const TerminalHistory: Model<ITerminalHistory> =
  mongoose.models.TerminalHistory ||
  mongoose.model<ITerminalHistory>('TerminalHistory', TerminalHistorySchema);

export default TerminalHistory;
