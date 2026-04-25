export interface ExecutionInput {
  method: string;
  body?: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  ip?: string;
  userAgent?: string;
}

export interface ExecutionResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  stdout?: string;
  stderr?: string;
  error?: string;
  duration: number;
}
