'use client';

import { 
  Shield, 
  LockOpen, 
  Key, 
  AlertTriangle, 
  Copy, 
  LoaderCircle, 
  Trash2, 
  Terminal, 
  Check 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, relativeTime } from '@/lib/utils';
import type { EndpointCreateRequest, EndpointToken } from '../../types';

interface EndpointAuthProps {
  form: EndpointCreateRequest;
  isCreating: boolean;
  tokens: EndpointToken[];
  tokensLoading: boolean;
  newTokenName: string;
  generatedToken: string | null;
  onUpdateForm: <K extends keyof EndpointCreateRequest>(key: K, value: EndpointCreateRequest[K]) => void;
  onGenerateToken: () => void;
  onRevokeToken: (tokenId: string) => void;
  onSetNewTokenName: (val: string) => void;
  exampleTab: 'curl' | 'fetch' | 'python' | 'node';
  onSetExampleTab: (tab: 'curl' | 'fetch' | 'python' | 'node') => void;
  onCopySnippet: (code: string) => void;
}

export function EndpointAuth({
  form,
  isCreating,
  tokens,
  tokensLoading,
  newTokenName,
  generatedToken,
  onUpdateForm,
  onGenerateToken,
  onRevokeToken,
  onSetNewTokenName,
  exampleTab,
  onSetExampleTab,
  onCopySnippet,
}: EndpointAuthProps) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${baseUrl}/api/endpoints/${form.slug}`;

  const curlSnippet = `curl -X ${form.method} "${url}" \\
  -H "Authorization: Bearer YOUR_TOKEN"`;

  const fetchSnippet = `fetch("${url}", {
  method: "${form.method}",
  headers: {
    "Authorization": "Bearer YOUR_TOKEN"
  }
});`;

  const nodeSnippet = `const response = await fetch("${url}", {
  method: "${form.method}",
  headers: {
    "Authorization": "Bearer YOUR_TOKEN"
  }
});
const data = await response.json();`;

  const pythonSnippet = `import requests

