import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { ToastItem } from '../types';

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-sm sm:max-w-md w-full pointer-events-none"
      aria-live="polite"
      aria-atomic="true"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          const isWarning = toast.type === 'warning';

          const bgColor = isSuccess
            ? 'bg-slate-900/95 border-emerald-500/50 text-emerald-100 shadow-emerald-950/50'
            : isError
            ? 'bg-slate-900/95 border-rose-500/50 text-rose-100 shadow-rose-950/50'
            : isWarning
            ? 'bg-slate-900/95 border-amber-500/50 text-amber-100 shadow-amber-950/50'
            : 'bg-slate-900/95 border-indigo-500/50 text-indigo-100 shadow-indigo-950/50';

          const iconColor = isSuccess
            ? 'text-emerald-400 bg-emerald-500/10'
            : isError
            ? 'text-rose-400 bg-rose-500/10'
            : isWarning
            ? 'text-amber-400 bg-amber-500/10'
            : 'text-indigo-400 bg-indigo-500/10';

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.95 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-xl backdrop-blur-md ${bgColor}`}
            >
              <div className={`p-2 rounded-lg flex-shrink-0 ${iconColor}`}>
                {isSuccess && <CheckCircle2 className="w-5 h-5" />}
                {isError && <AlertCircle className="w-5 h-5" />}
                {isWarning && <AlertTriangle className="w-5 h-5" />}
                {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5" />}
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                {toast.title && (
                  <h4 className="font-semibold text-sm leading-tight text-white mb-0.5">
                    {toast.title}
                  </h4>
                )}
                <p className="text-xs text-slate-300 leading-relaxed break-words">
                  {toast.message}
                </p>
              </div>

              <button
                onClick={() => onDismiss(toast.id)}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors flex-shrink-0"
                aria-label="Zamknij powiadomienie"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
