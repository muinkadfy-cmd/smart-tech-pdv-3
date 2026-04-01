/**
 * Widget de Status da Licença
 * Exibe status resumido da licença
 */

import { useEffect, useState } from 'react';
import { getLicenseStatus, getLicenseStatusAsync } from '@/lib/license';

function isPermanent(status: ReturnType<typeof getLicenseStatus>) {
  const message = String(status.message || '').toLowerCase();
  const plan = String(status.payload?.plan || '').toLowerCase();
  const validUntil = status.validUntil ? new Date(status.validUntil) : null;

  if (plan.includes('lifetime') || plan.includes('permanent') || plan.includes('vitalicia') || plan.includes('vitalícia')) {
    return true;
  }
  if (message.includes('permanente') || message.includes('lifetime') || message.includes('vitalicia') || message.includes('vitalícia')) {
    return true;
  }
  return Boolean(validUntil && validUntil.getFullYear() >= 2099);
}

function LicenseStatusWidget() {
  const [status, setStatus] = useState(getLicenseStatus());

  useEffect(() => {
    // Carregar status inicial do servidor
    const loadStatus = async () => {
      const serverStatus = await getLicenseStatusAsync();
      setStatus(serverStatus);
    };
    loadStatus();
    return;
  }, []);

  const getStatusColor = () => {
    switch (status.status) {
      case 'active':
      case 'trial':
        return 'var(--success, #10b981)';
      case 'expired':
        return 'var(--error, #ef4444)';
      default:
        return 'var(--warning, #f59e0b)';
    }
  };

  const getStatusIcon = () => {
    switch (status.status) {
      case 'trial':
        return '🧪';
      case 'active':
        return isPermanent(status) ? '🟢' : '✅';
      case 'expired':
        return '❌';
      default:
        return '⚠️';
    }
  };

  const getStatusLabel = () => {
    if (status.status === 'trial') return 'Trial de 15 dias';
    if (status.status === 'active' && isPermanent(status)) return 'Sistema ativado permanente';
    if (status.status === 'active') return 'Sistema ativado';
    if (status.status === 'expired') return 'Trial encerrado - ativação necessária';
    return status.message;
  };

  return (
    <div className="info-list">
      <div className="info-item">
        <strong>Status:</strong>
        <span style={{ color: getStatusColor() }}>
          {getStatusIcon()} {getStatusLabel()}
        </span>
      </div>
      {(status.status === 'active' || status.status === 'trial') && status.validUntil && !isPermanent(status) && (
        <div className="info-item">
          <strong>Validade:</strong>
          <span>{new Date(status.validUntil).toLocaleDateString('pt-BR')}</span>
        </div>
      )}
      {status.status === 'expired' && (
        <div className="info-item">
          <strong>Modo:</strong>
          <span style={{ color: 'var(--error, #ef4444)' }}>🔒 Leitura</span>
        </div>
      )}
    </div>
  );
}

export default LicenseStatusWidget;
