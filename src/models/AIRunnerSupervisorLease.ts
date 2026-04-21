import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IAIRunnerSupervisorLease extends Document<string> {
  _id: string;
  ownerId: string;
  expiresAt: Date;
  heartbeatAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AIRunnerSupervisorLeaseSchema = new Schema<IAIRunnerSupervisorLease>(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    heartbeatAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false }
);

const AIRunnerSupervisorLease: Model<IAIRunnerSupervisorLease> =
  mongoose.models.AIRunnerSupervisorLease ||
  mongoose.model<IAIRunnerSupervisorLease>(
    'AIRunnerSupervisorLease',
    AIRunnerSupervisorLeaseSchema
  );

export default AIRunnerSupervisorLease;
