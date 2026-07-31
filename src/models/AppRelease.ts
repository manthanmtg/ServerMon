import mongoose, { Document, Model, Schema } from 'mongoose';

export type AppReleaseStatus = 'building' | 'active' | 'failed' | 'superseded';

export interface IAppRelease extends Document {
  _id: mongoose.Types.ObjectId;
  appId: mongoose.Types.ObjectId;
  appSlug: string;
  releaseId: string;
  status: AppReleaseStatus;
  operationId?: string;
  commitSha?: string;
  sourcePath?: string;
  releasePath?: string;
  error?: string;
  createdAt?: Date;
  activatedAt?: Date;
  updatedAt?: Date;
}

const AppReleaseSchema = new Schema<IAppRelease>(
  {
    appId: { type: Schema.Types.ObjectId, ref: 'ManagedApp', required: true },
    appSlug: { type: String, required: true, trim: true },
    releaseId: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['building', 'active', 'failed', 'superseded'],
      required: true,
      default: 'building',
    },
    operationId: { type: String, trim: true },
    commitSha: { type: String, trim: true },
    sourcePath: { type: String, trim: true },
    releasePath: { type: String, trim: true },
    error: { type: String },
    activatedAt: { type: Date },
  },
  { timestamps: true }
);

AppReleaseSchema.index({ appId: 1, releaseId: 1 }, { unique: true });
AppReleaseSchema.index({ appId: 1, createdAt: -1 });
AppReleaseSchema.index({ appId: 1, status: 1 });

const AppRelease: Model<IAppRelease> =
  (mongoose.models.AppRelease as Model<IAppRelease>) ||
  mongoose.model<IAppRelease>('AppRelease', AppReleaseSchema);

export default AppRelease;
