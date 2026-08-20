'use client';

import {
  useSharedPollingQuery,
  type SharedPollingOptions,
  type SharedPollingResult,
} from './useSharedPollingQuery';

type JsonPollingOptions<T> = Omit<SharedPollingOptions<T>, 'fetcher'> & {
  url: string;
};

const jsonFetchers = new Map<string, (signal: AbortSignal) => Promise<unknown>>();

function getJsonFetcher<T>(url: string): (signal: AbortSignal) => Promise<T> {
  let fetcher = jsonFetchers.get(url);
  if (!fetcher) {
    fetcher = async (signal: AbortSignal) => {
      const response = await fetch(url, { cache: 'no-store', signal });
      if (!response.ok) {
        throw new Error(`Request failed with ${response.status}`);
      }
      return response.json();
    };
    jsonFetchers.set(url, fetcher);
  }
  return fetcher as (signal: AbortSignal) => Promise<T>;
}

export function useSharedJsonPollingQuery<T>({
  url,
  ...options
}: JsonPollingOptions<T>): SharedPollingResult<T> {
  return useSharedPollingQuery({ ...options, fetcher: getJsonFetcher<T>(url) });
}
