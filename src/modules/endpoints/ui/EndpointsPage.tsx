'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Check,
    Copy,
    Globe,
    LoaderCircle,
    Plus,
    RefreshCcw,
    Search,
    Sparkles,
    Terminal,
    Braces,
    Trash2,
    Waypoints,
    X,
    Play,
    Tag,
    Key,
    Settings,
    FileText,
    ChevronRight,
    ChevronDown,
    AlertTriangle,
    Shield,
    LockOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import type {
    CustomEndpointDTO,
    EndpointsListResponse,
    EndpointCreateRequest,
    EndpointTestResult,
    EndpointTemplate,
    HttpMethod,
    EndpointType,
    ScriptLanguage,
    EndpointExecutionLogDTO,
    EndpointToken,
} from '../types';

const ScriptEditor = dynamic(() => import('./components/ScriptEditor'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-[400px] rounded-xl border border-border/50 bg-[#1e1e2e] flex items-center justify-center">
            <LoaderCircle className="w-5 h-5 animate-spin text-white/30" />
        </div>
    ),
});

// ---- Constants ----

const METHOD_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    GET: { bg: 'bg-success/10', text: 'text-success', border: 'border-success/30' },
    POST: { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/30' },
    PUT: { bg: 'bg-warning/10', text: 'text-warning', border: 'border-warning/30' },
    PATCH: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/30' },
    DELETE: { bg: 'bg-destructive/10', text: 'text-destructive', border: 'border-destructive/30' },
};

const TYPE_ICONS: Record<EndpointType, typeof Terminal> = {
    script: Terminal,
    logic: Braces,
    webhook: Globe,
};

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const TYPES: EndpointType[] = ['script', 'logic', 'webhook'];
const LANGUAGES: ScriptLanguage[] = ['python', 'bash', 'node'];

type DetailTab = 'configure' | 'code' | 'auth' | 'logs' | 'settings';

function slugify(text: string): string {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.max(0, Math.round(diff / 60_000));
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}

// ---- Method Badge ----

function MethodBadge({ method, size = 'sm' }: { method: HttpMethod; size?: 'sm' | 'lg' }) {
    const colors = METHOD_COLORS[method] || METHOD_COLORS.GET;
    return (
        <span className={cn(
            'inline-flex items-center font-mono font-bold rounded-md border',
            colors.bg, colors.text, colors.border,
            size === 'lg' ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]',
        )}>
            {method}
        </span>
    );
}

// ---- Empty State ----

function EmptyState({ onCreateNew, onFromTemplate }: { onCreateNew: () => void; onFromTemplate: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Waypoints className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">No endpoints yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
                Create custom API endpoints that run scripts, proxy webhooks, or execute logic — all managed from here.
            </p>
            <div className="flex items-center gap-3">
                <Button onClick={onCreateNew} className="gap-2">
                    <Plus className="w-4 h-4" />
                    New Endpoint
                </Button>
                <Button variant="outline" onClick={onFromTemplate} className="gap-2">
                    <Sparkles className="w-4 h-4" />
                    From Template
                </Button>
            </div>
        </div>
    );
}

// ---- Main Page ----

