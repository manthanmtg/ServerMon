import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';
import {
  NODE_STATUSES,
  TUNNEL_STATUSES,
  PROXY_STATUSES,
  FRPC_PROTOCOLS,
  SERVICE_MANAGERS,
  SERVICE_STATES,
} from '@/lib/fleet/enums';

const ProxyRuleZ = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/),
  type: z.enum(['tcp', 'http', 'https', 'udp', 'stcp', 'xtcp']),
  subdomain: z.string().max(100).optional(),
  localIp: z.string().default('127.0.0.1'),
  localPort: z.number().int().min(1).max(65535),
  remotePort: z.number().int().min(1).max(65535).optional(),
  customDomains: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  status: z.enum(PROXY_STATUSES).default('disabled'),
  lastError: z.string().optional(),
});

const FrpcConfigZ = z
  .object({
    protocol: z.enum(FRPC_PROTOCOLS).default('tcp'),
    tlsEnabled: z.boolean().default(true),
    tlsVerify: z.boolean().default(true),
    transportEncryptionEnabled: z.boolean().default(true),
    compressionEnabled: z.boolean().default(false),
    heartbeatInterval: z.number().int().min(5).max(3600).default(30),
    heartbeatTimeout: z.number().int().min(10).max(3600).default(90),
    poolCount: z.number().int().min(0).max(50).default(1),
    advanced: z.record(z.string(), z.unknown()).default({}),
  })
  .default({
    protocol: 'tcp',
    tlsEnabled: true,
    tlsVerify: true,
    transportEncryptionEnabled: true,
    compressionEnabled: false,
    heartbeatInterval: 30,
    heartbeatTimeout: 90,
    poolCount: 1,
    advanced: {},
  });

export const NodeZodSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().max(500).optional(),
  status: z.enum(NODE_STATUSES).default('unpaired'),
  tunnelStatus: z.enum(TUNNEL_STATUSES).default('disconnected'),
  serviceManager: z.enum(SERVICE_MANAGERS).default('unknown'),
  serviceStatus: z.enum(SERVICE_STATES).default('stopped'),
  autoStartEnabled: z.boolean().default(false),
  agentVersion: z.string().max(40).optional(),
  frpcVersion: z.string().max(40).optional(),
  hardware: z
    .object({
      cpuCount: z.number().int().optional(),
      totalRam: z.number().int().optional(),
      diskSize: z.number().int().optional(),
      osDistro: z.string().max(120).optional(),
      arch: z.string().max(40).optional(),
    })
    .default({}),
  frpcConfig: FrpcConfigZ,
  proxyRules: z.array(ProxyRuleZ).default([]),
  tags: z.array(z.string().max(40)).max(20).default([]),
  maintenance: z
    .object({
      enabled: z.boolean().default(false),
      reason: z.string().max(200).optional(),
      until: z.date().optional(),
    })
    .default({ enabled: false }),
  capabilities: z
    .object({
      terminal: z.boolean().default(true),
      endpointRuns: z.boolean().default(true),
      processes: z.boolean().default(true),
      metrics: z.boolean().default(true),
      publishRoutes: z.boolean().default(true),
      tcpForward: z.boolean().default(true),
      fileOps: z.boolean().default(false),
      updates: z.boolean().default(true),
    })
    .default({
      terminal: true,
      endpointRuns: true,
      processes: true,
      metrics: true,
      publishRoutes: true,
      tcpForward: true,
      fileOps: false,
      updates: true,
    }),
});

export type INodeDTO = z.infer<typeof NodeZodSchema>;

