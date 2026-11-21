import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { EnvVarRecord } from '../types';

interface EnvVarsTableProps {
  rows: EnvVarRecord[];
  canDelete: boolean;
  revealed: Set<string>;
  onToggleReveal: (recordKey: string) => void;
  onDelete?: (record: EnvVarRecord) => void;
}

const MASK = '••••••••';

export function EnvVarsTable({
  rows,
  canDelete,
  revealed,
  onToggleReveal,
  onDelete,
}: EnvVarsTableProps) {
  function displayValue(record: EnvVarRecord, isRevealed: boolean): string {
    if (record.sensitive && !isRevealed) return MASK;
    return record.value || '(empty)';
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60 bg-card/40 shadow-sm shadow-background/20">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/50 bg-accent/15">
            <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">
              Name
            </th>
            <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">
              Value
            </th>
            <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">
              Scope
            </th>
            <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase">
              Status
            </th>
            <th className="px-4 py-3 text-[11px] font-bold text-muted-foreground uppercase text-right">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((record) => {
            const isRevealed = revealed.has(record.key);
            return (
              <tr
                key={`${record.scope}-${record.key}`}
                className="group border-b border-border/40 transition-colors last:border-b-0 hover:bg-accent/10"
              >
                <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                  {record.key}
                </td>
                <td className="px-4 py-3">
                  <span className="block max-w-[280px] truncate rounded-md bg-background/40 px-2 py-1 font-mono text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                    {displayValue(record, isRevealed)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={record.scope === 'session' ? 'secondary' : 'default'}>
                    {record.scope}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={record.inCurrentSession ? 'success' : 'warning'}>
                    {record.inCurrentSession ? 'current' : 'new session'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {record.sensitive && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`${isRevealed ? 'Hide' : 'Reveal'} ${record.key}`}
                        onClick={() => onToggleReveal(record.key)}
                      >
                        {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    )}
                    {canDelete && onDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${record.key}`}
                        onClick={() => onDelete(record)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="py-10 text-center text-sm text-muted-foreground">No variables found.</div>
      )}
    </div>
  );
}
