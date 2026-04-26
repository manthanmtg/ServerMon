import mongoose, { Document, Model, Schema } from 'mongoose';
import type {
  NetworkSpeedtestCli,
  NetworkSpeedtestStatus,
  NetworkSpeedtestTrigger,
} from '@/modules/network/types';

export interface INetworkSpeedtestResult extends Document {
  trigger: NetworkSpeedtestTrigger;
  status: NetworkSpeedtestStatus;
  cli: NetworkSpeedtestCli;
  startedAt: Date;
  finishedAt: Date;
  downloadMbps?: number;
  uploadMbps?: number;
  pingMs?: number;
  jitterMs?: number;
  packetLoss?: number;
  serverId?: string;
  serverName?: string;
  serverLocation?: string;
  isp?: string;
  resultUrl?: string;
  bytesReceived?: number;
  bytesSent?: number;
  error?: string;
}

const NetworkSpeedtestResultSchema = new Schema(
  {
    trigger: { type: String, enum: ['manual', 'scheduled'], required: true, index: true },
    status: { type: String, enum: ['completed', 'failed'], required: true, index: true },
    cli: { type: String, enum: ['ookla', 'python', 'unknown'], required: true },
    startedAt: { type: Date, required: true, index: true },
    finishedAt: { type: Date, required: true },
    downloadMbps: { type: Number },
    uploadMbps: { type: Number },
    pingMs: { type: Number },
    jitterMs: { type: Number },
    packetLoss: { type: Number },
    serverId: { type: String },
    serverName: { type: String },
    serverLocation: { type: String },
    isp: { type: String },
    resultUrl: { type: String },
    bytesReceived: { type: Number },
    bytesSent: { type: Number },
    error: { type: String },
  },
  { timestamps: true }
);

const NetworkSpeedtestResult: Model<INetworkSpeedtestResult> =
  mongoose.models.NetworkSpeedtestResult ||
  mongoose.model<INetworkSpeedtestResult>('NetworkSpeedtestResult', NetworkSpeedtestResultSchema);

export default NetworkSpeedtestResult;
