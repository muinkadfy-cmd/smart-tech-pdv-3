import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCompany } from '@/contexts/CompanyContext';
import { getLicenseStatus, type LicenseStatus } from '@/lib/license';
import {
  getBackupAlertState,
  getAutoBackupRuntimeState,
  onAutoBackupRuntimeChange,
  onBackupAlertChange,
  type AutoBackupRuntimeState,
  type BackupAlertState,
} from '@/lib/auto-backup';
import {
  getPersistenceGuardState,
  onPersistenceGuardStateChange,
  type PersistenceGuardState,
} from '@/lib/persistence-gate';

function formatDatePtBR(dateIso?: string) {
  if (!dateIso) return null;
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR');
}

function formatDateTimePtBR(timestamp?: number | null) {
  if (!timestamp) return null;
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function computeDaysRemaining(status: LicenseStatus): number | null {
  if (typeof status.daysRemaining === 'number') return status.daysRemaining;
  if (!status.validUntil) return null;
  const until = new Date(status.validUntil);
  if (Number.isNaN(until.getTime())) return null;
  const now = new Date();
  const ms = until.getTime() - now.getTime();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return Number.isFinite(days) ? days : null;
}

function licenseLabel(status: LicenseStatus) {
  if (status.status === 'trial') return 'Trial';
  if (status.status === 'active') return 'Licença ativa';
  if (status.status === 'expired') return 'Trial expirado';
  if (status.status === 'blocked') return 'Bloqueado';
  if (status.status === 'invalid') return 'Token inválido';
  if (status.status === 'not_found') return 'Ativação necessária';
  return 'Verificando';
}

function licenseTone(status: LicenseStatus) {
  if (status.status === 'expired' || status.status === 'blocked' || status.status === 'invalid') return 'danger';
  if (status.status === 'not_found') return 'warn';
  const days = computeDaysRemaining(status);
  if (typeof days === 'number' && days <= 3) return 'warn';
  return 'ok';
}

function backupFooterMeta(alert: BackupAlertState, runtime: AutoBackupRuntimeState): string | null {
  if (runtime.running) {
    return runtime.runningReason === 'close'
      ? 'Fechando com proteção de backup…'
      : 'Executando backup automático…';
  }
  if (runtime.lastRunOk === false && runtime.lastRunError) {
    return `Backup automático falhou: ${runtime.lastRunError}`;
  }
  if (!runtime.lastBackupMs && runtime.nextScheduledRunAtMs) {
    const next = formatDateTimePtBR(runtime.nextScheduledRunAtMs);
    return next
      ? `Primeiro auto-backup agendado: ${next}`
      : 'Primeiro auto-backup já está agendado';
  }
  if (runtime.nextScheduledRunAtMs) {
    const next = formatDateTimePtBR(runtime.nextScheduledRunAtMs);
    if (next) return `Próximo auto-backup: ${next}`;
  }
  return alert.message || null;
}

function persistenceFooterMeta(state: PersistenceGuardState): string | null {
  if (state.closeDrainInProgress) return 'Fechando com checkpoint seguro…';
  if (state.pendingWrites > 0) {
    return state.pendingWrites === 1
      ? '1 gravação local pendente'
      : `${state.pendingWrites} gravações locais pendentes`;
  }
  return 'Persistência local estável';
}

function backupPillTone(alert: BackupAlertState, runtime: AutoBackupRuntimeState): 'ok' | 'warn' | 'danger' | 'info' {
  if (runtime.running) return 'info';
  if (runtime.lastRunOk === false) return 'danger';
  if (!runtime.lastBackupMs && runtime.nextScheduledRunAtMs) return 'info';
  if (alert.showAlert) return 'warn';
  return 'ok';
}

function backupLabel(alert: BackupAlertState, runtime: AutoBackupRuntimeState): string {
  if (runtime.running) return 'Backup em andamento';
  if (runtime.lastRunOk === false) return 'Backup com falha';
  if (!runtime.lastBackupMs && runtime.nextScheduledRunAtMs) return 'Auto-backup armado';
  if (alert.showAlert) return alert.daysSinceBackup < 0 ? 'Backup pendente' : 'Backup desatualizado';
  return 'Backup OK';
}

function persistencePillTone(state: PersistenceGuardState): 'ok' | 'warn' | 'danger' | 'info' {
  if (state.closeDrainInProgress) return 'info';
  if (state.pendingWrites > 0) return 'warn';
  return 'ok';
}

export function StatusFooter() {
  const { company } = useCompany();
  const [license, setLicense] = useState<LicenseStatus>(() => getLicenseStatus());
  const [backupAlert, setBackupAlert] = useState<BackupAlertState>(() => getBackupAlertState());
  const [backupRuntime, setBackupRuntime] = useState<AutoBackupRuntimeState>(() => getAutoBackupRuntimeState());
  const [persistenceState, setPersistenceState] = useState<PersistenceGuardState>(() => getPersistenceGuardState());
  const navigate = useNavigate();

  const openActivation = () => {
    navigate('/ativacao');
  };

  const openBackup = () => {
    navigate('/backup');
  };

  useEffect(() => {
    const tick = () => {
      try {
        setLicense(getLicenseStatus());
      } catch {
        // ignore
      }
    };

    const i = window.setInterval(tick, 30_000);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(i);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  useEffect(() => onBackupAlertChange(setBackupAlert), []);
  useEffect(() => onAutoBackupRuntimeChange(setBackupRuntime), []);
  useEffect(() => onPersistenceGuardStateChange(setPersistenceState), []);

  const companyName = (company?.nome_fantasia || 'Smart Tech Rolândia').trim();
  const appName = 'Sistema PDV Offline';

  const expiresAt = license.validUntil ? formatDatePtBR(license.validUntil) : null;
  const daysRemaining = computeDaysRemaining(license);

  const daysText = useMemo(() => {
    if (typeof daysRemaining !== 'number') return null;
    const d = Math.max(0, daysRemaining);
    if (license.status === 'trial') return `Trial: ${d} dia(s) restantes — Ative para continuar usando`;
    if (license.status === 'active') return `Licença ativa — ${d} dia(s) restantes`;
    if (license.status === 'expired') return 'Trial expirado — Ativação necessária';
    if (license.status === 'not_found') return 'Ativação necessária';
    if (license.status === 'invalid') return 'Token inválido ou expirado';
    if (license.status === 'blocked') return 'Ativação necessária';
    return null;
  }, [daysRemaining, license.status]);

  const tone = licenseTone(license);
  const backupTone = backupPillTone(backupAlert, backupRuntime);
  const persistenceTone = persistencePillTone(persistenceState);
  const backupMeta = backupFooterMeta(backupAlert, backupRuntime);
  const persistenceMeta = persistenceFooterMeta(persistenceState);
  const licenseMeta = daysText || (expiresAt ? `Validade: ${expiresAt}` : 'Clique para ativar ou gerenciar licença');

  return (
    <footer className="status-footer" role="contentinfo">
      <div className="sf-shell">
        <div className="sf-group sf-group--brand" title={companyName}>
          <span className="sf-kicker">Loja atual</span>
          <div className="sf-brand-row">
            <span className="sf-brand">{companyName}</span>
            <span className="sf-app">{appName}</span>
          </div>
        </div>

        <div className="sf-group sf-group--status">
          <span
            className={`sf-pill sf-pill--${persistenceTone}`}
            title={persistenceMeta || 'Persistência local'}
          >
            {persistenceState.closeDrainInProgress
              ? 'Fechando com proteção'
              : persistenceState.pendingWrites > 0
                ? `Salvando (${persistenceState.pendingWrites})`
                : 'Persistência OK'}
          </span>
          <div className="sf-copy">
            <span className="sf-label">Persistência</span>
            <span className="sf-detail">{persistenceMeta || 'Persistência local estável'}</span>
          </div>
        </div>

        <button
          type="button"
          className="sf-group sf-group--status sf-group--clickable"
          title={backupMeta || 'Clique para abrir Backup'}
          onClick={openBackup}
        >
          <span className={`sf-pill sf-pill--${backupTone}`}>
            {backupLabel(backupAlert, backupRuntime)}
          </span>
          <div className="sf-copy">
            <span className="sf-label">Backup</span>
            <span className="sf-detail">{backupMeta || 'Clique para abrir Backup e restauração'}</span>
          </div>
        </button>

        <button
          type="button"
          className="sf-group sf-group--status sf-group--status-license sf-group--clickable"
          title="Clique para ativar/gerenciar licença"
          onClick={openActivation}
        >
          <span className={`sf-pill sf-pill--${tone}`}>{licenseLabel(license)}</span>
          <div className="sf-copy">
            <span className="sf-label">Licença</span>
            <span className="sf-detail">{licenseMeta}</span>
          </div>
        </button>
      </div>
    </footer>
  );
}
