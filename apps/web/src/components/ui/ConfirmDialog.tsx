'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  /** Require the user to type this exact text to enable the confirm button */
  requireText?: string;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'default',
  onConfirm,
  onCancel,
  loading = false,
  requireText,
}: ConfirmDialogProps) {
  const [typedText, setTypedText] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const textMatch = !requireText || typedText.trim().toLowerCase() === requireText.trim().toLowerCase();

  // Reset typed text and focus when dialog opens
  useEffect(() => {
    if (open) {
      setTypedText('');
      const timer = setTimeout(() => {
        if (requireText) {
          inputRef.current?.focus();
        } else {
          cancelBtnRef.current?.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open, requireText]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel, loading]);

  // Focus trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableEls = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusableEls || focusableEls.length === 0) return;

      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [],
  );

  // Backdrop click
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !loading) {
      onCancel();
    }
  }

  if (!open) return null;

  const confirmBtnClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500/40'
      : 'bg-poker-600 hover:bg-poker-700 focus:ring-poker-500/40';

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-fade-in"
      onClick={handleBackdropClick}
      role="presentation"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onKeyDown={handleKeyDown}
        className="relative bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl w-full max-w-md animate-scale-in"
      >
        {/* Top accent bar */}
        <div className={`h-1 rounded-t-2xl ${variant === 'danger' ? 'bg-red-500' : 'bg-poker-500'}`} />

        <div className="p-6">
          {/* Title */}
          <h3
            id="confirm-dialog-title"
            className="text-lg font-bold text-white mb-2"
          >
            {title}
          </h3>

          {/* Message */}
          <p
            id="confirm-dialog-message"
            className="text-sm text-dark-200 leading-relaxed whitespace-pre-line"
          >
            {message}
          </p>

          {/* Typed confirmation input */}
          {requireText && (
            <div className="mt-4">
              <label className="text-xs text-dark-400 block mb-1.5">
                Digite <strong className="text-red-400">{requireText}</strong> para confirmar:
              </label>
              <input
                ref={inputRef}
                type="text"
                value={typedText}
                onChange={(e) => setTypedText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && textMatch && !loading) onConfirm();
                }}
                className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-sm text-white placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:border-red-500/50"
                placeholder={requireText}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 mt-6">
            <button
              ref={cancelBtnRef}
              onClick={onCancel}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-dark-700 hover:bg-dark-600 text-dark-300 transition-colors focus:outline-none focus:ring-2 focus:ring-dark-500/40 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmBtnRef}
              onClick={onConfirm}
              disabled={loading || !textMatch}
              className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed ${confirmBtnClass}`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" />
                  Aguarde...
                </span>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
