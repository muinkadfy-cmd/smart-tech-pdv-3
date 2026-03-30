import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCurrentUser, getCurrentSession, logout } from '@/lib/auth-supabase';
import { Usuario } from '@/types';
import './ProfileDropdown.css';

interface ProfileDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

function ProfileDropdown({ isOpen, onClose }: ProfileDropdownProps) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [role, setRole] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      const user = getCurrentUser();
      const session = getCurrentSession();
      setUsuario(user);
      setRole(session?.role || '');
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  if (!isOpen || !usuario) return null;

  const handleLogout = () => {
    logout();
    onClose();
    navigate('/login', { replace: true });
  };

  return (
    <div className="profile-dropdown" ref={dropdownRef}>
      <div className="profile-header">
        <div className="profile-info">
          <div className="profile-name">{usuario.nome || 'Usuário'}</div>
          {role && (
            <div className="profile-role" style={{ 
              fontSize: '0.75rem', 
              color: 'var(--text-secondary, #666)',
              textTransform: 'capitalize'
            }}>
              {role === 'admin' ? '👑 Administrador' : role === 'atendente' ? '💼 Atendente' : '🔧 Técnico'}
            </div>
          )}
          {usuario.cargo && <div className="profile-cargo">{usuario.cargo}</div>}
          {usuario.email && <div className="profile-email">{usuario.email}</div>}
        </div>
      </div>

      <div className="profile-menu">
        <Link
          to="/configuracoes"
          className="profile-menu-item"
          onClick={onClose}
        >
          <span className="menu-icon">⚙️</span>
          <span>Configurações</span>
        </Link>

        <div className="profile-divider" />

        <button
          type="button"
          className="profile-menu-item profile-logout"
          onClick={handleLogout}
        >
          <span className="menu-icon">↩</span>
          <span>Sair e entrar com outra conta</span>
        </button>
      </div>
    </div>
  );
}

export default ProfileDropdown;
