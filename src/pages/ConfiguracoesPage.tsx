import {lazy, Suspense, useState, useEffect, useRef, useCallback} from 'react';
import {useNavigate} from 'react-router-dom';
import {getCurrentSession, isAdmin} from '@/lib/auth-supabase';
import {getClientId} from '@/lib/tenant';
import {downloadBackup} from '@/lib/backup';
import {getSyncStatus} from '@/lib/repository/sync-engine';
import {isLocalOnly} from '@/lib/mode';
import { isDesktopApp } from '@/lib/platform';
import {safeGet, safeSet} from '@/lib/storage';
import {getModoCompacto, getModoAjustavel, setModoCompacto as saveModoCompacto, setModoAjustavel as saveModoAjustavel, aplicarModoCompacto, aplicarModoAjustavel} from '@/lib/layout-modes';
import { getLowEndMode, setLowEndMode, isLowEndSuggested } from '@/lib/low-end-mode';
import { useLowEndMode } from '@/hooks/useLowEndMode';
import { getDiagnosticsEnabled, setDiagnosticsEnabled } from '@/lib/diagnostics';
import { clearDiagLogs } from '@/lib/telemetry/diag-log';
import {canManageUsers, canManageLicense} from '@/lib/permissions';
import LicenseStatusWidget from '@/components/LicenseStatusWidget';
import Guard from '@/components/Guard';
import {showToast} from '@/components/ui/ToastContainer';
import {clearStoreData, removeOrphanedData, removeTestData} from '@/lib/store-cleanup';
import {isAdminMode} from '@/lib/adminMode';
import {useCompany} from '@/contexts/CompanyContext';
import {deleteCompany, upsertCompany, isCompanyLocked, lockCompany} from '@/lib/company-service';
import {initCompanyLock, getCompanyLockState, type CompanyLockState} from '@/lib/company-lock';
// Taxas removidas - usar aba "Simular Taxas" para configuração
import { getRuntimeStoreId } from '@/lib/runtime-context';
import { getPersistenceInfo, type PersistenceInfo } from '@/lib/persistence-info';
import './ConfiguracoesPage.css';

const PrinterSettings = lazy(() => import('@/components/PrinterSettings'));

type TamanhoPapel = 'A4' | '58mm' | '80mm';

function normalizeTamanhoPapel(raw: unknown): TamanhoPapel | null {
  const v = String(raw ?? '').trim();
  const lc = v.toLowerCase();

  // Compat/migração: versões antigas podem ter salvo "80"/"58" ou "a4".
  if (v === 'A4' || lc === 'a4') return 'A4';
  if (v === '80mm' || lc === '80mm' || v === '80') return '80mm';
  if (v === '58mm' || lc === '58mm' || v === '58') return '58mm';

  return null;
}
const STORAGE_KEY_PAPEL = 'smart-tech-tamanho-papel';
const STORAGE_KEY_PRINT_SCALE = 'smart-tech-print-scale';
const CONFIG_TABS = [
  { key: 'empresa', label: '🏢 Empresa' },
  { key: 'impressao', label: '🖨️ Impressão' },
  { key: 'sistema', label: '🛠️ Sistema' },
] as const;