export default function EndpointsPage() {
    const { toast } = useToast();

    // Data
    const [endpoints, setEndpoints] = useState<CustomEndpointDTO[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filters
    const [search, setSearch] = useState('');
    const [filterMethod, setFilterMethod] = useState<string>('');
    const [filterType, setFilterType] = useState<string>('');
    const [filterEnabled, setFilterEnabled] = useState<string>('');

    // Detail panel
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [detailTab, setDetailTab] = useState<DetailTab>('configure');
    const [isCreating, setIsCreating] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);

    // Form state
    const [form, setForm] = useState<EndpointCreateRequest>({
        name: '',
        slug: '',
        method: 'GET',
        endpointType: 'script',
        scriptLang: 'bash',
        scriptContent: '',
        auth: 'public',
        tags: [],
        enabled: true,
        timeout: 30000,
    });
    const [initialForm, setInitialForm] = useState<EndpointCreateRequest | null>(null);

    const isDirty = useMemo(() => {
        if (!initialForm) return false;
        return JSON.stringify(form) !== JSON.stringify(initialForm);
    }, [form, initialForm]);

    // Test console
    const [testBody, setTestBody] = useState('');
    const [testResult, setTestResult] = useState<EndpointTestResult | null>(null);
    const [testLoading, setTestLoading] = useState(false);
    const [showTestConsole, setShowTestConsole] = useState(false);

    // Execution logs
    const [logs, setLogs] = useState<EndpointExecutionLogDTO[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);

    // Tokens
    const [tokens, setTokens] = useState<EndpointToken[]>([]);
    const [tokensLoading, setTokensLoading] = useState(false);
    const [newTokenName, setNewTokenName] = useState('');
    const [generatedToken, setGeneratedToken] = useState<string | null>(null);

    // Templates
    const [templates, setTemplates] = useState<EndpointTemplate[]>([]);

    // Delete
    const [deleteTarget, setDeleteTarget] = useState<CustomEndpointDTO | null>(null);

    // Saving
    const [saving, setSaving] = useState(false);
    const [copiedSlug, setCopiedSlug] = useState(false);
    const [showDiscardModal, setShowDiscardModal] = useState(false);
    const [exampleTab, setExampleTab] = useState<'curl' | 'fetch'>('curl');
    const [showCopyRequestMenu, setShowCopyRequestMenu] = useState(false);
    const copyRequestMenuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (copyRequestMenuRef.current && !copyRequestMenuRef.current.contains(event.target as Node)) {
                setShowCopyRequestMenu(false);
            }
        };
        if (showCopyRequestMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showCopyRequestMenu]);

    // ---- Data loading ----

    const loadEndpoints = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        try {
            const params = new URLSearchParams();
            if (search) params.set('search', search);
            if (filterMethod) params.set('method', filterMethod);
            if (filterType) params.set('type', filterType);
            if (filterEnabled) params.set('enabled', filterEnabled);
            const res = await fetch(`/api/modules/endpoints?${params}`, { cache: 'no-store' });
            if (res.ok) {
                const data: EndpointsListResponse = await res.json();
                setEndpoints(data.endpoints);
                setTotal(data.total);
            }
        } catch {
            toast({ title: 'Failed to load endpoints', variant: 'destructive' });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [search, filterMethod, filterType, filterEnabled, toast]);

    useEffect(() => {
        loadEndpoints();
    }, [loadEndpoints]);

    const loadTemplates = useCallback(async () => {
        try {
            const res = await fetch('/api/modules/endpoints/templates');
            if (res.ok) {
                const data = await res.json();
                setTemplates(data.templates);
            }
        } catch { /* ignore */ }
    }, []);

    const loadLogs = useCallback(async (endpointId: string) => {
        setLogsLoading(true);
        try {
            const res = await fetch(`/api/modules/endpoints/${endpointId}/logs?limit=50`);
            if (res.ok) {
                const data = await res.json();
                setLogs(data.logs);
            }
        } catch { /* ignore */ }
        finally { setLogsLoading(false); }
    }, []);

    const loadTokens = useCallback(async (endpointId: string) => {
        setTokensLoading(true);
        try {
            const res = await fetch(`/api/modules/endpoints/${endpointId}/tokens`);
            if (res.ok) {
                const data = await res.json();
                setTokens(data.tokens);
            }
        } catch { /* ignore */ }
        finally { setTokensLoading(false); }
    }, []);

    // ---- Selection ----

    const selectedEndpoint = useMemo(
        () => endpoints.find((e) => e._id === selectedId) || null,
        [endpoints, selectedId]
    );

    const selectEndpoint = useCallback((ep: CustomEndpointDTO) => {
        setSelectedId(ep._id);
        setIsCreating(false);
        setDetailTab('configure');
        setShowTestConsole(false);
        setTestResult(null);
        setGeneratedToken(null);
        const f: EndpointCreateRequest = {
            name: ep.name,
            slug: ep.slug,
            description: ep.description,
            method: ep.method,
            endpointType: ep.endpointType,
            scriptLang: ep.scriptLang,
            scriptContent: ep.scriptContent,
            logicConfig: ep.logicConfig,
            webhookConfig: ep.webhookConfig,
            envVars: ep.envVars,
            auth: ep.auth,
            tags: ep.tags,
            enabled: ep.enabled,
            timeout: ep.timeout,
            responseHeaders: ep.responseHeaders,
        };
        setForm(f);
        setInitialForm(f);
    }, []);

    const startCreate = useCallback(() => {
        setSelectedId(null);
        setIsCreating(true);
        setDetailTab('configure');
        setShowTestConsole(false);
        setTestResult(null);
        setGeneratedToken(null);
        const f: EndpointCreateRequest = {
            name: '',
            slug: '',
            method: 'GET',
            endpointType: 'script',
            scriptLang: 'bash',
            scriptContent: '',
            auth: 'public',
            tags: [],
            enabled: true,
            timeout: 30000,
        };
        setForm(f);
        setInitialForm(f);
    }, []);

    const createFromTemplate = useCallback((tmpl: EndpointTemplate) => {
        setSelectedId(null);
        setIsCreating(true);
        setDetailTab('code');
        setShowTemplates(false);
        setShowTestConsole(false);
        setTestResult(null);
        setGeneratedToken(null);
        const f: EndpointCreateRequest = {
            name: tmpl.name,
            slug: slugify(tmpl.name),
            description: tmpl.description,
            method: tmpl.method,
            endpointType: tmpl.endpointType,
            scriptLang: tmpl.scriptLang,
            scriptContent: tmpl.scriptContent,
            webhookConfig: tmpl.webhookConfig,
            logicConfig: tmpl.logicConfig,
            auth: 'public',
            tags: tmpl.tags,
            enabled: true,
            timeout: 30000,
        };
        setForm(f);
        setInitialForm(f);
    }, []);

    const closeDetail = useCallback(() => {
        if (isDirty) {
            setShowDiscardModal(true);
        } else {
            setSelectedId(null);
            setIsCreating(false);
            setShowTestConsole(false);
            setInitialForm(null);
        }
    }, [isDirty]);

    const confirmDiscard = useCallback(() => {
        setShowDiscardModal(false);
        setSelectedId(null);
        setIsCreating(false);
        setShowTestConsole(false);
        setInitialForm(null);
    }, []);

    const generateCopySnippet = useCallback((format: 'url' | 'curl' | 'powershell' | 'fetch' | 'node' | 'python') => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
        const url = `${baseUrl}/api/endpoints/${form.slug}`;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (form.auth === 'token') {
            headers['Authorization'] = 'Bearer YOUR_TOKEN';
        }

        const safeBody = testBody || '{}';

        switch (format) {
            case 'url':
                return url;
            case 'curl':
                return `curl -X ${form.method} "${url}" \\\n  ${Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' \\\n  ')} \\\n  -d '${safeBody}'`;
            case 'powershell':
                const psHeaders = Object.entries(headers).map(([k, v]) => `"${k}"="${v}"`).join('; ');
                return `Invoke-RestMethod -Uri "${url}" -Method ${form.method} -Headers @{${psHeaders}} -Body '${safeBody}'`;
            case 'fetch':
                return `fetch("${url}", {\n  method: "${form.method}",\n  headers: ${JSON.stringify(headers, null, 2)},\n  body: ${testBody ? `JSON.stringify(${testBody})` : 'null'}\n});`;
            case 'node':
                return `const response = await fetch("${url}", {\n  method: "${form.method}",\n  headers: ${JSON.stringify(headers, null, 2)},\n  body: ${testBody ? `JSON.stringify(${testBody})` : 'null'}\n});\nconst data = await response.json();`;
            case 'python':
                return `import requests\n\nurl = "${url}"\nheaders = ${JSON.stringify(headers, null, 2)}\nresponse = requests.${form.method.toLowerCase()}(url, headers=headers, json=${testBody || '{}'})\nprint(response.json())`;
            default:
                return '';
        }
    }, [form, testBody]);

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            // Sanitize form data before sending
            const sanitizedForm = { ...form };
            
            // Fix timeout
            if (typeof sanitizedForm.timeout !== 'number' || isNaN(sanitizedForm.timeout)) {
                sanitizedForm.timeout = 30000;
            }

            // Remove irrelevant configs based on endpoint type
            if (sanitizedForm.endpointType === 'script') {
                delete sanitizedForm.webhookConfig;
                delete sanitizedForm.logicConfig;
            } else if (sanitizedForm.endpointType === 'webhook') {
                delete sanitizedForm.scriptContent;
                delete sanitizedForm.scriptLang;
                delete sanitizedForm.logicConfig;
                // Ensure targetUrl is trimmed and handled
                if (sanitizedForm.webhookConfig) {
                    sanitizedForm.webhookConfig.targetUrl = sanitizedForm.webhookConfig.targetUrl?.trim() || '';
                }
            } else if (sanitizedForm.endpointType === 'logic') {
                delete sanitizedForm.scriptContent;
                delete sanitizedForm.scriptLang;
                delete sanitizedForm.webhookConfig;
            }

            if (isCreating) {
                const res = await fetch('/api/modules/endpoints/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sanitizedForm),
                });
                const data = await res.json();
                if (!res.ok) {
                    const details = data.details ? Object.entries(data.details).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('; ') : '';
                    throw new Error(data.error + (details ? `: ${details}` : '') || 'Failed to create');
                }
                toast({ title: 'Endpoint created', description: data.name, variant: 'success' });
                setIsCreating(false);
                setSelectedId(data._id);
                setInitialForm({ ...form });
                await loadEndpoints();
            } else if (selectedId) {
                const res = await fetch(`/api/modules/endpoints/${selectedId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(sanitizedForm),
                });
                const data = await res.json();
                if (!res.ok) {
                    const details = data.details ? Object.entries(data.details).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('; ') : '';
                    throw new Error(data.error + (details ? `: ${details}` : '') || 'Failed to update');
                }
                toast({ title: 'Endpoint saved', variant: 'success' });
                setInitialForm({ ...form });
                await loadEndpoints();
            }
        } catch (err: unknown) {
            toast({ title: 'Save failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    }, [form, isCreating, selectedId, toast, loadEndpoints]);

    const handleToggle = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/modules/endpoints/${id}/toggle`, { method: 'PATCH' });
            if (res.ok) await loadEndpoints();
        } catch {
            toast({ title: 'Toggle failed', variant: 'destructive' });
        }
    }, [loadEndpoints, toast]);

    const handleDuplicate = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/modules/endpoints/${id}/duplicate`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                const details = data.details ? Object.entries(data.details).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('; ') : '';
                throw new Error(data.error + (details ? `: ${details}` : ''));
            }
            toast({ title: 'Endpoint duplicated', description: data.name, variant: 'success' });
            await loadEndpoints();
        } catch (err: unknown) {
            toast({ title: 'Duplicate failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
        }
    }, [loadEndpoints, toast]);

    const handleDelete = useCallback(async () => {
        if (!deleteTarget) return;
        try {
            const res = await fetch(`/api/modules/endpoints/${deleteTarget._id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete');
            toast({ title: 'Endpoint deleted', variant: 'success' });
            if (selectedId === deleteTarget._id) closeDetail();
            await loadEndpoints();
        } catch {
            toast({ title: 'Delete failed', variant: 'destructive' });
        } finally {
            setDeleteTarget(null);
        }
    }, [deleteTarget, selectedId, closeDetail, loadEndpoints, toast]);

    // ---- Test ----

    const handleTest = useCallback(async () => {
        if (!selectedId) return;
        setTestLoading(true);
        setShowTestConsole(true);
        try {
            const res = await fetch(`/api/modules/endpoints/${selectedId}/test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: testBody, headers: { 'content-type': 'application/json' } }),
            });
            const data: EndpointTestResult = await res.json();
            setTestResult(data);
        } catch {
            setTestResult({ statusCode: 0, headers: {}, body: 'Test request failed', duration: 0, error: 'Network error' });
        } finally {
            setTestLoading(false);
            await loadEndpoints();
        }
    }, [selectedId, testBody, loadEndpoints]);

    // ---- Tokens ----

    const handleGenerateToken = useCallback(async () => {
        if (!selectedId || !newTokenName.trim()) return;
        try {
            const res = await fetch(`/api/modules/endpoints/${selectedId}/tokens`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newTokenName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setGeneratedToken(data.token);
            setNewTokenName('');
            await loadTokens(selectedId);
            toast({ title: 'Token generated', variant: 'success' });
        } catch (err: unknown) {
            toast({ title: 'Failed to generate token', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
        }
    }, [selectedId, newTokenName, loadTokens, toast]);

    const handleRevokeToken = useCallback(async (tokenId: string) => {
        if (!selectedId) return;
        try {
            await fetch(`/api/modules/endpoints/${selectedId}/tokens/${tokenId}`, { method: 'DELETE' });
            await loadTokens(selectedId);
            toast({ title: 'Token revoked', variant: 'success' });
        } catch {
            toast({ title: 'Failed to revoke token', variant: 'destructive' });
        }
    }, [selectedId, loadTokens, toast]);

    // Load data when tab changes
    useEffect(() => {
        if (!selectedId) return;
        if (detailTab === 'logs') loadLogs(selectedId);
        if (detailTab === 'auth') loadTokens(selectedId);
    }, [detailTab, selectedId, loadLogs, loadTokens]);

    // ---- Form helpers ----

    const updateForm = useCallback(<K extends keyof EndpointCreateRequest>(key: K, value: EndpointCreateRequest[K]) => {
        setForm((prev) => {
            const next = { ...prev, [key]: value };
            if (key === 'name' && isCreating && !prev.slug) {
                next.slug = slugify(value as string);
            }
            return next;
        });
    }, [isCreating]);

    const copySlug = useCallback(async () => {
        const url = `${window.location.origin}/api/endpoints/${form.slug}`;
        await navigator.clipboard.writeText(url);
        setCopiedSlug(true);
        setTimeout(() => setCopiedSlug(false), 2000);
    }, [form.slug]);

    // Slug auto-gen
    const autoSlugRef = useRef(true);
    useEffect(() => {
        if (isCreating && autoSlugRef.current && form.name) {
            setForm((prev) => ({ ...prev, slug: slugify(prev.name || '') }));
        }
    }, [form.name, isCreating]);

    // ---- Keyboard shortcuts ----

    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault();
                startCreate();
            }
            if (e.key === 'Escape') {
                closeDetail();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 's' && (selectedId || isCreating)) {
                e.preventDefault();
                handleSave();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && selectedId && !isCreating) {
                e.preventDefault();
                handleTest();
            }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [startCreate, closeDetail, handleSave, handleTest, selectedId, isCreating]);

    // ---- Render ----

    const showDetail = isCreating || selectedId !== null;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <LoaderCircle className="h-6 w-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex gap-4 h-[calc(100vh-8rem)] relative">
            {/* ---- Left Panel: Endpoint List ---- */}
            <div className={cn(
                'flex flex-col min-w-0 transition-all duration-300',
                showDetail ? 'w-[340px] shrink-0 hidden lg:flex' : 'flex-1',
            )}>
                {/* Toolbar */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search endpoints..."
                            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border/50 bg-background/50 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground/60"
                        />
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadEndpoints(true)}
                        disabled={refreshing}
                        className="h-10 w-10 p-0 rounded-xl"
                    >
                        <RefreshCcw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { loadTemplates(); setShowTemplates(true); }}
                        className="h-10 gap-1.5 rounded-xl font-semibold px-4"
                    >
                        <Sparkles className="w-4 h-4" />
                        <span className="hidden sm:inline">From Template</span>
                    </Button>
                    <Button
                        size="sm"
                        onClick={startCreate}
                        className="h-10 gap-1.5 rounded-xl font-semibold px-4"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">New</span>
                    </Button>
                </div>

                {/* Filters */}
                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {METHODS.map((m) => {
                        const colors = METHOD_COLORS[m];
                        const active = filterMethod === m;
                        return (
                            <button
                                key={m}
                                onClick={() => setFilterMethod(active ? '' : m)}
                                className={cn(
                                    'px-2 py-1 rounded-lg text-[10px] font-mono font-bold border transition-all',
                                    active
                                        ? `${colors.bg} ${colors.text} ${colors.border}`
                                        : 'border-transparent text-muted-foreground hover:bg-accent',
                                )}
                            >
                                {m}
                            </button>
                        );
                    })}
                    <span className="w-px h-4 bg-border mx-1" />
                    {TYPES.map((t) => {
                        const active = filterType === t;
                        const Icon = TYPE_ICONS[t];
                        return (
                            <button
                                key={t}
                                onClick={() => setFilterType(active ? '' : t)}
                                className={cn(
                                    'px-2 py-1 rounded-lg text-[10px] font-medium border transition-all flex items-center gap-1 capitalize',
                                    active
                                        ? 'bg-primary/10 text-primary border-primary/30'
                                        : 'border-transparent text-muted-foreground hover:bg-accent',
                                )}
                            >
                                <Icon className="w-3 h-3" />
                                {t}
                            </button>
                        );
                    })}
                    <span className="w-px h-4 bg-border mx-1" />
                    {(['true', 'false'] as const).map((val) => {
                        const active = filterEnabled === val;
                        return (
                            <button
                                key={val}
                                onClick={() => setFilterEnabled(active ? '' : val)}
                                className={cn(
                                    'px-2 py-1 rounded-lg text-[10px] font-medium border transition-all flex items-center gap-1',
                                    active
                                        ? val === 'true' ? 'bg-success/10 text-success border-success/30' : 'bg-muted text-muted-foreground border-border'
                                        : 'border-transparent text-muted-foreground hover:bg-accent',
                                )}
                            >
                                <span className={cn('w-1.5 h-1.5 rounded-full', val === 'true' ? 'bg-success' : 'bg-muted-foreground/40')} />
                                {val === 'true' ? 'Active' : 'Disabled'}
                            </button>
                        );
                    })}
                </div>

                {/* Endpoint List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {endpoints.length === 0 && !loading ? (
                        <EmptyState
                            onCreateNew={startCreate}
                            onFromTemplate={() => { loadTemplates(); setShowTemplates(true); }}
                        />
                    ) : (
                        endpoints.map((ep) => (
                            <button
                                key={ep._id}
                                onClick={() => selectEndpoint(ep)}
                                className={cn(
                                    'w-full text-left p-3 rounded-xl border transition-all group',
                                    selectedId === ep._id
                                        ? 'bg-primary/5 border-primary/30 shadow-sm'
                                        : 'bg-card/50 border-border/40 hover:bg-accent/50 hover:border-border',
                                )}
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <MethodBadge method={ep.method} />
                                    <span className="text-sm font-semibold text-foreground truncate flex-1">{ep.name}</span>
                                    <span
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => { e.stopPropagation(); handleToggle(ep._id); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleToggle(ep._id); } }}
                                        title={ep.enabled ? 'Disable' : 'Enable'}
                                        className={cn(
                                            'w-2.5 h-2.5 rounded-full shrink-0 cursor-pointer ring-2 ring-transparent hover:ring-current transition-all',
                                            ep.enabled ? 'bg-success text-success' : 'bg-muted-foreground/40 text-muted-foreground/40',
                                        )}
                                    />
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <code className="truncate flex-1 font-mono">/api/endpoints/{ep.slug}</code>
                                    <span className="shrink-0">{ep.executionCount.toLocaleString()} hits</span>
                                </div>
                                {ep.lastExecutedAt && (
                                    <div className="text-[10px] text-muted-foreground/70 mt-1">
                                        Last run {relativeTime(ep.lastExecutedAt)}
                                        {ep.lastStatus && (
                                            <span className={cn(
                                                'ml-1.5',
                                                ep.lastStatus < 400 ? 'text-success' : 'text-destructive',
                                            )}>
                                                {ep.lastStatus}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </button>
                        ))
                    )}
                </div>

                <div className="pt-2 text-[10px] text-muted-foreground/60 text-center">
                    {total} endpoint{total !== 1 ? 's' : ''}
                </div>
            </div>

            {/* ---- Right Panel: Detail/Editor ---- */}
            {showDetail && (
                <div className={cn(
                    'flex-1 flex flex-col min-w-0 bg-card/40 rounded-2xl border border-border/40 overflow-hidden',
                    'animate-in slide-in-from-right-4 fade-in duration-300',
                )}>
                    {/* Detail Header */}
                    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border/40 bg-card/60">
                        <button onClick={closeDetail} className="lg:hidden p-1.5 rounded-lg hover:bg-accent text-muted-foreground">
                            <X className="w-4 h-4" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <input
                                type="text"
                                value={form.name}
                                onChange={(e) => updateForm('name', e.target.value)}
                                placeholder="Endpoint name..."
                                className="text-base font-bold text-foreground bg-transparent border-none outline-none w-full placeholder:text-muted-foreground/40"
                            />
                            {form.slug && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <code className="text-[11px] font-mono text-muted-foreground truncate">
                                        /api/endpoints/{form.slug}
                                    </code>
                                    <button onClick={copySlug} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
                                        {copiedSlug ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {!isCreating && selectedId && (
                                <>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleTest}
                                        disabled={testLoading}
                                        className="h-8 gap-1.5 rounded-lg text-xs"
                                    >
                                        {testLoading ? <LoaderCircle className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                                        Test
                                    </Button>
                                </>
                            )}
                            <Button
                                size="sm"
                                onClick={handleSave}
                                disabled={saving || !form.name || !isDirty}
                                className="h-8 gap-1.5 rounded-lg text-xs font-semibold"
                            >
                                {saving ? <LoaderCircle className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                {isCreating ? 'Create' : 'Save'}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={closeDetail}
                                className="h-8 gap-1.5 rounded-lg text-xs"
                            >
                                <X className="w-3.5 h-3.5 text-muted-foreground" />
                                Close
                            </Button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-0.5 px-5 pt-2 border-b border-border/40 bg-card/30">
                        {([
                            { id: 'configure', label: 'Configure', icon: Settings },
                            { id: 'code', label: form.endpointType === 'webhook' ? 'Webhook' : form.endpointType === 'logic' ? 'Logic' : 'Code', icon: TYPE_ICONS[form.endpointType || 'script'] },
                            { id: 'auth', label: 'Auth & Tokens', icon: Key },
                            { id: 'logs', label: 'Logs', icon: FileText },
                            { id: 'settings', label: 'Settings', icon: Settings },
                        ] as Array<{ id: DetailTab; label: string; icon: typeof Settings }>).map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setDetailTab(tab.id)}
                                className={cn(
                                    'flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-t-lg transition-colors border-b-2',
                                    detailTab === tab.id
                                        ? 'text-primary border-primary bg-primary/5'
                                        : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-accent/50',
                                )}
                            >
                                <tab.icon className="w-3.5 h-3.5" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-5">
                        {/* ---- Configure Tab ---- */}
                        {detailTab === 'configure' && (
                            <div className="space-y-5 animate-in fade-in duration-200">
                                {/* Slug */}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Slug</label>
                                    <input
                                        type="text"
                                        value={form.slug || ''}
                                        onChange={(e) => { autoSlugRef.current = false; updateForm('slug', e.target.value); }}
                                        placeholder="my-endpoint"
                                        className="w-full h-10 px-3 rounded-xl border border-border/50 bg-background/50 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                                    />
                                </div>

                                {/* Description */}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Description</label>
                                    <textarea
                                        value={form.description || ''}
                                        onChange={(e) => updateForm('description', e.target.value)}
                                        placeholder="What does this endpoint do?"
                                        rows={2}
                                        className="w-full px-3 py-2 rounded-xl border border-border/50 bg-background/50 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
                                    />
                                </div>

                                {/* Method */}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Method</label>
                                    <div className="flex items-center gap-1.5">
                                        {METHODS.map((m) => {
                                            const colors = METHOD_COLORS[m];
                                            const active = form.method === m;
                                            return (
                                                <button
                                                    key={m}
                                                    onClick={() => updateForm('method', m)}
                                                    className={cn(
                                                        'px-3 py-2 rounded-xl text-xs font-mono font-bold border transition-all min-h-[44px]',
                                                        active
                                                            ? `${colors.bg} ${colors.text} ${colors.border} shadow-sm`
                                                            : 'border-border/40 text-muted-foreground hover:bg-accent',
                                                    )}
                                                >
                                                    {m}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Endpoint Type */}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Type</label>
                                    <div className="flex p-1 bg-white/[0.03] border border-white/5 rounded-[1.25rem] backdrop-blur-md">
                                        {TYPES.map((t) => {
                                            const Icon = TYPE_ICONS[t];
                                            const active = form.endpointType === t;
                                            return (
                                                <button
                                                    key={t}
                                                    onClick={() => updateForm('endpointType', t)}
                                                    className={cn(
                                                        'flex-1 flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-[1rem] text-xs font-bold transition-all duration-300 relative group',
                                                        active
                                                            ? 'bg-primary/10 text-primary shadow-[0_0_20px_rgba(var(--primary),0.15)] border border-primary/20'
                                                            : 'text-muted-foreground/60 hover:text-foreground hover:bg-white/5 border border-transparent'
                                                    )}
                                                >
                                                    <Icon className={cn(
                                                        "w-4 h-4 transition-transform duration-300",
                                                        active ? "scale-110" : "group-hover:scale-110 opacity-50"
                                                    )} />
                                                    <span className="capitalize tracking-tight">{t}</span>
                                                    {active && (
                                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary shadow-[0_0_10px_rgba(var(--primary),0.8)]" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Tags */}
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tags</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {(form.tags || []).map((tag, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted/50 border border-border/40 text-xs">
                                                <Tag className="w-3 h-3 text-muted-foreground" />
                                                {tag}
                                                <button
                                                    onClick={() => updateForm('tags', (form.tags || []).filter((_, j) => j !== i))}
                                                    className="text-muted-foreground hover:text-destructive"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                        <input
                                            type="text"
                                            placeholder="Add tag..."
                                            className="h-7 px-2 text-xs bg-transparent outline-none min-w-[80px]"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                                    updateForm('tags', [...(form.tags || []), e.currentTarget.value.trim()]);
                                                    e.currentTarget.value = '';
                                                }
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Enabled Toggle */}
                                <div className="flex items-center justify-between py-2">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">Enabled</div>
                                        <div className="text-[11px] text-muted-foreground">Endpoint is callable when enabled</div>
                                    </div>
                                    <button
                                        onClick={() => updateForm('enabled', !form.enabled)}
                                        className={cn(
                                            'w-11 h-6 rounded-full transition-all relative',
                                            form.enabled ? 'bg-success' : 'bg-muted-foreground/30',
                                        )}
                                    >
                                        <span className={cn(
                                            'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                                            form.enabled ? 'left-[22px]' : 'left-0.5',
                                        )} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ---- Code / Logic / Webhook Tab ---- */}
                        {detailTab === 'code' && (
                            <div className="space-y-4 animate-in fade-in duration-200">
                                {form.endpointType === 'script' && (
                                    <>
                                        {/* Language picker */}
                                        <div className="flex items-center gap-1 bg-muted/30 rounded-xl p-1 w-fit">
                                            {LANGUAGES.map((lang) => (
                                                <button
                                                    key={lang}
                                                    onClick={() => updateForm('scriptLang', lang)}
                                                    className={cn(
                                                        'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                                                        form.scriptLang === lang
                                                            ? 'bg-card text-foreground shadow-sm'
                                                            : 'text-muted-foreground hover:text-foreground',
                                                    )}
                                                >
                                                    {lang}
                                                </button>
                                            ))}
                                        </div>

                                        <ScriptEditor
                                            value={form.scriptContent || ''}
                                            onChange={(val) => updateForm('scriptContent', val)}
                                            language={form.scriptLang || 'bash'}
                                            onRun={!isCreating && selectedId ? handleTest : undefined}
                                            onSave={handleSave}
                                        />

                                        {/* Env Vars */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Environment Variables</label>
                                                <button
                                                    onClick={() => {
                                                        const vars = { ...(form.envVars || {}), '': '' };
                                                        updateForm('envVars', vars);
                                                    }}
                                                    className="text-[10px] text-primary hover:underline"
                                                >
                                                    + Add
                                                </button>
                                            </div>
                                            {Object.entries(form.envVars || {}).map(([key, value], i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <input
                                                        type="text"
                                                        value={key}
                                                        placeholder="KEY"
                                                        onChange={(e) => {
                                                            const entries = Object.entries(form.envVars || {});
                                                            entries[i] = [e.target.value, value];
                                                            updateForm('envVars', Object.fromEntries(entries));
                                                        }}
                                                        className="flex-1 h-8 px-2 rounded-lg border border-border/40 bg-background/50 text-xs font-mono outline-none focus:ring-1 focus:ring-primary/30"
                                                    />
                                                    <span className="text-muted-foreground">=</span>
                                                    <input
                                                        type="text"
                                                        value={value}
                                                        placeholder="value"
                                                        onChange={(e) => {
                                                            const entries = Object.entries(form.envVars || {});
                                                            entries[i] = [key, e.target.value];
                                                            updateForm('envVars', Object.fromEntries(entries));
                                                        }}
                                                        className="flex-1 h-8 px-2 rounded-lg border border-border/40 bg-background/50 text-xs font-mono outline-none focus:ring-1 focus:ring-primary/30"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const entries = Object.entries(form.envVars || {}).filter((_, j) => j !== i);
                                                            updateForm('envVars', Object.fromEntries(entries));
                                                        }}
                                                        className="text-muted-foreground hover:text-destructive"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {form.endpointType === 'webhook' && (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Target URL</label>
                                            <input
                                                type="url"
                                                value={form.webhookConfig?.targetUrl || ''}
                                                onChange={(e) => updateForm('webhookConfig', { ...form.webhookConfig, targetUrl: e.target.value })}
                                                placeholder="https://example.com/webhook"
                                                className="w-full h-10 px-3 rounded-xl border border-border/50 bg-background/50 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Method Override</label>
                                            <div className="flex items-center gap-1.5">
                                                {['', ...METHODS].map((m) => (
                                                    <button
                                                        key={m}
                                                        onClick={() => updateForm('webhookConfig', { ...form.webhookConfig, targetUrl: form.webhookConfig?.targetUrl || '', method: (m || undefined) as HttpMethod | undefined })}
                                                        className={cn(
                                                            'px-2.5 py-1.5 rounded-lg text-[10px] font-mono font-bold border transition-all',
                                                            (form.webhookConfig?.method || '') === m
                                                                ? 'bg-primary/10 text-primary border-primary/30'
                                                                : 'border-border/40 text-muted-foreground hover:bg-accent',
                                                        )}
                                                    >
                                                        {m || 'Same'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between py-2">
                                            <div>
                                                <div className="text-sm font-medium text-foreground">Forward Headers</div>
                                                <div className="text-[11px] text-muted-foreground">Pass incoming headers to the target</div>
                                            </div>
                                            <button
                                                onClick={() => updateForm('webhookConfig', { ...form.webhookConfig, targetUrl: form.webhookConfig?.targetUrl || '', forwardHeaders: !form.webhookConfig?.forwardHeaders })}
                                                className={cn(
                                                    'w-11 h-6 rounded-full transition-all relative',
                                                    form.webhookConfig?.forwardHeaders ? 'bg-success' : 'bg-muted-foreground/30',
                                                )}
                                            >
                                                <span className={cn(
                                                    'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                                                    form.webhookConfig?.forwardHeaders ? 'left-[22px]' : 'left-0.5',
                                                )} />
                                            </button>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Body Transform (JS)</label>
                                            <textarea
                                                value={form.webhookConfig?.transformBody || ''}
                                                onChange={(e) => updateForm('webhookConfig', { ...form.webhookConfig, targetUrl: form.webhookConfig?.targetUrl || '', transformBody: e.target.value })}
                                                placeholder="return { text: input.message };"
                                                rows={4}
                                                className="w-full px-3 py-2 rounded-xl border border-border/50 bg-[#1e1e2e] text-[#cdd6f4] text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-y"
                                                spellCheck={false}
                                            />
                                        </div>
                                    </div>
                                )}

                                {form.endpointType === 'logic' && (
                                    <div className="space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Request Schema (JSON)</label>
                                            <textarea
                                                value={form.logicConfig?.requestSchema || ''}
                                                onChange={(e) => updateForm('logicConfig', { ...form.logicConfig, requestSchema: e.target.value })}
                                                placeholder='{"type":"object","required":["name"]}'
                                                rows={4}
                                                className="w-full px-3 py-2 rounded-xl border border-border/50 bg-[#1e1e2e] text-[#cdd6f4] text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-y"
                                                spellCheck={false}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Handler Code (JS)</label>
                                            <textarea
                                                value={form.logicConfig?.handlerCode || ''}
                                                onChange={(e) => updateForm('logicConfig', { ...form.logicConfig, handlerCode: e.target.value })}
                                                placeholder="return { statusCode: 200, body: { message: 'Hello ' + input.name } };"
                                                rows={8}
                                                className="w-full px-3 py-2 rounded-xl border border-border/50 bg-[#1e1e2e] text-[#cdd6f4] text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-y"
                                                spellCheck={false}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Response Mapping (JSON)</label>
                                            <textarea
                                                value={form.logicConfig?.responseMapping || ''}
                                                onChange={(e) => updateForm('logicConfig', { ...form.logicConfig, responseMapping: e.target.value })}
                                                placeholder='{"statusCode":200,"body":{"message":"OK"}}'
                                                rows={3}
                                                className="w-full px-3 py-2 rounded-xl border border-border/50 bg-[#1e1e2e] text-[#cdd6f4] text-sm font-mono outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-y"
                                                spellCheck={false}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ---- Auth & Tokens Tab ---- */}
                        {detailTab === 'auth' && (
                            <div className="space-y-5 animate-in fade-in duration-200">
                                <div className="flex items-center justify-between py-2">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">Authentication</div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {form.auth === 'public' ? 'Anyone can call this endpoint' : 'Requires a valid bearer token'}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 bg-muted/30 rounded-xl p-1">
                                        <button
                                            onClick={() => updateForm('auth', 'public')}
                                            className={cn(
                                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                                form.auth === 'public' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                                            )}
                                        >
                                            <LockOpen className="w-3 h-3" />
                                            Public
                                        </button>
                                        <button
                                            onClick={() => updateForm('auth', 'token')}
                                            className={cn(
                                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                                form.auth === 'token' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                                            )}
                                        >
                                            <Shield className="w-3 h-3" />
                                            Token
                                        </button>
                                    </div>
                                </div>
                                {isCreating && (
                                    <div className="flex flex-col items-center py-8 text-center bg-muted/20 rounded-xl border border-dashed border-border/60">
                                        <Key className="w-8 h-8 text-muted-foreground/30 mb-3" />
                                        <p className="text-sm font-medium text-muted-foreground">Tokens require a saved endpoint</p>
                                        <p className="text-[11px] text-muted-foreground/60 max-w-[240px]">
                                            You can configure the authentication type now, but token generation will be available after you save the endpoint.
                                        </p>
                                    </div>
                                )}

                                {!isCreating && form.auth === 'token' && (
                                    <>
                                        {/* Generated token display */}
                                        {generatedToken && (
                                            <div className="p-4 rounded-xl border border-warning/30 bg-warning/5">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <AlertTriangle className="w-4 h-4 text-warning" />
                                                    <span className="text-xs font-semibold text-warning">Copy this token now — it won&apos;t be shown again</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 text-xs font-mono bg-background/50 px-3 py-2 rounded-lg break-all">{generatedToken}</code>
                                                    <button
                                                        onClick={async () => {
                                                            await navigator.clipboard.writeText(generatedToken);
                                                            toast({ title: 'Token copied', variant: 'success' });
                                                        }}
                                                        className="shrink-0 p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Generate new token */}
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={newTokenName}
                                                onChange={(e) => setNewTokenName(e.target.value)}
                                                placeholder="Token name (e.g., 'CI/CD Pipeline')"
                                                className="flex-1 h-10 px-3 rounded-xl border border-border/50 bg-background/50 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleGenerateToken(); }}
                                            />
                                            <Button
                                                size="sm"
                                                onClick={handleGenerateToken}
                                                disabled={!newTokenName.trim()}
                                                className="h-10 gap-1.5 rounded-xl"
                                            >
                                                <Key className="w-3.5 h-3.5" />
                                                Generate
                                            </Button>
                                        </div>

                                        {/* Token list */}
                                        {tokensLoading ? (
                                            <div className="flex justify-center py-6">
                                                <LoaderCircle className="w-5 h-5 animate-spin text-primary" />
                                            </div>
                                        ) : tokens.length === 0 ? (
                                            <div className="flex flex-col items-center py-8 text-center">
                                                <Key className="w-8 h-8 text-muted-foreground/40 mb-3" />
                                                <p className="text-sm text-muted-foreground">No tokens yet</p>
                                                <p className="text-[11px] text-muted-foreground/70">Generate a token to protect this endpoint</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {tokens.map((token) => (
                                                    <div key={token._id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/30">
                                                        <Key className="w-4 h-4 text-muted-foreground shrink-0" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-sm font-medium text-foreground">{token.name}</div>
                                                            <div className="text-[10px] text-muted-foreground font-mono">{token.prefix}</div>
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground text-right shrink-0">
                                                            {token.lastUsedAt ? `Used ${relativeTime(token.lastUsedAt)}` : 'Never used'}
                                                        </div>
                                                        <button
                                                            onClick={() => handleRevokeToken(token._id)}
                                                            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                                            title="Revoke token"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Usage Example */}
                                        <div className="mt-8 space-y-4 pt-6 border-t border-border/40">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <Terminal className="w-4 h-4 text-primary" />
                                                    <h4 className="text-xs font-bold uppercase tracking-widest text-foreground">Usage Example</h4>
                                                </div>
                                                <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg">
                                                    {(['curl', 'fetch'] as const).map((tab) => (
                                                        <button
                                                            key={tab}
                                                            onClick={() => setExampleTab(tab)}
                                                            className={cn(
                                                                "px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                                                                exampleTab === tab 
                                                                    ? "bg-card text-primary shadow-sm" 
                                                                    : "text-muted-foreground hover:text-foreground"
                                                            )}
                                                        >
                                                            {tab}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="relative group">
                                                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button 
                                                        onClick={() => {
                                                            const url = `${window.location.origin}/api/endpoints/${form.slug}`;
                                                            const code = exampleTab === 'curl' 
                                                                ? `curl -X ${form.method} "${url}" \\\n  -H "Authorization: Bearer YOUR_TOKEN"`
                                                                : `fetch("${url}", {\n  method: "${form.method}",\n  headers: {\n    "Authorization": "Bearer YOUR_TOKEN"\n  }\n});`;
                                                            navigator.clipboard.writeText(code);
                                                            toast({ title: 'Example copied', variant: 'success' });
                                                        }}
                                                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground backdrop-blur-md border border-white/10 shadow-xl transition-all"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <pre className="p-4 rounded-2xl bg-[#0d0d0d] border border-white/5 text-[11px] font-mono leading-relaxed overflow-x-auto text-blue-400 select-all">
                                                    {exampleTab === 'curl' ? (
                                                        <>
                                                            <span className="text-purple-400">curl</span> <span className="text-orange-400">-X</span> {form.method} <span className="text-green-400">&quot;{window.location.origin}/api/endpoints/{form.slug}&quot;</span> \<br />
                                                            &nbsp;&nbsp;<span className="text-orange-400">-H</span> <span className="text-green-400">&quot;Authorization: Bearer <span className="bg-primary/20 text-primary px-1 rounded">YOUR_TOKEN</span>&quot;</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="text-purple-400">fetch</span>(<span className="text-green-400">&quot;{window.location.origin}/api/endpoints/{form.slug}&quot;</span>, &#123;<br />
                                                            &nbsp;&nbsp;method: <span className="text-green-400">&quot;{form.method}&quot;</span>,<br />
                                                            &nbsp;&nbsp;headers: &#123;<br />
                                                            &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-green-400">&quot;Authorization&quot;</span>: <span className="text-green-400">&quot;Bearer <span className="bg-primary/20 text-primary px-1 rounded">YOUR_TOKEN</span>&quot;</span><br />
                                                            &nbsp;&nbsp;&#125;<br />
                                                            &#125;);
                                                        </>
                                                    )}
                                                </pre>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground/60 italic">
                                                Replace <code className="text-primary font-bold">YOUR_TOKEN</code> with one of the generated tokens above.
                                            </p>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ---- Logs Tab ---- */}
                        {detailTab === 'logs' && (
                            <div className="space-y-3 animate-in fade-in duration-200">
                                {logsLoading ? (
                                    <div className="flex justify-center py-12">
                                        <LoaderCircle className="w-5 h-5 animate-spin text-primary" />
                                    </div>
                                ) : isCreating ? (
                                    <div className="flex flex-col items-center py-12 text-center">
                                        <FileText className="w-8 h-8 text-muted-foreground/40 mb-3" />
                                        <p className="text-sm text-muted-foreground">No execution logs yet</p>
                                        <p className="text-[11px] text-muted-foreground/70">Logs will appear here after the endpoint is created and called.</p>
                                    </div>
                                ) : logs.length === 0 ? (
                                    <div className="flex flex-col items-center py-12 text-center">
                                        <FileText className="w-8 h-8 text-muted-foreground/40 mb-3" />
                                        <p className="text-sm text-muted-foreground">No execution logs</p>
                                        <p className="text-[11px] text-muted-foreground/70">Logs will appear here after the endpoint is called</p>
                                    </div>
                                ) : (
                                    logs.map((entry) => (
                                        <LogEntry key={entry._id} entry={entry} />
                                    ))
                                )}
                            </div>
                        )}

                        {/* ---- Settings Tab ---- */}
                        {detailTab === 'settings' && (
                            <div className="space-y-6 animate-in fade-in duration-200">
                                {/* Timeout */}
                                <div className="space-y-2">
                                    <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                                        Timeout ({((form.timeout || 30000) / 1000).toFixed(0)}s)
                                    </label>
                                    <input
                                        type="range"
                                        min={1000}
                                        max={120000}
                                        step={1000}
                                        value={form.timeout || 30000}
                                        onChange={(e) => updateForm('timeout', Number(e.target.value))}
                                        className="w-full accent-primary"
                                    />
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>1s</span>
                                        <span>120s</span>
                                    </div>
                                </div>

                                {/* Response Headers */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Custom Response Headers</label>
                                        <button
                                            onClick={() => updateForm('responseHeaders', { ...(form.responseHeaders || {}), '': '' })}
                                            className="text-[10px] text-primary hover:underline"
                                        >
                                            + Add
                                        </button>
                                    </div>
                                    {Object.entries(form.responseHeaders || {}).map(([key, value], i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={key}
                                                placeholder="Header-Name"
                                                onChange={(e) => {
                                                    const entries = Object.entries(form.responseHeaders || {});
                                                    entries[i] = [e.target.value, value];
                                                    updateForm('responseHeaders', Object.fromEntries(entries));
                                                }}
                                                className="flex-1 h-8 px-2 rounded-lg border border-border/40 bg-background/50 text-xs font-mono outline-none focus:ring-1 focus:ring-primary/30"
                                            />
                                            <span className="text-muted-foreground">:</span>
                                            <input
                                                type="text"
                                                value={value}
                                                placeholder="value"
                                                onChange={(e) => {
                                                    const entries = Object.entries(form.responseHeaders || {});
                                                    entries[i] = [key, e.target.value];
                                                    updateForm('responseHeaders', Object.fromEntries(entries));
                                                }}
                                                className="flex-1 h-8 px-2 rounded-lg border border-border/40 bg-background/50 text-xs font-mono outline-none focus:ring-1 focus:ring-primary/30"
                                            />
                                            <button
                                                onClick={() => {
                                                    const entries = Object.entries(form.responseHeaders || {}).filter((_, j) => j !== i);
                                                    updateForm('responseHeaders', Object.fromEntries(entries));
                                                }}
                                                className="text-muted-foreground hover:text-destructive"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                {/* Actions */}
                                {!isCreating && selectedEndpoint && (
                                    <div className="space-y-3 pt-4 border-t border-border/40">
                                        <h4 className="text-xs font-semibold text-destructive uppercase tracking-wider">Danger Zone</h4>
                                        <div className="flex items-center gap-3">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => selectedId && handleDuplicate(selectedId)}
                                                className="gap-1.5 text-xs"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                Duplicate
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => setDeleteTarget(selectedEndpoint)}
                                                className="gap-1.5 text-xs"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Delete Endpoint
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ---- Test Console ---- */}
                    {showTestConsole && (
                        <div className="border-t border-border/40 bg-[#1e1e2e] animate-in slide-in-from-bottom-4 duration-300">
                            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
                                <span className="text-xs font-semibold text-white/70">Test Console</span>
                                <button onClick={() => setShowTestConsole(false)} className="text-white/40 hover:text-white/70">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 divide-x divide-white/10 max-h-[300px]">
                                <div className="p-3 overflow-y-auto relative">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Request Body</p>
                                        <div className="relative" ref={copyRequestMenuRef}>
                                            <button 
                                                onClick={() => setShowCopyRequestMenu(!showCopyRequestMenu)}
                                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors text-[10px] font-medium"
                                            >
                                                <Copy className="w-3 h-3" />
                                                Copy
                                                <ChevronDown className="w-2.5 h-2.5" />
                                            </button>
                                            {showCopyRequestMenu && (
                                                <div className="absolute right-0 top-full mt-1 w-48 py-1.5 rounded-xl border border-white/10 bg-[#2d2d3d] shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-200">
                                                    {[
                                                        { label: 'Copy URL', format: 'url' },
                                                        { label: 'Copy as cURL', format: 'curl' },
                                                        { label: 'Copy as PowerShell', format: 'powershell' },
                                                        { label: 'Copy as fetch', format: 'fetch' },
                                                        { label: 'Copy as fetch (Node.js)', format: 'node' },
                                                        { label: 'Copy as Python', format: 'python' },
                                                    ].map((opt) => (
                                                        <button
                                                            key={opt.label}
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(generateCopySnippet(opt.format as 'url' | 'curl' | 'powershell' | 'fetch' | 'node' | 'python'));
                                                                toast({ title: 'Copied to clipboard', variant: 'success' });
                                                                setShowCopyRequestMenu(false);
                                                            }}
                                                            className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <textarea
                                        value={testBody}
                                        onChange={(e) => setTestBody(e.target.value)}
                                        placeholder='{"key": "value"}'
                                        className="w-full h-[200px] bg-transparent text-white/80 text-xs font-mono outline-none resize-none"
                                        spellCheck={false}
                                    />
                                </div>
                                <div className="p-3 overflow-y-auto relative">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Response</p>
                                        {testResult && (
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(testResult.body);
                                                    toast({ title: 'Response copied', variant: 'success' });
                                                }}
                                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors text-[10px] font-medium"
                                                title="Copy response body"
                                            >
                                                <Copy className="w-3 h-3" />
                                                Copy
                                            </button>
                                        )}
                                    </div>
                                    {testLoading ? (
                                        <div className="flex items-center gap-2 text-white/60 text-xs">
                                            <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                                            Running...
                                        </div>
                                    ) : testResult ? (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    'px-2 py-0.5 rounded-md text-[10px] font-bold',
                                                    testResult.statusCode < 400 ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive',
                                                )}>
                                                    {testResult.statusCode}
                                                </span>
                                                <span className="text-white/40 text-[10px]">{testResult.duration}ms</span>
                                            </div>
                                            <pre className="text-white/70 text-xs font-mono whitespace-pre-wrap break-all">{testResult.body}</pre>
                                            {testResult.stderr && (
                                                <div className="mt-2">
                                                    <p className="text-[10px] text-destructive/70 uppercase tracking-wider mb-1">Stderr</p>
                                                    <pre className="text-destructive/60 text-xs font-mono whitespace-pre-wrap">{testResult.stderr}</pre>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-white/30 text-xs">Press Test or Cmd+Enter to run</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ---- Template Gallery Modal ---- */}
            {showTemplates && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setShowTemplates(false)} />
                    <div className="relative w-full max-w-2xl rounded-3xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-300">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h3 className="text-lg font-bold text-foreground">Start from a Template</h3>
                                <p className="text-sm text-muted-foreground">Choose a template to get started quickly</p>
                            </div>
                            <button onClick={() => setShowTemplates(false)} className="p-2 rounded-xl hover:bg-accent text-muted-foreground">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {templates.map((tmpl) => (
                                <button
                                    key={tmpl.id}
                                    onClick={() => createFromTemplate(tmpl)}
                                    className="text-left p-4 rounded-2xl border border-border/40 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                                >
                                    <div className="flex items-center gap-3 mb-2">
                                        <MethodBadge method={tmpl.method} size="lg" />
                                        <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{tmpl.name}</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2">{tmpl.description}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        {tmpl.scriptLang && (
                                            <span className="px-1.5 py-0.5 rounded-md bg-muted/50 text-[10px] font-mono text-muted-foreground capitalize">{tmpl.scriptLang}</span>
                                        )}
                                        <span className="px-1.5 py-0.5 rounded-md bg-muted/50 text-[10px] text-muted-foreground capitalize">{tmpl.endpointType}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ---- Delete Confirmation ---- */}
            <ConfirmationModal
                isOpen={!!deleteTarget}
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
                title="Delete Endpoint"
                message={`Are you sure you want to delete "${deleteTarget?.name}"? This will remove all tokens and execution logs.`}
                confirmLabel="Delete"
                variant="danger"
                verificationText={deleteTarget?.slug}
            />

            {/* Discard Changes Confirmation */}
            <ConfirmationModal
                isOpen={showDiscardModal}
                onConfirm={confirmDiscard}
                onCancel={() => setShowDiscardModal(false)}
                title="Unsaved Changes"
                message="You have unsaved changes in this endpoint. If you close now, all changes will be permanently lost."
                confirmLabel="Discard Changes"
                cancelLabel="Keep Editing"
                variant="warning"
            />
        </div>
    );
}

// ---- Log Entry Component ----

function LogEntry({ entry }: { entry: EndpointExecutionLogDTO }) {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className="rounded-xl border border-border/30 overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30 transition-colors"
            >
                <span className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    entry.statusCode < 400 ? 'bg-success' : 'bg-destructive',
                )} />
                <span className={cn(
                    'text-xs font-mono font-bold shrink-0',
                    entry.statusCode < 400 ? 'text-success' : 'text-destructive',
                )}>
                    {entry.statusCode}
                </span>
                <span className="text-xs text-muted-foreground">{entry.duration}ms</span>
                <span className="flex-1" />
                <Badge variant={entry.triggeredBy === 'test' ? 'outline' : 'default'} className="text-[10px] h-5">
                    {entry.triggeredBy}
                </Badge>
                <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(entry.createdAt)}</span>
                <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
            </button>
            {expanded && (
                <div className="px-4 py-3 border-t border-border/20 bg-muted/10 space-y-3 text-xs animate-in fade-in duration-200">
                    {entry.requestBody && (
                        <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Request</p>
                            <pre className="font-mono text-foreground/80 bg-background/50 rounded-lg px-3 py-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{entry.requestBody}</pre>
                        </div>
                    )}
                    {entry.responseBody && (
                        <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Response</p>
                            <pre className="font-mono text-foreground/80 bg-background/50 rounded-lg px-3 py-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{entry.responseBody}</pre>
                        </div>
                    )}
                    {entry.stdout && (
                        <div>
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Stdout</p>
                            <pre className="font-mono text-foreground/80 bg-background/50 rounded-lg px-3 py-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{entry.stdout}</pre>
                        </div>
                    )}
                    {entry.stderr && (
                        <div>
                            <p className="text-[10px] font-medium text-destructive/70 uppercase tracking-wider mb-1">Stderr</p>
                            <pre className="font-mono text-destructive/80 bg-destructive/5 rounded-lg px-3 py-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">{entry.stderr}</pre>
                        </div>
                    )}
                    {entry.error && (
                        <div>
                            <p className="text-[10px] font-medium text-destructive/70 uppercase tracking-wider mb-1">Error</p>
                            <p className="text-destructive/80">{entry.error}</p>
                        </div>
                    )}
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground/60">
                        {entry.requestMeta.ip && <span>IP: {entry.requestMeta.ip}</span>}
                        {entry.requestMeta.userAgent && <span className="truncate">{entry.requestMeta.userAgent}</span>}
                    </div>
                </div>
            )}
        </div>
    );
}
