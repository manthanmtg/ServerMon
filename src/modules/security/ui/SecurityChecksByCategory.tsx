'use client';

import { memo, type ReactNode } from 'react';
import { CheckCircle, AlertTriangle, Info, RefreshCw, SkipForward, ShieldCheck, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SecurityCheck } from '../types';

const statusIcon: Record<SecurityCheck['status'], ReactNode> = {
  pass: <CheckCircle className="w-4 h-4 text-success" />,
  fail: <XCircle className="w-4 h-4 text-destructive" />,
  warn: <AlertTriangle className="w-4 h-4 text-warning" />,
  info: <Info className="w-4 h-4 text-primary" />,
  skip: <SkipForward className="w-4 h-4 text-muted-foreground" />,
};

const statusLabel: Record<SecurityCheck['status'], string> = {
  pass: 'Pass',
  fail: 'Fail',
  warn: 'Warning',
  info: 'Info',
  skip: 'Skipped',
};

interface SecurityChecksByCategoryProps {
  checksByCategory: Map<string, SecurityCheck[]>;
  error: string | null;
  onRefresh: () => void;
}

export const SecurityChecksByCategory = memo(function SecurityChecksByCategory({
  checksByCategory,
  error,
  onRefresh,
}: SecurityChecksByCategoryProps) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Security Checks
          </CardTitle>
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh security checks"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </CardHeader>
      {error && (
        <div className="px-4 pb-4">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
      <CardContent className="space-y-4">
        {Array.from(checksByCategory.entries()).map(([category, checks]) => (
          <div key={category}>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              {category}
            </h3>
            <div className="space-y-1.5">
              {checks.map((check) => (
                <div
                  key={check.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-accent/30 transition-colors"
                >
                  {statusIcon[check.status]}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{check.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{check.details}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">
                      {check.severity}
                    </Badge>
                    <Badge
                      variant={
                        check.status === 'pass'
                          ? 'success'
                          : check.status === 'fail'
                            ? 'destructive'
                            : check.status === 'warn'
                              ? 'warning'
                              : 'secondary'
                      }
                      className="text-[10px]"
                    >
                      {statusLabel[check.status]}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
});

SecurityChecksByCategory.displayName = 'SecurityChecksByCategory';
