import { EventEmitter } from 'node:events';

export type FleetEventKind =
  | 'node.heartbeat'
  | 'node.status_change'
  | 'node.reboot'
  | 'route.status_change'
  | 'revision.applied'
  | 'frp.state_change';

export interface FleetEvent<T = Record<string, unknown>> {
  kind: FleetEventKind;
  nodeId?: string;
  routeId?: string;
  at: string;
  data: T;
}

export interface FleetEventFilter {
  nodeId?: string;
  routeId?: string;
  kind?: FleetEventKind;
}

const FLEET_EVENT_NAME = 'fleet.event';

class FleetEventBus {
  private ee: EventEmitter;

  constructor() {
    this.ee = new EventEmitter();
    this.ee.setMaxListeners(1000);
  }

  emit(ev: FleetEvent): void {
    const enriched: FleetEvent = ev.at ? ev : { ...ev, at: new Date().toISOString() };
    this.ee.emit(FLEET_EVENT_NAME, enriched);
  }

  subscribe(listener: (ev: FleetEvent) => void): () => void {
    this.ee.on(FLEET_EVENT_NAME, listener);
    return () => {
      this.ee.off(FLEET_EVENT_NAME, listener);
    };
  }

  subscribeFiltered(filter: FleetEventFilter, listener: (ev: FleetEvent) => void): () => void {
    const wrapped = (ev: FleetEvent) => {
      if (filter.kind && ev.kind !== filter.kind) return;
      if (filter.nodeId && ev.nodeId !== filter.nodeId) return;
      if (filter.routeId && ev.routeId !== filter.routeId) return;
      listener(ev);
    };
    this.ee.on(FLEET_EVENT_NAME, wrapped);
    return () => {
      this.ee.off(FLEET_EVENT_NAME, wrapped);
    };
  }

  /** Internal: for tests only. */
  __resetForTests__(): void {
    this.ee.removeAllListeners();
    this.ee = new EventEmitter();
    this.ee.setMaxListeners(1000);
  }

  /** Internal: for tests only. */
  __listenerCount__(): number {
    return this.ee.listenerCount(FLEET_EVENT_NAME);
  }

  /** Internal: for tests only. */
  __maxListeners__(): number {
    return this.ee.getMaxListeners();
  }
}

export const fleetEventBus = new FleetEventBus();

export function __resetEventBusForTests__(): void {
  fleetEventBus.__resetForTests__();
}
