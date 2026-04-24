import { z } from 'zod';

export const TTY_MSG = {
  OPEN: 'tty:open',
  CLOSE: 'tty:close',
  DATA: 'tty:data',
  RESIZE: 'tty:resize',
  ERROR: 'tty:error',
  EXIT: 'tty:exit',
  READY: 'tty:ready',
} as const;

export type TtyMsgType = (typeof TTY_MSG)[keyof typeof TTY_MSG];

export const TtyOpenSchema = z.object({
  nodeId: z.string().min(1),
  sessionId: z.string().min(1).max(80),
  cols: z.number().int().min(10).max(500).default(80),
  rows: z.number().int().min(5).max(200).default(24),
  shell: z.string().max(200).optional(),
  cwd: z.string().max(500).optional(),
});
export type TtyOpen = z.infer<typeof TtyOpenSchema>;

export const TtyCloseSchema = z.object({ sessionId: z.string().min(1) });
export type TtyClose = z.infer<typeof TtyCloseSchema>;

export const TtyDataSchema = z.object({
  sessionId: z.string().min(1),
  data: z.string(),
});
export type TtyData = z.infer<typeof TtyDataSchema>;

export const TtyResizeSchema = z.object({
  sessionId: z.string().min(1),
  cols: z.number().int().min(10).max(500),
  rows: z.number().int().min(5).max(200),
});
export type TtyResize = z.infer<typeof TtyResizeSchema>;

export const TtyErrorSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string(),
});
export type TtyError = z.infer<typeof TtyErrorSchema>;

export const TtyExitSchema = z.object({
  sessionId: z.string().min(1),
  exitCode: z.number().nullable(),
  signal: z.string().nullable(),
});
export type TtyExit = z.infer<typeof TtyExitSchema>;

export const TtyReadySchema = z.object({ sessionId: z.string().min(1) });
export type TtyReady = z.infer<typeof TtyReadySchema>;

export type ParsedTtyMessage =
  | { type: 'OPEN'; data: TtyOpen }
  | { type: 'CLOSE'; data: TtyClose }
  | { type: 'DATA'; data: TtyData }
  | { type: 'RESIZE'; data: TtyResize }
  | { type: 'ERROR'; data: TtyError }
  | { type: 'EXIT'; data: TtyExit }
  | { type: 'READY'; data: TtyReady }
  | { type: 'UNKNOWN'; raw: unknown };

function formatZodError(context: string, err: z.ZodError): Error {
  const issues = err.issues
    .map((i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
  return new Error(`Invalid ${context} payload: ${issues}`);
}

export function parseTtyMessage(type: string, payload: unknown): ParsedTtyMessage {
  switch (type) {
    case TTY_MSG.OPEN: {
      const parsed = TtyOpenSchema.safeParse(payload);
      if (!parsed.success) throw formatZodError(TTY_MSG.OPEN, parsed.error);
      return { type: 'OPEN', data: parsed.data };
    }
    case TTY_MSG.CLOSE: {
      const parsed = TtyCloseSchema.safeParse(payload);
      if (!parsed.success) throw formatZodError(TTY_MSG.CLOSE, parsed.error);
      return { type: 'CLOSE', data: parsed.data };
    }
    case TTY_MSG.DATA: {
      const parsed = TtyDataSchema.safeParse(payload);
      if (!parsed.success) throw formatZodError(TTY_MSG.DATA, parsed.error);
      return { type: 'DATA', data: parsed.data };
    }
    case TTY_MSG.RESIZE: {
      const parsed = TtyResizeSchema.safeParse(payload);
      if (!parsed.success) throw formatZodError(TTY_MSG.RESIZE, parsed.error);
      return { type: 'RESIZE', data: parsed.data };
    }
    case TTY_MSG.ERROR: {
      const parsed = TtyErrorSchema.safeParse(payload);
      if (!parsed.success) throw formatZodError(TTY_MSG.ERROR, parsed.error);
      return { type: 'ERROR', data: parsed.data };
    }
    case TTY_MSG.EXIT: {
      const parsed = TtyExitSchema.safeParse(payload);
      if (!parsed.success) throw formatZodError(TTY_MSG.EXIT, parsed.error);
      return { type: 'EXIT', data: parsed.data };
    }
    case TTY_MSG.READY: {
      const parsed = TtyReadySchema.safeParse(payload);
      if (!parsed.success) throw formatZodError(TTY_MSG.READY, parsed.error);
      return { type: 'READY', data: parsed.data };
    }
    default:
      return { type: 'UNKNOWN', raw: payload };
  }
}
