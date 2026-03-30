/**
 * Widget de Status da Licença
 * Exibe status resumido da licença
 */

import { useEffect, useState } from 'react';
import { getLicenseStatus, getLicenseStatusAsync } from '@/lib/license';

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
        return 'var(--success, #10b981)';
      case 'expired':
        return 'var(--error, #ef4444)';
      default:
        return 'var(--warning, #f59e0b)';
    }
  };

  const getStatusIcon = () => {
    switch (status.status) {
      case 'active':
        return '✅';
      case 'expired':
        return '❌';
      default:
        return '⚠️';
    }
  };

  return (
    <div className="info-list">
      <div className="info-item">
        <strong>Status:</strong>
        <span style={{ color: getStatusColor() }}>
          {getStatusIcon()} {status.message}
        </span>
      </div>
      {status.status === 'active' && status.validUntil && (
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