url = "${url}"
headers = {
    "Authorization": "Bearer YOUR_TOKEN"
}
response = requests.${form.method.toLowerCase()}(url, headers=headers)
print(response.json())`;

  const getActiveSnippet = () => {
    switch (exampleTab) {
      case 'curl': return curlSnippet;
      case 'fetch': return fetchSnippet;
      case 'node': return nodeSnippet;
      case 'python': return pythonSnippet;
      default: return curlSnippet;
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between p-6 rounded-3xl bg-card border border-border/40 shadow-sm transition-all hover:bg-accent/5 overflow-hidden relative">
        <div className="relative z-10">
          <div className="text-sm font-black text-foreground uppercase tracking-tight">Security Protocol</div>
          <div className="text-[11px] text-muted-foreground font-medium mt-1">
            {form.auth === 'public'
              ? 'Anyone can interact with this endpoint without credentials'
              : 'Requests must include a valid Bearer token in the Authorization header'}
          </div>
        </div>
        <div className="flex items-center gap-1.5 p-1.5 bg-muted/20 rounded-2xl border border-border/40 backdrop-blur-md relative z-10">
          <button
            onClick={() => onUpdateForm('auth', 'public')}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300',
              form.auth === 'public'
                ? 'bg-card text-foreground shadow-lg scale-105 border border-border'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <LockOpen className="w-4 h-4" />
            Public
          </button>
          <button
            onClick={() => onUpdateForm('auth', 'token')}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300',
              form.auth === 'token'
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-105'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Shield className="w-4 h-4" />
            Token
          </button>
        </div>
        {form.auth === 'token' && (
           <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none -mr-4 -mt-4">
             <Shield className="w-24 h-24" />
           </div>
        )}
      </div>

      {isCreating && (
        <div className="flex flex-col items-center py-16 text-center bg-muted/5 rounded-[2.5rem] border border-dashed border-border/60">
          <div className="w-16 h-16 rounded-full bg-muted/10 flex items-center justify-center mb-6">
            <Key className="w-8 h-8 text-muted-foreground/30" />
          </div>
          <p className="text-sm font-black text-foreground uppercase tracking-tight mb-2">
            Dynamic Token Generation
          </p>
          <p className="text-[11px] text-muted-foreground/60 max-w-[280px] leading-relaxed">
            You can configure the authentication type now, but token generation will be
            available after you save the endpoint to the database.
          </p>
        </div>
      )}

      {!isCreating && form.auth === 'token' && (
        <div className="space-y-8">
          {/* Generated token display */}
          {generatedToken && (
            <div className="p-6 rounded-[2rem] border border-warning/30 bg-warning/5 animate-in slide-in-from-top-4 duration-500 shadow-2xl shadow-warning/5 ring-1 ring-warning/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-warning/20">
                   <AlertTriangle className="w-5 h-5 text-warning" />
                </div>
                <div className="space-y-0.5">
                    <span className="text-xs font-black text-warning uppercase tracking-tighter">
                      CONFIDENTIAL TOKEN CREATED
                    </span>
                    <p className="text-[10px] text-warning/60 font-medium">Capture this immediately — it is only displayed once for security reasons</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-1.5 bg-background/50 rounded-2xl border border-warning/10 focus-within:ring-2 focus-within:ring-warning/20 transition-all">
                <code className="flex-1 text-xs font-mono px-4 py-2.5 break-all select-all text-warning/90">
                  {generatedToken}
                </code>
                <Button
                  onClick={() => onCopySnippet(generatedToken)}
                  variant="outline"
                  size="sm"
                  className="shrink-0 h-10 w-10 p-0 rounded-xl border-warning/20 bg-warning/10 hover:bg-warning/20 text-warning transition-transform active:scale-95"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Generate new token */}
          <div className="space-y-4">
             <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-1">
                New Access Token
              </label>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={newTokenName}
                onChange={(e) => onSetNewTokenName(e.target.value)}
                placeholder="Identifiable label (e.g., 'Third-party Client')"
                className="flex-1 h-12 px-5 rounded-2xl border border-border/40 bg-background/30 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all hover:bg-background/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onGenerateToken();
                }}
              />
              <Button
                size="sm"
                onClick={onGenerateToken}
                disabled={!newTokenName.trim()}
                className="h-12 gap-2 rounded-2xl px-6 font-bold shadow-lg shadow-primary/20"
              >
                <Key className="w-4 h-4" />
                Generate
              </Button>
            </div>
          </div>

          {/* Token list */}
          <div className="space-y-4">
             <div className="flex items-center justify-between px-1">
               <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                  Revocation Registry
                </label>
                {!tokensLoading && tokens.length > 0 && <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">{tokens.length} Active</span>}
             </div>
            {tokensLoading ? (
              <div className="flex flex-col items-center justify-center py-12 rounded-[2rem] border border-border/20 bg-muted/5">
                <LoaderCircle className="w-8 h-8 animate-spin text-primary/40 mb-3" />
                <span className="text-[10px] font-bold text-muted-foreground/40 uppercase">Decrypting tokens...</span>
              </div>
            ) : tokens.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-center bg-muted/5 rounded-[2rem] border border-dashed border-border/40">
                <div className="w-12 h-12 rounded-full bg-muted/10 flex items-center justify-center mb-4">
                   <Key className="w-6 h-6 text-muted-foreground/20" />
                </div>
                <p className="text-sm font-bold text-muted-foreground/60 mb-1">No identifiers active</p>
                <p className="text-[10px] text-muted-foreground/40 max-w-[200px]">
                  Generate a revocable access token to grant scoped access to this endpoint
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {tokens.map((token) => (
                  <div
                    key={token._id}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border/40 hover:border-border transition-all hover:shadow-md group/token relative overflow-hidden"
                  >
                    <div className="w-10 h-10 rounded-xl bg-muted/20 flex items-center justify-center group-hover/token:bg-primary/10 transition-colors">
                        <Key className="w-4 h-4 text-muted-foreground group-hover/token:text-primary transition-colors shrink-0" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-black text-foreground truncate">
                        {token.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono bg-muted/30 px-2 py-0.5 rounded-full w-fit mt-1">
                        {token.prefix}...
                      </div>
                    </div>
                    <div className="text-right shrink-0 pr-2">
                       <div className="text-[10px] font-bold text-foreground">Last Activity</div>
                       <div className="text-[10px] text-muted-foreground/60">
                        {token.lastUsedAt
                          ? relativeTime(token.lastUsedAt)
                          : 'Pristine'}
                      </div>
                    </div>
                    <button
                      onClick={() => onRevokeToken(token._id)}
                      className="p-2.5 rounded-xl hover:bg-destructive/10 text-muted-foreground/40 hover:text-destructive transition-all active:scale-90"
                      title="Revoke identity permanently"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Usage Example */}
          <div className="mt-8 space-y-6 pt-10 border-t border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                   <Terminal className="w-4 h-4 text-primary" />
                </div>
                <div className="space-y-0.5">
                  <h4 className="text-xs font-black uppercase tracking-widest text-foreground">
                    INTEGRATION MANIFEST
                  </h4>
                  <p className="text-[10px] text-muted-foreground font-medium">Code snippets for programmatic interaction</p>
                </div>
              </div>
              <div className="flex flex-wrap p-0.5 bg-muted/40 rounded-[1rem] border border-border/40 gap-1 sm:gap-0">
                {(['curl', 'fetch', 'python', 'node'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => onSetExampleTab(tab)}
                    className={cn(
                      'px-3 sm:px-5 py-2 rounded-[0.8rem] text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex-1 sm:flex-none text-center',
                      exampleTab === tab
                        ? 'bg-card text-primary shadow-lg scale-105'
                        : 'text-muted-foreground/60 hover:text-foreground'
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative group">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <button
                  onClick={() => onCopySnippet(getActiveSnippet())}
                  className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground backdrop-blur-md border border-white/10 shadow-2xl transition-all active:scale-95"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <pre className="p-6 rounded-[2rem] bg-[#0d0d0d] border border-white/5 text-[11px] font-mono leading-relaxed overflow-x-auto text-blue-400 select-all shadow-2xl ring-1 ring-white/5 min-h-[160px]">
                {exampleTab === 'curl' && (
                  <>
                    <span className="text-purple-400 font-bold">curl</span>{' '}
                    <span className="text-orange-400 font-medium">-X</span> {form.method}{' '}
                    <span className="text-green-400">
                      &quot;{url}&quot;
                    </span>{' '}
                    \<br />
                    &nbsp;&nbsp;<span className="text-orange-400 font-medium">-H</span>{' '}
                    <span className="text-green-400">
                      &quot;Authorization: Bearer{' '}
                      <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold border border-primary/20">
                        YOUR_TOKEN
                      </span>
                      &quot;
                    </span>
                  </>
                )}
                {exampleTab === 'fetch' && (
                  <>
                    <span className="text-purple-400 font-bold">fetch</span>(
                    <span className="text-green-400">
                      &quot;{url}&quot;
                    </span>
                    , &#123;
                    <br />
                    &nbsp;&nbsp;method:{' '}
                    <span className="text-green-400">&quot;{form.method}&quot;</span>,
                    <br />
                    &nbsp;&nbsp;headers: &#123;
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;
                    <span className="text-green-400 font-bold">
                      &quot;Authorization&quot;
                    </span>:{' '}
                    <span className="text-green-400">
                      &quot;Bearer{' '}
                      <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold border border-primary/20">
                        YOUR_TOKEN
                      </span>
                      &quot;
                    </span>
                    <br />
                    &nbsp;&nbsp;&#125;
                    <br />
                    &#125;);
                  </>
                )}
                {exampleTab === 'node' && (
                  <>
                    <span className="text-purple-400 font-bold text-xs">const</span> response = <span className="text-purple-400 font-bold">await fetch</span>(
                    <span className="text-green-400">&quot;{url}&quot;</span>, &#123;
                    <br />
                    &nbsp;&nbsp;method: <span className="text-green-400">&quot;{form.method}&quot;</span>,
                    <br />
                    &nbsp;&nbsp;headers: &#123;
                    <br />
                    &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-green-400 font-bold">&quot;Authorization&quot;</span>: <span className="text-green-400">&quot;Bearer <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold border border-primary/20">YOUR_TOKEN</span>&quot;</span>
                    <br />
                    &nbsp;&nbsp;&#125;
                    <br />
                    &#125;);
                    <br />
                    <span className="text-purple-400 font-bold text-xs">const</span> data = <span className="text-purple-400 font-bold">await</span> response.<span className="text-orange-400">json</span>();
                  </>
                )}
                {exampleTab === 'python' && (
                  <>
                    <span className="text-purple-400 font-bold text-xs">import</span> requests
                    <br /><br />
                    url = <span className="text-green-400">&quot;{url}&quot;</span>
                    <br />
                    headers = &#123;
                    <br />
                    &nbsp;&nbsp;<span className="text-green-400 font-bold">&quot;Authorization&quot;</span>: <span className="text-green-400">&quot;Bearer <span className="bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold border border-primary/20">YOUR_TOKEN</span>&quot;</span>
                    <br />
                    &#125;
                    <br />
                    response = requests.<span className="text-purple-400 font-bold">{form.method.toLowerCase()}</span>(url, headers=headers)
                    <br />
                    <span className="text-purple-400 font-bold text-xs">print</span>(response.<span className="text-orange-400">json</span>())
                  </>
                )}
              </pre>
            </div>
            <div className="flex items-center gap-2 px-1">
              <Check className="w-3.5 h-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground/60 font-medium italic">
                Securely inject the <code className="text-primary font-black uppercase">YOUR_TOKEN</code> placeholder with an active identifier from the registry
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
