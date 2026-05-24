import { Fragment, memo } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Pause,
  Play,
  Power,
  RotateCcw,
  Shield,
  Square,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn, formatBytes } from '@/lib/utils';
import type { ServiceUnit } from '../../types';
import { ServiceLogPanel } from './ServiceLogPanel';

export type ServiceAction = 'start' | 'stop' | 'restart' | 'enable' | 'disable' | 'reload';
export type ServicesSortField = 'name' | 'status' | 'cpu' | 'memory' | 'uptime' | 'restarts';
export type ServicesSortDir = 'asc' | 'desc';

interface ServicesTableProps {
  services: ServiceUnit[];
  totalServices: number;
  expandedService: string | null;
  pendingAction: string | null;
  sortField: ServicesSortField;
  sortDir: ServicesSortDir;
  onToggleExpanded: (serviceName: string | null) => void;
  onToggleSort: (field: ServicesSortField) => void;
  onRunAction: (serviceName: string, action: ServiceAction) => void;
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function statusVariant(state: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (state === 'active') return 'success';
  if (state === 'activating' || state === 'deactivating' || state === 'reloading') return 'warning';
  if (state === 'failed') return 'destructive';
  return 'secondary';
}

function subStateIcon(sub: string) {
  if (sub === 'running') return <Play className="w-3.5 h-3.5" />;
  if (sub === 'exited') return <Square className="w-3.5 h-3.5" />;
  if (sub === 'failed') return <XCircle className="w-3.5 h-3.5" />;
  if (sub === 'dead') return <Power className="w-3.5 h-3.5" />;
  if (sub === 'waiting' || sub === 'start-pre' || sub === 'start')
    return <LoaderCircle className="w-3.5 h-3.5 animate-spin" />;
  if (sub === 'auto-restart') return <RotateCcw className="w-3.5 h-3.5 animate-spin" />;
  return <Pause className="w-3.5 h-3.5" />;
}

function sortIcon(
  activeField: ServicesSortField,
  sortDir: ServicesSortDir,
  field: ServicesSortField
) {
  if (activeField !== field) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />;
  return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
}

const serviceActionButtonClass = 'min-h-11 min-w-11 sm:h-8 sm:min-h-8 sm:w-8 sm:min-w-8 p-0';

function ServicesTableBase({
  services,
  totalServices,
  expandedService,
  pendingAction,
  sortField,
  sortDir,
  onToggleExpanded,
  onToggleSort,
  onRunAction,
}: ServicesTableProps) {
  return (
    <Card className="border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-[0.18em] text-muted-foreground bg-muted/20">
            <tr>
              <th className="py-3 px-4 w-8" />
              <th
                className="py-3 px-4 cursor-pointer select-none"
                onClick={() => onToggleSort('name')}
              >
                <span className="inline-flex items-center gap-1">
                  Service {sortIcon(sortField, sortDir, 'name')}
                </span>
              </th>
              <th
                className="py-3 px-4 cursor-pointer select-none"
                onClick={() => onToggleSort('status')}
              >
                <span className="inline-flex items-center gap-1">
                  Status {sortIcon(sortField, sortDir, 'status')}
                </span>
              </th>
              <th className="py-3 px-4">PID</th>
              <th
                className="py-3 px-4 cursor-pointer select-none"
                onClick={() => onToggleSort('cpu')}
              >
                <span className="inline-flex items-center gap-1">
                  CPU {sortIcon(sortField, sortDir, 'cpu')}
                </span>
              </th>
              <th
                className="py-3 px-4 cursor-pointer select-none"
                onClick={() => onToggleSort('memory')}
              >
                <span className="inline-flex items-center gap-1">
                  Memory {sortIcon(sortField, sortDir, 'memory')}
                </span>
              </th>
              <th
                className="py-3 px-4 cursor-pointer select-none"
                onClick={() => onToggleSort('uptime')}
              >
                <span className="inline-flex items-center gap-1">
                  Uptime {sortIcon(sortField, sortDir, 'uptime')}
                </span>
              </th>
              <th
                className="py-3 px-4 cursor-pointer select-none"
                onClick={() => onToggleSort('restarts')}
              >
                <span className="inline-flex items-center gap-1">
                  Restarts {sortIcon(sortField, sortDir, 'restarts')}
                </span>
              </th>
              <th className="py-3 px-4">Enabled</th>
              <th className="py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {services.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-muted-foreground">
                  No services match your filter.
                </td>
              </tr>
            ) : (
              services.map((svc) => {
                const isExpanded = expandedService === svc.name;
                return (
                  <Fragment key={svc.name}>
                    <tr
                      className={cn(
                        'border-t border-border/60 transition-colors hover:bg-muted/10',
                        isExpanded && 'bg-muted/10'
                      )}
                    >
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${svc.name} details`}
                          aria-expanded={isExpanded}
                          onClick={() => onToggleExpanded(isExpanded ? null : svc.name)}
                          className="p-1 rounded hover:bg-accent transition-colors"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <div>
                          <span className="font-medium">{svc.name}</span>
                          <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                            {svc.description}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={statusVariant(svc.activeState)} className="gap-1">
                          {subStateIcon(svc.subState)}
                          {svc.activeState} ({svc.subState})
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs">
                        {svc.mainPid > 0 ? svc.mainPid : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'font-medium',
                            svc.cpuPercent > 50
                              ? 'text-destructive'
                              : svc.cpuPercent > 20
                                ? 'text-warning'
                                : ''
                          )}
                        >
                          {svc.cpuPercent > 0 ? `${svc.cpuPercent.toFixed(1)}%` : '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'font-medium',
                            svc.memoryBytes > 2 * 1024 * 1024 * 1024
                              ? 'text-destructive'
                              : svc.memoryBytes > 512 * 1024 * 1024
                                ? 'text-warning'
                                : ''
                          )}
                        >
                          {svc.memoryBytes > 0 ? formatBytes(svc.memoryBytes) : '-'}
                        </span>
                        {svc.memoryPercent > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">
                            ({svc.memoryPercent}%)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">{formatUptime(svc.uptimeSeconds)}</td>
                      <td className="py-3 px-4">
                        {svc.restartCount > 0 ? (
                          <Badge variant={svc.restartCount > 3 ? 'destructive' : 'warning'}>
                            {svc.restartCount}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={svc.enabled ? 'success' : 'secondary'}>
                          {svc.enabled ? 'yes' : 'no'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          {svc.activeState !== 'active' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={cn(
                                serviceActionButtonClass,
                                'text-success hover:bg-success/10'
                              )}
                              type="button"
                              aria-label={`Start ${svc.name}`}
                              title="Start"
                              loading={pendingAction === `${svc.name}:start`}
                              onClick={() => onRunAction(svc.name, 'start')}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          {svc.activeState === 'active' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={cn(
                                serviceActionButtonClass,
                                'text-destructive hover:bg-destructive/10'
                              )}
                              type="button"
                              aria-label={`Stop ${svc.name}`}
                              title="Stop"
                              loading={pendingAction === `${svc.name}:stop`}
                              onClick={() => onRunAction(svc.name, 'stop')}
                            >
                              <Square className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className={cn(
                              serviceActionButtonClass,
                              'text-primary hover:bg-primary/10'
                            )}
                            type="button"
                            aria-label={`Restart ${svc.name}`}
                            title="Restart"
                            loading={pendingAction === `${svc.name}:restart`}
                            onClick={() => onRunAction(svc.name, 'restart')}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={cn(serviceActionButtonClass, 'hover:bg-accent')}
                            type="button"
                            aria-label={`${svc.enabled ? 'Disable' : 'Enable'} ${svc.name}`}
                            title={svc.enabled ? 'Disable' : 'Enable'}
                            loading={
                              pendingAction === `${svc.name}:enable` ||
                              pendingAction === `${svc.name}:disable`
                            }
                            onClick={() =>
                              onRunAction(svc.name, svc.enabled ? 'disable' : 'enable')
                            }
                          >
                            {svc.enabled ? (
                              <Shield className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-success" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-muted/5">
                        <td colSpan={10} className="px-4 py-3">
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div>
                                <span className="text-muted-foreground">Type: </span>
                                <span className="font-medium">{svc.type}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Unit file: </span>
                                <span className="font-mono">{svc.unitFileState}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Path: </span>
                                <span className="font-mono truncate">
                                  {svc.fragmentPath || 'n/a'}
                                </span>
                              </div>
                              {svc.triggeredBy && (
                                <div>
                                  <span className="text-muted-foreground">Triggered by: </span>
                                  <span className="font-medium">{svc.triggeredBy}</span>
                                </div>
                              )}
                            </div>
                            {svc.after && svc.after.length > 0 && (
                              <div className="text-xs">
                                <span className="text-muted-foreground">
                                  Dependencies (After):{' '}
                                </span>
                                <span className="font-mono">
                                  {svc.after.slice(0, 8).join(', ')}
                                  {svc.after.length > 8 && ` +${svc.after.length - 8} more`}
                                </span>
                              </div>
                            )}
                            <div>
                              <ServiceLogPanel serviceName={svc.name} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-border/60 text-xs text-muted-foreground">
        Showing {services.length} of {totalServices} services
      </div>
    </Card>
  );
}

export const ServicesTable = memo(ServicesTableBase);
