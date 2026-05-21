import { Activity, Boxes, Server, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface AppsSummaryCardsProps {
  summary: {
    total: number;
    running: number;
    failed: number;
  };
  activeOperations: number;
}

export function AppsSummaryCards({ summary, activeOperations }: AppsSummaryCardsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Boxes className="h-5 w-5 text-primary" />
          <div>
            <div className="text-xl font-semibold">{summary.total}</div>
            <div className="text-xs text-muted-foreground">Managed apps</div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Server className="h-5 w-5 text-success" />
          <div>
            <div className="text-xl font-semibold">{summary.running}</div>
            <div className="text-xs text-muted-foreground">Running</div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <XCircle className="h-5 w-5 text-destructive" />
          <div>
            <div className="text-xl font-semibold">{summary.failed}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Activity className="h-5 w-5 text-warning" />
          <div>
            <div className="text-xl font-semibold">{activeOperations}</div>
            <div className="text-xs text-muted-foreground">Active operations</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
