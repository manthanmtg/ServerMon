'use client';

import React, { useEffect, useState } from 'react';
import { Info, AlertTriangle, XCircle, Clock, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';

interface LogEntry {
  _id: string;
  moduleId: string;
  event: string;
  timestamp: string;
  severity: 'info' | 'warn' | 'error';
}

const severityConfig = {
  info: { icon: Info, color: 'text-primary', bg: 'bg-primary/10' },
  warn: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  error: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
};

export default function LogsWidget() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/analytics/recent?limit=5');
        const data = await res.json();
        setLogs(data.events || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-3 py-2">
            <Skeleton className="h-7 w-7 rounded-md shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3.5 w-full max-w-[90%] rounded" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-3">
          <ScrollText className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No activity yet</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Audit events will appear here as you use the app.
        </p>
        <Link
          href="/logs"
          className="mt-3 text-sm text-primary hover:text-primary/80 font-medium transition-colors"
        >
          View logs page
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {logs.map((log) => {
          const config = severityConfig[log.severity] || severityConfig.info;
          const Icon = config.icon;
          return (
            <div key={log._id} className="flex items-start gap-3 py-2 group">
              <div
                className={`mt-0.5 w-7 h-7 rounded-md ${config.bg} flex items-center justify-center shrink-0`}
              >
                <Icon className={`w-3.5 h-3.5 ${config.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{log.event}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground capitalize">{log.moduleId}</span>
                  <span className="text-muted-foreground/30">·</span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(log.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Link
        href="/logs"
        className="block text-center text-sm text-primary hover:text-primary/80 font-medium transition-colors py-2"
      >
        View all logs
      </Link>
    </div>
  );
}
