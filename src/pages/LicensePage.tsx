import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getDeviceId } from '@/lib/device';
import { isLicenseEnabled, isLicenseMandatory, setFeatureFlag } from '@/lib/mode';
import {
  activateLicense,
  removeLicense,
  getLicenseStatus,
  getLicenseStatusAsync,
  canManageLicense,
  type LicenseStatus,
} from '@/lib/license';
import './LicensePage.css';

function statusIcon(s: LicenseStatus['status']) {
  switch (s) {
    case 'active': return '✅';
    case 'expired': return '⏰';
    case 'blocked': return '🔒';
    case 'invalid': return '⚠️';
    case 'not_found': return '🧾';
    case 'offline': return '…';
    default: return '⚠️';
  }
}

function statusColor(s: LicenseStatus['status']) {
  switch (s) {
    case 'active': return 'var(--success, #10b981)';
    case 'expired':
    case 'blocked': return 'var(--error, #ef4444)';
    case 'invalid':
    case 'not_found':
    case 'offline':
    default: return 'var(--warning, #f59e0b)';
  }
}

export default function LicensePage() {
  const { session } = useAuth();
  const isRealSuperAdmin = session?.isSuperAdmin === true;
  const deviceId = useMemo(() => getDeviceId(), []);
  const mandatory = useMemo(() => isLicenseMandatory(), []);
  const [enabled, setEnabled] = useState(isLicenseEnabled());
  const [token, setToken] = useState('');
  const [status, setStatus] = useState(getLicenseStatus());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = useMemo(() => canManageLicense(), []);

  useEffect(() => {
    // sempre valida 1x ao abrir a página (sem polling)
    const run = async () => {
      const st = await getLicenseStatusAsync();
      setStatus(st);
    };
    run();
  }, [enabled]);

  const copyDeviceId = async () => {
    try {
      await navigator.clipboard.writeText(deviceId);
      setError(null);
    } catch {
      // fallback simples
      try {
        const el = document.getElementById('deviceIdInput') as HTMLInputElement | null;
        el?.select();
        document.execCommand('copy');
        setError(null);
      } catch {
        setError('Não foi possível copiar. Copie manualmente.');
      }
    }
  };

  const onToggleEnabled = () => {
    if (mandatory) return;
    if (!canManage) return;
    const next = !enabled;
    setFeatureFlag('license', next);
    setEnabled(next);
    // limpa cache para refletir o novo modo
    setStatus(getLicenseStatus());
  };


const importFromFile = async () => {
  try {
    const el = document.getElementById('licenseFileInput') as HTMLInputElement | null;
    el?.click();
  } catch {
    // ignore
  }
};

const onFileSelected = async (file: File | null) => {
  if (!file) return;
  setBusy(true);
  setError(null);
  try {
    const raw = (await file.text()).trim();
    let extracted = raw;
    try {
      const obj = JSON.parse(raw);
      if (typeof obj === 'string') extracted = obj;
      else if (obj?.token) extracted = String(obj.token);
      else if (obj?.licenseToken) extracted = String(obj.licenseToken);
    } catch {
      // raw é o token puro
    }
    setToken(extracted);
    // auto-ativar (melhor UX)
    const res = activateLicense(extracted);
    if (!res.success) {
      setError(res.error || 'Arquivo inválido');
      return;
    }
    const st = await getLicenseStatusAsync();
    setStatus(st);
    if (st.status !== 'active' && st.status !== 'trial') {
      setError(st.message);
    } else {
      setToken('');
    }
  } catch (e: any) {
    setError(e?.message || 'Falha ao importar licença');
  } finally {
    setBusy(false);
  }
};
  const onActivate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = activateLicense(token);
      if (!res.success) {
        setError(res.error || 'Token inválido');
        setBusy(false);
        return;
      }
      const st = await getLicenseStatusAsync();
      setStatus(st);
      if (st.status !== 'active' && st.status !== 'trial') {
        setError(st.message);
      } else {
        setToken('');
      }
    } catch (e: any) {
      setError(e?.message || 'Falha ao ativar');
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      removeLicense();
      const st = await getLicenseStatusAsync();
      setStatus(st);
      setToken('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="license-page">
      <div className="license-card">
        <div className="license-status-header">
          <div className="license-status-icon" aria-hidden>{statusIcon(status.status)}</div>
          <div>
            <h2>Licença</h2>
            <p className="license-status-message" style={{ color: statusColor(status.status) }}>
              {status.message}
            </p>
          </div>
        </div>

        <div className="license-details">
          {isRealSuperAdmin ? (
            <>
              <div className="license-detail-item">
                <strong>Machine ID</strong>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    id="deviceIdInput"
                    value={deviceId}
                    readOnly
                    style={{ width: '360px', maxWidth: '65vw' }}
                  />
                  <button className="btn btn-secondary" onClick={copyDeviceId}>
                    Copiar
                  </button>
                </div>
              </div>

              <div className="license-detail-item">
                <strong>Bloqueio por licença</strong>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ color: enabled ? 'var(--success, #10b981)' : 'var(--text-secondary)' }}>
                    {mandatory ? 'OBRIGATÓRIO' : (enabled ? 'ATIVO' : 'DESATIVADO')}
                  </span>
                  <button
                    className="btn btn-secondary"
                    onClick={onToggleEnabled}
                    disabled={!canManage || mandatory}
                    title={mandatory ? 'Neste build a licença é obrigatória' : (!canManage ? 'Apenas admin pode alterar' : undefined)}
                  >
                    {mandatory ? 'Obrigatório' : (enabled ? 'Desativar' : 'Ativar')}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="license-detail-item">
              <strong>Status comercial</strong>
              <span>{status.status === 'trial' ? 'Teste ativo' : status.status === 'active' ? 'Liberado' : 'Ativacao necessaria'}</span>
            </div>
          )}

          {status.validUntil && (
            <div className="license-detail-item">
              <strong>Validade</strong>
              <span>{new Date(status.validUntil).toLocaleDateString('pt-BR')}</span>
            </div>
          )}

          {typeof status.daysRemaining === 'number' && (
            <div className="license-detail-item">
              <strong>Dias restantes</strong>
              <span>{status.daysRemaining}</span>
            </div>
          )}

          {isRealSuperAdmin && status.payload?.licenseId && (
            <div className="license-detail-item">
              <strong>ID da licença</strong>
              <span>{status.payload.licenseId}</span>
            </div>
          )}

          {isRealSuperAdmin && status.payload?.plan && (
            <div className="license-detail-item">
              <strong>Plano</strong>
              <span>{status.payload.plan}</span>
            </div>
          )}
        </div>

        {(status.status !== 'active' && status.status !== 'trial' || enabled) && (
          <div className="license-warning">
            <p><strong>{isRealSuperAdmin ? 'Como ativar:' : 'Como liberar sua loja:'}</strong></p>
            {isRealSuperAdmin ? (
              <>
                <p>1) Copie o <b>Machine ID</b> e envie no WhatsApp <b>(43) 99669-4751</b>.</p>
                <p>2) A ativacao libera vendas, ordem de servico, financeiro, backup e operacao da loja.</p>
                <p>3) Receba o token, cole abaixo e clique em <b>Ativar licenca</b>.</p>
              </>
            ) : (
              <>
                <p>1) Entre em contato no WhatsApp <b>(43) 99669-4751</b> para liberar sua loja.</p>
                <p>2) A ativacao libera vendas, ordem de servico, financeiro, backup e suporte.</p>
                <p>3) Se seu teste expirou, a liberacao e feita pela conta principal sem voce lidar com token tecnico.</p>
              </>
            )}
          </div>
        )}

        {isRealSuperAdmin && (
        <div className="license-form">
          <div className="form-group">
            <label>Token da Licença</label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '8px 0 6px' }}>
              <button type="button" className="btn btn-secondary" onClick={importFromFile} disabled={busy}>
                Importar arquivo (.lic)
              </button>
              <input
                id="licenseFileInput"
                type="file"
                accept=".lic,.txt,.json"
                style={{ display: 'none' }}
                onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Aceita arquivo com token puro ou JSON <code>{'{"token":"..."}'}</code>.
              </span>
            </div>
            <textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              rows={4}
              placeholder="Cole aqui o token (ex: eyJ2IjoxLCJh... . XyZ...)"
            />
          </div>

          {error && (
            <div style={{ color: 'var(--error, #ef4444)', fontWeight: 600 }}>
              {error}
            </div>
          )}

          <div className="license-actions">
            <button className="btn btn-primary" onClick={onActivate} disabled={busy || !token.trim()}>
              {busy ? 'Processando…' : 'Ativar licença'}
            </button>
            <button className="btn btn-secondary" onClick={onRemove} disabled={busy}>
              Remover
            </button>
          </div>
        </div>
        )}
      </div>

      <div className="license-info">
        <h3>{isRealSuperAdmin ? 'Vantagens do sistema' : 'Sua loja fica protegida com'}</h3>
        <ul>
          <li>Gestao completa de <b>vendas, ordem de servico, estoque, financeiro e recibos</b> em um so lugar.</li>
          <li>Operacao por <b>loja identificada por store_id</b>, ajudando a evitar mistura de dados entre clientes.</li>
          <li>Fluxo com <b>backup, suporte e ativacao comercial</b> para manter a operacao segura.</li>
          {!isRealSuperAdmin && <li>Teste inicial com prazo visivel e liberacao comercial sem complicacao tecnica para a loja.</li>}
          {!isRealSuperAdmin && <li>Atendimento para ativacao e suporte no WhatsApp <b>(43) 99669-4751</b>.</li>}
        </ul>
      </div>
    </div>
  );
}


