import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';
import { ACCESS_MODES, PUBLIC_ROUTE_STATUSES } from '@/lib/fleet/enums';

const TlsProviderZ = z.enum(['letsencrypt', 'manual', 'reverse_proxy']);
const TlsStatusZ = z.enum(['pending', 'active', 'failed', 'expired', 'unknown']);
const HealthStatusZ = z.enum(['healthy', 'degraded', 'down', 'unknown']);
const DnsStatusZ = z.enum(['ok', 'missing', 'mismatch', 'unknown']);

export const PublicRouteZodSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  domain: z.string().min(1).max(253),
  path: z.string().max(200).default('/'),
  nodeId: z.string().min(1),
  proxyRuleName: z.string().min(1),
  target: z.object({
    localIp: z.string().min(1),
    localPort: z.number().int().min(1).max(65535),
    protocol: z.enum(['http', 'https', 'tcp']),
  }),
  tlsEnabled: z.boolean().default(true),
  tlsProvider: TlsProviderZ.optional(),
  tlsStatus: TlsStatusZ.default('unknown'),
  accessMode: z.enum(ACCESS_MODES).default('servermon_auth'),
  accessPolicyId: z.string().optional(),
  nginxConfigRevisionId: z.string().optional(),
  frpConfigRevisionId: z.string().optional(),
  status: z.enum(PUBLIC_ROUTE_STATUSES).default('pending_dns'),
  healthStatus: HealthStatusZ.default('unknown'),
  dnsStatus: DnsStatusZ.default('unknown'),
  websocketEnabled: z.boolean().default(false),
  http2Enabled: z.boolean().default(true),
  maxBodyMb: z.number().int().min(1).max(1024).default(32),
  timeoutSeconds: z.number().int().min(1).max(3600).default(60),
  compression: z.boolean().default(true),
  headers: z.record(z.string(), z.string()).default({}),
  lastCheckedAt: z.date().optional(),
  lastError: z.string().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  enabled: z.boolean().default(true),
  templateId: z.string().optional(),
});

export type IPublicRouteDTO = z.infer<typeof PublicRouteZodSchema>;

export interface IPublicRoute extends Document, IPublicRouteDTO {
  _id: mongoose.Types.ObjectId;
}

const PublicRouteSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    domain: { type: String, required: true },
    path: { type: String, default: '/' },
    nodeId: { type: String, required: true },
    proxyRuleName: { type: String, required: true },
    target: {
      localIp: { type: String, required: true },
      localPort: { type: Number, required: true },
      protocol: {
        type: String,
        enum: ['http', 'https', 'tcp'],
        required: true,
      },
    },
    tlsEnabled: { type: Boolean, default: true },
    tlsProvider: {
      type: String,
      enum: ['letsencrypt', 'manual', 'reverse_proxy'],
    },
    tlsStatus: {
      type: String,
      enum: ['pending', 'active', 'failed', 'expired', 'unknown'],
      default: 'unknown',
    },
    accessMode: { type: String, enum: ACCESS_MODES, default: 'servermon_auth' },
    accessPolicyId: { type: String },
    nginxConfigRevisionId: { type: String },
    frpConfigRevisionId: { type: String },
    status: {
      type: String,
      enum: PUBLIC_ROUTE_STATUSES,
      default: 'pending_dns',
    },
    healthStatus: {
      type: String,
      enum: ['healthy', 'degraded', 'down', 'unknown'],
      default: 'unknown',
    },
    dnsStatus: {
      type: String,
      enum: ['ok', 'missing', 'mismatch', 'unknown'],
      default: 'unknown',
    },
    websocketEnabled: { type: Boolean, default: false },
    http2Enabled: { type: Boolean, default: true },
    maxBodyMb: { type: Number, default: 32, min: 1, max: 1024 },
    timeoutSeconds: { type: Number, default: 60, min: 1, max: 3600 },
    compression: { type: Boolean, default: true },
    headers: { type: Map, of: String, default: {} },
    lastCheckedAt: { type: Date },
    lastError: { type: String },
    createdBy: { type: String },
    updatedBy: { type: String },
    enabled: { type: Boolean, default: true },
    templateId: { type: String },
  },
  { timestamps: true }
);

PublicRouteSchema.index({ domain: 1 });
PublicRouteSchema.index({ nodeId: 1 });
PublicRouteSchema.index({ status: 1 });

const PublicRoute: Model<IPublicRoute> =
  (mongoose.models.PublicRoute as Model<IPublicRoute>) ||
  mongoose.model<IPublicRoute>('PublicRoute', PublicRouteSchema);

export default PublicRoute;
