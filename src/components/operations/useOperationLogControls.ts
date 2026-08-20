'use client';

import { useState } from 'react';

export interface OperationLogControlDefaults {
  follow?: boolean;
  autoscroll?: boolean;
  wrap?: boolean;
}

const DEFAULTS = {
  follow: true,
  autoscroll: true,
  wrap: true,
};

export function useOperationLogControls(
  operationId: string | null | undefined,
  defaults: OperationLogControlDefaults = DEFAULTS
) {
  const resolvedDefaults = {
    follow: defaults.follow ?? true,
    autoscroll: defaults.autoscroll ?? true,
    wrap: defaults.wrap ?? true,
  };
  const [state, setState] = useState(() => ({
    operationId,
    ...resolvedDefaults,
  }));
  const resolvedState =
    state.operationId === operationId ? state : { operationId, ...resolvedDefaults };

  const update = (changes: Partial<typeof resolvedDefaults>) => {
    setState((current) => ({
      ...(current.operationId === operationId ? current : { operationId, ...resolvedDefaults }),
      ...changes,
    }));
  };

  return {
    follow: resolvedState.follow,
    setFollow: (follow: boolean) => update({ follow }),
    autoscroll: resolvedState.autoscroll,
    setAutoscroll: (autoscroll: boolean) => update({ autoscroll }),
    wrap: resolvedState.wrap,
    setWrap: (wrap: boolean) => update({ wrap }),
  };
}
