import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLogger } from '@/lib/logger';
import type {
    CertbotCertificate,
    CertbotTimer,
    CertificatesSnapshot,
} from '@/modules/certificates/types';

const execFileAsync = promisify(execFile);
const log = createLogger('certificates');

async function execCmd(cmd: string, args: string[], timeoutMs = 15000): Promise<string> {
    try {
        const { stdout } = await execFileAsync(cmd, args, { timeout: timeoutMs, maxBuffer: 5 * 1024 * 1024 });
        return stdout;
    } catch (err: unknown) {
        const error = err as { stdout?: string };
        if (error.stdout) return error.stdout;
        throw err;
    }
}

const COMMON_CERTBOT_PATHS = [
    'certbot', // default in PATH
    '/snap/bin/certbot',
    '/usr/bin/certbot',
    '/usr/local/bin/certbot',
    '/opt/homebrew/bin/certbot', // for local dev on mac if needed
];

let certbotChecked = false;
let certbotPath: string | null = null;

async function checkCertbot(): Promise<boolean> {
    if (certbotChecked) return certbotPath !== null;

    for (const path of COMMON_CERTBOT_PATHS) {
        try {
            await execCmd(path, ['--version'], 5000);
            certbotPath = path;
            log.info(`certbot detected at: ${path}`);
            break;
        } catch (err: unknown) {
            // only log if it was an actual execution error, not "not found"
            const error = err as { message?: string; code?: string };
            if (error.code !== 'ENOENT') {
                log.warn(`Failed to execute certbot at ${path}: ${error.message}`);
            }
        }
    }

    if (!certbotPath) {
        log.warn('certbot not found in any common locations');
    }

    certbotChecked = true;
    return certbotPath !== null;
}

