import { z } from 'zod';
import { TUNNEL_STATUSES, PROXY_STATUSES } from './enums';

export const HeartbeatZodSchema = z.object({
  nodeId: z.string().min(1),
  bootId: z.string().min(1),
  bootAt: z.coerce.date(),
  agentVersion: z.string().max(40),
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
  metrics: z
    .object({
      cpuLoad: z.number().optional(),
      ramUsed: z.number().optional(),
      uptime: z.number().optional(),
    })
    .default({}),
  tunnel: z.object({
    status: z.enum(TUNNEL_STATUSES),
    connectedSince: z.coerce.date().optional(),
    lastError: z.string().optional(),
  }),
  proxies: z
    .array(
      z.object({
        name: z.string(),
        status: z.enum(PROXY_STATUSES),
        lastError: z.string().optional(),
      })
    )
    .default([]),
  capabilities: z
    .object({
      terminal: z.boolean(),
      endpointRuns: z.boolean(),
      processes: z.boolean(),
      metrics: z.boolean(),
      publishRoutes: z.boolean(),
      tcpForward: z.boolean(),
      fileOps: z.boolean(),
      updates: z.boolean(),
    })
    .partial()
    .default({}),
  correlationId: z.string().optional(),
});

export type Heartbeat = z.infer<typeof HeartbeatZodSchema>;
