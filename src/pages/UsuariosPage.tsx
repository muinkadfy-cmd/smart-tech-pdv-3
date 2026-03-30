import { useEffect, useMemo, useState } from 'react';

import AuthGuard from '@/components/AuthGuard';
import { showToast } from '@/components/ui/ToastContainer';
import {
  createUser,
  getCurrentSession,
  listUsers,
  resetUserPassword,
  toggleUserActive,
  updateUserRole,
  type AppUser,
} from '@/lib/auth-supabase';
import type { UserRole } from '@/types';

import './UsuariosPage.css';

type ResetDraftMap = Record<string, string>;
type InviteResult = { email: string; token: string } | null;

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'atendente', label: 'Atendente' },
  { value: 'tecnico', label: 'Tecnico' },
];

function roleLabel(role: UserRole): string {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || role;
}

function scopeText(user: AppUser): string {
  if (user.isSuperAdmin) return 'Conta principal do sistema';
  if (user.storeName && user.storeId) return `${user.storeName} • ${user.storeId}`;
  if (user.storeId) return `Loja ${user.storeId}`;
  return 'Escopo local';
}

export default function UsuariosPage() {
  const session = getCurrentSession();
  const superAdmin = session?.isSuperAdmin === true;
  const remoteManagedUsers = session?.authSource === 'remote' || session?.isSuperAdmin === true;

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('atendente');
  const [resetDrafts, setResetDrafts] = useState<ResetDraftMap>({});
  const [inviteResult, setInviteResult] = useState<InviteResult>(null);

  const pageTitle = superAdmin ? 'Contas do sistema' : 'Usuarios da loja';
  const pageSubtitle = superAdmin
    ? 'Gerencie a conta principal e os usuarios das lojas dentro do escopo atual.'
    : 'Crie e mantenha usuarios da sua loja sem misturar acessos com outras lojas.';

  async function loadData() {
    setLoading(true);
    try {
      const response = await listUsers();
      if (!response.success || !response.users) {
        showToast(response.error || 'Nao foi possivel carregar os usuarios.', 'error');
        return;
      }
      setUsers(response.users);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const currentSummary = useMemo(() => {
    if (!session) return null;
    return {
      email: session.email || session.username,
      role: session.isSuperAdmin ? 'SuperAdmin' : roleLabel(session.role),
      scope: session.isSuperAdmin
        ? 'Conta principal do sistema'
        : session.storeName
          ? `${session.storeName} • ${session.storeId}`
          : session.storeId,
    };
  }, [session]);

  async function handleCreateUser(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    const email = formEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showToast('Informe um e-mail valido.', 'error');
      return;
    }
    if (formPassword.length < 6) {
      showToast('A senha precisa ter pelo menos 6 caracteres.', 'error');
      return;
    }

    setSaving(true);
    try {
      const response = await createUser(email, formPassword, formRole, {
        email,
        storeId: session?.storeId,
        storeName: session?.storeName,
      });
      if (!response.success) {
        showToast(response.error || 'Nao foi possivel criar o usuario.', 'error');
        return;
      }
      if (response.inviteToken && response.inviteEmail) {
        setInviteResult({ email: response.inviteEmail, token: response.inviteToken });
        showToast('Convite remoto criado com sucesso.', 'success');
      } else {
        showToast('Usuario criado com sucesso.', 'success');
      }
      setFormEmail('');
      setFormPassword('');
      setFormRole('atendente');
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId: string, role: UserRole) {
    const response = await updateUserRole(userId, role);
    if (!response.success) {
      showToast(response.error || 'Nao foi possivel alterar a role.', 'error');
      return;
    }
    showToast('Perfil atualizado.', 'success');
    await loadData();
  }

  async function handleToggleActive(userId: string, nextActive: boolean) {
    const response = await toggleUserActive(userId, nextActive);
    if (!response.success) {
      showToast(response.error || 'Nao foi possivel alterar o status.', 'error');
      return;
    }
    showToast(nextActive ? 'Usuario reativado.' : 'Usuario desativado.', 'success');
    await loadData();
  }

  async function handleResetPassword(userId: string) {
    const draft = String(resetDrafts[userId] || '');
    if (!remoteManagedUsers && draft.length < 6) {
      showToast('A nova senha precisa ter pelo menos 6 caracteres.', 'error');
      return;
    }
    const response = await resetUserPassword(userId, draft);
    if (!response.success) {
      showToast(response.error || 'Nao foi possivel resetar a senha.', 'error');
      return;
    }
    setResetDrafts((current) => ({ ...current, [userId]: '' }));
    showToast(
      remoteManagedUsers
        ? 'Link de redefinicao enviado para o e-mail do usuario.'
        : 'Senha redefinida com sucesso.',
      'success'
    );
  }

  return (
    <AuthGuard requireRole="admin">
      <div className="usuarios-page page-container">
        <div className="page-header">
          <div className="page-kicker">{superAdmin ? 'Conta principal' : 'Gestao da loja'}</div>
          <h1>{pageTitle}</h1>
          <p className="page-subtitle">{pageSubtitle}</p>
        </div>

        {currentSummary ? (
          <section className="config-card usuarios-section">
            <div className="usuarios-section-header">
              <div>
                <h2>Conta atual</h2>
                <p>Essa e a sessao que esta controlando este painel.</p>
              </div>
            </div>
            <div className="usuarios-summary-grid">
              <div className="usuarios-summary-card">
                <span className="usuarios-summary-label">E-mail</span>
                <strong>{currentSummary.email}</strong>
              </div>
              <div className="usuarios-summary-card">
                <span className="usuarios-summary-label">Perfil</span>
                <strong>{currentSummary.role}</strong>
              </div>
              <div className="usuarios-summary-card usuarios-summary-card-wide">
                <span className="usuarios-summary-label">Escopo</span>
                <strong>{currentSummary.scope}</strong>
              </div>
            </div>
          </section>
        ) : null}

        {remoteManagedUsers ? (
          <section className="config-card usuarios-section">
            <div className="usuarios-principal-note">
              Esta conta ja usa Supabase Auth. A tela ja lista e atualiza perfis remotos, gera convite para novos usuarios e envia redefinicao de senha por e-mail oficial do Supabase.
            </div>
          </section>
        ) : null}

        {inviteResult ? (
          <section className="config-card usuarios-section">
            <div className="usuarios-section-header">
              <div>
                <h2>Convite gerado</h2>
                <p>Envie este link para o usuario concluir o acesso da loja.</p>
              </div>
            </div>
            <div className="usuarios-principal-note">
              <strong>{inviteResult.email}</strong><br />
              {`${window.location.origin}/cadastro?invite=${inviteResult.token}`}
            </div>
          </section>
        ) : null}

        <section className="config-card usuarios-section">
          <div className="usuarios-section-header">
            <div>
              <h2>Novo usuario</h2>
              <p>
                {superAdmin
                  ? 'O novo usuario sera criado no store_id atualmente ativo no sistema.'
                  : 'Crie usuarios que operam somente dentro da sua loja.'}
              </p>
            </div>
          </div>

          <form className="usuario-form" onSubmit={handleCreateUser}>
            <div className="usuarios-form-grid">
              <div className="form-group">
                <label htmlFor="usuario-email">E-mail</label>
                <input
                  id="usuario-email"
                  value={formEmail}
                  onChange={(event) => setFormEmail(event.target.value)}
                  placeholder="usuario@loja.com"
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="usuario-role">Perfil</label>
                <select
                  id="usuario-role"
                  value={formRole}
                  onChange={(event) => setFormRole(event.target.value as UserRole)}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group usuarios-form-grid-wide">
                <label htmlFor="usuario-password">Senha inicial</label>
                <input
                  id="usuario-password"
                  type="password"
                  value={formPassword}
                  onChange={(event) => setFormPassword(event.target.value)}
                  placeholder="Minimo de 6 caracteres"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Criando...' : 'Criar usuario'}
              </button>
            </div>
          </form>
        </section>

        <section className="config-card usuarios-section">
          <div className="usuarios-section-header">
            <div>
              <h2>Usuarios cadastrados</h2>
              <p>{superAdmin ? 'Visao do escopo atual liberada para a conta principal.' : 'Lista de usuarios da loja atual.'}</p>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Carregando usuarios...</div>
          ) : users.length === 0 ? (
            <div className="empty-state">Nenhum usuario cadastrado neste escopo.</div>
          ) : (
            <div className="usuarios-card-list">
              {users.map((user) => {
                const isCurrent = user.id === session?.userId;
                const isPrincipal = user.isSuperAdmin === true;
                return (
                  <article key={user.id} className="usuarios-user-card">
                    <div className="usuarios-user-main">
                      <div className="usuarios-user-head">
                        <div>
                          <div className="usuarios-user-email">{user.email || user.username}</div>
                          <div className="usuarios-user-meta">
                            <span className={`usuarios-pill ${user.active ? 'is-ok' : 'is-warn'}`}>
                              {user.active ? 'Ativo' : 'Desativado'}
                            </span>
                            <span className="usuarios-pill">{isPrincipal ? 'SuperAdmin' : roleLabel(user.role)}</span>
                            {isCurrent ? <span className="usuarios-pill is-info">Sessao atual</span> : null}
                          </div>
                        </div>
                        <div className="usuarios-user-scope">{scopeText(user)}</div>
                      </div>

                      {!isPrincipal ? (
                        <div className="usuarios-user-actions">
                          <div className="form-group usuarios-inline-field">
                            <label>Perfil</label>
                            <select
                              value={user.role}
                              onChange={(event) => void handleRoleChange(user.id, event.target.value as UserRole)}
                            >
                              {ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>

                          <div className="form-group usuarios-inline-field usuarios-inline-field-wide">
                            <label>{remoteManagedUsers ? 'Recuperacao de senha' : 'Nova senha'}</label>
                            <div className="usuarios-reset-row">
                              {remoteManagedUsers ? (
                                <input
                                  type="text"
                                  value={user.email || ''}
                                  placeholder="E-mail do usuario"
                                  readOnly
                                  disabled
                                />
                              ) : (
                                <input
                                  type="password"
                                  value={resetDrafts[user.id] || ''}
                                  onChange={(event) => setResetDrafts((current) => ({ ...current, [user.id]: event.target.value }))}
                                  placeholder="Nova senha"
                                  autoComplete="new-password"
                                />
                              )}
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => void handleResetPassword(user.id)}
                              >
                                {remoteManagedUsers ? 'Enviar link' : 'Resetar senha'}
                              </button>
                            </div>
                          </div>

                          <div className="form-group usuarios-inline-field">
                            <label>Status</label>
                            <button
                              type="button"
                              className={user.active ? 'btn-secondary' : 'btn-primary'}
                              onClick={() => void handleToggleActive(user.id, !user.active)}
                            >
                              {user.active ? 'Desativar' : 'Reativar'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="usuarios-principal-note">
                          A conta principal do sistema fica protegida e nao pode ser editada nesta tela.
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AuthGuard>
  );
}
