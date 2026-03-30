'use client';
 
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn, formatBytes, relativeTime } from '@/lib/utils';
import type { 
  DockerImageSummary, 
  DockerNetworkSummary, 
  DockerVolumeSummary 
} from '../../types';
 
type DataTab = 'images' | 'volumes' | 'networks';
 
interface AssetManagerProps {
  images: DockerImageSummary[];
  volumes: DockerVolumeSummary[];
  networks: DockerNetworkSummary[];
  onDelete: (id: string, type: 'images' | 'volumes' | 'networks') => void;
}
 
function DatasetTabs({
  activeTab,
  onChange,
}: {
  activeTab: DataTab;
  onChange: (tab: DataTab) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-border/40 bg-muted/20 p-1 backdrop-blur-sm">
      {(['images', 'volumes', 'networks'] as DataTab[]).map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            'min-h-[36px] rounded-lg px-4 text-[10px] font-bold uppercase tracking-widest transition-all',
            activeTab === tab
              ? 'bg-card text-foreground shadow-sm ring-1 ring-border/20'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
 
export function AssetManager({
  images,
  volumes,
  networks,
  onDelete,
}: AssetManagerProps) {
  const [activeTab, setActiveTab] = useState<DataTab>('images');
 
  return (
    <Card className="border-border/60 bg-card/50 backdrop-blur-md shadow-sm overflow-hidden" data-testid="docker-assets">
      <CardHeader className="border-b border-border/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold tracking-tight">Images, volumes, and networks</CardTitle>
            <p className="text-sm text-muted-foreground">
              Inventory views for registries, attached storage, and bridge topology.
            </p>
          </div>
          <DatasetTabs activeTab={activeTab} onChange={setActiveTab} />
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto min-h-[320px]">
        {activeTab === 'images' && (
          <table className="min-w-full text-sm" data-testid="docker-images-table">
            <thead className="text-left text-[10px] uppercase tracking-widest text-muted-foreground font-bold bg-muted/10">
              <tr>
                <th className="py-3 px-4">Repository</th>
                <th className="py-3 px-4">Tag</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4">Using</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {images.map((image) => (
                <tr key={image.id} className="hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-semibold text-foreground">{image.repository}</td>
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{image.tag}</td>
                  <td className="py-3 px-4 font-mono text-xs">{formatBytes(image.sizeBytes)}</td>
                  <td className="py-3 px-4 text-muted-foreground">{relativeTime(image.createdAt)}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      {image.containersUsing}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 transition-transform active:scale-90"
                      onClick={() => onDelete(image.id, 'images')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {activeTab === 'volumes' && (
          <table className="min-w-full text-sm" data-testid="docker-volumes-table">
            <thead className="text-left text-[10px] uppercase tracking-widest text-muted-foreground font-bold bg-muted/10">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Driver</th>
                <th className="py-3 px-4">Scope</th>
                <th className="py-3 px-4">Mountpoint</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {volumes.map((volume) => (
                <tr key={volume.name} className="hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-semibold text-foreground truncate max-w-[200px]">{volume.name}</td>
                  <td className="py-3 px-4 text-muted-foreground">{volume.driver}</td>
                  <td className="py-3 px-4 text-xs font-mono">{volume.scope || 'local'}</td>
                  <td className="py-3 px-4 font-mono text-[10px] text-muted-foreground opacity-60 truncate max-w-[300px]">
                    {volume.mountpoint || 'n/a'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => onDelete(volume.name, 'volumes')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {activeTab === 'networks' && (
          <table className="min-w-full text-sm" data-testid="docker-networks-table">
            <thead className="text-left text-[10px] uppercase tracking-widest text-muted-foreground font-bold bg-muted/10">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Driver</th>
                <th className="py-3 px-4">Scope</th>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {networks.map((network) => (
                <tr key={network.id} className="hover:bg-muted/10 transition-colors">
                  <td className="py-3 px-4 font-semibold text-foreground">{network.name}</td>
                  <td className="py-3 px-4 text-muted-foreground">{network.driver}</td>
                  <td className="py-3 px-4 text-xs font-mono">{network.scope || 'local'}</td>
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground opacity-60">
                    {network.id.slice(0, 12)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                      onClick={() => onDelete(network.id, 'networks')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
