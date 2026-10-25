import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location, navigate] = useLocation();
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const email = localStorage.getItem('userEmail') || '';
    setUserEmail(email);
  }, []);

  const handleLogout = () => {
    console.log('Logging out...');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('userEmail');
    // Borrar la cookie de sesión en el servidor y luego redirigir
    fetch('/api/logout', { method: 'POST', credentials: 'include' })
      .catch(() => {})
      .finally(() => {
        window.location.href = '/login';
      });
  };
  
  // Cerrar menú al cambiar de ruta
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);
  
  // Prevenir scroll cuando el menú está abierto
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);
  
  return (
    <>
      <header className="bg-gradient-to-r from-black to-gray-900 text-white shadow-xl border-b-2 border-yellow-400">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            {/* Logo/Brand */}
            <div className="flex items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg">
                  <i className="ri-tools-line text-black text-xl"></i>
                </div>
                <div>
                  <span className="text-xl font-bold text-white">Peza Maquinaria</span>
                  <div className="text-xs text-yellow-400 font-medium">Sistema de Cotizaciones</div>
                </div>
              </div>
            </div>
            
            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center space-x-2">
            <Link 
              href="/dashboard" 
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                location === "/dashboard" 
                  ? "bg-yellow-400 text-black font-semibold shadow-lg" 
                  : "text-gray-300 hover:bg-gray-700 hover:text-yellow-400"
              }`}
            >
              <i className="ri-dashboard-line mr-2"></i>
              Dashboard
            </Link>
            <Link 
              href="/quotation" 
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                location === "/quotation" 
                  ? "bg-yellow-400 text-black font-semibold shadow-lg" 
                  : "text-gray-300 hover:bg-gray-700 hover:text-yellow-400"
              }`}
            >
              <i className="ri-file-list-3-line mr-2"></i>
              Cotizador
            </Link>
            <Link 
              href="/quotations" 
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                location === "/quotations" 
                  ? "bg-yellow-400 text-black font-semibold shadow-lg" 
                  : "text-gray-300 hover:bg-gray-700 hover:text-yellow-400"
              }`}
            >
              <i className="ri-file-list-line mr-2"></i>
              Cotizaciones
            </Link>
            <Link 
              href="/clients" 
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                location === "/clients" || location.startsWith("/clients/") 
                  ? "bg-yellow-400 text-black font-semibold shadow-lg" 
                  : "text-gray-300 hover:bg-gray-700 hover:text-yellow-400"
              }`}
            >
              <i className="ri-user-3-line mr-2"></i>
              Clientes
            </Link>
            <Link 
              href="/client-reports" 
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                location === "/client-reports"
                  ? "bg-yellow-400 text-black font-semibold shadow-lg" 
                  : "text-gray-300 hover:bg-gray-700 hover:text-yellow-400"
              }`}
            >
              <i className="ri-bar-chart-line mr-2"></i>
              Reportes
            </Link>
            <Link 
              href="/accounts-receivable" 
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                location === "/accounts-receivable"
                  ? "bg-yellow-400 text-black font-semibold shadow-lg" 
                  : "text-gray-300 hover:bg-gray-700 hover:text-yellow-400"
              }`}
              data-testid="link-accounts-receivable-desktop"
            >
              <i className="ri-money-dollar-circle-line mr-2"></i>
              Cuentas por Cobrar
            </Link>
            <Link 
              href="/concepts" 
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                location === "/concepts" 
                  ? "bg-yellow-400 text-black font-semibold shadow-lg" 
                  : "text-gray-300 hover:bg-gray-700 hover:text-yellow-400"
              }`}
            >
              <i className="ri-price-tag-3-line mr-2"></i>
              Conceptos
            </Link>
            <Link 
              href="/repairs" 
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                location === "/repairs" || location.startsWith("/repairs/") 
                  ? "bg-yellow-400 text-black font-semibold shadow-lg" 
                  : "text-gray-300 hover:bg-gray-700 hover:text-yellow-400"
              }`}
            >
              <i className="ri-tools-line mr-2"></i>
              Reparaciones
            </Link>
            <div className="border-l border-gray-600 mx-2 h-6"></div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{userEmail}</span>
              <Button
                onClick={handleLogout}
                className="px-3 py-2 h-9 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-700 text-white transition-all duration-200"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Salir
              </Button>
            </div>
          </nav>
          
          {/* Mobile menu button - Hamburguesa Amarilla */}
          <div className="lg:hidden">
            <button
              type="button"
              className="p-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 transition-all duration-200 shadow-lg"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Abrir menú"
            >
              <i className="ri-menu-line text-black text-2xl"></i>
            </button>
          </div>
        </div>
      </div>
      </header>

      {/* Overlay oscuro */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Mobile - Deslizante desde la izquierda */}
      <div 
        className={`fixed top-0 left-0 h-full w-3/4 max-w-sm bg-black z-50 transform transition-transform duration-300 ease-in-out lg:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Header del Sidebar */}
        <div className="flex items-center justify-between p-4 border-b-2 border-yellow-400">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg">
              <i className="ri-tools-line text-black text-xl"></i>
            </div>
            <div>
              <span className="text-lg font-bold text-yellow-400">Peza Maquinaria</span>
              <div className="text-xs text-gray-400">Menú Principal</div>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            aria-label="Cerrar menú"
          >
            <i className="ri-close-line text-yellow-400 text-2xl"></i>
          </button>
        </div>

        {/* Links del Menú */}
        <nav className="flex flex-col p-4 space-y-2 overflow-y-auto h-[calc(100%-80px)]">
          <Link 
            href="/dashboard" 
            className={`flex items-center px-4 py-3 rounded-lg text-base font-bold transition-all duration-200 ${
              location === "/dashboard" 
                ? "bg-yellow-400 text-black shadow-lg" 
                : "text-yellow-400 hover:bg-gray-900"
            }`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <i className="ri-dashboard-line mr-3 text-xl"></i>
            Dashboard
          </Link>
          <Link 
            href="/quotation" 
            className={`flex items-center px-4 py-3 rounded-lg text-base font-bold transition-all duration-200 ${
              location === "/quotation" 
                ? "bg-yellow-400 text-black shadow-lg" 
                : "text-yellow-400 hover:bg-gray-900"
            }`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <i className="ri-file-list-3-line mr-3 text-xl"></i>
            Cotizador
          </Link>
          <Link 
            href="/quotations" 
            className={`flex items-center px-4 py-3 rounded-lg text-base font-bold transition-all duration-200 ${
              location === "/quotations" 
                ? "bg-yellow-400 text-black shadow-lg" 
                : "text-yellow-400 hover:bg-gray-900"
            }`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <i className="ri-file-list-line mr-3 text-xl"></i>
            Cotizaciones
          </Link>
          <Link 
            href="/clients" 
            className={`flex items-center px-4 py-3 rounded-lg text-base font-bold transition-all duration-200 ${
              location === "/clients" || location.startsWith("/clients/") 
                ? "bg-yellow-400 text-black shadow-lg" 
                : "text-yellow-400 hover:bg-gray-900"
            }`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <i className="ri-user-3-line mr-3 text-xl"></i>
            Clientes
          </Link>
          <Link 
            href="/client-reports" 
            className={`flex items-center px-4 py-3 rounded-lg text-base font-bold transition-all duration-200 ${
              location === "/client-reports"
                ? "bg-yellow-400 text-black shadow-lg" 
                : "text-yellow-400 hover:bg-gray-900"
            }`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <i className="ri-bar-chart-line mr-3 text-xl"></i>
            Reportes
          </Link>
          <Link 
            href="/accounts-receivable" 
            className={`flex items-center px-4 py-3 rounded-lg text-base font-bold transition-all duration-200 ${
              location === "/accounts-receivable"
                ? "bg-yellow-400 text-black shadow-lg" 
                : "text-yellow-400 hover:bg-gray-900"
            }`}
            onClick={() => setMobileMenuOpen(false)}
            data-testid="link-accounts-receivable-mobile"
          >
            <i className="ri-money-dollar-circle-line mr-3 text-xl"></i>
            Cuentas por Cobrar
          </Link>
          <Link 
            href="/concepts" 
            className={`flex items-center px-4 py-3 rounded-lg text-base font-bold transition-all duration-200 ${
              location === "/concepts" 
                ? "bg-yellow-400 text-black shadow-lg" 
                : "text-yellow-400 hover:bg-gray-900"
            }`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <i className="ri-price-tag-3-line mr-3 text-xl"></i>
            Conceptos
          </Link>
          <Link 
            href="/repairs" 
            className={`flex items-center px-4 py-3 rounded-lg text-base font-bold transition-all duration-200 ${
              location === "/repairs" || location.startsWith("/repairs/")
                ? "bg-yellow-400 text-black shadow-lg" 
                : "text-yellow-400 hover:bg-gray-900"
            }`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <i className="ri-tools-line mr-3 text-xl"></i>
            Reparaciones
          </Link>
          <div className="border-t border-gray-700 my-4 pt-4">
            <p className="text-xs text-gray-400 px-4 mb-3 truncate">{userEmail}</p>
            <button
              onClick={() => {
                handleLogout();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center px-4 py-3 rounded-lg text-base font-bold bg-red-600 hover:bg-red-700 text-white transition-all"
            >
              <i className="ri-logout-box-line mr-3 text-xl"></i>
              Salir
            </button>
          </div>
        </nav>
      </div>
    </>
  );
}