export interface INode extends Document, INodeDTO {
  _id: mongoose.Types.ObjectId;
  pairingTokenHash?: string;
  pairingTokenPrefix?: string;
  pairingIssuedAt?: Date;
  pairingVerifiedAt?: Date | null;
  lastSeen?: Date;
  connectedSince?: Date;
  lastBootAt?: Date;
  bootId?: string;
  lastError?: { code: string; message: string; occurredAt: Date; correlationId?: string };
  generatedToml?: { hash: string; renderedAt: Date; version: number };
  metrics?: { cpuLoad?: number; ramUsed?: number; uptime?: number; capturedAt?: Date };
  /**
   * Reported by the agent every heartbeat: the local TCP port and shared
   * auth token of the agent's PTY bridge. The hub uses these to dial into
   * the agent for terminal sessions through the FRP TCP tunnel.
   */
  ptyBridge?: { port: number; authToken: string };
  pendingCommands?: Array<{ id: string; command: string; args?: unknown; issuedAt?: Date }>;
  createdBy?: string;
  updatedBy?: string;
}

const ProxyRuleSub = new Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    subdomain: { type: String },
    localIp: { type: String, default: '127.0.0.1' },
    localPort: { type: Number, required: true },
    remotePort: { type: Number },
    customDomains: [{ type: String }],
    enabled: { type: Boolean, default: true },
    status: { type: String, enum: PROXY_STATUSES, default: 'disabled' },
    lastError: { type: String },
  },
  { _id: false }
);

const NodeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, index: true, trim: true },
    description: { type: String },
    status: { type: String, enum: NODE_STATUSES, default: 'unpaired' },
    tunnelStatus: { type: String, enum: TUNNEL_STATUSES, default: 'disconnected' },
    serviceManager: { type: String, enum: SERVICE_MANAGERS, default: 'unknown' },
    serviceStatus: { type: String, enum: SERVICE_STATES, default: 'stopped' },
    autoStartEnabled: { type: Boolean, default: false },
    agentVersion: { type: String },
    frpcVersion: { type: String },
    hardware: {
      cpuCount: Number,
      totalRam: Number,
      diskSize: Number,
      osDistro: String,
      arch: String,
    },
    frpcConfig: {
      protocol: { type: String, enum: FRPC_PROTOCOLS, default: 'tcp' },
      tlsEnabled: { type: Boolean, default: true },
      tlsVerify: { type: Boolean, default: true },
      transportEncryptionEnabled: { type: Boolean, default: true },
      compressionEnabled: { type: Boolean, default: false },
      heartbeatInterval: { type: Number, default: 30 },
      heartbeatTimeout: { type: Number, default: 90 },
      poolCount: { type: Number, default: 1 },
      advanced: { type: Schema.Types.Mixed, default: {} },
    },
    proxyRules: [ProxyRuleSub],
    tags: [{ type: String, trim: true }],
    maintenance: {
      enabled: { type: Boolean, default: false },
      reason: String,
      until: Date,
    },
    capabilities: {
      terminal: { type: Boolean, default: true },
      endpointRuns: { type: Boolean, default: true },
      processes: { type: Boolean, default: true },
      metrics: { type: Boolean, default: true },
      publishRoutes: { type: Boolean, default: true },
      tcpForward: { type: Boolean, default: true },
      fileOps: { type: Boolean, default: false },
      updates: { type: Boolean, default: true },
    },
    pairingTokenHash: { type: String },
    pairingTokenPrefix: { type: String },
    pairingIssuedAt: { type: Date },
    pairingVerifiedAt: { type: Date, default: null },
    lastSeen: { type: Date },
    connectedSince: { type: Date },
    lastBootAt: { type: Date },
    bootId: { type: String },
    lastError: {
      code: String,
      message: String,
      occurredAt: Date,
      correlationId: String,
    },
    generatedToml: { hash: String, renderedAt: Date, version: Number },
    metrics: { cpuLoad: Number, ramUsed: Number, uptime: Number, capturedAt: Date },
    ptyBridge: {
      port: { type: Number },
      authToken: { type: String },
    },
    pendingCommands: [
      {
        id: { type: String, required: true },
        command: { type: String, required: true },
        args: { type: Schema.Types.Mixed },
        issuedAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: { type: String },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

NodeSchema.index({ tags: 1 });
NodeSchema.index({ status: 1 });
NodeSchema.index({ pairingTokenPrefix: 1 });

const Node: Model<INode> =
  (mongoose.models.Node as Model<INode>) || mongoose.model<INode>('Node', NodeSchema);

export default Node;