function parseDaysUntilExpiry(expiryDateStr: string): number {
    const expiry = new Date(expiryDateStr);
    const now = new Date();
    return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

async function getCertbotCertificates(): Promise<CertbotCertificate[]> {
    const certs: CertbotCertificate[] = [];

    try {
        if (!certbotPath) throw new Error('certbot path not initialized');
        const raw = await execCmd(certbotPath, ['certificates', '--no-color']);
        const blocks = raw.split('Certificate Name:');

        for (const block of blocks.slice(1)) {
            const lines = block.split('\n');
            const name = lines[0]?.trim() || '';
            const domainsMatch = block.match(/Domains:\s*(.+)/);
            const expiryMatch = block.match(/Expiry Date:\s*([^\(]+)/);
            const certPathMatch = block.match(/Certificate Path:\s*(.+)/);
            const keyPathMatch = block.match(/Private Key Path:\s*(.+)/);

            const domains = domainsMatch?.[1]?.trim().split(/\s+/) || [name];
            const expiryDate = expiryMatch?.[1]?.trim() || '';
            const daysUntilExpiry = expiryDate ? parseDaysUntilExpiry(expiryDate) : 0;

            certs.push({
                name,
                domains,
                expiryDate,
                certPath: certPathMatch?.[1]?.trim() || '',
                keyPath: keyPathMatch?.[1]?.trim() || '',
                chainPath: '',
                daysUntilExpiry,
                isExpired: daysUntilExpiry < 0,
                isExpiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= 30,
            });
        }
    } catch (err) {
        log.error('Failed to list certbot certificates', err);
    }

    return certs;
}

async function getCertbotTimer(): Promise<CertbotTimer | null> {
    if (process.platform !== 'linux') return null;

    try {
        const raw = await execCmd('systemctl', ['list-timers', '--no-pager', '--no-legend']);
        const lines = raw.split('\n');
        for (const line of lines) {
            if (line.includes('certbot') || line.includes('snap.certbot')) {
                const parts = line.trim().split(/\s{2,}/);
                return {
                    enabled: true,
                    lastRun: parts[2] || '',
                    nextRun: parts[0] || '',
                    active: true,
                };
            }
        }
    } catch {
        // systemctl not available
    }

    return null;
}

function getMockData(): CertificatesSnapshot {
    const now = new Date();
    const in45d = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString();
    const in12d = new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000).toISOString();
    const expired = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();

    return {
        timestamp: now.toISOString(),
        source: 'mock',
        certbotAvailable: false,
        certbotTimer: { enabled: true, lastRun: '2 days ago', nextRun: 'in 10 hours', active: true },
        certificates: [
            {
                name: 'example.com',
                domains: ['example.com', 'www.example.com'],
                expiryDate: in45d,
                certPath: '/etc/letsencrypt/live/example.com/fullchain.pem',
                keyPath: '/etc/letsencrypt/live/example.com/privkey.pem',
                chainPath: '/etc/letsencrypt/live/example.com/chain.pem',
                daysUntilExpiry: 45,
                isExpired: false,
                isExpiringSoon: false,
            },
            {
                name: 'api.example.com',
                domains: ['api.example.com'],
                expiryDate: in12d,
                certPath: '/etc/letsencrypt/live/api.example.com/fullchain.pem',
                keyPath: '/etc/letsencrypt/live/api.example.com/privkey.pem',
                chainPath: '/etc/letsencrypt/live/api.example.com/chain.pem',
                daysUntilExpiry: 12,
                isExpired: false,
                isExpiringSoon: true,
            },
            {
                name: 'old.example.com',
                domains: ['old.example.com'],
                expiryDate: expired,
                certPath: '/etc/letsencrypt/live/old.example.com/fullchain.pem',
                keyPath: '/etc/letsencrypt/live/old.example.com/privkey.pem',
                chainPath: '/etc/letsencrypt/live/old.example.com/chain.pem',
                daysUntilExpiry: -5,
                isExpired: true,
                isExpiringSoon: false,
            },
        ],
        summary: {
            total: 3,
            valid: 1,
            expiringSoon: 1,
            expired: 1,
            nearestExpiry: 12,
            nearestDomain: 'api.example.com',
        },
    };
}

async function getSnapshot(): Promise<CertificatesSnapshot> {
    const available = await checkCertbot();

    if (!available) {
        log.warn('certbot not available, returning mock data');
        return getMockData();
    }

    try {
        const [certificates, certbotTimer] = await Promise.all([
            getCertbotCertificates(),
            getCertbotTimer(),
        ]);

        if (certificates.length === 0) {
            return getMockData();
        }

        const valid = certificates.filter(c => !c.isExpired && !c.isExpiringSoon).length;
        const expiringSoon = certificates.filter(c => c.isExpiringSoon).length;
        const expired = certificates.filter(c => c.isExpired).length;
        const nonExpired = certificates.filter(c => !c.isExpired);
        const nearest = nonExpired.length > 0
            ? nonExpired.reduce((min, c) => c.daysUntilExpiry < min.daysUntilExpiry ? c : min)
            : null;

        return {
            timestamp: new Date().toISOString(),
            source: 'live',
            certbotAvailable: true,
            certbotTimer,
            certificates,
            summary: {
                total: certificates.length,
                valid,
                expiringSoon,
                expired,
                nearestExpiry: nearest?.daysUntilExpiry ?? null,
                nearestDomain: nearest?.name ?? null,
            },
        };
    } catch (err) {
        log.error('Failed to get certificates snapshot', err);
        return getMockData();
    }
}

async function renewCertificate(domain: string): Promise<{ success: boolean; output: string }> {
    try {
        if (!certbotPath) throw new Error('certbot path not initialized');
        const raw = await execCmd(certbotPath, ['renew', '--cert-name', domain, '--no-color'], 60000);
        return { success: true, output: raw };
    } catch (err: unknown) {
        const error = err as { stderr?: string; message?: string };
        return { success: false, output: error.stderr || error.message || 'Unknown error' };
    }
}

export const certificatesService = {
    getSnapshot,
    renewCertificate,
};
