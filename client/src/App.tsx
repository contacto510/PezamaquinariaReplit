import { Switch, Route, useLocation } from "wouter";
import { useEffect, useState, Component, lazy, Suspense } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Login from "@/pages/Login";
import Navbar from "@/components/Navbar";

// Carga diferida de páginas: reduce el tamaño del bundle inicial
const NotFound = lazy(() => import("@/pages/not-found"));
const Quotation = lazy(() => import("@/pages/Quotation"));
const QuotationList = lazy(() => import("@/pages/QuotationList"));
const Clients = lazy(() => import("@/pages/Clients"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const ClientForm = lazy(() => import("@/pages/ClientForm"));
const ProjectDetail = lazy(() => import("@/pages/ProjectDetail"));
const ReportForm = lazy(() => import("@/pages/ReportForm"));
const Concepts = lazy(() => import("@/pages/Concepts"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const AccountsReceivable = lazy(() => import("@/pages/AccountsReceivable"));
const Repairs = lazy(() => import("@/pages/Repairs"));
const RepairForm = lazy(() => import("@/pages/RepairForm"));
const RepairDetail = lazy(() => import("@/pages/RepairDetail"));
const RepairConcepts = lazy(() => import("@/pages/RepairConcepts"));
const ClientReports = lazy(() => import("@/pages/ClientReports"));
const ZohoSetup = lazy(() => import("@/pages/ZohoSetup"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-yellow-500"></div>
    </div>
  );
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    try {
      const seen = new WeakSet();
      return JSON.stringify(obj, (_k, v) => {
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        return v;
      });
    } catch {
      return String(obj);
    }
  }
}

function reportClientError(payload: {
  source: string;
  message: string;
  stack?: string;
  componentStack?: string;
}) {
  try {
    const body = safeStringify({
      ...payload,
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      viewport:
        typeof window !== "undefined"
          ? `${window.innerWidth}x${window.innerHeight}`
          : "",
      timestamp: new Date().toISOString(),
    });
    const url = "/api/client-errors";
    let sent = false;
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      try {
        const blob = new Blob([body], { type: "application/json" });
        sent = navigator.sendBeacon(url, blob);
      } catch {
        sent = false;
      }
    }
    if (!sent) {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // nunca propagar errores del reportador
  }
}

if (typeof window !== "undefined" && !(window as any).__pezaErrorHandlersInstalled) {
  (window as any).__pezaErrorHandlersInstalled = true;
  window.addEventListener("error", (e) => {
    const msg = e?.message || "";
    // Silenciar ruido conocido y no fatal del ResizeObserver
    if (msg.includes("ResizeObserver loop")) return;
    reportClientError({
      source: "window.error",
      message: msg,
      stack: e?.error?.stack,
    });
  });
  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason: any = e?.reason;
    reportClientError({
      source: "unhandledrejection",
      message:
        typeof reason === "string"
          ? reason
          : reason?.message || JSON.stringify(reason),
      stack: reason?.stack,
    });
  });
}

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string; errorStack: string; componentStack: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: "", errorStack: "", componentStack: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error?.message || String(error),
      errorStack: error?.stack || "",
      componentStack: "",
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Error capturado:", error?.message, error?.stack);
    console.error("[ErrorBoundary] Componente:", info?.componentStack);
    this.setState({ componentStack: info?.componentStack || "" });
    reportClientError({
      source: "ErrorBoundary",
      message: error?.message || String(error),
      stack: error?.stack,
      componentStack: info?.componentStack || undefined,
    });

    // Una pestaña abierta durante una publicación puede conservar referencias
    // a módulos con hash antiguo. Recargar una vez obtiene el index nuevo.
    const message = (error?.message || "").toLowerCase();
    const isStaleChunk =
      message.includes("failed to fetch dynamically imported module") ||
      message.includes("error loading dynamically imported module") ||
      message.includes("importing a module script failed") ||
      message.includes("chunkloaderror") ||
      message.includes("loading chunk");
    if (isStaleChunk) {
      const reloadKey = "peza:stale-chunk-reload";
      const lastReload = Number(sessionStorage.getItem(reloadKey) || "0");
      const now = Date.now();
      if (!Number.isFinite(lastReload) || now - lastReload > 30_000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const details = [
        `Mensaje: ${this.state.errorMessage}`,
        this.state.errorStack ? `\nStack:\n${this.state.errorStack}` : "",
        this.state.componentStack ? `\nComponente:\n${this.state.componentStack}` : "",
        `\nURL: ${window.location.href}`,
        `UserAgent: ${navigator.userAgent}`,
        `Viewport: ${window.innerWidth}x${window.innerHeight}`,
      ].join("\n");

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-100 p-4">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl w-full">
            <div className="text-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">⚙️</span>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Algo salió mal</h2>
              <p className="text-sm text-gray-600 mb-4">
                Ocurrió un error inesperado. Por favor recarga la página para continuar.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 py-2 px-4 bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg transition-colors"
                >
                  Recargar página
                </button>
                <button
                  onClick={() => {
                    try {
                      navigator.clipboard?.writeText(details);
                    } catch {}
                  }}
                  className="flex-1 py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors text-sm"
                >
                  Copiar detalles
                </button>
              </div>
            </div>
            <details className="text-left bg-gray-50 rounded-lg p-3 border border-gray-200">
              <summary className="cursor-pointer text-xs font-semibold text-gray-700 select-none">
                Ver detalles técnicos
              </summary>
              <pre className="mt-2 text-[10px] leading-tight text-red-700 whitespace-pre-wrap break-words max-h-72 overflow-auto">
                {details}
              </pre>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Redirect({ to }: { to: string }) {
  const [, navigate] = useLocation();
  
  useEffect(() => {
    navigate(to);
  }, [navigate, to]);
  
  return null;
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-neutral-100">
      {/* Top Navigation Bar */}
      <Navbar />

      {/* Main Content */}
      <main className="flex-grow p-4 md:p-6 lg:p-8">
        <div className="container mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

function Router() {
  const [location, navigate] = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // La cookie firmada del servidor es la única fuente de verdad. localStorage
    // puede sobrevivir a una publicación aunque la sesión ya no sea válida.
    fetch('/api/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.authenticated) {
          localStorage.setItem('isAuthenticated', 'true');
          if (data.user?.email) localStorage.setItem('userEmail', data.user.email);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('isAuthenticated');
          localStorage.removeItem('userEmail');
          queryClient.clear();
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('userEmail');
        queryClient.clear();
        setIsAuthenticated(false);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Monitorear cambios en localStorage para actualizar autenticación
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'isAuthenticated') {
        const auth = e.newValue === 'true';
        console.log('Auth changed via storage event:', auth);
        setIsAuthenticated(auth);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      queryClient.clear();
      setIsAuthenticated(false);
      setIsLoading(false);
    };
    window.addEventListener('peza:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('peza:unauthorized', handleUnauthorized);
  }, []);

  // Redirigir cuando cambia el estado de autenticación
  useEffect(() => {
    console.log('Auth state:', isAuthenticated, 'Location:', location);
    if (!isLoading) {
      if (!isAuthenticated && location !== '/login') {
        console.log('Not authenticated, redirecting to login');
        navigate('/login');
      } else if (isAuthenticated && location === '/login') {
        console.log('Already authenticated, redirecting to dashboard');
        navigate('/dashboard');
      }
    }
  }, [isAuthenticated, location, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado, solo mostrar login
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route component={() => <Login />} />
      </Switch>
    );
  }

  // Si está autenticado, mostrar el sistema completo
  return (
    <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path="/login" component={() => <Redirect to="/dashboard" />} />
      
      <Route path="/" component={() => <Redirect to="/dashboard" />} />
      <Route path="/quotations/new" component={() => (
        <Layout>
          <Quotation />
        </Layout>
      )} />
      {/* Rutas para cotizaciones */}
      <Route path="/quotation" component={() => (
        <Layout>
          <Quotation />
        </Layout>
      )} />
      <Route path="/quotation/:id" component={() => (
        <Layout>
          <Quotation />
        </Layout>
      )} />
      <Route path="/quotations" component={() => (
        <Layout>
          <QuotationList />
        </Layout>
      )} />
      
      {/* Rutas para clientes */}
      <Route path="/clients" component={() => (
        <Layout>
          <Clients />
        </Layout>
      )} />
      <Route path="/clients/new" component={() => (
        <Layout>
          <ClientForm />
        </Layout>
      )} />
      <Route path="/clients/:id" component={() => (
        <Layout>
          <ClientDetail />
        </Layout>
      )} />
      <Route path="/client-reports" component={() => (
        <Layout>
          <ClientReports />
        </Layout>
      )} />
      <Route path="/zoho-setup" component={() => (
        <Layout>
          <ZohoSetup />
        </Layout>
      )} />
      
      {/* Rutas para proyectos */}
      <Route path="/clients/:clientId/projects/:projectId" component={() => (
        <Layout>
          <ProjectDetail />
        </Layout>
      )} />
      
      {/* Ruta para crear reportes */}
      <Route path="/clients/:clientId/projects/:projectId/report" component={() => (
        <Layout>
          <ReportForm />
        </Layout>
      )} />
      
      {/* Ruta para editar reportes */}
      <Route path="/reports/:id/edit" component={() => (
        <Layout>
          <ReportForm />
        </Layout>
      )} />

      {/* Ruta para conceptos */}
      <Route path="/concepts" component={() => (
        <Layout>
          <Concepts />
        </Layout>
      )} />

      {/* Ruta para dashboard */}
      <Route path="/dashboard" component={() => (
        <Layout>
          <Dashboard />
        </Layout>
      )} />

      {/* Cuentas por cobrar */}
      <Route path="/accounts-receivable" component={() => (
        <Layout>
          <AccountsReceivable />
        </Layout>
      )} />

      {/* Rutas para reparaciones */}
      <Route path="/repairs" component={() => (
        <Layout>
          <Repairs />
        </Layout>
      )} />
      <Route path="/repairs/new" component={() => (
        <Layout>
          <RepairForm />
        </Layout>
      )} />
      <Route path="/repairs/:id" component={() => (
        <Layout>
          <RepairDetail />
        </Layout>
      )} />
      <Route path="/repairs/:id/edit" component={() => (
        <Layout>
          <RepairForm />
        </Layout>
      )} />
      
      <Route path="/repair-concepts" component={() => (
        <Layout>
          <RepairConcepts />
        </Layout>
      )} />
      
      {/* Ruta para 404 */}
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <Router />
      </ErrorBoundary>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
