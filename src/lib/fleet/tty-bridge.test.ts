import { describe, it, expect } from 'vitest';
import {
  TTY_MSG,
  TtyOpenSchema,
  TtyCloseSchema,
  TtyDataSchema,
  TtyResizeSchema,
  TtyErrorSchema,
  TtyExitSchema,
  TtyReadySchema,
  parseTtyMessage,
} from './tty-bridge';

describe('TTY_MSG constants', () => {
  it('exposes the expected string message types', () => {
    expect(TTY_MSG).toEqual({
      OPEN: 'tty:open',
      CLOSE: 'tty:close',
      DATA: 'tty:data',
      RESIZE: 'tty:resize',
      ERROR: 'tty:error',
      EXIT: 'tty:exit',
      READY: 'tty:ready',
    });
  });
});

describe('TtyOpenSchema', () => {
  it('parses a minimal valid payload with defaults', () => {
    const parsed = TtyOpenSchema.parse({
      nodeId: 'node-1',
      sessionId: 'sess-1',
    });
    expect(parsed).toEqual({
      nodeId: 'node-1',
      sessionId: 'sess-1',
      cols: 80,
      rows: 24,
    });
  });

  it('accepts a fully specified payload', () => {
    const parsed = TtyOpenSchema.parse({
      nodeId: 'node-1',
      sessionId: 'sess-1',
      cols: 120,
      rows: 40,
      shell: '/bin/zsh',
      cwd: '/home/user',
    });
    expect(parsed.cols).toBe(120);
    expect(parsed.rows).toBe(40);
    expect(parsed.shell).toBe('/bin/zsh');
    expect(parsed.cwd).toBe('/home/user');
  });

  it('rejects empty nodeId', () => {
    expect(() => TtyOpenSchema.parse({ nodeId: '', sessionId: 'sess-1' })).toThrow();
  });

  it('rejects empty sessionId', () => {
    expect(() => TtyOpenSchema.parse({ nodeId: 'node-1', sessionId: '' })).toThrow();
  });

  it('rejects sessionId longer than 80 chars', () => {
    expect(() => TtyOpenSchema.parse({ nodeId: 'node-1', sessionId: 'x'.repeat(81) })).toThrow();
  });

  it('rejects cols below 10', () => {
    expect(() => TtyOpenSchema.parse({ nodeId: 'node-1', sessionId: 'sess-1', cols: 1 })).toThrow();
  });

  it('rejects cols above 500', () => {
    expect(() =>
      TtyOpenSchema.parse({ nodeId: 'node-1', sessionId: 'sess-1', cols: 501 })
    ).toThrow();
  });

  it('rejects rows below 5', () => {
    expect(() => TtyOpenSchema.parse({ nodeId: 'node-1', sessionId: 'sess-1', rows: 1 })).toThrow();
  });

  it('rejects rows above 200', () => {
    expect(() =>
      TtyOpenSchema.parse({ nodeId: 'node-1', sessionId: 'sess-1', rows: 201 })
    ).toThrow();
  });

  it('rejects non-integer cols', () => {
    expect(() =>
      TtyOpenSchema.parse({ nodeId: 'node-1', sessionId: 'sess-1', cols: 80.5 })
    ).toThrow();
  });

  it('rejects shell longer than 200 chars', () => {
    expect(() =>
      TtyOpenSchema.parse({ nodeId: 'node-1', sessionId: 'sess-1', shell: 'a'.repeat(201) })
    ).toThrow();
  });

  it('rejects cwd longer than 500 chars', () => {
    expect(() =>
      TtyOpenSchema.parse({ nodeId: 'node-1', sessionId: 'sess-1', cwd: 'a'.repeat(501) })
    ).toThrow();
  });
});

describe('TtyCloseSchema', () => {
  it('accepts a valid sessionId', () => {
    expect(TtyCloseSchema.parse({ sessionId: 'sess-1' })).toEqual({ sessionId: 'sess-1' });
  });

  it('rejects missing sessionId', () => {
    expect(() => TtyCloseSchema.parse({})).toThrow();
  });

  it('rejects empty sessionId', () => {
    expect(() => TtyCloseSchema.parse({ sessionId: '' })).toThrow();
  });
});

describe('TtyDataSchema', () => {
  it('accepts empty-string data for a valid session', () => {
    expect(TtyDataSchema.parse({ sessionId: 'sess-1', data: '' })).toEqual({
      sessionId: 'sess-1',
      data: '',
    });
  });

  it('accepts arbitrary string data', () => {
    expect(TtyDataSchema.parse({ sessionId: 'sess-1', data: 'ls -la\r\n' })).toEqual({
      sessionId: 'sess-1',
      data: 'ls -la\r\n',
    });
  });

  it('rejects missing data field', () => {
    expect(() => TtyDataSchema.parse({ sessionId: 'sess-1' })).toThrow();
  });

  it('rejects non-string data', () => {
    expect(() => TtyDataSchema.parse({ sessionId: 'sess-1', data: 123 })).toThrow();
  });
});

