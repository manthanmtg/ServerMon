/** @vitest-environment node */
import { describe, it, expect, vi } from 'vitest';
import { AgentClient } from './agentClient';

function mkOkResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function mkInvalidJsonResponse(): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => {
      throw new Error('Invalid JSON');
    },
    text: async () => 'not a json',
  } as unknown as Response;
}

describe('AgentClient Resilience', () => {
  it('start() handles invalid JSON in pair response gracefully', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request): Promise<Response> => {
      const u = typeof url === 'string' ? url : url.toString();
      if (u.endsWith('/pair')) {
        return mkInvalidJsonResponse();
      }
      return mkOkResponse({});
    });

    const client = new AgentClient({
      hubUrl: 'https://hub.example.com',
      pairingToken: 'pair-token',
      nodeId: 'node-1',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.start()).rejects.toThrow('pair-failed: invalid-payload');
    expect(client.status().lastError).toBe('pair-failed: invalid-payload');
  });

  it('handleCommand handles invalid command payloads gracefully', async () => {
    const logEntry = vi.fn();
    const client = new AgentClient({
      hubUrl: 'https://hub.example.com',
      pairingToken: 'pair-token',
      nodeId: 'node-1',
      logEntry,
    });

    // Accessing private handleCommand for testing
    // @ts-expect-error - testing private method
    await client.handleCommand(null);
    expect(logEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.command.invalid',
      })
    );

    logEntry.mockClear();
    // @ts-expect-error - testing private method
    await client.handleCommand({});
    expect(logEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'agent.command.invalid',
      })
    );
  });
});
