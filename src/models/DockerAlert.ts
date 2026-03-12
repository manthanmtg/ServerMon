import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IDockerAlert extends Document {
    fingerprint: string;
    severity: 'warning' | 'critical';
    title: string;
    message: string;
    source: string;
    metadata?: Record<string, unknown>;
    active: boolean;
    firstSeenAt: Date;
    lastSeenAt: Date;
    resolvedAt?: Date;
}

const DockerAlertSchema = new Schema(
    {
        fingerprint: { type: String, required: true, unique: true, index: true },
        severity: { type: String, enum: ['warning', 'critical'], required: true },
        title: { type: String, required: true },
        message: { type: String, required: true },
        source: { type: String, required: true },
        metadata: { type: Schema.Types.Mixed },
        active: { type: Boolean, default: true, index: true },
        firstSeenAt: { type: Date, default: Date.now },
        lastSeenAt: { type: Date, default: Date.now },
        resolvedAt: { type: Date },
    },
    { timestamps: true }
);

const DockerAlert: Model<IDockerAlert> =
    mongoose.models.DockerAlert ||
    mongoose.model<IDockerAlert>('DockerAlert', DockerAlertSchema);

export default DockerAlert;
