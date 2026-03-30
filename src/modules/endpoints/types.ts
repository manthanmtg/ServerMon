export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type EndpointType = 'script' | 'logic' | 'webhook';
export type ScriptLanguage = 'python' | 'bash' | 'node';
export type EndpointAuth = 'public' | 'token';
export type DetailTab = 'configure' | 'code' | 'auth' | 'logs' | 'settings';

export interface EndpointToken {
  _id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

export interface LogicConfig {
  requestSchema?: string;
  responseMapping?: string;
  handlerCode?: string;
}

export interface WebhookConfig {
  targetUrl: string;
  method?: HttpMethod;
  forwardHeaders?: boolean;
  transformBody?: string;
}

export interface CustomEndpointDTO {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  method: HttpMethod;
  endpointType: EndpointType;
  scriptLang?: ScriptLanguage;
  scriptContent?: string;
  logicConfig?: LogicConfig;
  webhookConfig?: WebhookConfig;
  envVars?: Record<string, string>;
  auth: EndpointAuth;
  tokens: EndpointToken[];
  tags: string[];
  enabled: boolean;
  timeout: number;
  responseHeaders?: Record<string, string>;
  lastExecutedAt?: string;
  executionCount: number;
  lastStatus?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EndpointExecutionLogDTO {
  _id: string;
  endpointId: string;
  method: string;
  statusCode: number;
  duration: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  requestBody?: string;
  responseBody?: string;
  requestMeta: {
    ip?: string;
    userAgent?: string;
    contentType?: string;
  };
  triggeredBy: 'external' | 'test';
  createdAt: string;
}

export interface EndpointCreateRequest {
  name: string;
  slug?: string;
  description?: string;
  method: HttpMethod;
  endpointType: EndpointType;
  scriptLang?: ScriptLanguage;
  scriptContent?: string;
  logicConfig?: LogicConfig;
  webhookConfig?: WebhookConfig;
  envVars?: Record<string, string>;
  auth?: EndpointAuth;
  tags?: string[];
  enabled?: boolean;
  timeout?: number;
  responseHeaders?: Record<string, string>;
}

export interface EndpointUpdateRequest extends Partial<EndpointCreateRequest> {
  _id?: string;
}

export interface EndpointTestRequest {
  body?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
}

export interface EndpointTestResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  duration: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export type TemplateCategory = 'monitoring' | 'security' | 'devops' | 'integrations' | 'data' | 'networking';

export interface EndpointTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: TemplateCategory;
  method: HttpMethod;
  endpointType: EndpointType;
  scriptLang?: ScriptLanguage;
  scriptContent?: string;
  logicConfig?: LogicConfig;
  webhookConfig?: WebhookConfig;
  tags: string[];
}

export interface EndpointsListResponse {
  endpoints: CustomEndpointDTO[];
  total: number;
}

export interface EndpointsSummary {
  total: number;
  active: number;
  errored: number;
  totalHits: number;
  topEndpoints: Array<{
    _id: string;
    name: string;
    method: HttpMethod;
    executionCount: number;
  }>;
}
