'use client';

import { useEffect, useState } from 'react';
import { getWhatsAppConfig, updateWhatsAppConfig, testWhatsAppConnection } from '@/lib/api';
import { useToast } from '@/components/Toast';
import Spinner from '@/components/Spinner';
import { Save, Wifi, WifiOff, Eye, EyeOff } from 'lucide-react';

export default function ConfigWhatsApp() {
  const [form, setForm] = useState({
    api_url: '',
    api_key: '',
    instance_name: '',
    is_active: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connectionState, setConnectionState] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const res = await getWhatsAppConfig();
      if (res.success && res.data) {
        setForm({
          api_url: res.data.api_url || '',
          api_key: res.data.api_key || '',
          instance_name: res.data.instance_name || '',
          is_active: res.data.is_active ?? false,
        });
      }
    } catch {
      toast('Erro ao carregar config WhatsApp', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.api_url || !form.api_key || !form.instance_name) {
      toast('Preencha todos os campos', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await updateWhatsAppConfig(form);
      if (res.success) {
        toast('Configuracao salva!', 'success');
      } else {
        toast(res.error || 'Erro ao salvar', 'error');
      }
    } catch {
      toast('Erro de conexao', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!form.api_url || !form.api_key || !form.instance_name) {
      toast('Salve a configuracao antes de testar', 'error');
      return;
    }
    setTesting(true);
    setConnectionState(null);
    try {
      const res = await testWhatsAppConnection();
      if (res.success && res.data) {
        const state = res.data.state || 'unknown';
        setConnectionState(state);
        if (res.data.connected) {
          toast('Conectado! WhatsApp pronto para uso.', 'success');
        } else {
          toast(`Status: ${state}. Verifique a instancia na Evolution API.`, 'info');
        }
      } else {
        toast(res.error || 'Erro ao testar', 'error');
        setConnectionState('error');
      }
    } catch {
      toast('Erro de conexao com o servidor', 'error');
      setConnectionState('error');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-bold text-white">WhatsApp — Evolution API</h3>
        <p className="text-dark-400 text-sm mt-1">
          Configure a integração com Evolution API para enviar comprovantes direto pelo WhatsApp.
        </p>
      </div>

      {/* Status card */}
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
          form.is_active && connectionState === 'open'
            ? 'bg-emerald-950/20 border-emerald-700/30'
            : form.is_active
              ? 'bg-amber-950/20 border-amber-700/30'
              : 'bg-dark-800/50 border-dark-700/50'
        }`}
      >
        {form.is_active && connectionState === 'open' ? (
          <Wifi size={18} className="text-emerald-400" />
        ) : (
          <WifiOff size={18} className={form.is_active ? 'text-amber-400' : 'text-dark-500'} />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-white">
            {form.is_active && connectionState === 'open'
              ? 'Conectado'
              : form.is_active
                ? 'Ativo — clique em Testar Conexao'
                : 'Inativo'}
          </p>
          {connectionState && connectionState !== 'open' && connectionState !== 'error' && (
            <p className="text-[10px] text-dark-400 mt-0.5">Estado: {connectionState}</p>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-dark-400">Ativo</span>
          <div
            className={`relative w-10 h-5 rounded-full transition-colors ${form.is_active ? 'bg-emerald-600' : 'bg-dark-700'}`}
            onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </div>
        </label>
      </div>

      {/* Form */}
      <div className="space-y-4">
        <div>
          <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1.5 block">
            URL da API
          </label>
          <input
            type="url"
            value={form.api_url}
            onChange={(e) => setForm((f) => ({ ...f, api_url: e.target.value }))}
            placeholder="https://sua-evolution-api.com"
            className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none font-mono"
          />
          <p className="text-[10px] text-dark-600 mt-1">URL base da sua instancia Evolution API</p>
        </div>

        <div>
          <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1.5 block">
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={form.api_key}
              onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
              placeholder="sua-api-key-aqui"
              className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300 transition-colors p-1"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-dark-500 uppercase tracking-wider font-bold mb-1.5 block">
            Nome da Instancia
          </label>
          <input
            type="text"
            value={form.instance_name}
            onChange={(e) => setForm((f) => ({ ...f, instance_name: e.target.value }))}
            placeholder="minha-instancia"
            className="w-full bg-dark-800 border border-dark-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-dark-600 focus:border-poker-500 focus:outline-none font-mono"
          />
          <p className="text-[10px] text-dark-600 mt-1">Nome da instancia criada na Evolution API</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-poker-600 text-white hover:bg-poker-500 transition-colors disabled:opacity-50"
        >
          {saving ? <Spinner size="sm" /> : <Save size={14} />}
          Salvar
        </button>
        <button
          onClick={handleTest}
          disabled={testing || !form.api_url || !form.api_key}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-dark-800 border border-dark-700 text-dark-300 hover:text-white hover:border-dark-500 transition-colors disabled:opacity-30"
        >
          {testing ? <Spinner size="sm" /> : <Wifi size={14} />}
          Testar Conexao
        </button>
      </div>

      {/* Help */}
      <div className="bg-dark-800/30 border border-dark-700/30 rounded-xl p-4 mt-4">
        <h4 className="text-xs font-bold text-dark-400 uppercase tracking-wider mb-2">Como configurar</h4>
        <ol className="text-xs text-dark-400 space-y-1.5 list-decimal list-inside">
          <li>Instale a Evolution API no seu servidor (Docker recomendado)</li>
          <li>Crie uma instancia e escaneie o QR Code com seu WhatsApp</li>
          <li>Copie a URL, API Key e nome da instancia aqui</li>
          <li>Clique em <strong className="text-dark-300">Testar Conexao</strong> para verificar</li>
          <li>Ative o toggle e salve — pronto!</li>
        </ol>
      </div>
    </div>
  );
}
