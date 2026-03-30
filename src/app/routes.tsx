import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { SqliteLoadingGuard } from '@/components/SqliteLoadingGuard';
import RouteError from '@/components/ui/RouteError';
import { isUpdateEnabled } from '@/lib/mode';

// ✅ P0 (Pré-login): não carregar o Shell privado (Layout + Sidebar/Topbar/etc.) antes do Login.
// Isso reduz bundle inicial e melhora app_start → login_visível em PCs fracos.
const Layout = lazy(() => import('./Layout'));

// ✅ P0 (Pré-login): páginas raras (feature desativada) não entram no bundle inicial.
const DisabledFeaturePage = lazy(() => import('@/pages/DisabledFeaturePage'));

// Componente de loading otimizado
function PageLoader() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '200px',
      color: 'var(--text-secondary)'
    }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '4px solid var(--border-light)',
        borderTop: '4px solid var(--primary)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }}></div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// Lazy loading para melhor performance
const PainelPage = lazy(() => import('@/pages/Painel/PainelPage'));
const ClientesPage = lazy(() => import('@/pages/ClientesPage'));
const VendasPage = lazy(() => import('@/pages/VendasPage'));
const ProdutosPage = lazy(() => import('@/pages/ProdutosPage'));
const OrdensPage = lazy(() => import('@/pages/OrdensPage'));
const SimularTaxasPage = lazy(() => import('@/pages/SimularTaxasPage'));
const AjudaPage = lazy(() => import('@/pages/AjudaPage'));
const SelfTestPage = lazy(() => import('@/pages/SelfTestPage'));
const AutoAjudaPage = lazy(() => import('@/pages/AutoAjudaPage'));
const FinanceiroPage = lazy(() => import('@/pages/FinanceiroPage'));
const RelatoriosPage = lazy(() => import('@/pages/RelatoriosPage'));
const FluxoCaixaPage = lazy(() => import('@/pages/FluxoCaixaPage'));
const DevolucaoPage = lazy(() => import('@/pages/DevolucaoPage'));
const CobrancasPage = lazy(() => import('@/pages/CobrancasPage'));
const ReciboPage = lazy(() => import('@/pages/ReciboPage'));
const EstoquePage = lazy(() => import('@/pages/EstoquePage'));
const EncomendasPage = lazy(() => import('@/pages/EncomendasPage'));
const FornecedoresPage = lazy(() => import('@/pages/FornecedoresPage'));
const CodigosPage = lazy(() => import('@/pages/CodigosPage'));
const BackupPage = lazy(() => import('@/pages/BackupPage'));
const AtualizacoesPage = lazy(() => import('@/pages/AtualizacoesPage'));
const ImeiPage = lazy(() => import('@/pages/ImeiPage'));
const ConfiguracoesPage = lazy(() => import('@/pages/ConfiguracoesPage'));
const ConfiguracoesTermosGarantiaPage = lazy(() => import('@/pages/ConfiguracoesTermosGarantiaPage'));
const _SupabaseTestPage = lazy(() => import('@/pages/SupabaseTestPage'));
const _SyncStatusPage = lazy(() => import('@/pages/SyncStatusPage'));
const SystemTestPage = lazy(() => import('@/pages/SystemTestPage'));
const DiagnosticoDadosPage = lazy(() => import('@/pages/DiagnosticoDadosPage'));
const ProdutosDiagnosticoPage = lazy(() => import('@/pages/ProdutosDiagnosticoPage'));
const AuditPage = lazy(() => import('@/pages/AuditPage'));
const SetupPage = lazy(() => import('@/pages/SetupPage'));
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const CadastroLojaPage = lazy(() => import('@/pages/CadastroLojaPage'));
const ActivationPage = lazy(() => import('@/pages/ActivationPage'));
const BuyPage = lazy(() => import('@/pages/BuyPage'));
const WizardPage = lazy(() => import('@/pages/WizardPage'));
const ResetSenhaPage = lazy(() => import('@/pages/ResetSenhaPage'));
const ConfigurarLojaPage = lazy(() => import('@/pages/ConfigurarLojaPage'));
const UsuariosPage = lazy(() => import('@/pages/UsuariosPage'));
const LicensePage = lazy(() => import('@/pages/LicensePage'));
const _StoreAccessPage = lazy(() => import('@/pages/StoreAccessPage'));
const _LojasPage = lazy(() => import('@/pages/LojasPage'));
const CompraUsadosPage = lazy(() => import('@/pages/CompraUsadosPage'));
const VendaUsadosPage = lazy(() => import('@/pages/VendaUsadosPage'));
const HealthRoutesPage = lazy(() => import('@/pages/HealthRoutesPage'));
const DiagnosticoPage = lazy(() => import('@/pages/DiagnosticoPage'));
const DiagnosticoRotasPage = lazy(() => import('@/pages/DiagnosticoRotasPage'));
const DiagnosticoSyncPage = lazy(() => import('@/pages/DiagnosticoSyncPage'));
const StoreRedirectPage = lazy(() => import('@/pages/StoreRedirectPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

export const router = createBrowserRouter([
  {
    path: '/setup',
    element: (
      <Suspense fallback={<PageLoader />}>
        <SetupPage />
      </Suspense>
    ),
  },
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoader />}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: '/cadastro',
    element: (
      <Suspense fallback={<PageLoader />}>
        <CadastroLojaPage />
      </Suspense>
    ),
  },
  {
    path: '/comprar',
    element: (
      <Suspense fallback={<PageLoader />}>
        <BuyPage />
      </Suspense>
    ),
  },
  {
    path: '/ativacao',
    element: (
      <Suspense fallback={<PageLoader />}>
        <ActivationPage />
      </Suspense>
    ),
  },
  {
    path: '/wizard',
    element: (
      <Suspense fallback={<PageLoader />}>
        <WizardPage />
      </Suspense>
    ),
  },
  {
    path: '/reset-senha',
    element: (
      <Suspense fallback={<PageLoader />}>
        <ResetSenhaPage />
      </Suspense>
    ),
  },

  {
    path: '/configurar-loja',
    element: (
      <Suspense fallback={<PageLoader />}>
        <ConfigurarLojaPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <Suspense fallback={<PageLoader />}>
        <Layout />
      </Suspense>
    ),
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        element: <Navigate to="/login" replace />,
      },
      {
        path: 'painel',
        element: <PainelPage />,
      },
      {
        path: 'clientes',
        element: <SqliteLoadingGuard><ClientesPage /></SqliteLoadingGuard>,
      },
      {
        path: 'vendas',
        // ✅ P0: precisa de SqliteLoadingGuard para evitar lista vazia + loading eterno (SqliteLocalStore preload é async)
        element: <SqliteLoadingGuard><VendasPage /></SqliteLoadingGuard>,
      },
      {
        path: 'produtos',
        element: <SqliteLoadingGuard><ProdutosPage /></SqliteLoadingGuard>,
      },
      {
        path: 'ordens',
        element: <SqliteLoadingGuard><OrdensPage /></SqliteLoadingGuard>,
      },
      {
        path: 'simular-taxas',
        element: <SqliteLoadingGuard><SimularTaxasPage /></SqliteLoadingGuard>,
      },
      {
        path: 'autoajuda',
        element: <AutoAjudaPage />,
      },
      {
        path: 'ajuda',
        element: <AjudaPage />,
      },
      {
        path: 'auto-teste',
        element: <SelfTestPage />,
      },
      {
        path: 'financeiro',
        element: <SqliteLoadingGuard><FinanceiroPage /></SqliteLoadingGuard>,
      },
      {
        path: 'relatorios',
        element: <SqliteLoadingGuard><RelatoriosPage /></SqliteLoadingGuard>,
      },
      {
        path: 'fluxo-caixa',
        element: <SqliteLoadingGuard><FluxoCaixaPage /></SqliteLoadingGuard>,
      },
      {
        path: 'devolucao',
        element: <DevolucaoPage />,
      },
      {
        path: 'cobrancas',
        element: <SqliteLoadingGuard><CobrancasPage /></SqliteLoadingGuard>,
      },
      {
        path: 'recibo',
        element: <ReciboPage />,
      },
      {
        path: 'estoque',
        element: <SqliteLoadingGuard><EstoquePage /></SqliteLoadingGuard>,
      },
      {
        path: 'encomendas',
        element: <SqliteLoadingGuard><EncomendasPage /></SqliteLoadingGuard>,
      },
      {
        path: 'fornecedores',
        // ✅ P0: precisa de SqliteLoadingGuard para evitar lista vazia + loading eterno (SqliteLocalStore preload é async)
        element: <SqliteLoadingGuard><FornecedoresPage /></SqliteLoadingGuard>,
      },
      {
        path: 'codigos',
        element: <CodigosPage />,
      },
      {
        path: 'backup',
        element: <SqliteLoadingGuard><BackupPage /></SqliteLoadingGuard>,
      },
      {
        path: 'atualizacoes',
        element: isUpdateEnabled() ? <AtualizacoesPage /> : <DisabledFeaturePage title="Atualizações desativadas" />,
      },
      {
        path: 'imei',
        element: <ImeiPage />,
      },
      {
        path: 'configuracoes',
        element: <SqliteLoadingGuard><ConfiguracoesPage /></SqliteLoadingGuard>,
      },
      {
        path: 'configuracoes-termos-garantia',
        element: <ConfiguracoesTermosGarantiaPage />,
      },
      {
        // Compat: link antigo (evita 404)
        path: 'configuracoes/termos-garantia',
        element: <Navigate to="/configuracoes-termos-garantia" replace />,
      },
      {
        path: 'usuarios',
        element: <UsuariosPage />,
      },
      {
        path: 'licenca',
        element: <LicensePage />,
      },
      {
        // Lojas (SuperAdmin): criar/listar/entrar
        path: 'lojas',
        element: <_LojasPage />,
      },
      {
        path: 'permissoes-loja',
        element: <DisabledFeaturePage title="Permissões de loja (online) desativado" />,
      },
      {
        path: 'compra-usados',
        element: <SqliteLoadingGuard><CompraUsadosPage /></SqliteLoadingGuard>,
      },
      {
        path: 'venda-usados',
        element: <SqliteLoadingGuard><VendaUsadosPage /></SqliteLoadingGuard>,
      },
      {
        path: 'supabase-test',
        element: <DisabledFeaturePage title="Supabase (teste) desativado" />,
      },
      {
        path: 'sync-status',
        element: <DisabledFeaturePage title="Status de sincronização desativado" />,
      },
      // Rotas de desenvolvimento apenas em dev
      ...(import.meta.env.DEV ? [
        {
          path: 'testes',
          element: <SystemTestPage />,
        },
        {
          path: 'diagnostico-dados',
          element: <DiagnosticoDadosPage />,
        },
        {
          path: 'produtos-diagnostico',
          element: <ProdutosDiagnosticoPage />,
        },
        {
          path: 'audit',
          element: <AuditPage />,
        },
        {
          path: 'health-routes',
          element: <HealthRoutesPage />,
        },
        {
          path: 'diagnostico',
          element: <DiagnosticoPage />,
        },
        {
          path: 'diagnostico-rotas',
          element: <DiagnosticoRotasPage />,
        },
        {
          path: 'diagnostico-sync',
          element: <DiagnosticoSyncPage />,
        }
      ] : []),
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
