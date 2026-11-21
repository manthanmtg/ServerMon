import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IFleetCommandSecret extends Document {
  _id: mongoose.Types.ObjectId;
  commandId: string;
  nodeId: string;
  iv: string;
  tag: string;
  ciphertext: string;
  expiresAt: Date;
}

const FleetCommandSecretSchema = new Schema(
  {
    commandId: { type: String, required: true, index: true },
    nodeId: { type: String, required: true, index: true },
    iv: { type: String, required: true },
    tag: { type: String, required: true },
    ciphertext: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

FleetCommandSecretSchema.index({ commandId: 1, nodeId: 1 }, { unique: true });
FleetCommandSecretSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const FleetCommandSecret: Model<IFleetCommandSecret> =
  (mongoose.models.FleetCommandSecret as Model<IFleetCommandSecret>) ||
  mongoose.model<IFleetCommandSecret>('FleetCommandSecret', FleetCommandSecretSchema);

export default FleetCommandSecret;
