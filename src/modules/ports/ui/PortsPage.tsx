'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Cable,
  Filter,
  LoaderCircle,
  Radio,
  RefreshCw,
  Search,
  Server,
  Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PortsSnapshot } from '../types';
import { PortAvailabilityChecker } from './PortAvailabilityChecker';

type ProtocolFilter = 'all' | 'tcp' | 'udp';

const WELL_KNOWN: Record<number, string> = {
  21: 'FTP',
  22: 'SSH',
  25: 'SMTP',
  53: 'DNS',
  80: 'HTTP',
  110: 'POP3',
  143: 'IMAP',
  443: 'HTTPS',
  465: 'SMTPS',
  587: 'Submission',
  993: 'IMAPS',
  995: 'POP3S',
  3000: 'Dev Server',
  3306: 'MySQL',
  5432: 'PostgreSQL',
  5672: 'RabbitMQ',
  6379: 'Redis',
  8080: 'HTTP Alt',
  8443: 'HTTPS Alt',
  8912: 'ServerMon',
  9090: 'Prometheus',
  9200: 'Elasticsearch',
  27017: 'MongoDB',
};

type ListeningPort = PortsSnapshot['listening'][number];

type SearchableListeningPort = ListeningPort & {
  processLower: string;
  addressLower: string;
  userLower: string;
  stateLower: string;
  protocolLower: string;
  wellKnownLower: string;
  pidText: string;
};

export function getFilteredListeningPorts(
  listening: ReadonlyArray<ListeningPort | SearchableListeningPort>,
  protocolFilter: ProtocolFilter,
  query: string
): ListeningPort[] {
  return listening
    .filter((entry) => {
      const protocolLower =
        'protocolLower' in entry ? entry.protocolLower : entry.protocol.toLowerCase();
      if (protocolFilter === 'tcp' && !protocolLower.startsWith('tcp')) return false;
      if (protocolFilter === 'udp' && !protocolLower.startsWith('udp')) return false;
      if (!query) return true;
      const processLower =
        'processLower' in entry ? entry.processLower : entry.process.toLowerCase();
      const addressLower =
        'addressLower' in entry ? entry.addressLower : entry.address.toLowerCase();
      const userLower = 'userLower' in entry ? entry.userLower : entry.user.toLowerCase();
      const stateLower = 'stateLower' in entry ? entry.stateLower : entry.state.toLowerCase();
      const wellKnownLower =
        'wellKnownLower' in entry
          ? entry.wellKnownLower
          : (WELL_KNOWN[entry.port] || '').toLowerCase();
      const pidText = 'pidText' in entry ? entry.pidText : String(entry.pid ?? '');

      return (
        entry.port.toString().includes(query) ||
        processLower.includes(query) ||
        addressLower.includes(query) ||
        userLower.includes(query) ||
        stateLower.includes(query) ||
        pidText.includes(query) ||
        wellKnownLower.includes(query)
      );
    })
    .sort((left, right) => left.port - right.port);
}

function buildSearchableListeningPorts(listening: ListeningPort[]): SearchableListeningPort[] {
  return listening.map((port) => ({
    ...port,
    processLower: port.process.toLowerCase(),
    addressLower: port.address.toLowerCase(),
    userLower: port.user.toLowerCase(),
    stateLower: port.state.toLowerCase(),
    protocolLower: port.protocol.toLowerCase(),
    wellKnownLower: (WELL_KNOWN[port.port] || '').toLowerCase(),
    pidText: String(port.pid ?? ''),
  }));
}

export default function PortsPage() {
  const [snapshot, setSnapshot] = useState<PortsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all');

  const preparedListening = useMemo(
    () => buildSearchableListeningPorts(snapshot?.listening ?? []),
    [snapshot?.listening]
  );
  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/modules/ports', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSnapshot(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 10000);
    return () => window.clearInterval(interval);
  }, [load]);

  const filtered = useMemo(
    () => getFilteredListeningPorts(preparedListening, protocolFilter, normalizedSearch),
    [preparedListening, protocolFilter, normalizedSearch]
  );

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Radio className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot?.summary.totalListening ?? 0}</p>
                <p className="text-xs text-muted-foreground">Listening Ports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Server className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot?.summary.tcpCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">TCP Ports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Server className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot?.summary.udpCount ?? 0}</p>
                <p className="text-xs text-muted-foreground">UDP Ports</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/50 flex items-center justify-center">
                <Cable className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{snapshot?.summary.uniqueProcesses ?? 0}</p>
                <p className="text-xs text-muted-foreground">Processes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <PortAvailabilityChecker />

      {/* Listening Ports Table */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="w-4 h-4 text-primary" />
              Listening Ports
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  aria-label="Search listening ports"
                  placeholder="Search ports..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-9 pr-3 w-48 bg-secondary border border-border rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Filter className="w-3 h-3 text-muted-foreground" />
                {(['all', 'tcp', 'udp'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setProtocolFilter(f)}
                    aria-pressed={protocolFilter === f}
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      protocolFilter === f
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    )}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
              <button
                onClick={load}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                title="Refresh"
                aria-label="Refresh listening ports"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Port</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                    Service
                  </th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                    Protocol
                  </th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                    Address
                  </th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                    Process
                  </th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">PID</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">User</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">State</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted-foreground py-8">
                      No ports found matching filters
                    </td>
                  </tr>
                ) : (
                  filtered.map((p, i) => (
                    <tr
                      key={`${p.protocol}-${p.port}-${p.address}-${i}`}
                      className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono font-semibold">{p.port}</td>
                      <td className="px-4 py-2.5">
                        {WELL_KNOWN[p.port] ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {WELL_KNOWN[p.port]}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={p.protocol.startsWith('tcp') ? 'success' : 'warning'}
                          className="text-[10px]"
                        >
                          {p.protocol.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        {p.address || '*'}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{p.process || '-'}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">
                        {p.pid ?? '-'}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{p.user || '-'}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {p.state}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Firewall Rules */}
      {snapshot?.firewall.available && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="w-4 h-4 text-primary" />
                Firewall Rules
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge
                  variant={snapshot.firewall.enabled ? 'success' : 'warning'}
                  className="text-[10px]"
                >
                  {snapshot.firewall.enabled ? 'Active' : 'Inactive'}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {snapshot.firewall.backend.toUpperCase()}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {snapshot.firewall.rules.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">
                No firewall rules configured
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                        Rule
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                        Action
                      </th>
                      <th className="text-left font-medium text-muted-foreground px-4 py-2.5">
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.firewall.rules.map((rule, i) => (
                      <tr
                        key={i}
                        className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-mono">{rule.port || rule.raw}</td>
                        <td className="px-4 py-2.5">
                          <Badge
                            variant={
                              rule.action.toLowerCase().includes('allow') ||
                              rule.action.toLowerCase().includes('accept')
                                ? 'success'
                                : 'destructive'
                            }
                            className="text-[10px]"
                          >
                            {rule.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {rule.source || 'Any'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
