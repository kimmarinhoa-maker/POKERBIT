'use client';

import { User, Phone, Mail, X, Save } from 'lucide-react';
import Spinner from '@/components/Spinner';

export interface EntityDataModalProps {
  title: string;
  entityName: string;
  entityExternalId?: string;
  firstLabel: string;
  firstValue: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  editForm: { full_name: string; phone: string; email: string };
  setEditForm: React.Dispatch<React.SetStateAction<{ full_name: string; phone: string; email: string }>>;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function EntityDataModal({
  title,
  entityName,
  entityExternalId,
  firstLabel,
  firstValue,
  namePlaceholder,
  emailPlaceholder,
  editForm,
  setEditForm,
  saving,
  onClose,
  onSave,
}: EntityDataModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-dark-900 border border-dark-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-dark-700/50">
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="text-dark-500 text-xs mt-0.5">
              {entityName}
              {entityExternalId && (
                <> · <span className="font-mono">{entityExternalId}</span></>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-dark-500 hover:text-dark-300 transition-colors p-1"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 pb-4 border-b border-dark-700/30">
            <div>
              <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">{firstLabel}</label>
              <p className="text-sm text-white font-medium mt-0.5">{firstValue}</p>
            </div>
            <div>
              <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold">ID Plataforma</label>
              <p className="text-sm text-dark-300 font-mono mt-0.5">{entityExternalId || '—'}</p>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold flex items-center gap-1.5 mb-1.5">
              <User size={12} /> Nome Completo
            </label>
            <input
              type="text"
              value={editForm.full_name}
              onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder={namePlaceholder}
              className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold flex items-center gap-1.5 mb-1.5">
              <Phone size={12} /> Celular
            </label>
            <div className="flex items-center gap-0">
              <span className="bg-dark-700 border border-dark-700/50 border-r-0 rounded-l-lg px-3 py-2 text-sm text-dark-300 font-mono font-bold select-none">
                +55
              </span>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                  setEditForm((f) => ({ ...f, phone: digits }));
                }}
                placeholder="11999999999"
                className="flex-1 bg-dark-800 border border-dark-700/50 rounded-r-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none font-mono"
                maxLength={11}
              />
            </div>
            <p className="text-[10px] text-dark-600 mt-1">DDD + numero (ex: 11999999999)</p>
          </div>
          <div>
            <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold flex items-center gap-1.5 mb-1.5">
              <Mail size={12} /> E-mail
            </label>
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              placeholder={emailPlaceholder}
              className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="px-6 pb-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-dark-400 hover:bg-dark-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-poker-600 text-white hover:bg-poker-500 transition-colors disabled:opacity-50"
          >
            {saving ? <Spinner size="sm" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
