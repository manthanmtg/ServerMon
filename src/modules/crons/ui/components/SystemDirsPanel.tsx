'use client';

import { FolderOpen, Terminal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SystemCronDir } from '../../types';

interface SystemDirsPanelProps {
  systemDirs: SystemCronDir[];
}

export function SystemDirsPanel({ systemDirs }: SystemDirsPanelProps) {
  return (
    <div
      id="cron-view-panel-system"
      role="tabpanel"
      aria-labelledby="cron-view-tab-system"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {systemDirs.map((dir) => (
        <Card key={dir.name} className="border-border/60">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-primary" />
                {dir.name}
              </CardTitle>
              <Badge variant="outline">{dir.count} scripts</Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono">{dir.path}</p>
          </CardHeader>
          <CardContent>
            {dir.scripts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No scripts in this directory.</p>
            ) : (
              <div className="space-y-1">
                {dir.scripts.map((script) => (
                  <div
                    key={script}
                    className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/30"
                  >
                    <Terminal className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="font-mono text-foreground">{script}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {systemDirs.length === 0 && (
        <Card className="border-border/60 sm:col-span-2 lg:col-span-3">
          <CardContent className="py-12 text-center text-muted-foreground">
            No system cron directories found.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
