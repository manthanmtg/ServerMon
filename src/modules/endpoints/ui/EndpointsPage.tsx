'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { slugify } from '@/lib/utils';

// Types
import type {
  CustomEndpointDTO,
  EndpointsListResponse,
  EndpointCreateRequest,
  EndpointTestResult,
  EndpointTemplate,
  HttpMethod,
  EndpointExecutionLogDTO,
  EndpointToken,
  DetailTab,
} from '../types';

// Components
import { EndpointList } from './components/EndpointList';
import { EndpointDetail } from './components/EndpointDetail';
import { EndpointConfig } from './components/EndpointConfig';
import { EndpointEditor } from './components/EndpointEditor';
import { EndpointAuth } from './components/EndpointAuth';
import { EndpointLogs } from './components/EndpointLogs';
import { EndpointSettings } from './components/EndpointSettings';
import { EndpointTestConsole } from './components/EndpointTestConsole';
import { TemplateGallery } from './components/TemplateGallery';
import { ResizeHandle } from './components/common/ResizeHandle';

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

  // Resizable list panel (left side)
  const [listWidth, setListWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        copyRequestMenuRef.current &&
        !copyRequestMenuRef.current.contains(event.target as Node)
      ) {
        setShowCopyRequestMenu(false);
      }
    };
    if (showCopyRequestMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCopyRequestMenu]);

  // ---- Data loading ----

  const loadEndpoints = useCallback(
    async (showRefresh = false) => {
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
    },
    [search, filterMethod, filterType, filterEnabled, toast]
  );

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
    } catch {
      /* ignore */
    }
  }, []);

  const loadLogs = useCallback(async (endpointId: string) => {
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/modules/endpoints/${endpointId}/logs?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const loadTokens = useCallback(async (endpointId: string) => {
    setTokensLoading(true);
    try {
      const res = await fetch(`/api/modules/endpoints/${endpointId}/tokens`);
      if (res.ok) {
        const data = await res.json();
        setTokens(data.tokens || []);
      }
    } catch {
      /* ignore */
    } finally {
      setTokensLoading(false);
    }
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

  const generateCopySnippet = useCallback(
    (format: 'url' | 'curl' | 'powershell' | 'fetch' | 'node' | 'python') => {
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
          return `curl -X ${form.method} "${url}" \\\n  ${Object.entries(headers)
            .map(([k, v]) => `-H "${k}: ${v}"`)
            .join(' \\\n  ')} \\\n  -d '${safeBody}'`;
        case 'powershell':
          const psHeaders = Object.entries(headers)
            .map(([k, v]) => `"${k}"="${v}"`)
            .join('; ');
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
    },
    [form, testBody]
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const sanitizedForm = { ...form };
      if (typeof sanitizedForm.timeout !== 'number' || isNaN(sanitizedForm.timeout)) {
        sanitizedForm.timeout = 30000;
      }

      if (sanitizedForm.endpointType === 'script') {
        delete sanitizedForm.webhookConfig;
        delete sanitizedForm.logicConfig;
      } else if (sanitizedForm.endpointType === 'webhook') {
        delete sanitizedForm.scriptContent;
        delete sanitizedForm.scriptLang;
        delete sanitizedForm.logicConfig;
        if (sanitizedForm.webhookConfig) {
          sanitizedForm.webhookConfig.targetUrl =
            sanitizedForm.webhookConfig.targetUrl?.trim() || '';
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
        if (!res.ok) throw new Error(data.error || 'Failed to create');
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
        if (!res.ok) throw new Error(data.error || 'Failed to update');
        toast({ title: 'Endpoint saved', variant: 'success' });
        setInitialForm({ ...form });
        await loadEndpoints();
      }
    } catch (err: unknown) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [form, isCreating, selectedId, toast, loadEndpoints]);

  const handleToggle = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/modules/endpoints/${id}/toggle`, { method: 'PATCH' });
        if (res.ok) await loadEndpoints();
      } catch {
        toast({ title: 'Toggle failed', variant: 'destructive' });
      }
    },
    [loadEndpoints, toast]
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/modules/endpoints/${id}/duplicate`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        toast({ title: 'Endpoint duplicated', description: data.name, variant: 'success' });
        await loadEndpoints();
      } catch (err: unknown) {
        toast({
          title: 'Duplicate failed',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    },
    [loadEndpoints, toast]
  );

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
      setTestResult({
        statusCode: 0,
        headers: {},
        body: 'Test request failed',
        duration: 0,
      });
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
      toast({
        title: 'Failed to generate token',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [selectedId, newTokenName, loadTokens, toast]);

  const handleRevokeToken = useCallback(
    async (tokenId: string) => {
      if (!selectedId) return;
      try {
        await fetch(`/api/modules/endpoints/${selectedId}/tokens/${tokenId}`, { method: 'DELETE' });
        await loadTokens(selectedId);
        toast({ title: 'Token revoked', variant: 'success' });
      } catch {
        toast({ title: 'Failed to revoke token', variant: 'destructive' });
      }
    },
    [selectedId, loadTokens, toast]
  );

  // Load data when tab changes
  useEffect(() => {
    if (!selectedId) return;
    if (detailTab === 'logs') loadLogs(selectedId);
    if (detailTab === 'auth') loadTokens(selectedId);
  }, [detailTab, selectedId, loadLogs, loadTokens]);

  // ---- Form helpers ----

  const updateForm = useCallback(
    <K extends keyof EndpointCreateRequest>(key: K, value: EndpointCreateRequest[K]) => {
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        if (key === 'name' && isCreating && !prev.slug) {
          next.slug = slugify(value as string);
        }
        return next;
      });
    },
    [isCreating]
  );

  const copySlugUrl = useCallback(async () => {
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

  return (
    <div ref={containerRef} className="flex gap-6 h-[calc(100vh-8.5rem)] relative overflow-hidden">
      {/* List Panel */}
      <div 
        className="flex flex-col min-w-0 h-full"
        style={showDetail ? { width: listWidth } : { flex: 1 }}
      >
        <EndpointList
          endpoints={endpoints}
          total={total}
          loading={loading}
          refreshing={refreshing}
          selectedId={selectedId}
          showDetail={showDetail}
          search={search}
          filterMethod={filterMethod}
          filterType={filterType}
          filterEnabled={filterEnabled}
          onSearch={setSearch}
          onFilterMethod={setFilterMethod}
          onFilterType={setFilterType}
          onFilterEnabled={setFilterEnabled}
          onRefresh={() => loadEndpoints(true)}
          onSelect={selectEndpoint}
          onCreate={startCreate}
          onShowTemplates={() => {
            loadTemplates();
            setShowTemplates(true);
          }}
          onToggle={handleToggle}
          isResizing={isResizing}
        />
      </div>

      {/* Resize Handle */}
      {showDetail && (
        <ResizeHandle
          onDragStart={() => setIsResizing(true)}
          onDragEnd={() => setIsResizing(false)}
          onDrag={(clientX) => {
            const containerLeft = containerRef.current?.getBoundingClientRect().left ?? 0;
            const newWidth = Math.max(300, Math.min(600, clientX - containerLeft));
            setListWidth(newWidth);
          }}
        />
      )}

      {/* Detail/Editor Panel */}
      {showDetail && (
        <EndpointDetail
          form={form}
          initialForm={initialForm}
          selectedId={selectedId}
          isCreating={isCreating}
          isDirty={isDirty}
          saving={saving}
          testLoading={testLoading}
          detailTab={detailTab}
          copiedSlug={copiedSlug}
          onUpdateForm={updateForm}
          onCopySlug={copySlugUrl}
          onCloseDetail={closeDetail}
          onSave={handleSave}
          onTest={handleTest}
          onTabChange={setDetailTab}
          showTestConsole={showTestConsole}
        >
          {detailTab === 'configure' && (
            <EndpointConfig 
              form={form} 
              onUpdateForm={updateForm} 
              autoSlugRef={autoSlugRef} 
            />
          )}

          {detailTab === 'code' && (
            <EndpointEditor
              form={form}
              onUpdateForm={updateForm}
              onRun={!isCreating && selectedId ? handleTest : undefined}
              onSave={handleSave}
            />
          )}

          {detailTab === 'auth' && (
            <EndpointAuth
              form={form}
              selectedId={selectedId}
              isCreating={isCreating}
              tokens={tokens}
              tokensLoading={tokensLoading}
              newTokenName={newTokenName}
              generatedToken={generatedToken}
              onUpdateForm={updateForm}
              onGenerateToken={handleGenerateToken}
              onRevokeToken={handleRevokeToken}
              onSetNewTokenName={setNewTokenName}
              exampleTab={exampleTab}
              onSetExampleTab={setExampleTab}
              onCopySnippet={(code) => {
                navigator.clipboard.writeText(code);
                toast({ title: 'Copied to clipboard', variant: 'success' });
              }}
            />
          )}

          {detailTab === 'logs' && (
            <EndpointLogs 
              logs={logs} 
              logsLoading={logsLoading} 
              isCreating={isCreating} 
            />
          )}

          {detailTab === 'settings' && (
            <EndpointSettings
              form={form}
              selectedEndpoint={selectedEndpoint}
              selectedId={selectedId}
              isCreating={isCreating}
              onUpdateForm={updateForm}
              onDuplicate={handleDuplicate}
              onDelete={setDeleteTarget}
            />
          )}

          {showTestConsole && (
             <div className="fixed bottom-0 right-0 left-0 lg:left-[auto] lg:w-[calc(100%-listWidth-3rem)] pointer-events-none">
                <div className="pointer-events-auto">
                    <EndpointTestConsole
                      testBody={testBody}
                      testResult={testResult}
                      testLoading={testLoading}
                      showCopyRequestMenu={showCopyRequestMenu}
                      copyRequestMenuRef={copyRequestMenuRef}
                      onSetTestBody={setTestBody}
                      onToggleCopyMenu={() => setShowCopyRequestMenu(!showCopyRequestMenu)}
                      onClose={() => setShowTestConsole(false)}
                      onCopySnippet={(format) => {
                        navigator.clipboard.writeText(generateCopySnippet(format));
                        toast({ title: 'Copied to clipboard', variant: 'success' });
                        setShowCopyRequestMenu(false);
                      }}
                      onCopyResponse={() => {
                        if (testResult) {
                          navigator.clipboard.writeText(testResult.body);
                          toast({ title: 'Response copied', variant: 'success' });
                        }
                      }}
                      onRun={handleTest}
                    />
                </div>
             </div>
          )}
        </EndpointDetail>
      )}

      {/* Template Gallery Modal */}
      {showTemplates && (
        <TemplateGallery
          templates={templates}
          onClose={() => setShowTemplates(false)}
          onCreateFromTemplate={createFromTemplate}
        />
      )}

      {/* Modals */}
      <ConfirmationModal
        isOpen={!!deleteTarget}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title="Terminate Endpoint"
        message={`Are you sure you want to permanently delete "${deleteTarget?.name}"? All associated tokens and execution history will be purged.`}
        confirmLabel="Terminate"
        variant="danger"
        verificationText={deleteTarget?.slug}
      />

      <ConfirmationModal
        isOpen={showDiscardModal}
        onConfirm={confirmDiscard}
        onCancel={() => setShowDiscardModal(false)}
        title="Unsaved Changes detected"
        message="Your modifications have not been committed. Discarding now will revert all changes to their previous state."
        confirmLabel="Discard"
        cancelLabel="Continue Editing"
        variant="warning"
      />
    </div>
  );
}
