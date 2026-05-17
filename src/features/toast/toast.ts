'use client';

import type { ToastAction, ToastTone } from './toastStore';
import { toastStore } from './toastStore';

export type ToastOptions = {
  id?: string;
  dedupeKey?: string;
  durationMs?: number;
  action?: ToastAction;
};

function push(tone: ToastTone, message: string, options?: ToastOptions) {
  return toastStore.getState().push({
    tone,
    message,
    id: options?.id,
    dedupeKey: options?.dedupeKey,
    durationMs: options?.durationMs,
    action: options?.action,
  });
}

export const toast = {
  success(message: string, options?: ToastOptions) {
    return push('success', message, options);
  },
  info(message: string, options?: ToastOptions) {
    return push('info', message, options);
  },
  error(message: string, options?: ToastOptions) {
    return push('error', message, options);
  },
  dismiss(id?: string) {
    toastStore.getState().dismiss(id);
  },
  push(input: { tone: ToastTone; message: string } & ToastOptions) {
    return push(input.tone, input.message, input);
  },
};