function ConfiguracoesPage() {
  const navigate = useNavigate();
  const session = getCurrentSession();
  const isRealSuperAdmin = session?.isSuperAdmin === true;
  const localOnly = isLocalOnly();
  const desktopSuggestedDefault: TamanhoPapel = isDesktopApp() ? '80mm' : 'A4';
  const { company, loading: companyLoading, error: companyError, refresh: refreshCompany } = useCompany();
  const [companyForm, setCompanyForm] = useState({
    nome_fantasia: '',
    razao_social: '',
    cnpj: '',
    telefone: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    logo_url: '',
    mensagem_rodape: ''
  });
  const [companySaving, setCompanySaving] = useState(false);
  const [showCompanyAdvanced, setShowCompanyAdvanced] = useState(false);
  const [lockState, setLockState] = useState<CompanyLockState>(() => getCompanyLockState());
  const companyLocked = lockState.locked;
  const [showLockModal, setShowLockModal] = useState(false);
  const [locking, setLocking] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [tamanhoPapel, setTamanhoPapel] = useState<TamanhoPapel>(desktopSuggestedDefault);
  const [printScale, setPrintScale] = useState<number>(1);
  const [modoCompacto, setModoCompacto] = useState(false);
  const [modoAjustavel, setModoAjustavel] = useState(false);

  // Modo PC Lento
  const { isLowEnd: lowEndMode, setMode: applyLowEnd, suggested: lowEndSuggested } = useLowEndMode();
  // Diagnóstico (logs/perf detalhado)
  const [diagnosticsOn, setDiagnosticsOn] = useState<boolean>(() => {
    try { return getDiagnosticsEnabled(); } catch { return import.meta.env.DEV; }
  });
  const [persistenceInfo, setPersistenceInfo] = useState<PersistenceInfo | null>(null);
  const [persistenceLoading, setPersistenceLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'empresa' | 'impressao' | 'sistema'>('empresa');
  const [showPrinterAdvanced, setShowPrinterAdvanced] = useState(false);
  const [showPersistenceDiagnostics, setShowPersistenceDiagnostics] = useState(false);
  const runtimeRefreshTimerRef = useRef<number | null>(null);

  const loadPersistenceInfo = useCallback(async () => {
    if (!isDesktopApp()) return;
    setPersistenceLoading(true);
    try {
      const info = await getPersistenceInfo();
      setPersistenceInfo(info);
    } catch {
      setPersistenceInfo(null);
    } finally {
      setPersistenceLoading(false);
    }
  }, []);


  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [cleaning, setCleaning] = useState(false);
  const clientId = getClientId();

// Taxas de pagamento removidas - usar aba "Simular Taxas"

  const hydrateLocalPrefs = () => {
    const papelRaw = safeGet<any>(STORAGE_KEY_PAPEL, null).data;
    const papel = normalizeTamanhoPapel(papelRaw);
    const papelEfetivo: TamanhoPapel | null = papel;

    if (papelEfetivo) {
      setTamanhoPapel(papelEfetivo);
      if (papelRaw !== papelEfetivo) safeSet(STORAGE_KEY_PAPEL, papelEfetivo);
    } else {
      setTamanhoPapel(desktopSuggestedDefault);
      safeSet(STORAGE_KEY_PAPEL, desktopSuggestedDefault);
    }

    try { localStorage.removeItem(STORAGE_KEY_PRINT_SCALE); } catch { /* ignore */ }
    setPrintScale(1);

    try {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.removeItem('smart-tech-tema');
    } catch {
      // ignore
    }

    setModoCompacto(getModoCompacto());
    setModoAjustavel(getModoAjustavel());
  };

  useEffect(() => {
    hydrateLocalPrefs();

    let interval: number | undefined;
    if (!localOnly) {
      interval = window.setInterval(() => {
        setSyncStatus(getSyncStatus());
      }, 5000);
    }

    return () => {
      if (interval) window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let retryTimer: number | undefined;

    const refreshRuntime = () => {
      hydrateLocalPrefs();
      setSyncStatus(getSyncStatus());
      if (diagnosticsOn && showPersistenceDiagnostics) {
        void loadPersistenceInfo();
      }
      initCompanyLock().then((state) => {
        setLockState(state);
      }).catch(() => {
        setLockState({ locked: isCompanyLocked() });
      });
      void refreshCompany();
    };

    const scheduleRefreshRuntime = (delay = 120) => {
      if (runtimeRefreshTimerRef.current) window.clearTimeout(runtimeRefreshTimerRef.current);
      runtimeRefreshTimerRef.current = window.setTimeout(() => {
        runtimeRefreshTimerRef.current = null;
        refreshRuntime();
      }, delay);
    };
    const onRuntimeRefreshEvent = () => scheduleRefreshRuntime();
    const onStorageRefreshEvent = () => scheduleRefreshRuntime();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleRefreshRuntime(60);
    };

    window.addEventListener('smarttech:sqlite-ready', onRuntimeRefreshEvent as EventListener);
    window.addEventListener('smarttech:store-changed', onRuntimeRefreshEvent as EventListener);
    window.addEventListener('storage', onStorageRefreshEvent);
    document.addEventListener('visibilitychange', onVisibility);

    retryTimer = window.setTimeout(() => scheduleRefreshRuntime(0), 280);

    return () => {
      if (runtimeRefreshTimerRef.current) window.clearTimeout(runtimeRefreshTimerRef.current);
      if (retryTimer) window.clearTimeout(retryTimer);
      window.removeEventListener('smarttech:sqlite-ready', onRuntimeRefreshEvent as EventListener);
      window.removeEventListener('smarttech:store-changed', onRuntimeRefreshEvent as EventListener);
      window.removeEventListener('storage', onStorageRefreshEvent);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [desktopSuggestedDefault, refreshCompany, diagnosticsOn, showPersistenceDiagnostics, loadPersistenceInfo]);

  useEffect(() => {
    // Hidrata o lock do SQLite KV na memória (async — sobrevive a limpeza do WebView)
    initCompanyLock().then((state) => {
      setLockState(state);
    }).catch(() => {
      // fallback síncrono via localStorage
      setLockState({ locked: isCompanyLocked() });
    });
  }, []); // executa apenas 1x — initCompanyLock é idempotente

  useEffect(() => {
    // Carregar dados da empresa no form quando vierem do contexto
    if (company) {
      setCompanyForm({
        nome_fantasia: company.nome_fantasia || '',
        razao_social: company.razao_social || '',
        cnpj: company.cnpj || '',
        telefone: company.telefone || '',
        endereco: company.endereco || '',
        cidade: company.cidade || '',
        estado: company.estado || '',
        cep: company.cep || '',
        logo_url: company.logo_url || '',
        mensagem_rodape: company.mensagem_rodape || ''
      });
    }
  }, [company]);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.nome_fantasia.trim()) {
      showToast('Nome fantasia é obrigatório.', 'warning');
      return;
    }
    setCompanySaving(true);
    try {
      // 🔒 Se empresa está fixada, envia apenas campos editáveis — campos críticos
    // vêm do snapshot do lock (não do form, que pode ter sido adulterado via DevTools)
    const upsertPayload = companyLocked && lockState.snapshot
      ? {
          nome_fantasia: lockState.snapshot.nome_fantasia,   // usa snapshot
          razao_social: lockState.snapshot.razao_social || undefined,
          cnpj: lockState.snapshot.cnpj || undefined,
        }
      : {
          nome_fantasia: companyForm.nome_fantasia,
          razao_social: companyForm.razao_social || undefined,
          cnpj: companyForm.cnpj || undefined,
        };
    const result = await upsertCompany({
        ...upsertPayload,
        telefone: companyForm.telefone || undefined,
        endereco: companyForm.endereco || undefined,
        cidade: companyForm.cidade || undefined,
        estado: companyForm.estado || undefined,
        cep: companyForm.cep || undefined,
        logo_url: companyForm.logo_url || undefined,
        mensagem_rodape: companyForm.mensagem_rodape || undefined
      });
      if (result.success) {
        showToast('Dados da empresa salvos com sucesso!', 'success');
        await refreshCompany();
      } else {
        showToast(result.error || 'Erro ao salvar empresa', 'error');
      }
    } finally {
      setCompanySaving(false);
    }
  };


  // ─── Fixar Empresa ────────────────────────────────────────────────────────────

  const handleConfirmLock = async () => {
    setLocking(true);
    try {
      // lockCompany() lê do storage — não do formulário (anti-tamper)
      // Se o usuário alterou campos no form sem salvar, o lock usa os dados SALVOS.
      const result = await lockCompany();
      if (result.success) {
        // Recarregar lock state da memória (já atualizado por lockCompany)
        setLockState(getCompanyLockState());
        setShowLockModal(false);
        showToast('🔒 Empresa fixada. CNPJ e razão social não podem mais ser alterados.', 'success');
      } else {
        showToast(result.error || 'Erro ao fixar empresa.', 'error');
      }
    } finally {
      setLocking(false);
    }
  };

    const _handleLockCompany = async () => {
    setLocking(true);
    try {
      const result = await lockCompany();
      if (result.success) {
        setLockState({ locked: true });
        setShowLockModal(false);
        showToast('🔒 Empresa fixada com sucesso. CNPJ e Razão Social não podem mais ser alterados.', 'success');
      } else {
        showToast(result.error || 'Erro ao fixar empresa.', 'error');
      }
    } finally {
      setLocking(false);
    }
  };

  const handlePrintScaleChange = (scale: number) => {
    const clamped = Math.max(0.5, Math.min(1.0, scale));
    setPrintScale(clamped);
    safeSet(STORAGE_KEY_PRINT_SCALE, clamped);
    const pct = Math.round(clamped * 100);
    setMensagem(`Escala de impressão ajustada para ${pct}%`);
    setTimeout(() => setMensagem(''), 3000);
  };

  const handleDeleteCompany = async () => {
    if (!window.confirm('Remover cadastro da empresa? Isso impacta cabeçalho das impressões.')) return;
    setCompanySaving(true);
    try {
      const result = await deleteCompany();
      if (result.success) {
        showToast('Cadastro da empresa removido.', 'success');
        await refreshCompany();
        setCompanyForm({
          nome_fantasia: '',
          razao_social: '',
          cnpj: '',
          telefone: '',
          endereco: '',
          cidade: '',
          estado: '',
          cep: '',
          logo_url: '',
          mensagem_rodape: ''
        });
      } else {
        showToast(result.error || 'Erro ao remover empresa', 'error');
      }
    } finally {
      setCompanySaving(false);
    }
  };

  const handleExportBackup = async () => {
    const success = await downloadBackup();
    if (success) showToast('Backup exportado com sucesso!', 'success');
    else showToast('Erro ao exportar backup', 'error');
  };

  const handleTamanhoPapelChange = (tamanho: TamanhoPapel) => {
    const next: TamanhoPapel = tamanho;
    setTamanhoPapel(next);
    safeSet(STORAGE_KEY_PAPEL, next);
    setMensagem(`Tamanho de papel alterado para ${next}`);
    setTimeout(() => setMensagem(''), 3000);
  };

  const handleModoCompactoChange = (compacto: boolean) => {
    setModoCompacto(compacto);
    saveModoCompacto(compacto);
    aplicarModoCompacto(compacto);
    setMensagem(`Modo ${compacto ? 'compacto' : 'normal'} ${compacto ? 'ativado' : 'desativado'}`);
    setTimeout(() => setMensagem(''), 3000);
  };

  const _handleModoAjustavelChange = (ajustavel: boolean) => {
    setModoAjustavel(ajustavel);
    saveModoAjustavel(ajustavel);
    aplicarModoAjustavel(ajustavel);
    setMensagem(`Modo ajustável ${ajustavel ? 'ativado' : 'desativado'}`);
    setTimeout(() => setMensagem(''), 3000);
  };

  return (
    <div className="configuracoes-page page-container">
      <div className="page-header">
        <h1>⚙️ Configurações</h1>
        <p>Gerencie preferências do sistema</p>
      </div>

      {isRealSuperAdmin && !isDesktopApp() && (
        <div className="superadmin-highlight">
          <div className="superadmin-highlight__content">
            <span className="superadmin-highlight__kicker">Conta principal</span>
            <h2>Modo SuperAdmin ativo</h2>
            <p>
              Esta conta pode visualizar todas as lojas criadas, acessar o painel de qualquer cliente
              e controlar ativação, bloqueio e licença sem misturar os dados operacionais.
            </p>
          </div>
          <div className="superadmin-highlight__actions">
            <button className="btn-primary" onClick={() => navigate('/lojas')}>
              Abrir painel de lojas
            </button>
          </div>
        </div>
      )}

      {mensagem && (
        <div className={`mensagem ${mensagem.includes('sucesso') || mensagem.includes('ativado') || mensagem.includes('alterado') || (mensagem.includes('removida') || mensagem.includes('desativado')) ? 'sucesso' : 'erro'}`} role="alert">
          {mensagem}
        </div>
      )}

      <div className="config-tabs" role="tablist" aria-label="Seções de configurações">
        {CONFIG_TABS.map((tab) => (
          <button
            key={tab.key}
            id={`config-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`config-panel-${tab.key}`}
            className={`config-tab ${activeTab === tab.key ? 'is-active' : ''}`}
            onClick={() => setActiveTab(tab.key as 'empresa' | 'impressao' | 'sistema')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="configuracoes-content">
        {activeTab === 'empresa' && (
        <div className="config-tab-panel" id="config-panel-empresa" role="tabpanel" aria-labelledby="config-tab-empresa">
        <div className="config-card">
          <h2>🏢 Dados da Empresa (para impressões)</h2>
          <p style={{ color: 'var(--text-secondary, #666)', marginBottom: '1rem' }}>
            Esses dados aparecem automaticamente nos comprovantes, recibos e ordens impressas.
          </p>

          <Guard
            allowed={isAdmin()}
            mode="disable"
            reason="Apenas administradores podem editar os dados da empresa"
          >
            <form onSubmit={handleSaveCompany}>

              {/* ── Banner de estado do lock ─────────────────────────────── */}
              {companyLocked ? (
                <div style={{
                  marginBottom: '0.75rem',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1.5px solid rgba(16,185,129,0.35)',
                  background: 'rgba(16,185,129,0.09)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                }}>
                  <span style={{ fontSize: 20, lineHeight: 1 }}>🔒</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#10b981' }}>Empresa fixada</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>
                      CNPJ e Razão Social estão bloqueados permanentemente.<br />
                      Telefone, endereço, logo e rodapé ainda podem ser editados.
                    </div>
                  </div>
                </div>
              ) : company && (
                <div style={{
                  marginBottom: '0.75rem',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid rgba(251,191,36,0.3)',
                  background: 'rgba(251,191,36,0.07)',
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                }}>
                  ⚠️ Antes de <b>fixar</b>, confira com atenção <b>Nome Fantasia</b>, <b>Razão Social</b> e <b>CNPJ</b>. Depois de fixado, esses campos ficam imutáveis. Para confirmar, será solicitado digitar <b>FIXAR</b>.
                </div>
              )}

              <div className="form-grid">

                {/* ── CAMPOS CRÍTICOS (disabled quando locked) ───────────── */}
                <div className="form-group">
                  <label>
                    Nome Fantasia *
                    {companyLocked && (
                      <span title="Campo fixado — não pode ser alterado" style={{ marginLeft: 6, cursor: 'help', opacity: 0.7 }}>🔒</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={companyForm.nome_fantasia}
                    onChange={(e) => setCompanyForm({ ...companyForm, nome_fantasia: e.target.value })}
                    placeholder="Ex: Smart Tech"
                    autoFocus={false}
                    disabled={companyLocked || companySaving || companyLoading}
                    title={companyLocked ? '🔒 Campo fixado — não pode ser alterado' : undefined}
                  />
                </div>

                <div className="form-group">
                  <label>
                    Razão Social
                    {companyLocked && (
                      <span title="Campo fixado — não pode ser alterado" style={{ marginLeft: 6, cursor: 'help', opacity: 0.7 }}>🔒</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={companyForm.razao_social}
                    onChange={(e) => setCompanyForm({ ...companyForm, razao_social: e.target.value })}
                    placeholder="Ex: Smart Tech Assistência Técnica LTDA"
                    disabled={companyLocked || companySaving || companyLoading}
                    title={companyLocked ? '🔒 Campo fixado — não pode ser alterado' : undefined}
                  />
                </div>

                <div className="form-group">
                  <label>
                    CNPJ
                    {companyLocked && (
                      <span title="Campo fixado — não pode ser alterado" style={{ marginLeft: 6, cursor: 'help', opacity: 0.7 }}>🔒</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={companyForm.cnpj}
                    onChange={(e) => setCompanyForm({ ...companyForm, cnpj: e.target.value })}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    disabled={companyLocked || companySaving || companyLoading}
                    title={companyLocked ? '🔒 Campo fixado — não pode ser alterado' : undefined}
                  />
                </div>

                {/* ── CAMPOS NÃO-CRÍTICOS (sempre editáveis) ─────────────── */}
                <div className="form-group">
                  <label>Telefone</label>
                  <input
                    type="tel"
                    value={companyForm.telefone}
                    onChange={(e) => setCompanyForm({ ...companyForm, telefone: e.target.value })}
                    placeholder="(43) 99999-9999"
                    inputMode="tel"
                    disabled={companySaving || companyLoading}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Endereço</label>
                  <input
                    type="text"
                    value={companyForm.endereco}
                    onChange={(e) => setCompanyForm({ ...companyForm, endereco: e.target.value })}
                    placeholder="Rua, número, bairro"
                    disabled={companySaving || companyLoading}
                  />
                </div>

                <div className="form-group">
                  <label>Cidade</label>
                  <input
                    type="text"
                    value={companyForm.cidade}
                    onChange={(e) => setCompanyForm({ ...companyForm, cidade: e.target.value })}
                    placeholder="Rolândia"
                    disabled={companySaving || companyLoading}
                  />
                </div>

                <div className="form-group">
                  <label>Estado</label>
                  <input
                    type="text"
                    value={companyForm.estado}
                    onChange={(e) => setCompanyForm({ ...companyForm, estado: e.target.value })}
                    placeholder="PR"
                    disabled={companySaving || companyLoading}
                  />
                </div>

                <div className="form-group">
                  <label>CEP</label>
                  <input
                    type="text"
                    value={companyForm.cep}
                    onChange={(e) => setCompanyForm({ ...companyForm, cep: e.target.value })}
                    placeholder="00000-000"
                    inputMode="numeric"
                    disabled={companySaving || companyLoading}
                  />
                </div>

                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowCompanyAdvanced((v) => !v)}
                    disabled={companySaving || companyLoading}
                    style={{ width: 'fit-content' }}
                  >
                    {showCompanyAdvanced ? 'Ocultar opções avançadas' : 'Mostrar opções avançadas'}
                  </button>
                </div>

                {showCompanyAdvanced && (
                  <>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Logo URL (opcional)</label>
                      <input
                        type="url"
                        value={companyForm.logo_url}
                        onChange={(e) => setCompanyForm({ ...companyForm, logo_url: e.target.value })}
                        placeholder="https://.../logo.png"
                        disabled={companySaving || companyLoading}
                      />
                    </div>

                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Mensagem do Rodapé (opcional)</label>
                      <textarea
                        value={companyForm.mensagem_rodape}
                        onChange={(e) => setCompanyForm({ ...companyForm, mensagem_rodape: e.target.value })}
                        placeholder="Ex: Obrigado pela preferência!"
                        rows={3}
                        disabled={companySaving || companyLoading}
                      />
                    </div>
                  </>
                )}

              </div>

              {companyError && (
                <div style={{ marginTop: '0.5rem', color: 'var(--error, #ef4444)', fontSize: '0.9rem' }}>
                  Erro ao carregar empresa: {companyError}
                </div>
              )}

              {/* ── Botões de ação ─────────────────────────────────────────── */}
              <div className="form-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>

                <button type="submit" className="btn-primary" disabled={companySaving || companyLoading}>
                  {companySaving ? '⏳ Salvando...' : '💾 Salvar Empresa'}
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={async () => { await refreshCompany(); showToast('Dados atualizados.', 'success'); }}
                  disabled={companySaving}
                >
                  🔄 Atualizar
                </button>

                {/* Remover: oculto quando locked */}
                {!companyLocked && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleDeleteCompany}
                    disabled={companySaving}
                    style={{ backgroundColor: 'var(--error, #ef4444)', color: 'white' }}
                  >
                    🗑️ Remover
                  </button>
                )}

                {/* Fixar: desativado quando já locked */}
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={companyLocked || companySaving || companyLoading || !companyForm.nome_fantasia.trim()}
                  onClick={() => setShowLockModal(true)}
                  title={companyLocked
                    ? '🔒 Empresa já fixada — CNPJ e Razão Social são imutáveis'
                    : 'Bloqueia permanentemente CNPJ, Razão Social e Nome Fantasia'}
                  style={companyLocked
                    ? { opacity: 0.5, cursor: 'not-allowed' }
                    : { borderColor: '#f59e0b', color: '#f59e0b' }
                  }
                >
                  {companyLocked ? '🔒 Empresa fixada' : '🔒 Fixar empresa'}
                </button>
              </div>

            </form>
          </Guard>
        </div>
        </div>
        )}

        {activeTab === 'impressao' && (
<div className="config-tab-panel" id="config-panel-impressao" role="tabpanel" aria-labelledby="config-tab-impressao">
<div className="config-card">
  <h2>🖨️ Impressão</h2>

  <div className="printing-hero">
    <div>
      <strong>Fluxo de impressão mais leve e previsível</strong>
      <p>Ajuste papel, modo de balcão e impressora padrão sem carregar a parte pesada do Windows antes da hora.</p>
    </div>
    <span className="printing-hero__badge">Baixo risco • ganho alto</span>
  </div>

  {/* Tamanho do Papel */}
  <div className="setting-section" style={{ marginTop: 'var(--spacing-md)' }}>
    <div className="setting-label-group">
      <label className="setting-label">Tamanho do Papel</label>
      <span className="setting-description">Escolha A4 ou bobina térmica (58/80)</span>
    </div>

    <div className="tamanho-papel-grid">
      {([
            { value: 'A4', label: 'A4' },
            { value: '80mm', label: '80' },
            { value: '58mm', label: '58' },
          ] as const).map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`tamanho-papel-btn ${tamanhoPapel === opt.value ? 'ativo' : ''}`}
          onClick={() => handleTamanhoPapelChange(opt.value)}
          aria-pressed={tamanhoPapel === opt.value}
        >
          {tamanhoPapel === opt.value && <span className="tamanho-papel-check">✓</span>}
          <span className="tamanho-papel-icon">{opt.value === 'A4' ? '📄' : '🧾'}</span>
          <span className="tamanho-papel-info">
            <strong>{opt.label}</strong>
            <span>{opt.value === 'A4' ? 'Comprovantes e layouts amplos' : `Bobina térmica ${opt.label}mm`}</span>
          </span>
        </button>
      ))}
    </div>

    <div className="printing-inline-status">
      Atual: <strong>{tamanhoPapel === '58mm' ? '58' : tamanhoPapel === '80mm' ? '80' : 'A4'}</strong>
    </div>
  </div>

  {/* Modo compacto */}
  <div className="setting-section" style={{ marginTop: 'var(--spacing-lg)' }}>
    <div className="setting-label-group">
      <label className="setting-label">Modo Compacto</label>
      <span className="setting-description">Reduz espaçamentos e fontes para uso em balcão</span>
    </div>

    <div className="compact-toggle-container">
      <button
        type="button"
        className={`compact-toggle modo-compacto ${modoCompacto ? 'ativo' : ''}`}
        onClick={() => handleModoCompactoChange(!modoCompacto)}
      >
        <div className="compact-toggle-icon">{modoCompacto ? '📐' : '📏'}</div>
        <div className="compact-toggle-info">
          <strong>{modoCompacto ? 'Compacto' : 'Normal'}</strong>
          <span>{modoCompacto ? 'Interface compacta ativada' : 'Interface padrão'}</span>
        </div>
        <div className={`compact-toggle-switch ${modoCompacto ? 'ativo' : ''}`}>
          <span className="switch-slider"></span>
        </div>
      </button>
    </div>
  </div>

  {isDesktopApp() && (
    <div className="setting-section" style={{ marginTop: 'var(--spacing-lg)' }}>
      <div className="setting-label-group">
        <label className="setting-label">Impressora Padrão (ESC/POS)</label>
        <span className="setting-description">Selecione a impressora para impressão silenciosa (sem janela do Windows).</span>
      </div>
      {!showPrinterAdvanced ? (
        <div className="printing-advanced-callout">
          <div className="printing-advanced-callout__text">
            A parte pesada de impressoras do Windows fica sob demanda para evitar travadinhas.
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary printing-advanced-callout__button"
              onClick={() => setShowPrinterAdvanced(true)}
            >
              Carregar impressoras e opções avançadas
            </button>
          </div>
        </div>
      ) : (
        <Suspense fallback={<div className="printer-settings-skeleton" aria-live="polite">Abrindo opções avançadas de impressão…</div>}>
          <PrinterSettings />
        </Suspense>
      )}
    </div>
  )}
</div>
</div>
        )}

        {activeTab === 'sistema' && (
        <div className="config-tab-panel" id="config-panel-sistema" role="tabpanel" aria-labelledby="config-tab-sistema">
<div className="config-card">
  <h2>🏢 Cliente</h2>
  <div className="info-list">
    <div className="info-item">
      <strong>CLIENT_ID:</strong>
      <span>{clientId || 'Não configurado'}</span>
    </div>
    <div className="info-item">
      <strong>Status:</strong>
      <span style={{ color: clientId ? 'var(--success, #10b981)' : 'var(--error, #ef4444)' }}>
        {clientId ? '✅ Configurado' : '❌ Não configurado'}
      </span>
    </div>

    {!clientId && (
      <button
        className="btn-primary"
        onClick={() => navigate('/setup')}
        style={{ marginTop: '1rem', width: '100%' }}
      >
        Configurar CLIENT_ID
      </button>
    )}
  </div>
</div>

        <div className="config-card">
          <h2>👥 Usuários</h2>
          <p style={{ color: 'var(--text-secondary, #666)', marginBottom: '1rem' }}>
            Gerencie usuários e permissões do sistema
          </p>
          <Guard 
            allowed={canManageUsers()}
            mode="disable"
            reason="Apenas administradores podem gerenciar usuários"
          >
            <button
              className="btn-secondary"
              onClick={() => navigate('/usuarios')}
              style={{ width: '100%' }}
            >
              Gerenciar Usuários
            </button>
          </Guard>
        </div>

        {isRealSuperAdmin && !isDesktopApp() && (
          <div className="config-card">
            <h2>🏪 Lojas (SuperAdmin)</h2>
            <p style={{ color: 'var(--text-secondary, #666)', marginBottom: '1rem' }}>
              Crie novas lojas para vender o sistema e gerencie o acesso por store_id
            </p>
            <button
              className="btn-secondary"
              onClick={() => {
                const sid = getRuntimeStoreId();
                const url = sid
                  ? (isDesktopApp() ? '/lojas' : `/lojas?store=${encodeURIComponent(sid)}`)
                  : '/lojas';
                navigate(url);
              }}
              style={{ width: '100%' }}
            >
              Gerenciar Lojas
            </button>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #666)', marginTop: '0.5rem' }}>
              Dica: se a rota /lojas ainda não existir, eu já te passo o arquivo pronto.
            </p>
          </div>
        )}

        <div className="config-card">
          <h2>💾 Backup e Restauração</h2>
          <p style={{ color: 'var(--text-secondary, #666)', marginBottom: '1rem' }}>
            Exporte ou restaure todos os dados do sistema
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
            <button
              className="btn-primary"
              onClick={handleExportBackup}
              style={{ width: '100%' }}
            >
              💾 Exportar Backup
            </button>
            <button
              className="btn-secondary"
              onClick={() => navigate('/backup')}
              style={{ width: '100%' }}
            >
              📥 Ir para Backup/Restore
            </button>
          </div>
        </div>

        {isAdminMode() && (
          <div className="config-card">
            <h2>🧹 Limpeza de Dados</h2>
            <p style={{ color: 'var(--text-secondary, #666)', marginBottom: '1rem' }}>
              Remova dados restantes ou limpe todos os dados do store atual
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
              <button
                className="btn-secondary"
                onClick={async () => {
                  if (!confirm('Tem certeza que deseja remover TODOS os dados do store atual? Esta ação não pode ser desfeita!')) {
                    return;
                  }
                  setCleaning(true);
                  try {
                    const result = await clearStoreData();
                    if (result.success) {
                      const total = Object.values(result.removed).reduce((sum, count) => sum + count, 0);
                      showToast(`✅ ${total} itens removidos com sucesso!`, 'success');
                      setTimeout(() => window.location.reload(), 1000);
                    } else {
                      showToast(`❌ Erro ao limpar dados: ${result.error}`, 'error');
                    }
                  } catch (error) {
                    showToast('Erro ao limpar dados', 'error');
                  } finally {
                    setCleaning(false);
                  }
                }}
                disabled={cleaning}
                style={{ width: '100%', backgroundColor: 'var(--error, #ef4444)', color: 'white' }}
              >
                {cleaning ? '⏳ Limpando...' : '🗑️ Limpar TODOS os Dados do Store'}
              </button>
              <button
                className="btn-secondary"
                onClick={async () => {
                  if (!confirm('Remover apenas dados órfãos (que não pertencem ao store atual)?')) {
                    return;
                  }
                  setCleaning(true);
                  try {
                    const result = await removeOrphanedData();
                    if (result.success) {
                      const total = Object.values(result.removed).reduce((sum, count) => sum + count, 0);
                      if (total > 0) {
                        showToast(`✅ ${total} itens órfãos removidos!`, 'success');
                        setTimeout(() => window.location.reload(), 1000);
                      } else {
                        showToast('✅ Nenhum dado órfão encontrado', 'success');
                      }
                    } else {
                      showToast(`❌ Erro: ${result.error}`, 'error');
                    }
                  } catch (error) {
                    showToast('Erro ao remover dados órfãos', 'error');
                  } finally {
                    setCleaning(false);
                  }
                }}
                disabled={cleaning}
                style={{ width: '100%' }}
              >
                {cleaning ? '⏳ Removendo...' : '🧹 Remover Dados Órfãos'}
              </button>
              <button
                className="btn-secondary"
                onClick={async () => {
                  if (!confirm('Remover todos os dados marcados com [TESTE_E2E] ou [TESTE_PERSIST] (movimentações, vendas, clientes, etc.)?')) {
                    return;
                  }
                  setCleaning(true);
                  try {
                    const result = await removeTestData();
                    if (result.success) {
                      const total = Object.values(result.removed).reduce((sum, count) => sum + count, 0);
                      if (total > 0) {
                        showToast(`✅ ${total} itens de teste removidos!`, 'success');
                        setTimeout(() => window.location.reload(), 1000);
                      } else {
                        showToast('✅ Nenhum dado de teste encontrado', 'success');
                      }
                    } else {
                      showToast(`❌ Erro: ${result.error}`, 'error');
                    }
                  } catch (error) {
                    showToast('Erro ao remover dados de teste', 'error');
                  } finally {
                    setCleaning(false);
                  }
                }}
                disabled={cleaning}
                style={{ width: '100%' }}
              >
                {cleaning ? '⏳ Removendo...' : '🧪 Remover Dados [TESTE_E2E] / [TESTE_PERSIST]'}
              </button>
            </div>
            <p style={{ 
              fontSize: '0.875rem', 
              color: 'var(--text-secondary, #666)', 
              marginTop: '0.5rem',
              fontStyle: 'italic'
            }}>
              ⚠️ Atenção: Limpar dados remove permanentemente. Faça backup antes!
            </p>
          </div>
        )}

        {/* Licença e sincronização são ocultadas no modo 100% local */}
        {!localOnly && (isAdmin() || isAdminMode() || canManageLicense()) && (
          <div className="config-card">
            <h2>🔐 Licença</h2>
            <LicenseStatusWidget />
            <Guard 
              allowed={canManageLicense()}
              mode="disable"
              reason="Apenas o SuperAdmin do sistema pode gerenciar licença"
            >
              <button
                className="btn-secondary"
                onClick={() => navigate('/licenca')}
                style={{ width: '100%', marginTop: '1rem' }}
              >
                Gerenciar Licença
              </button>
            </Guard>
          </div>
        )}

        {!localOnly && (
        <div className="config-card">
          <h2>🔄 Sincronização</h2>
          <div className="info-list">
            <div className="info-item">
              <strong>Status:</strong>
              <span style={{ 
                color: syncStatus.isOnline ? 'var(--success, #10b981)' : 'var(--error, #ef4444)' 
              }}>
                {syncStatus.isOnline ? '🟢 Online' : '🔴 Offline'}
              </span>
            </div>
            <div className="info-item">
              <strong>Sincronizando:</strong>
              <span>{syncStatus.isSyncing ? '⏳ Sim' : '✅ Não'}</span>
            </div>
            <div className="info-item">
              <strong>Pendências:</strong>
              <span>{syncStatus.pendingCount} item(s)</span>
            </div>
          </div>
          <button
            className="btn-secondary"
            onClick={() => navigate('/sync-status')}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            Ver Detalhes de Sincronização
          </button>
        </div>
        )}

        {/* ── Modo PC Lento ─────────────────────────────────────── */}
        <div className="config-card">
          <h2>⚡ Desempenho</h2>

          {lowEndSuggested && !lowEndMode && (
            <div className="low-end-suggestion-banner" style={{ marginBottom: '1rem' }}>
              <span style={{ fontSize: 18 }}>🐢</span>
              <div style={{ flex: 1 }}>
                <strong>Hardware limitado detectado.</strong>{' '}
                Ative o Modo PC Lento para melhorar a estabilidade.
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn-primary"
                    style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: 4 }}
                    onClick={() => { applyLowEnd(true); sessionStorage.removeItem('smart-tech-low-end-suggested'); }}>
                    Ativar agora
                  </button>
                  <button className="btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: 4 }}
                    onClick={() => { sessionStorage.removeItem('smart-tech-low-end-suggested'); window.location.reload(); }}>
                    Ignorar
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="low-end-toggle" onClick={() => applyLowEnd(!lowEndMode)}>
            <div className="low-end-toggle__info">
              <div className="low-end-toggle__title">
                🐢 Modo PC Lento
                {lowEndMode && (
                  <span style={{
                    fontSize: '0.68rem', background: 'rgba(245,158,11,0.15)',
                    color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: 4, padding: '1px 6px', fontWeight: 500,
                  }}>ATIVO</span>
                )}
              </div>
              <div className="low-end-toggle__desc">
                Recomendado para computadores com hardware limitado
                (Celeron, Atom, Pentium, ≤ 4 GB RAM). Remove animações,
                sombras e efeitos visuais pesados.
              </div>
            </div>
            <button
              className={`low-end-switch${lowEndMode ? ' on' : ''}`}
              type="button"
              aria-pressed={lowEndMode}
              aria-label="Modo PC Lento"
              onClick={(e) => { e.stopPropagation(); applyLowEnd(!lowEndMode); }}
            />
          </div>

          {/* Status já é indicado pelo selo "ATIVO" acima; evita mensagem fixa na tela */}

          {/* ── Diagnóstico (produção) ───────────────────────────── */}
          <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
            <div className="low-end-toggle" onClick={() => {
              const next = !diagnosticsOn;
              setDiagnosticsEnabled(next);
              setDiagnosticsOn(next);
            }}>
              <div className="low-end-toggle__info">
                <div className="low-end-toggle__title">
                  🧰 Diagnóstico (suporte)
                  {diagnosticsOn && (
                    <span style={{
                      fontSize: '0.68rem', background: 'rgba(16,185,129,0.12)',
                      color: 'var(--success, #10b981)', border: '1px solid rgba(16,185,129,0.25)',
                      borderRadius: 4, padding: '1px 6px', fontWeight: 500,
                    }}>ATIVO</span>
                  )}
                </div>
                <div className="low-end-toggle__desc">
                  Quando ativado, o sistema registra mais informações para o Pacote de Suporte
                  (inclui <code>diag-log.json</code> e long tasks). Use só quando precisar.
                </div>
              </div>
              <button
                className={`low-end-switch${diagnosticsOn ? ' on' : ''}`}
                type="button"
                aria-pressed={diagnosticsOn}
                aria-label="Diagnóstico"
                onClick={(e) => {
                  e.stopPropagation();
                  const next = !diagnosticsOn;
                  setDiagnosticsEnabled(next);
                  setDiagnosticsOn(next);
                }}
              />
            </div>

            {diagnosticsOn && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const next = !showPersistenceDiagnostics;
                    setShowPersistenceDiagnostics(next);
                    if (next) void loadPersistenceInfo();
                  }}
                  style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                >
                  {showPersistenceDiagnostics ? 'Ocultar diagnóstico de persistência' : 'Carregar diagnóstico de persistência'}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    try { clearDiagLogs(); } catch {}
                    window.location.reload();
                  }}
                  style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                >
                  Limpar logs de diagnóstico
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="config-card">
          <h2>ℹ️ Sistema</h2>
          <div className="info-list">
            <div className="info-item">
              <strong>Nome do Sistema:</strong>
              <span>Smart Tech Rolândia</span>
            </div>
            <div className="info-item">
              <strong>Versão:</strong>
              <span>1.0.0</span>
            </div>
            <div className="info-item">
              <strong>Armazenamento:</strong>
              <span>{isDesktopApp() ? 'SQLite (Desktop / AppData)' : 'Web (Offline-first)'}</span>
            </div>
            {isDesktopApp() && diagnosticsOn && showPersistenceDiagnostics && (
              <div className="info-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <strong>Persistência (Diagnóstico):</strong>
                {persistenceLoading && <span>Carregando…</span>}
                {!persistenceLoading && persistenceInfo?.platform === 'desktop' && (
                  <div style={{ fontSize: '0.82rem', opacity: 0.92, lineHeight: 1.35 }}>
                    <div><b>AppData:</b> <code>{persistenceInfo.appDataDir || '-'}</code></div>
                    {persistenceInfo.appLocalDataDir ? (
                      <div><b>AppLocalData:</b> <code>{persistenceInfo.appLocalDataDir}</code></div>
                    ) : null}
                    <div><b>DB dir:</b> <code>{persistenceInfo.dbDir || '-'}</code></div>
                    {typeof persistenceInfo.storeIdKv === 'string' ? (
                      <div><b>store_id (KV):</b> <code>{persistenceInfo.storeIdKv}</code></div>
                    ) : null}
                    {persistenceInfo.cryptoKey ? (
                      <div>
                        <b>crypto.key:</b> <code>{persistenceInfo.cryptoKey.path}</code>
                        {' '}({Math.round((persistenceInfo.cryptoKey.size || 0) / 1024)} KB){' '}
                        {persistenceInfo.cryptoKey.hasBak ? '✅ bak' : '⚠️ sem .bak'}
                      </div>
                    ) : (
                      <div><b>crypto.key:</b> ⚠️ não encontrada</div>
                    )}
                    {Array.isArray(persistenceInfo.dbFiles) && persistenceInfo.dbFiles.length > 0 ? (
                      <details style={{ marginTop: 6 }}>
                        <summary style={{ cursor: 'pointer' }}>Arquivos .db ({persistenceInfo.dbFiles.length})</summary>
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {persistenceInfo.dbFiles.slice(0, 8).map(f => (
                            <div key={f.path} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                              {f.name} — {Math.round((f.size || 0) / 1024)} KB
                            </div>
                          ))}
                          {persistenceInfo.dbFiles.length > 8 ? (
                            <div style={{ opacity: 0.85 }}>… +{persistenceInfo.dbFiles.length - 8} arquivos</div>
                          ) : null}
                        </div>
                      </details>
                    ) : (
                      <div><b>Arquivos .db:</b> (nenhum encontrado)</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="info-item">
              <strong>PWA:</strong>
              <span>Ativado</span>
            </div>
            <div className="info-item">
              <strong>Tamanho do Papel:</strong>
              <span>{tamanhoPapel === 'A4' ? 'A4' : tamanhoPapel === '80mm' ? '80' : '58'}</span>
            </div>
            <div className="info-item">
              <strong>Tema Atual:</strong>
              <span></span>
            </div>
            <div className="info-item">
              <strong>Modo Compacto:</strong>
              <span>{modoCompacto ? '📐 Ativado' : '📏 Desativado'}</span>
            </div>
            <div className="info-item">
              <strong>Modo Ajustável:</strong>
              <span>{modoAjustavel ? '📋 Ativado' : '📑 Desativado'}</span>
            </div>
          </div>
        </div>
        </div>
      )}
      </div>

      {/* ── Modal: Fixar Empresa ─────────────────────────────────────── */}
      <LockCompanyModal
        open={showLockModal}
        companyName={companyForm.nome_fantasia}
        cnpj={companyForm.cnpj}
        razaoSocial={companyForm.razao_social}
        loading={locking}
        onConfirm={handleConfirmLock}
        onCancel={() => setShowLockModal(false)}
      />
    </div>
  );
}

// ─── Modal Fixar Empresa ─────────────────────────────────────────────────────

function LockCompanyModal({
  open,
  companyName,
  cnpj,
  razaoSocial,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  companyName: string;
  cnpj: string;
  razaoSocial: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText.trim().toUpperCase() === 'FIXAR';
  useEffect(() => {
    if (!open) setConfirmText('');
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: 'var(--surface, #1e293b)',
        border: '1px solid rgba(239,68,68,0.4)',
        borderRadius: 16, padding: '2rem',
        maxWidth: 480, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 36, textAlign: 'center', marginBottom: '1rem' }}>🔒</div>

        <h2 style={{ color: 'var(--text)', textAlign: 'center', marginBottom: '0.5rem', fontSize: '1.2rem' }}>
          Fixar Empresa — Ação Irreversível
        </h2>

        <p style={{ color: 'var(--text-secondary, #94a3b8)', textAlign: 'center', marginBottom: '1.25rem', fontSize: 14, lineHeight: 1.5 }}>
          Após fixar, <strong>CNPJ</strong>, <strong>Razão Social</strong> e <strong>Nome Fantasia</strong> não poderão ser alterados.
          Essa ação é permanente e não pode ser desfeita pela interface.
        </p>

        <div style={{
          background: 'rgba(15,23,42,0.6)', borderRadius: 10,
          padding: '12px 16px', marginBottom: '1.5rem',
          border: '1px solid rgba(148,163,184,0.15)',
          fontSize: 13,
        }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>Dados que serão fixados:</div>
          <div style={{ color: 'var(--text)', fontWeight: 600 }}>📛 {companyName || '(sem nome)'}</div>
          {razaoSocial && <div style={{ color: 'var(--text)' }}>📋 {razaoSocial}</div>}
          {cnpj && <div style={{ color: 'var(--text)' }}>🪪 {cnpj}</div>}
          {!cnpj && <div style={{ color: '#f59e0b', fontSize: 12 }}>⚠️ CNPJ não preenchido — poderá ser corrigido antes de fixar.</div>}
        </div>

        
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 13, marginBottom: 6 }}>
            Para confirmar, digite <strong>FIXAR</strong>:
          </div>
          <input
            className="input"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Digite FIXAR"
            autoComplete="off"
            spellCheck={false}
            style={{ width: '100%', maxWidth: 260 }}
          />
          <div style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: 12, marginTop: 6 }}>
            Isso evita fixar por engano.
          </div>
        </div>

<div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            className="btn-secondary"
            onClick={onCancel}
            disabled={loading}
            style={{ minWidth: 100 }}
          >
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={onConfirm}
            disabled={loading || !canConfirm}
            style={{ minWidth: 160, background: '#dc2626', borderColor: '#dc2626' }}
          >
            {loading ? '⏳ Fixando...' : '🔒 Confirmar — Fixar Empresa'}
          </button>
        </div>
      </div>
    </div>
  );
}
export default ConfiguracoesPage;
