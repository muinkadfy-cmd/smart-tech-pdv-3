/**
 * Página de Redirecionamento de Loja
 * Rota curta: /s/:storeId → Define store_id e redireciona para o sistema
 */

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { setStoreId, isValidUUID } from '@/lib/store-id';
import { getCurrentSession } from '@/lib/auth-supabase';

export default function StoreRedirectPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (!storeId || !isValidUUID(storeId)) {
      console.error('[StoreRedirect] ID inválido:', storeId);
      navigate('/painel', { replace: true });
      return;
    }

    // Salvar store_id no localStorage
    setStoreId(storeId);
    console.log('[StoreRedirect] Store ID definido:', storeId);

    // A sessão é criada automaticamente quando necessário.
    const session = getCurrentSession();
    navigate(session ? '/' : '/painel', { replace: true });
  }, [storeId, navigate]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--background, #f5f5f5)'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '2rem'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #e0e0e0',
          borderTop: '4px solid var(--primary-color, #2563eb)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
          margin: '0 auto 1rem'
        }}></div>
        <p style={{ color: 'var(--text-secondary, #666)' }}>Redirecionando...</p>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