describe('TtyResizeSchema', () => {
  it('accepts a valid resize payload', () => {
    expect(TtyResizeSchema.parse({ sessionId: 'sess-1', cols: 120, rows: 40 })).toEqual({
      sessionId: 'sess-1',
      cols: 120,
      rows: 40,
    });
  });

  it('rejects cols above 500', () => {
    expect(() => TtyResizeSchema.parse({ sessionId: 'sess-1', cols: 501, rows: 40 })).toThrow();
  });

  it('rejects rows below 5', () => {
    expect(() => TtyResizeSchema.parse({ sessionId: 'sess-1', cols: 80, rows: 1 })).toThrow();
  });
});

describe('TtyErrorSchema', () => {
  it('accepts valid error payload', () => {
    expect(TtyErrorSchema.parse({ sessionId: 'sess-1', message: 'boom' })).toEqual({
      sessionId: 'sess-1',
      message: 'boom',
    });
  });

  it('rejects missing message', () => {
    expect(() => TtyErrorSchema.parse({ sessionId: 'sess-1' })).toThrow();
  });
});

describe('TtyExitSchema', () => {
  it('accepts numeric exitCode and string signal', () => {
    expect(TtyExitSchema.parse({ sessionId: 'sess-1', exitCode: 0, signal: null })).toEqual({
      sessionId: 'sess-1',
      exitCode: 0,
      signal: null,
    });
  });

  it('accepts null exitCode and signal', () => {
    expect(TtyExitSchema.parse({ sessionId: 'sess-1', exitCode: null, signal: 'SIGTERM' })).toEqual(
      { sessionId: 'sess-1', exitCode: null, signal: 'SIGTERM' }
    );
  });

  it('rejects missing exitCode/signal', () => {
    expect(() => TtyExitSchema.parse({ sessionId: 'sess-1' })).toThrow();
  });
});

describe('TtyReadySchema', () => {
  it('accepts valid ready payload', () => {
    expect(TtyReadySchema.parse({ sessionId: 'sess-1' })).toEqual({ sessionId: 'sess-1' });
  });

  it('rejects empty sessionId', () => {
    expect(() => TtyReadySchema.parse({ sessionId: '' })).toThrow();
  });
});

describe('parseTtyMessage', () => {
  it('dispatches OPEN messages', () => {
    const result = parseTtyMessage(TTY_MSG.OPEN, { nodeId: 'n', sessionId: 's' });
    expect(result.type).toBe('OPEN');
    if (result.type === 'OPEN') {
      expect(result.data.cols).toBe(80);
      expect(result.data.rows).toBe(24);
    }
  });

  it('dispatches CLOSE messages', () => {
    const result = parseTtyMessage(TTY_MSG.CLOSE, { sessionId: 's' });
    expect(result.type).toBe('CLOSE');
    if (result.type === 'CLOSE') expect(result.data.sessionId).toBe('s');
  });

  it('dispatches DATA messages', () => {
    const result = parseTtyMessage(TTY_MSG.DATA, { sessionId: 's', data: 'ls' });
    expect(result.type).toBe('DATA');
    if (result.type === 'DATA') expect(result.data.data).toBe('ls');
  });

  it('dispatches RESIZE messages', () => {
    const result = parseTtyMessage(TTY_MSG.RESIZE, { sessionId: 's', cols: 100, rows: 30 });
    expect(result.type).toBe('RESIZE');
    if (result.type === 'RESIZE') expect(result.data.cols).toBe(100);
  });

  it('dispatches ERROR messages', () => {
    const result = parseTtyMessage(TTY_MSG.ERROR, { sessionId: 's', message: 'oops' });
    expect(result.type).toBe('ERROR');
    if (result.type === 'ERROR') expect(result.data.message).toBe('oops');
  });

  it('dispatches EXIT messages', () => {
    const result = parseTtyMessage(TTY_MSG.EXIT, {
      sessionId: 's',
      exitCode: 0,
      signal: null,
    });
    expect(result.type).toBe('EXIT');
    if (result.type === 'EXIT') expect(result.data.exitCode).toBe(0);
  });

  it('dispatches READY messages', () => {
    const result = parseTtyMessage(TTY_MSG.READY, { sessionId: 's' });
    expect(result.type).toBe('READY');
    if (result.type === 'READY') expect(result.data.sessionId).toBe('s');
  });

  it('returns UNKNOWN for unrecognized type', () => {
    const result = parseTtyMessage('not-a-real-type', { foo: 'bar' });
    expect(result.type).toBe('UNKNOWN');
    if (result.type === 'UNKNOWN') expect(result.raw).toEqual({ foo: 'bar' });
  });

  it('throws a clear error on malformed OPEN payload', () => {
    expect(() => parseTtyMessage(TTY_MSG.OPEN, { nodeId: '', sessionId: 's' })).toThrow(
      /Invalid tty:open payload/
    );
  });

  it('throws a clear error on malformed DATA payload', () => {
    expect(() => parseTtyMessage(TTY_MSG.DATA, { sessionId: 's' })).toThrow(
      /Invalid tty:data payload/
    );
  });
});
