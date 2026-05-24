'use client';

import {
  AlertTriangle,
  Ban,
  CheckCircle,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SecuritySnapshot } from '../types';

interface SecurityScoreGaugeProps {
  score: number;
}

function SecurityScoreGauge({ score }: SecurityScoreGaugeProps) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--destructive)';

  return (
    <div className="relative w-28 h-28">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{score}</span>
        <span className="text-[10px] text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

interface SecuritySummaryCardsProps {
  summary: SecuritySnapshot['summary'];
  source: SecuritySnapshot['source'];
  firewallRulesCount: number;
}

export function SecurityScoreOverview({
  summary,
  source,
  firewallRulesCount,
  score,
}: SecuritySummaryCardsProps & { score: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6">
      <Card className="border-border/60">
        <CardContent className="pt-6 pb-6 flex flex-col items-center gap-3">
          <SecurityScoreGauge score={score} />
          <p className="text-sm font-medium">Security Score</p>
          <Badge variant={source === 'live' ? 'success' : 'warning'} className="text-[10px]">
            {source}
          </Badge>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-success" />
              <div>
                <p className="text-2xl font-bold">{summary.passed}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{summary.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-warning" />
              <div>
                <p className="text-2xl font-bold">{summary.warnings}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Ban className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{summary.bannedIps}</p>
                <p className="text-xs text-muted-foreground">Banned IPs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-warning" />
              <div>
                <p className="text-2xl font-bold">{summary.pendingSecurityUpdates}</p>
                <p className="text-xs text-muted-foreground">Security Updates</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{firewallRulesCount}</p>
                <p className="text-xs text-muted-foreground">Firewall Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
