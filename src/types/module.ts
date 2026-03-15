export interface ModuleContext {
  analytics: {
    track: (event: string, metadata?: Record<string, unknown>) => void;
  };
  events: {
    emit: (event: string, data?: unknown) => void;
    on: (event: string, callback: (data: unknown) => void) => void;
  };
  db: {
    getCollection: (name: string) => unknown;
  };
  logger: {
    info: (message: string, ...args: unknown[]) => void;
    warn: (message: string, ...args: unknown[]) => void;
    error: (message: string, ...args: unknown[]) => void;
  };
  system: {
    capabilities: {
      platform: string;
      arch: string;
      cpus: number;
      memory: number;
    };
  };
  settings: {
    get: (key: string) => Promise<unknown>;
    set: (key: string, value: unknown) => Promise<void>;
  };
  ui: {
    theme: {
      id: string;
      mode: 'light' | 'dark';
    };
  };
}

export interface ModuleWidget {
  id: string;
  name: string;
  component: string; // Component path or registry ID
}

export interface ModuleRoute {
  path: string;
  component: string;
  name: string;
}

export interface ModuleGuideSection {
  title: string;
  content: string; // Markdown supported
  icon?: string; // Lucide icon name
}

export interface ModuleGuide {
  title: string;
  description?: string;
  sections: ModuleGuideSection[];
}

export interface Module {
  id: string;
  name: string;
  version: string;
  description?: string;

  // UI Registration
  widgets?: ModuleWidget[];
  routes?: ModuleRoute[];
  guide?: ModuleGuide;

  // Lifecycle hooks
  init?: (ctx: ModuleContext) => Promise<void> | void;
  start?: (ctx: ModuleContext) => Promise<void> | void;
  stop?: (ctx: ModuleContext) => Promise<void> | void;
  destroy?: (ctx: ModuleContext) => Promise<void> | void;
}
