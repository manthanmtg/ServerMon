type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL = LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'];

function ts(): string {
    return new Date().toISOString();
}

function format(level: LogLevel, context: string, message: string, data?: unknown): string {
    const base = `${ts()} [${level.toUpperCase()}] [${context}] ${message}`;
    if (data !== undefined) {
        const serialized = data instanceof Error
            ? `${data.message}\n${data.stack}`
            : JSON.stringify(data);
        return `${base} ${serialized}`;
    }
    return base;
}

function createLogger(context: string) {
    return {
        debug: (msg: string, data?: unknown) => {
            if (MIN_LEVEL <= LEVELS.debug) console.debug(format('debug', context, msg, data));
        },
        info: (msg: string, data?: unknown) => {
            if (MIN_LEVEL <= LEVELS.info) console.info(format('info', context, msg, data));
        },
        warn: (msg: string, data?: unknown) => {
            if (MIN_LEVEL <= LEVELS.warn) console.warn(format('warn', context, msg, data));
        },
        error: (msg: string, data?: unknown) => {
            if (MIN_LEVEL <= LEVELS.error) console.error(format('error', context, msg, data));
        },
    };
}

export { createLogger };
export type { LogLevel };
