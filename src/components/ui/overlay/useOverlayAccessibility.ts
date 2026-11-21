'use client';

import { useEffect, useRef, type RefObject } from 'react';

const focusableSelector = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const overlayStack: symbol[] = [];

interface BackgroundState {
  element: HTMLElement;
  inert: boolean;
  ariaHidden: string | null;
}

export interface UseOverlayAccessibilityOptions {
  open: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  dismissible?: boolean;
  onEscape?: () => void;
}

function focusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) => element.getAttribute('aria-hidden') !== 'true'
  );
}

function focusInitialElement(
  container: HTMLElement,
  initialFocusRef?: RefObject<HTMLElement | null>
) {
  const requested = initialFocusRef?.current;
  const target =
    (requested?.matches(focusableSelector)
      ? requested
      : requested?.querySelector<HTMLElement>(focusableSelector)) ??
    focusableElements(container)[0] ??
    container;
  target.focus();
}

function isolateBackground(overlayRoot: HTMLElement): BackgroundState[] {
  return Array.from(document.body.children)
    .filter(
      (element): element is HTMLElement => element instanceof HTMLElement && element !== overlayRoot
    )
    .map((element) => {
      const state = {
        element,
        inert: element.hasAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
      };
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
      return state;
    });
}

function restoreBackground(states: BackgroundState[]) {
  for (const { element, inert, ariaHidden } of states) {
    if (inert) element.setAttribute('inert', '');
    else element.removeAttribute('inert');

    if (ariaHidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', ariaHidden);
  }
}

function focusFallback(excludedRoot: HTMLElement) {
  const fallback = Array.from(document.querySelectorAll<HTMLElement>(focusableSelector)).find(
    (element) => !excludedRoot.contains(element) && !element.closest('[inert]')
  );
  fallback?.focus();
}

export function useOverlayAccessibility({
  open,
  containerRef,
  initialFocusRef,
  dismissible = true,
  onEscape,
}: UseOverlayAccessibilityOptions) {
  const onEscapeRef = useRef(onEscape);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    onEscapeRef.current = onEscape;
    dismissibleRef.current = dismissible;
  }, [dismissible, onEscape]);

  useEffect(() => {
    if (!open) return;

    const container = containerRef.current;
    if (!container) return;

    const token = Symbol('overlay');
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlayRoot = container.closest<HTMLElement>('[data-overlay-root]') ?? container;
    const previousBodyOverflow = document.body.style.overflow;
    const backgroundStates = isolateBackground(overlayRoot);

    overlayStack.push(token);
    document.body.style.overflow = 'hidden';
    focusInitialElement(container, initialFocusRef);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (overlayStack.at(-1) !== token) return;

      if (event.key === 'Escape') {
        if (!dismissibleRef.current) return;
        event.preventDefault();
        onEscapeRef.current?.();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = focusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || !container.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !container.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const stackIndex = overlayStack.lastIndexOf(token);
      if (stackIndex >= 0) overlayStack.splice(stackIndex, 1);
      document.body.style.overflow = previousBodyOverflow;
      restoreBackground(backgroundStates);

      const canRestore =
        previouslyFocused?.isConnected &&
        !previouslyFocused.hasAttribute('disabled') &&
        !previouslyFocused.closest('[inert]');
      if (canRestore) previouslyFocused.focus();
      else focusFallback(overlayRoot);
    };
  }, [containerRef, initialFocusRef, open]);
}
