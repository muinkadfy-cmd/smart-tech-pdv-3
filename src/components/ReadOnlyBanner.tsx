/**
 * Banner de Modo Leitura
 * Exibe quando licença está expirada
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isReadOnlyMode, getLicenseStatus, getLicenseStatusAsync } from '@/lib/license';
import './ReadOnlyBanner.css';

function ReadOnlyBanner() {
  const navigate = useNavigate();
  const [readOnly, setReadOnly] = useState(isReadOnlyMode());
  const [licenseStatus, setLicenseStatus] = useState(getLicenseStatus());

  useEffect(() => {
    // OPÇÃO A: não poluir o boot com chamadas repetidas.
    // Busca (no máximo 1x por sessão) e entra em modo leitura se NÃO estiver ativa.
    const updateStatus = async () => {
      const status = await getLicenseStatusAsync();
      const isRO = status.status !== 'active' && status.status !== 'trial';
      setReadOnly(isRO);
      setLicenseStatus(status);
    };
    
    updateStatus();
    return;
  }, []);

  // Não mostrar se não estiver em modo leitura
  if (!readOnly) {
    return null;
  }

  return (
    <div className="readonly-banner">
      <div className="readonly-banner-content">
        <span className="readonly-icon">🔒</span>
        <div className="readonly-text">
          <strong>Modo leitura</strong>
          <span>{licenseStatus.message}</span>
        </div>
        <button
          className="readonly-button"
          onClick={() => navigate('/licenca')}
          title="Gerenciar Licença"
        >
          Ver Licença
        </button>
      </div>
    </div>
  );
}

export default ReadOnlyBanner;
