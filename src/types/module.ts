export interface ModuleContext {
    analytics: {
        track: (event: string, metadata?: any) => void;
    };
    events: {
        emit: (event: string, data?: any) => void;
        on: (event: string, callback: (data: any) => void) => void;
    };
    db: {
        getCollection: (name: string) => any;
    };
    logger: {
        info: (message: string, ...args: any[]) => void;
        warn: (message: string, ...args: any[]) => void;
        error: (message: string, ...args: any[]) => void;
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
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
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

export interface Module {
    id: string;
    name: string;
    version: string;
    description?: string;

    // UI Registration
    widgets?: ModuleWidget[];
    routes?: ModuleRoute[];

    // Lifecycle hooks
    init?: (ctx: ModuleContext) => Promise<void> | void;
    start?: (ctx: ModuleContext) => Promise<void> | void;
    stop?: (ctx: ModuleContext) => Promise<void> | void;
    destroy?: (ctx: ModuleContext) => Promise<void> | void;
}
