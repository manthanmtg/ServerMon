import mongoose, { Schema, Document, Model } from 'mongoose';

export interface ITerminalSession extends Document {
    sessionId: string;
    label: string;
    order: number;
    createdAt: Date;
    lastActiveAt: Date;
    pid?: number;
}

const TerminalSessionSchema: Schema = new Schema(
    {
        sessionId: { type: String, required: true, unique: true, index: true },
        label: { type: String, default: 'Terminal' },
        order: { type: Number, default: 0 },
        lastActiveAt: { type: Date, default: Date.now },
        pid: { type: Number },
    },
    { timestamps: true }
);

const TerminalSession: Model<ITerminalSession> =
    mongoose.models.TerminalSession ||
    mongoose.model<ITerminalSession>('TerminalSession', TerminalSessionSchema);

export default TerminalSession;
