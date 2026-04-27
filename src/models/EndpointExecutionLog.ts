import mongoose, { Schema, Document, Model } from 'mongoose';

export const ENDPOINT_EXECUTION_LOG_BODY_MAX_CHARS = 1_000_000;
export const ENDPOINT_EXECUTION_LOG_ERROR_MAX_CHARS = 5_000;

export interface IEndpointExecutionLog extends Document {
  _id: mongoose.Types.ObjectId;
  endpointId: mongoose.Types.ObjectId;
  method: string;
  statusCode: number;
  duration: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  requestBody?: string;
  responseBody?: string;
  requestMeta: {
    ip?: string;
    userAgent?: string;
    contentType?: string;
  };
  triggeredBy: 'external' | 'test';
  createdAt: Date;
}

const EndpointExecutionLogSchema: Schema = new Schema(
  {
    endpointId: { type: Schema.Types.ObjectId, ref: 'CustomEndpoint', required: true, index: true },
    method: { type: String, required: true },
    statusCode: { type: Number, required: true },
    duration: { type: Number, required: true },
    stdout: { type: String, maxlength: ENDPOINT_EXECUTION_LOG_BODY_MAX_CHARS },
    stderr: { type: String, maxlength: ENDPOINT_EXECUTION_LOG_BODY_MAX_CHARS },
    error: { type: String, maxlength: ENDPOINT_EXECUTION_LOG_ERROR_MAX_CHARS },
    requestBody: { type: String, maxlength: ENDPOINT_EXECUTION_LOG_BODY_MAX_CHARS },
    responseBody: { type: String, maxlength: ENDPOINT_EXECUTION_LOG_BODY_MAX_CHARS },
    requestMeta: {
      ip: { type: String },
      userAgent: { type: String },
      contentType: { type: String },
    },
    triggeredBy: { type: String, enum: ['external', 'test'], default: 'external' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

EndpointExecutionLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
EndpointExecutionLogSchema.index({ endpointId: 1, createdAt: -1 });
EndpointExecutionLogSchema.index({ endpointId: 1, statusCode: 1 });

const EndpointExecutionLog: Model<IEndpointExecutionLog> =
  mongoose.models.EndpointExecutionLog ||
  mongoose.model<IEndpointExecutionLog>('EndpointExecutionLog', EndpointExecutionLogSchema);

export default EndpointExecutionLog;
