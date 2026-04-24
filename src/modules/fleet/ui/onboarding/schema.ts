import { z } from 'zod';
import { FRPC_PROTOCOLS } from '@/lib/fleet/enums';

export const OnboardingFormSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase with hyphens'),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().max(40)).default([]),
  frpcConfig: z.object({
    protocol: z.enum(FRPC_PROTOCOLS).default('tcp'),
    tlsEnabled: z.boolean().default(true),
    tlsVerify: z.boolean().default(true),
    transportEncryptionEnabled: z.boolean().default(true),
    compressionEnabled: z.boolean().default(false),
    heartbeatInterval: z.number().int().min(5).max(3600).default(30),
    heartbeatTimeout: z.number().int().min(10).max(3600).default(90),
    poolCount: z.number().int().min(0).max(50).default(1),
  }),
  proxyRules: z
    .array(
      z.object({
        name: z
          .string()
          .min(1)
          .regex(/^[a-z0-9-]+$/),
        type: z.enum(['tcp', 'http', 'https', 'udp', 'stcp', 'xtcp']),
        subdomain: z.string().optional(),
        localIp: z.string().default('127.0.0.1'),
        localPort: z.number().int().min(1).max(65535),
        remotePort: z.number().int().min(1).max(65535).optional(),
        customDomains: z.array(z.string()).default([]),
        enabled: z.boolean().default(true),
      })
    )
    .default([]),
});

export type OnboardingForm = z.infer<typeof OnboardingFormSchema>;
