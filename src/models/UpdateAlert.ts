import mongoose, { Schema, Document } from 'mongoose';

export interface IUpdateAlert extends Document {
    fingerprint: string;
    severity: 'warning' | 'critical';
    title: string;
    message: string;
    source: string;
    active: boolean;
    firstSeenAt: Date;
    lastSeenAt: Date;
    resolvedAt?: Date;
}

const UpdateAlertSchema: Schema = new Schema({
    fingerprint: { type: String, required: true, unique: true },
    severity: { type: String, enum: ['warning', 'critical'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    source: { type: String, required: true },
    active: { type: Boolean, default: true },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
});

export default mongoose.models.UpdateAlert || mongoose.model<IUpdateAlert>('UpdateAlert', UpdateAlertSchema);
