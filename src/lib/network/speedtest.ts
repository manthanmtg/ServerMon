import { createLogger } from '@/lib/logger';
import { spawn } from 'child_process';

const log = createLogger('speedtest');

export interface SpeedtestProgress {
  type: 'ping' | 'download' | 'upload' | 'result' | 'error';
  progress: number; // 0 to 1
  speed?: number; // bytes per second
  ping_ms?: number;
  jitter?: number;
  isp?: string;
  server?: string;
  location?: string;
  error?: string;
}

export interface SpeedtestResult {
  ping: number;
  jitter: number;
  speed: number; // Download speed in Mbps
  isp: string;
  server: string;
  location: string;
}

// Lazy load speedtest-net (Ookla)
async function getOoklaSpeedTest() {
  try {
    const mod = await import('speedtest-net');
    return mod.default;
  } catch (error) {
    log.error('Failed to load speedtest-net:', error);
    return null;
  }
}

// Lazy load fast-speedtest-api (Fast.com)
async function getFastSpeedTest() {
  try {
    const FastSpeedtest = await import('fast-speedtest-api');
    return FastSpeedtest.default;
  } catch (error) {
    log.error('Failed to load fast-speedtest-api:', error);
    return null;
  }
}

export class SpeedtestService {
  private static instance: SpeedtestService;
  private isMock = process.env.SPEEDTEST_MOCK === 'true' || process.env.NEXT_RUNTIME === 'edge';
  private isRunning = false;

  private constructor() {}

  public static getInstance(): SpeedtestService {
    if (!SpeedtestService.instance) {
      SpeedtestService.instance = new SpeedtestService();
    }
    return SpeedtestService.instance;
  }

