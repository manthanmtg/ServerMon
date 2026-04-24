'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';

export function RemoteProcessTable({ nodeId }: { nodeId: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2">
        <Activity className="h-4 w-4" />
        <CardTitle>Remote processes</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-sm space-y-2">
          <p className="font-medium">Awaiting agent process protocol</p>
          <p className="text-muted-foreground text-xs">
            Process enumeration ships with the Phase 2 agent runtime. Once the agent (node id{' '}
            <span className="font-mono">{nodeId}</span>) is connected and reports its process list,
            live rows will appear here.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
