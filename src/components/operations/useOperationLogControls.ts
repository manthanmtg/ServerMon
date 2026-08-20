'use client';

import { useEffect, useRef, useState } from 'react';

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
  const operationRef = useRef(operationId);
  const [follow, setFollow] = useState(resolvedDefaults.follow);
  const [autoscroll, setAutoscroll] = useState(resolvedDefaults.autoscroll);
  const [wrap, setWrap] = useState(resolvedDefaults.wrap);

  useEffect(() => {
    if (operationRef.current === operationId) return;
    operationRef.current = operationId;
    setFollow(resolvedDefaults.follow);
    setAutoscroll(resolvedDefaults.autoscroll);
    setWrap(resolvedDefaults.wrap);
  }, [operationId, resolvedDefaults.autoscroll, resolvedDefaults.follow, resolvedDefaults.wrap]);

  return {
    follow,
    setFollow,
    autoscroll,
    setAutoscroll,
    wrap,
    setWrap,
  };
}
