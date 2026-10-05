import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, Plus, Trash2, RefreshCw, AlertCircle, Copy, Check } from 'lucide-react';

export interface ParentDashboardProps {
  currentDeviceId: string;
  onSelectDevice: (deviceId: string, token: string) => void;
}

export const ParentDashboard: React.FC<ParentDashboardProps> = ({ currentDeviceId, onSelectDevice }) => {
  const [devices, setDevices] = useState<any[]>([]);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [lastCreatedToken, setLastCreatedToken] = useState<{ id: string; token: string } | null>(null);
  const [statusMetrics, setStatusMetrics] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
      }
    } catch (err) {
      console.warn('Fehler beim Laden der Geräte:', err);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/status?device=${currentDeviceId}`);
      if (res.ok) {
        const data = await res.json();
        setStatusMetrics(data);
      }
    } catch (err) {
      console.warn('Fehler beim Laden des Status:', err);
    }
  };

  useEffect(() => {
    fetchDevices();
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, [currentDeviceId]);

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceId) return;
    setLoading(true);

    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: newDeviceId, name: newDeviceName }),
      });

      if (res.ok) {
        const data = await res.json();
        setLastCreatedToken({ id: data.deviceId, token: data.token });
        setNewDeviceId('');
        setNewDeviceName('');
        fetchDevices();
      } else {
        const err = await res.json();
        alert(err.error || 'Fehler beim Erstellen');
      }
    } catch (err: any) {
      alert(err.message || 'Netzwerkfehler');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeDevice = async (id: string) => {
    if (!confirm(`Gerät ${id} wirklich widerrufen? Das Gerät kann dann keine Audio-Anfragen mehr stellen.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/devices/${id}/revoke`, { method: 'POST' });
      if (res.ok) {
        fetchDevices();
      }
    } catch (err) {
      console.error('Fehler beim Widerrufen:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex items-center justify-between border-b border-stone-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-100">Eltern- &amp; Geräteverwaltung (picast.com)</h3>
            <p className="text-xs text-stone-400">Sichere Geräteauthentifizierung, Token-Widerruf und Datenschutz-Garantien</p>
          </div>
        </div>
        <button
          onClick={() => {
            fetchDevices();
            fetchStatus();
          }}
          className="p-2 text-stone-400 hover:text-stone-200 bg-stone-800 hover:bg-stone-700 rounded-lg transition"
          title="Aktualisieren"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Privacy Architecture Notice */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800">
          <span className="font-semibold text-emerald-400 block mb-1">Keine Audio-Speicherung</span>
          <p className="text-stone-400 leading-relaxed">
            Kinder-Aufnahmen werden flüchtig im RAM verarbeitet und nie auf einer Festplatte persistiert.
          </p>
        </div>
        <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800">
          <span className="font-semibold text-emerald-400 block mb-1">Flüchtige Zustände (120 s TTL)</span>
          <p className="text-stone-400 leading-relaxed">
            WAV-Antworten werden genau einmal vom erzeugenden Gerät abgerufen und danach sofort gelöscht.
          </p>
        </div>
        <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800">
          <span className="font-semibold text-amber-400 block mb-1">Rate-Limiter Aktiv</span>
          <p className="text-stone-400 leading-relaxed">
            {statusMetrics?.rateLimit
              ? `${statusMetrics.rateLimit.remaining} von ${statusMetrics.rateLimit.max} Anfragen in 10 Min verfügbar.`
              : 'Schutz vor Überlastung aktiv.'}
          </p>
        </div>
      </div>

      {/* Generated Token Alert */}
      {lastCreatedToken && (
        <div className="p-4 bg-amber-950/40 border border-amber-600 rounded-xl text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-200 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-amber-400" />
              Neues Geräte-Token für «{lastCreatedToken.id}» generiert:
            </span>
            <button
              onClick={() => copyToClipboard(lastCreatedToken.token)}
              className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded flex items-center gap-1 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Kopiert' : 'Kopieren'}
            </button>
          </div>
          <p className="font-mono text-amber-100 bg-stone-950 p-2 rounded border border-amber-800/80 break-all select-all">
            {lastCreatedToken.token}
          </p>
          <p className="text-stone-400 text-[11px]">
            Wichtig: Dieses Token wird nur als SHA-256-Hash gespeichert und kann später nicht erneut angezeigt werden.
            Trage es auf dem Raspberry Pi in <code className="text-amber-300">/etc/kunibert/kunibert.env</code> ein.
          </p>
        </div>
      )}

      {/* Registered Devices List */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-300 mb-3">
          Registrierte Geräte
        </h4>
        <div className="space-y-2">
          {devices.map((dev) => (
            <div
              key={dev.deviceId}
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition ${
                dev.deviceId === currentDeviceId
                  ? 'bg-amber-950/20 border-amber-700/60'
                  : 'bg-stone-950 border-stone-800'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-200">{dev.name || dev.deviceId}</span>
                  <span className="font-mono text-stone-400">({dev.deviceId})</span>
                  {dev.deviceId === currentDeviceId && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700 text-[10px]">
                      Aktives Simulator-Gerät
                    </span>
                  )}
                  {dev.revoked && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 text-[10px]">
                      Widerrufen (Gesperrt)
                    </span>
                  )}
                </div>
                <p className="text-stone-500 text-[11px]">
                  Erstellt: {new Date(dev.created * 1000).toLocaleString('de-DE')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!dev.revoked && (
                  <button
                    onClick={() => handleRevokeDevice(dev.deviceId)}
                    className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-stone-800 rounded transition"
                    title="Zugang widerrufen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add New Device Form */}
      <div className="pt-4 border-t border-stone-800">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-300 mb-3">
          Neues Gerät registrieren
        </h4>
        <form onSubmit={handleCreateDevice} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={newDeviceId}
            onChange={(e) => setNewDeviceId(e.target.value)}
            placeholder="Geräte-ID (z. B. kinderzimmer-pi)"
            className="bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
            required
          />
          <input
            type="text"
            value={newDeviceName}
            onChange={(e) => setNewDeviceName(e.target.value)}
            placeholder="Bezeichnung (z. B. Kinderzimmer Pi 4)"
            className="bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Gerät hinzufügen
          </button>
        </form>
      </div>
    </div>
  );
};
