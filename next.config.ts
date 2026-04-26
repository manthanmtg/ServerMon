import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['systeminformation', 'node-pty', 'argon2', 'mongoose'],
  turbopack: {
    resolveAlias: {
      fs: { browser: '' },
      child_process: { browser: '' },
      net: { browser: '' },
      tls: { browser: '' },
    },
  },
};

export default nextConfig;