  public async runTest(
    onProgress?: (progress: SpeedtestProgress) => void
  ): Promise<SpeedtestResult> {
    if (this.isRunning) {
      onProgress?.({ type: 'error', progress: 0, error: 'Test already in progress' });
      throw new Error('Test already in progress');
    }

    this.isRunning = true;

    try {
      if (this.isMock) {
        return await this.runMockTest(onProgress);
      }

      // Attempt Ookla (npm library) first
      try {
        return await this.runOoklaTest(onProgress);
      } catch (ooklaError: unknown) {
        const message = ooklaError instanceof Error ? ooklaError.message : String(ooklaError);
        log.warn('Ookla npm library failed or not supported, trying system binary:', message);

        // Fallback to system CLI
        try {
          return await this.runSystemOoklaTest(onProgress);
        } catch (systemError: unknown) {
          const sysMessage =
            systemError instanceof Error ? systemError.message : String(systemError);
          log.error('System Ookla CLI failed:', sysMessage);

          // Final fallback to Fast.com
          log.warn('Both Ookla methods failed, falling back to Fast.com');
          return await this.runFastTest(onProgress);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error('Speedtest failed:', message);
      onProgress?.({ type: 'error', progress: 0, error: message });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async runSystemOoklaTest(
    onProgress?: (progress: SpeedtestProgress) => void
  ): Promise<SpeedtestResult> {
    return new Promise((resolve, reject) => {
      log.info('Starting System Ookla CLI Speedtest...');

      // Accept license automatically
      const cp = spawn('speedtest', ['--format=json', '--accept-license', '--accept-gdpr']);

      let lastResult: {
        ping?: { latency: number; jitter: number };
        download?: { bandwidth: number };
        isp?: string;
        server?: { name: string; location: string };
      } | null = null;

      cp.stdout.on('data', (data) => {
        try {
          const lines = data.toString().trim().split('\n');
          for (const line of lines) {
            const parsed = JSON.parse(line);

            // speedtest cli outputs different types of lines
            if (parsed.type === 'ping') {
              onProgress?.({ type: 'ping', progress: parsed.progress ?? 0.1 });
            } else if (parsed.type === 'download') {
              onProgress?.({
                type: 'download',
                progress: parsed.progress ?? 0.5,
                speed: (parsed.download?.bandwidth ?? 0) * 8,
              });
            } else if (parsed.type === 'upload') {
              onProgress?.({
                type: 'upload',
                progress: parsed.progress ?? 0.8,
                speed: (parsed.upload?.bandwidth ?? 0) * 8,
              });
            } else if (parsed.type === 'result') {
              lastResult = parsed;
            }
          }
        } catch (_error) {
          // Ignore non-json lines or partial lines
        }
      });

      cp.stderr.on('data', (data) => {
        log.warn(`Speedtest CLI stderr: ${data.toString()}`);
      });

      cp.on('close', (code) => {
        if (code !== 0 || !lastResult) {
          return reject(new Error(`Speedtest CLI exited with code ${code}`));
        }

        const finalResult: SpeedtestResult = {
          ping: lastResult.ping?.latency ?? 0,
          jitter: lastResult.ping?.jitter ?? 0,
          speed: ((lastResult.download?.bandwidth ?? 0) * 8) / 1_000_000,
          isp: lastResult.isp ?? 'Unknown',
          server: lastResult.server?.name ?? 'Unknown',
          location: lastResult.server?.location ?? 'Unknown',
        };

        onProgress?.({
          type: 'result',
          progress: 1,
          speed: (finalResult.speed * 1_000_000) / 8,
          ping_ms: finalResult.ping,
          jitter: finalResult.jitter,
          isp: finalResult.isp,
          server: finalResult.server,
          location: finalResult.location,
        });

        resolve(finalResult);
      });

      cp.on('error', (err) => {
        reject(err);
      });
    });
  }

  private async runOoklaTest(
    onProgress?: (progress: SpeedtestProgress) => void
  ): Promise<SpeedtestResult> {
    const speedTest = await getOoklaSpeedTest();
    if (!speedTest) throw new Error('Ookla Speedtest library not available');

    log.info('Starting Ookla Speedtest...');
    const result = await speedTest({
      acceptLicense: true,
      acceptGdpr: true,
      progress: (progress: unknown) => {
        const data = progress as {
          type: string;
          progress: number;
          download?: { bandwidth: number };
          upload?: { bandwidth: number };
        };
        if (data.type === 'ping') {
          onProgress?.({ type: 'ping', progress: data.progress });
        } else if (data.type === 'download') {
          onProgress?.({
            type: 'download',
            progress: data.progress,
            speed: (data.download?.bandwidth ?? 0) * 8,
          });
        } else if (data.type === 'upload') {
          onProgress?.({
            type: 'upload',
            progress: data.progress,
            speed: (data.upload?.bandwidth ?? 0) * 8,
          });
        }
      },
    });

    const res = result as {
      ping?: { latency: number; jitter: number };
      download?: { bandwidth: number };
      isp?: string;
      server?: { name: string; location: string };
    };

    const finalResult: SpeedtestResult = {
      ping: res.ping?.latency ?? 0,
      jitter: res.ping?.jitter ?? 0,
      speed: ((res.download?.bandwidth ?? 0) * 8) / 1_000_000,
      isp: res.isp ?? 'Unknown',
      server: res.server?.name ?? 'Unknown',
      location: res.server?.location ?? 'Unknown',
    };

    onProgress?.({
      type: 'result',
      progress: 1,
      speed: (finalResult.speed * 1_000_000) / 8,
      ping_ms: finalResult.ping,
      jitter: finalResult.jitter,
      isp: finalResult.isp,
      server: finalResult.server,
      location: finalResult.location,
    });

    return finalResult;
  }

  private async fetchFastToken(): Promise<string> {
    try {
      const response = await fetch('https://fast.com/');
      const html = await response.text();
      const jsMatch = html.match(/\/app-[a-f0-9]+\.js/);
      if (!jsMatch) throw new Error('Could not find Fast.com app JS');

      const jsResponse = await fetch(`https://fast.com${jsMatch[0]}`);
      const js = await jsResponse.text();
      const tokenMatch = js.match(/token:"([a-zA-Z0-9]+)"/);
      if (!tokenMatch) throw new Error('Could not find Fast.com token');

      return tokenMatch[1];
    } catch (error) {
      log.error('Failed to fetch Fast.com token:', error);
      return 'YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm'; // Fallback to last known good token
    }
  }

  private async runFastTest(
    onProgress?: (progress: SpeedtestProgress) => void
  ): Promise<SpeedtestResult> {
    const FastSpeedtest = await getFastSpeedTest();
    if (!FastSpeedtest) throw new Error('Fast.com library not available');

    log.info('Starting Fast.com Speedtest...');

    onProgress?.({ type: 'ping', progress: 0.5 });

    const token = await this.fetchFastToken();
    const speedtest = new FastSpeedtest({
      token: token,
      verbose: false,
      bufferSize: 8,
      unit: FastSpeedtest.UNITS.Mbps,
    });

    const speedMbps = await speedtest.getSpeed();

    const result: SpeedtestResult = {
      ping: 0,
      jitter: 0,
      speed: speedMbps,
      isp: 'Fast.com (Netflix)',
      server: 'Optimal Fast.com Server',
      location: 'Nearby',
    };

    onProgress?.({
      type: 'result',
      progress: 1,
      speed: (result.speed * 1_000_000) / 8,
      ping_ms: result.ping,
      jitter: result.jitter,
      isp: result.isp,
      server: result.server,
      location: result.location,
    });

    return result;
  }

  private async runMockTest(
    onProgress?: (progress: SpeedtestProgress) => void
  ): Promise<SpeedtestResult> {
    log.info('Running mock speedtest...');

    onProgress?.({ type: 'ping', progress: 0.5 });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    for (let i = 0; i <= 10; i++) {
      onProgress?.({
        type: 'download',
        progress: i / 10,
        speed: ((50 + Math.random() * 20) * 1_000_000) / 8,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    for (let i = 0; i <= 10; i++) {
      onProgress?.({
        type: 'upload',
        progress: i / 10,
        speed: ((20 + Math.random() * 10) * 1_000_000) / 8,
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    const result: SpeedtestResult = {
      ping: 12,
      jitter: 2,
      speed: 65.4,
      isp: 'Mock ISP',
      server: 'Mock Server',
      location: 'San Francisco, CA',
    };

    onProgress?.({
      type: 'result',
      progress: 1,
      speed: (result.speed * 1_000_000) / 8,
      ping_ms: result.ping,
      jitter: result.jitter,
      isp: result.isp,
      server: result.server,
      location: result.location,
    });

    return result;
  }
}
