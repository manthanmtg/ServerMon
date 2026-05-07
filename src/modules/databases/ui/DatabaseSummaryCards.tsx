import { CheckCircle2, Database, Globe2, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export interface DatabaseSummary {
  total: number;
  running: number;
  failed: number;
  publicCount: number;
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
