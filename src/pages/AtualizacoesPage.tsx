import { useEffect, useMemo, useState } from 'react';
import { useUpdates } from '@/contexts/UpdateContext';
import { isDesktopApp } from '@/lib/platform';
import { diffSinceCommit } from '@/lib/changelog';
import { BUILD_BASE_VERSION, BUILD_COMMIT, BUILD_DATE, BUILD_ID, BUILD_VERSION } from '@/config/buildInfo';
import './AtualizacoesPage.css';

function formatDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function getBaseVersion(version?: string) {
  const raw = String(version || '').trim();
  if (!raw) return '';
  const parts = raw.split('.');
  return parts.slice(0, Math.min(3, parts.length)).join('.');
}

const SECTION_ICONS: Record<string, string> = {
  'Atualização de melhorias': '🧩',
  'Correções': '🛠️',
  'Performance': '⚡',
  'Refatorações': '🧱',
  'Interface': '🎨',
  'Documentação': '📚',
  'Manutenção': '🧰',
  'Outros': '📝',
};

function AtualizacoesPage() {
  const {
    manifest,
    changelog,
    updateAvailable,
    pwaNeedRefresh,
    hasUpdate,
    logs,
    checkNow,
    markAsRead,
    reloadApp,
    clearAppCache,
    lastSeenVersion,
    lastSeenCommit,
  } = useUpdates();

  const desktop = isDesktopApp();

  const [updatePkg, setUpdatePkg] = useState<any | null>(null);
  const [pkgError, setPkgError] = useState<string | null>(null);
  const [pkgSavedPath, setPkgSavedPath] = useState<string | null>(null);
  const [pkgBusy, setPkgBusy] = useState(false);
  const [pkgSaving, setPkgSaving] = useState(false);

  const onPickUpdatePackage = async () => {
    if (!desktop) return;
    setPkgError(null);
    setPkgSavedPath(null);
    setPkgBusy(true);
    try {
      const mod = await import('@/lib/desktop/update-package');
      const res = await (mod as any).pickAndVerifyUpdatePackage();
      if (res?.canceled) return;
      if (res?.error) {
        setUpdatePkg(null);
        setPkgError(String(res.error));
        return;
      }
      setUpdatePkg(res?.pkg || null);
    } catch (e: any) {
      setUpdatePkg(null);
      setPkgError(e?.message || 'Falha ao abrir pacote');
    } finally {
      setPkgBusy(false);
    }
  };

  const onSaveUpdatePayload = async () => {
    if (!desktop || !updatePkg) return;
    setPkgError(null);
    setPkgSaving(true);
    try {
      const mod = await import('@/lib/desktop/update-package');
      const res = await (mod as any).saveUpdatePayloadFile(updatePkg);
      if (res?.canceled) return;
      if (res?.error) {
        setPkgError(String(res.error));
        return;
      }
      setPkgSavedPath(res?.savedPath ? String(res.savedPath) : '');
    } catch (e: any) {
      setPkgError(e?.message || 'Falha ao salvar o instalador');
    } finally {
      setPkgSaving(false);
    }
  };

  useEffect(() => {
    void checkNow();
  }, [checkNow]);

  const title = manifest?.title?.trim() || 'Atualizações';

  const currentVersion = BUILD_VERSION;
  const currentBaseVersion = BUILD_BASE_VERSION || getBaseVersion(BUILD_VERSION);
  const currentCommit = (BUILD_COMMIT || BUILD_ID || '').trim() || null;
  const currentBuildLabel = BUILD_DATE ? formatDate(BUILD_DATE) : '';

  const serverVersion = manifest?.version || changelog?.version || '—';
  const serverBaseVersion = getBaseVersion(serverVersion);
  const serverBuildDate = (manifest as any)?.date || changelog?.build || '';
  const serverBuildLabel = serverBuildDate ? formatDate(serverBuildDate) : '';
  const serverCommit = String((manifest as any)?.commit || (manifest as any)?.build || changelog?.commit || '').trim();
  const isNewVersion = Boolean(serverBaseVersion && currentBaseVersion && serverBaseVersion !== currentBaseVersion);
  const updateLabel = isNewVersion ? 'Nova versão disponível' : 'Novo build disponível';
  const updateExplanation = isNewVersion
    ? `Você está em ${currentVersion} e há ${serverVersion} pronta para instalar.`
    : `Você está no build ${currentVersion} e há um build de manutenção mais novo ${serverVersion} pronto para aplicar.`;

  // Mudanças desde o build atual (melhor para explicar o que muda ao atualizar)
  const sinceYou = useMemo(() => {
    if (!changelog) return null;
    const base = currentCommit || lastSeenCommit;
    return diffSinceCommit(changelog, base);
  }, [changelog, currentCommit, lastSeenCommit]);

  const sinceCount = useMemo(() => {
    if (!sinceYou) return 0;
    return Object.values(sinceYou).reduce((acc, arr) => acc + (arr?.length || 0), 0);
  }, [sinceYou]);

  const allSections = changelog?.sections || {};

  return (
    <div className="updates-page">
      <div className="updates-header">
        <div className="updates-title">
          <h1>🆕 Atualizações</h1>
          <p className="updates-sub">
            {updateAvailable
              ? `${updateLabel}. ${updateExplanation}`
              : desktop ? 'Você está na versão Desktop (Tauri). Aqui você pode revisar o changelog e conferir a versão instalada.' : 'Você está atualizado. Aqui você pode revisar o changelog e forçar a atualização do PWA.'}
            {pwaNeedRefresh ? ' (SW novo pronto para aplicar)' : ''}
          </p>

          <div className="updates-kpis">
            <div className="updates-kpi">
              <div className="updates-kpi-label">Instalado</div>
              <div className="updates-kpi-value">{currentVersion}</div>
              <div className="updates-kpi-meta">
                {currentBuildLabel ? <span>{currentBuildLabel}</span> : null}
                {currentCommit ? <span className="mono">{currentCommit}</span> : null}
              </div>
            </div>

            <div className="updates-kpi">
              <div className="updates-kpi-label">Disponível</div>
              <div className="updates-kpi-value">{serverVersion}</div>
              <div className="updates-kpi-meta">
                {serverBuildLabel ? <span>{serverBuildLabel}</span> : null}
                {serverCommit ? <span className="mono">{serverCommit}</span> : null}
              </div>
            </div>
          </div>

          <p className="updates-meta">
            Última leitura: <strong>{lastSeenVersion || '—'}</strong>
            {lastSeenCommit ? ` • ${lastSeenCommit}` : ''}
          </p>
        </div>

        {desktop ? (
  <div className="updates-actions">
    <div className="updates-tip">
      💻 Você está na versão Desktop (Tauri). Para atualizar, instale a nova versão do app (setup/zip).
    </div>
  </div>
) : (
  <div className="updates-actions">
          <button className="updates-btn secondary" onClick={() => void checkNow()}>
            🔄 Verificar
          </button>
          <button className="updates-btn primary" onClick={() => void reloadApp()}>
            ⬇️ Atualizar agora
          </button>
          <button
            className="updates-btn danger"
            onClick={() => {
              const ok = window.confirm(
                `Limpar cache do app?\n\nIsso remove o cache do PWA (Service Worker) e recarrega.\nSe você estiver offline, pode precisar de internet para abrir novamente.`
              );
              if (!ok) return;
              void clearAppCache();
            }}
            title="Limpar cache do app (PWA)"
          >
            🧹 Limpar cache
          </button>
        </div>
)}
      </div>

      <div className="updates-card">
        <div className="updates-card-head">
          <h2>{title}</h2>
          {hasUpdate && <span className="badge">NOVO</span>}
        </div>

        {updateAvailable ? (
          <div className="updates-callout warn">
            <span className="updates-callout-icon">⬆️</span>
            <div>
              <strong>{updateLabel}</strong>
              <div className="muted small">
                {isNewVersion ? (
                  <>
                    Você está em <span className="mono">{currentVersion}</span> e há uma nova versão no servidor.
                  </>
                ) : (
                  <>
                    Sua base continua em <span className="mono">{currentBaseVersion}</span>, mas existe um build de manutenção mais novo no servidor.
                  </>
                )}
                {sinceCount > 0 ? ` (${sinceCount} mudança(s) no changelog)` : ''}
              </div>
              <div className="muted small" style={{ marginTop: 8 }}>
                <strong>Como atualizar (passo a passo):</strong>
                <ol style={{ margin: '6px 0 0 18px' }}>
                  <li>Clique em <strong>“Atualizar agora”</strong> (acima).</li>
                  <li>Aguarde de <strong>10 a 20 segundos</strong> enquanto o app atualiza e recarrega.</li>
                  <li>Depois clique em <strong>“Marcar como lido”</strong>.</li>
                </ol>
                <div style={{ marginTop: 6 }}>
                  Se demorar além disso, feche o app e abra novamente.
                </div>
              </div>
            </div>
          </div>
        ) : hasUpdate ? (
          <div className="updates-callout">
            <span className="updates-callout-icon">🔔</span>
            <div>
              <strong>Novidades não lidas</strong>
              <div className="muted small">
                {sinceCount > 0 ? `Você tem ${sinceCount} mudança(s) novas no changelog.` : 'Há mudanças disponíveis. Veja a lista abaixo.'}
              </div>
            </div>
          </div>
        ) : (
          <p className="muted">Você já está atualizado e não há novidades não lidas.</p>
        )}

        <div className="updates-footer">
          <button className="updates-btn secondary" onClick={markAsRead} disabled={!hasUpdate || updateAvailable}>
            ✅ Marcar como lido
          </button>
          {updateAvailable && (
            <p className="muted small" style={{ marginTop: 6 }}>
              ⚠️ Atualize o app para habilitar “Marcar como lido”.
            </p>
          )}
          <p className="muted small">
            Dica: após atualizar, se estiver no iPhone (PWA), feche o app e abra novamente. Em Android, às vezes basta recarregar.
          </p>
        </div>
      </div>



      {desktop && (
        <div className="updates-card" style={{ marginTop: 12 }}>
          <div className="updates-card-head">
            <h2>📦 Atualização Offline (Pacote)</h2>
          </div>

          <p className="muted small">
            Para atualizar <strong>sem internet</strong>: selecione o pacote <span className="mono">.zip</span> recebido do admin.
            O app valida a assinatura e extrai o instalador para você executar.
          </p>

          <div className="updates-actions" style={{ marginTop: 10 }}>
            <button className="updates-btn secondary" onClick={() => void onPickUpdatePackage()} disabled={pkgBusy}>
              {pkgBusy ? 'Lendo pacote…' : '📦 Selecionar pacote (.zip)'}
            </button>
            <button className="updates-btn primary" onClick={() => void onSaveUpdatePayload()} disabled={!updatePkg || pkgSaving}>
              {pkgSaving ? 'Salvando…' : '💾 Salvar instalador'}
            </button>
          </div>

          {pkgError ? (
            <div className="updates-callout warn" style={{ marginTop: 10 }}>
              <span className="updates-callout-icon">⚠️</span>
              <div>
                <div className="updates-callout-title">Pacote inválido</div>
                <div className="updates-callout-sub">{pkgError}</div>
              </div>
            </div>
          ) : null}

          {updatePkg ? (
            <div className="updates-callout ok" style={{ marginTop: 10 }}>
              <span className="updates-callout-icon">✅</span>
              <div>
                <div className="updates-callout-title">Pacote verificado</div>
                <div className="updates-callout-sub">
                  Versão <span className="mono">{updatePkg.payload.version}</span> • {updatePkg.payload.fileName} ({formatBytes(updatePkg.payload.fileSize)})
                </div>
                <div className="muted small" style={{ marginTop: 6 }}>
                  Criado em: {formatDate(updatePkg.payload.createdAt)}
                  {updatePkg.payload.note ? <div style={{ marginTop: 6 }}>Nota: {updatePkg.payload.note}</div> : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="updates-callout info" style={{ marginTop: 10 }}>
              <span className="updates-callout-icon">ℹ️</span>
              <div>
                <div className="updates-callout-title">Dica</div>
                <div className="updates-callout-sub">
                  Use isso quando o PC do cliente não tem internet. Você pode enviar o pacote por pendrive e atualizar em minutos.
                </div>
              </div>
            </div>
          )}

          {pkgSavedPath ? (
            <p className="muted small" style={{ marginTop: 10 }}>
              ✅ Instalador salvo em: <span className="mono">{pkgSavedPath}</span>
            </p>
          ) : null}
        </div>
      )}

      {/* Mudanças desde o build atual (útil mesmo após marcar como lido) */}
      {(updateAvailable || hasUpdate) && sinceYou && sinceCount > 0 && (
        <div className="updates-section">
          <div className="updates-section-head">
            <h2>📌 {updateAvailable ? (isNewVersion ? 'O que muda na nova versão' : 'O que muda neste novo build') : 'O que mudou desde a sua versão'}</h2>
            <span className="updates-pill">{sinceCount} item(s)</span>
          </div>

          <div className="updates-grid">
            {Object.entries(sinceYou).map(([section, items]) => (
              <div className="updates-box" key={section}>
                <div className="updates-box-head">
                  <h3>
                    <span className="updates-ico">{SECTION_ICONS[section] || '🆕'}</span>
                    {section}
                  </h3>
                  <span className="updates-count">{items.length}</span>
                </div>
                <ul className="updates-items">
                  {items.map((it) => (
                    <li key={`${section}-${it.hash}-${it.text}`}>
                      <div className="updates-item-title">{it.text}</div>
                      <div className="updates-item-meta">
                        <span className="mono">{it.hash}</span> • {formatDate(it.date)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Changelog completo */}
      {changelog && (
        <div className="updates-section">
          <div className="updates-section-head">
            <h2>📚 Changelog completo</h2>
            <span className="updates-pill">{Object.values(allSections).reduce((a, b) => a + (b?.length || 0), 0)} item(s)</span>
          </div>

          <div className="updates-grid">
            {Object.entries(allSections).map(([section, items]) => (
              <div className="updates-box" key={`all-${section}`}>
                <div className="updates-box-head">
                  <h3>
                    <span className="updates-ico">{SECTION_ICONS[section] || '🆕'}</span>
                    {section}
                  </h3>
                  <span className="updates-count">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="muted small">Sem itens nesta categoria.</p>
                ) : (
                  <ul className="updates-items">
                    {items.map((it) => (
                      <li key={`${section}-${it.hash}-${it.text}`}>
                        <div className="updates-item-title">{it.text}</div>
                        <div className="updates-item-meta">
                          <span className="mono">{it.hash}</span> • {formatDate(it.date)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <p className="muted small" style={{ marginTop: 10 }}>
            Gerado automaticamente a partir dos commits (padrão: <span className="mono">feat:</span>, <span className="mono">fix:</span>, <span className="mono">perf:</span>…).
          </p>
        </div>
      )}

      {logs?.length ? (
        <div className="updates-section">
          <div className="updates-section-head">
            <h2>🧾 Logs de atualização</h2>
            <span className="updates-pill">{Math.min(12, logs.length)} / {logs.length}</span>
          </div>

          <div className="updates-card" style={{ marginTop: 0 }}>
            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 12,
                lineHeight: 1.45,
                opacity: 0.92,
              }}
            >
{logs.slice(-12).map((l) => `• [${formatDate(l.ts)}] (${l.type}) ${l.message}`).join('\n')}
            </pre>
            <p className="muted small" style={{ marginTop: 10 }}>
              Esses logs ajudam a diagnosticar quando o app detectou/instalou uma versão nova.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AtualizacoesPage;
