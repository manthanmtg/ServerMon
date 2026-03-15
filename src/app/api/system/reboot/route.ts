import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@/lib/logger';

const execAsync = promisify(exec);
const logger = createLogger('api:system:reboot');

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    logger.warn('System reboot requested via API');

    // In a real environment, this would trigger a system reboot.
    // We'll execute it asynchronously so we can return a response before the system goes down.
    // Note: The app user must have sudo permissions for 'reboot' without a password.

    // For development/safety, we might want to log the command instead of running it
    // unless explicitly in a production-like environment.
    if (process.env.NODE_ENV === 'production') {
      execAsync('sudo reboot').catch((err) => {
        logger.error(`Failed to execute reboot command: ${err.message}`);
      });
    } else {
      logger.info('Simulating reboot in development mode');
    }

    return NextResponse.json({
      message: 'Reboot command issued successfully. The system will restart shortly.',
      status: 'success',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Reboot error: ${message}`);
    return NextResponse.json(
      { error: 'Failed to issue reboot command', details: message },
      { status: 500 }
    );
  }
}
