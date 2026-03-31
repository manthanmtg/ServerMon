import { createLogger } from '@/lib/logger';
import { detectCommand, ShellExecutor } from '../shell-executor';

const log = createLogger('self-service:ssl-cert');

interface SslCertResult {
  success: boolean;
  logs: string[];
  skipped?: boolean;
  error?: string;
}

export async function runSslCertSetup(
  domain: string,
  mode: 'letsencrypt' | 'self-signed' | 'none',
  onLog: (line: string) => void,
): Promise<SslCertResult> {
  const logs: string[] = [];

  if (mode === 'none') {
    const msg = 'SSL disabled — skipping certificate provisioning.';
    onLog(msg);
    logs.push(msg);
    return { success: true, logs, skipped: true };
  }

  if (mode === 'self-signed') {
    return runSelfSignedCert(domain, onLog);
  }

  return runLetsEncrypt(domain, onLog);
}

async function runLetsEncrypt(
  domain: string,
  onLog: (line: string) => void,
): Promise<SslCertResult> {
  const logs: string[] = [];
  const shell = new ShellExecutor();

  onLog('Provisioning SSL certificate via Let\'s Encrypt...');
  logs.push('Provisioning SSL certificate via Let\'s Encrypt...');

  const certbotCheck = await detectCommand('which certbot');
  if (!certbotCheck.found) {
    const msg = 'certbot not found — cannot provision Let\'s Encrypt certificate.';
    onLog(msg);
    logs.push(msg);
    log.error(msg);
    return { success: false, logs, error: msg };
  }

  const cmd = `certbot --nginx -d ${domain} --non-interactive --agree-tos --register-unsafely-without-email`;
  onLog(`$ ${cmd}`);
  logs.push(`$ ${cmd}`);

  const result = await shell.execute(
    { method: 'shell', commands: [cmd] },
    (line) => {
      logs.push(line);
      onLog(line);
    },
  );

  if (!result.success) {
    const msg = `Let's Encrypt certificate provisioning failed for ${domain}`;
    onLog(msg);
    logs.push(msg);
    log.error(msg, result.error);
    return { success: false, logs, error: result.error || msg };
  }

  const msg = `SSL certificate provisioned for ${domain} via Let's Encrypt.`;
  onLog(msg);
  logs.push(msg);
  return { success: true, logs };
}

async function runSelfSignedCert(
  domain: string,
  onLog: (line: string) => void,
): Promise<SslCertResult> {
  const logs: string[] = [];
  const shell = new ShellExecutor();

  onLog('Generating self-signed SSL certificate...');
  logs.push('Generating self-signed SSL certificate...');

  const certDir = `/etc/ssl/self-signed`;
  const commands = [
    `mkdir -p ${certDir}`,
    `openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout ${certDir}/${domain}.key -out ${certDir}/${domain}.crt -subj "/CN=${domain}/O=ServerMon Self-Signed"`,
  ];

  for (const cmd of commands) {
    const result = await shell.execute(
      { method: 'shell', commands: [cmd] },
      (line) => {
        logs.push(line);
        onLog(line);
      },
    );

    if (!result.success) {
      const msg = 'Self-signed certificate generation failed.';
      onLog(msg);
      logs.push(msg);
      log.error(msg, result.error);
      return { success: false, logs, error: result.error || msg };
    }
  }

  const msg = `Self-signed SSL certificate generated for ${domain}.`;
  onLog(msg);
  logs.push(msg);
  return { success: true, logs };
}

export async function rollbackSslCert(
  domain: string,
  onLog: (line: string) => void,
): Promise<void> {
  onLog(`Rolling back SSL certificate for ${domain}...`);

  const certbotCheck = await detectCommand('which certbot');
  if (certbotCheck.found) {
    const shell = new ShellExecutor();
    await shell.execute(
      { method: 'shell', commands: [`certbot delete --cert-name ${domain} --non-interactive || true`] },
      (line) => onLog(line),
    );
  }

  const shell = new ShellExecutor();
  await shell.execute(
    { method: 'shell', commands: [`rm -f /etc/ssl/self-signed/${domain}.key /etc/ssl/self-signed/${domain}.crt`] },
    (line) => onLog(line),
  );
}
