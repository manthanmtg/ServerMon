import { CheckCircle2, Database, Globe2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ManagedDatabaseDTO } from '../types';

export interface DatabaseSummary {
  total: number;
  running: number;
  failed: number;
  publicCount: number;
}

type DatabaseSummaryInput = Pick<ManagedDatabaseDTO, 'status' | 'publicRoute'>;

export function deriveDatabaseSummary(databases: DatabaseSummaryInput[]): DatabaseSummary {
  return databases.reduce<DatabaseSummary>(
    (summary, database) => {
      summary.total += 1;
      if (database.status === 'running') summary.running += 1;
      if (database.status === 'failed') summary.failed += 1;
      if (database.publicRoute) summary.publicCount += 1;
      return summary;
    },
    { total: 0, running: 0, failed: 0, publicCount: 0 }
  );
}

interface DatabaseSummaryCardsProps {
  summary: DatabaseSummary;
}

export function DatabaseSummaryCards({ summary }: DatabaseSummaryCardsProps) {
  const cards = [
    { label: 'Instances', value: summary.total, icon: Database },
    { label: 'Running', value: summary.running, icon: CheckCircle2 },
    { label: 'Public routes', value: summary.publicCount, icon: Globe2 },
    { label: 'Failed', value: summary.failed, icon: XCircle },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-4">
      {cards.map(({ label, value, icon: Icon }) => (
        <Card key={label}>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
            <Icon className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
