'use client';

import { useState, useCallback, useRef, type ReactNode } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface ConfirmOptions {
  title: string;
  message: string;
  variant?: 'danger' | 'default';
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogState extends ConfirmOptions {
  open: boolean;
}

/**
 * Hook that provides an imperative `confirm()` function returning a Promise<boolean>,
 * plus a `ConfirmDialogElement` to render in the component tree.
 *
 * Usage:
 * ```tsx
 * const { confirm, ConfirmDialogElement } = useConfirmDialog();
 *
 * async function handleDelete() {
 *   const ok = await confirm({ title: 'Confirmar', message: 'Tem certeza?' });
 *   if (!ok) return;
 *   // proceed...
 * }
 *
 * return <div>...{ConfirmDialogElement}</div>;
 * ```
 */
export function useConfirmDialog() {
  const [state, setState] = useState<DialogState>({
    open: false,
    title: '',
    message: '',
    variant: 'default',
  });

  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({
        open: true,
        title: options.title,
        message: options.message,
        variant: options.variant || 'default',
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const ConfirmDialogElement: ReactNode = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      variant={state.variant}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirm, ConfirmDialogElement } as const;
}
