import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { isDesktopApp } from '@/lib/platform';
import { getDeviceId } from '@/lib/device';
import { getLicenseStatusAsync, type LicenseStatus } from '@/lib/license';
import { isClientIdConfigured } from '@/lib/tenant';
import { setWizardDone } from '@/lib/first-run';
import { getRuntimeStoreId } from '@/lib/runtime-context';

export default function WizardPage() {
  const nav = useNavigate();
  const loc = useLocation();

  const [deviceId, setDeviceId] = useState<string>('');
  const [lic, setLic] = useState<LicenseStatus | null>(null);

  const storeId = useMemo(() => getRuntimeStoreId(), []);
  const clientOk = useMemo(() => isClientIdConfigured(), []);

  useEffect(() => {
    if (!isDesktopApp()) {
      // Web: wizard não é necessário
      nav('/painel', { replace: true });
      return;
    }
    (async () => {
      const id = await Promise.resolve(getDeviceId()).catch(() => '');
      setDeviceId(id || '');
      const st = await getLicenseStatusAsync().catch(() => null);
      setLic(st);
    })();
  }, [nav]);

  const licenseOk = lic?.status === 'active' || lic?.status === 'trial';
  const storeOk = !!storeId;
  const allOk = licenseOk && storeOk && clientOk;

  const finish = async () => {
    await setWizardDone();
    const from = (loc.state as any)?.from as string | undefined;
    nav(from || '/painel', { replace: true });
  };

  return (
    <div className="page-container" style={{ padding: '1.25rem' }}>
      <div style={{
        maxWidth: 900,
        margin: '0 auto',
        borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.03)',
        padding: 18
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>🧭 Primeira Configuração</div>
            <div style={{ opacity: 0.85, marginTop: 6 }}>
              Vamos deixar tudo pronto para uso no Desktop (offline).
            </div>
          </div>
          <div style={{ textAlign: 'right', opacity: 0.85 }}>
            <div style={{ fontSize: 12 }}>Machine ID</div>
            <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: 700 }}>
              {deviceId || 'carregando…'}
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <Card
            title="1) Ativação"
            ok={licenseOk}
            desc={lic ? lic.message : 'Verificando licença…'}
            actions={
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="btn" to="/ativacao">Abrir ativação</Link>
                <Link className="btn btn-secondary" to="/license">Ver detalhes</Link>
              </div>
            }
          />

          <Card
            title="2) Loja (Store ID)"
            ok={storeOk}
            desc={storeOk ? `Store: ${storeId}` : 'Configure a loja para separar os dados'}
            actions={
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="btn" to="/configurar-loja">Configurar loja</Link>
              </div>
            }
          />

          <Card
            title="3) Client ID"
            ok={clientOk}
            desc={clientOk ? 'Configurado' : 'Configure para garantir isolamento por cliente'}
            actions={
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="btn" to="/setup">Configurar Client ID</Link>
              </div>
            }
          />
        </div>

        <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ opacity: 0.85 }}>
            {allOk ? '✅ Tudo pronto. Você já pode entrar e usar.' : 'Complete os itens acima. Se estiver em DEMO, alguns recursos ficam bloqueados.'}
          </div>
          <button className="btn" onClick={finish} disabled={!licenseOk}>
            {allOk ? 'Concluir e entrar' : 'Continuar'}
          </button>
        </div>

        {!licenseOk && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: 'var(--text-secondary)' }}>
            🔒 Para continuar, ative a licença (ou aguarde a verificação do modo DEMO).
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, ok, desc, actions }: { title: string; ok: boolean; desc: string; actions: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.10)',
      background: 'rgba(255,255,255,0.02)',
      padding: 14
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div aria-hidden style={{ fontWeight: 900 }}>{ok ? '✅' : '⏳'}</div>
      </div>
      <div style={{ marginTop: 8, opacity: 0.85, lineHeight: 1.4 }}>{desc}</div>
      <div style={{ marginTop: 12 }}>{actions}</div>
    </div>
  );
}
