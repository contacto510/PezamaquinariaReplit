import { useState, useMemo, useEffect, useCallback, memo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Repair } from "@shared/schema";
import RepairReviewPayment from "@/components/RepairReviewPayment";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { Wrench, Plus, Package, Calendar, CheckCircle, Clock, Trash2, ChevronDown, Search, Eye, AlertCircle, Hourglass, Truck, XCircle, FileDown, CalendarCog, PackageX, ClipboardList, FileText, Settings2, ArrowUp, ArrowDown } from "lucide-react";

const STATUS_OPTIONS = [
  { value: 'Espera de confirmación', label: 'Espera', icon: Hourglass, color: 'amber' },
  { value: 'Diagnóstico', label: 'Diagnóstico', icon: ClipboardList, color: 'cyan' },
  { value: 'En Proceso', label: 'En Proceso', icon: Clock, color: 'purple' },
  { value: 'Entregada', label: 'Entregada', icon: Truck, color: 'green' },
  { value: 'Terminada', label: 'Terminada', icon: CheckCircle, color: 'teal' },
  { value: 'No Entregada', label: 'No Entregada', icon: PackageX, color: 'orange' },
  { value: 'No autorizado', label: 'No Autorizado', icon: XCircle, color: 'red' },
];

// Orden por defecto de las pestañas (puede personalizarse y se guarda en el navegador)
const DEFAULT_TAB_ORDER = [
  'all',
  'Espera de confirmación',
  'En Proceso',
  'Terminada',
  'Entregada',
  'No Entregada',
  'Pagada',
  'No Pagada',
  'Revisión',
  'No autorizado',
  'Diagnóstico',
  'Cotización',
];
const TAB_ORDER_STORAGE_KEY = 'repairsTabOrder';

function loadTabOrder(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(TAB_ORDER_STORAGE_KEY) || 'null');
    if (Array.isArray(saved)) {
      // Sanitizar: conservar solo pestañas válidas y agregar las que falten
      const valid = saved.filter((v) => DEFAULT_TAB_ORDER.includes(v));
      const missing = DEFAULT_TAB_ORDER.filter((v) => !valid.includes(v));
      return [...valid, ...missing];
    }
  } catch {}
  return DEFAULT_TAB_ORDER;
}

const getStatusColor = (color: string) => {
  const colors: Record<string, { bg: string; text: string; border: string; headerBg: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', headerBg: 'bg-blue-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', headerBg: 'bg-amber-100' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', headerBg: 'bg-purple-100' },
    green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', headerBg: 'bg-green-100' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', headerBg: 'bg-teal-100' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', headerBg: 'bg-orange-100' },
    red: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', headerBg: 'bg-red-100' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', headerBg: 'bg-cyan-100' },
  };
  return colors[color] || colors.blue;
};

export default function Repairs() {
  const [location, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [tabOrder, setTabOrder] = useState<string[]>(loadTabOrder);
  const [isTabOrderDialogOpen, setIsTabOrderDialogOpen] = useState(false);

  const moveTab = (index: number, direction: -1 | 1) => {
    setTabOrder((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      try { localStorage.setItem(TAB_ORDER_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const resetTabOrder = () => {
    setTabOrder(DEFAULT_TAB_ORDER);
    try { localStorage.removeItem(TAB_ORDER_STORAGE_KEY); } catch {}
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { data: repairs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['/api/repairs'],
    queryFn: async () => {
      return await apiRequest('/api/repairs') as Repair[];
    },
    refetchOnWindowFocus: false,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  const filteredRepairs = useMemo(() => {
    let result = repairs;
    
    if (debouncedSearch) {
      const lowerSearch = debouncedSearch.toLowerCase();
      result = result.filter(repair => {
        const r = repair as any;
        return (
          r.clientName?.toLowerCase().includes(lowerSearch) ||
          r.client?.name?.toLowerCase().includes(lowerSearch) ||
          r.equipment?.toLowerCase().includes(lowerSearch) ||
          r.repairNumber?.toLowerCase().includes(lowerSearch) ||
          r.serialNumber?.toLowerCase().includes(lowerSearch)
        );
      });
    }
    
    return result;
  }, [repairs, debouncedSearch]);

  const PAYMENT_TABS = [
    { value: 'Revisión', label: 'Revisión', icon: ClipboardList, bgActive: 'bg-amber-100', textActive: 'text-amber-700', border: 'border-amber-200', badgeBg: 'bg-amber-50' },
    { value: 'Pagada', label: 'Pagada', icon: CheckCircle, bgActive: 'bg-green-100', textActive: 'text-green-700', border: 'border-green-200', badgeBg: 'bg-green-50' },
    { value: 'No Pagada', label: 'No Pagada', icon: XCircle, bgActive: 'bg-red-100', textActive: 'text-red-700', border: 'border-red-200', badgeBg: 'bg-red-50' },
    { value: 'Cotización', label: 'Cotización', icon: FileText, bgActive: 'bg-blue-100', textActive: 'text-blue-700', border: 'border-blue-200', badgeBg: 'bg-blue-50' },
  ];

  const repairsByStatus = useMemo(() => {
    const grouped: Record<string, Repair[]> = {};
    STATUS_OPTIONS.forEach(status => {
      grouped[status.value] = filteredRepairs.filter(r =>
        r.status?.toLowerCase() === status.value.toLowerCase()
      );
    });
    return grouped;
  }, [filteredRepairs]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    STATUS_OPTIONS.forEach(status => {
      counts[status.value] = repairsByStatus[status.value]?.length || 0;
    });
    counts['all'] = filteredRepairs.length;
    PAYMENT_TABS.forEach(pt => {
      counts[pt.value] = filteredRepairs.filter(r => (r as any).paymentStatus === pt.value).length;
    });
    return counts;
  }, [repairsByStatus, filteredRepairs]);

  const displayedRepairs = useMemo(() => {
    if (activeTab === 'Pagada' || activeTab === 'No Pagada' || activeTab === 'Cotización' || activeTab === 'Revisión') {
      return filteredRepairs.filter(r => (r as any).paymentStatus === activeTab);
    }
    if (activeTab !== 'all') {
      return repairsByStatus[activeTab] || [];
    }
    return filteredRepairs;
  }, [activeTab, repairsByStatus, filteredRepairs]);

  // Calculate repair statistics
  const repairStats = useMemo(() => {
    const getRepairTotal = (repair: Repair) => {
      const total = typeof repair.total === 'string' ? parseFloat(repair.total) : (repair.total || 0);
      return isNaN(total) ? 0 : total;
    };

    const totalValue = repairs.reduce((sum, r) => sum + getRepairTotal(r), 0);
    
    // Completadas = Entregada + Terminada
    const completedStatuses = ['Terminada', 'Entregada'];
    const completedRepairs = repairs.filter(r => completedStatuses.includes(r.status || ''));
    const completedValue = completedRepairs.reduce((sum, r) => sum + getRepairTotal(r), 0);
    
    // Pendiente = Solo "Espera de confirmación"
    const pendingRepairs = repairs.filter(r => r.status === 'Espera de confirmación');
    const pendingValue = pendingRepairs.reduce((sum, r) => sum + getRepairTotal(r), 0);

    return {
      count: repairs.length,
      totalValue,
      completedValue,
      pendingValue
    };
  }, [repairs]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="peza-header rounded-xl p-4 sm:p-6 pb-6">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-black">
              Reparaciones
            </h1>
            <p className="mt-1 sm:mt-2 text-sm sm:text-base text-black/80">
              Gestiona órdenes de reparación
            </p>
          </div>
          <button 
            onClick={() => setLocation("/repairs/new")} 
            className="peza-button-primary w-full sm:w-auto min-h-[44px] sm:px-4 sm:py-2"
          >
            <Plus className="w-4 h-4 sm:w-4 sm:h-4 mr-2" />
            <span className="text-sm sm:text-sm">Nueva Reparación</span>
          </button>
        </div>
      </div>
      
      {/* Tabs de navegación */}
      <div className="flex gap-1.5 sm:gap-2 bg-white rounded-lg p-1.5 sm:p-2 shadow-sm border border-gray-200 overflow-x-auto">
        <Link href="/repairs">
          <button className={`px-3 sm:px-6 py-2 sm:py-2.5 rounded-md font-medium transition-all whitespace-nowrap text-sm sm:text-base min-h-[44px] ${
            location.toString().includes("/repairs") && !location.toString().includes("/edit") && !location.toString().includes("/repair-concepts")
              ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-black shadow-md" 
              : "text-gray-600 hover:bg-gray-100"
          }`}>
            <Wrench className="w-4 h-4 inline-block mr-1 sm:mr-2" />
            <span className="hidden xs:inline">Reparaciones</span>
            <span className="xs:hidden">Reparac.</span>
          </button>
        </Link>
        <Link href="/repair-concepts">
          <button className={`px-3 sm:px-6 py-2 sm:py-2.5 rounded-md font-medium transition-all whitespace-nowrap text-sm sm:text-base min-h-[44px] ${
            location.toString().includes("/repair-concepts")
              ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-black shadow-md" 
              : "text-gray-600 hover:bg-gray-100"
          }`}>
            <Package className="w-4 h-4 inline-block mr-1 sm:mr-2" />
            Conceptos
          </button>
        </Link>
      </div>

      {/* Buscador */}
      <div className="flex items-center w-full">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Buscar por cliente, equipo, serie u orden (ej: R-07)..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full text-sm pl-10"
          />
        </div>
      </div>

      {/* Error State */}
      {isError && (
        <div className="text-center py-8 bg-red-50 rounded-xl border border-red-200">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-bold text-red-900 mb-2">Error al cargar reparaciones</h3>
          <p className="text-sm text-red-700 mb-4">
            {(error as any)?.message || "No se pudieron cargar las reparaciones. Intenta de nuevo."}
          </p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Full page loading state */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-yellow-100 to-yellow-200 flex items-center justify-center mb-4 animate-pulse">
            <Wrench className="w-8 h-8 text-yellow-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Cargando reparaciones...</h3>
          <p className="text-sm text-gray-600">Esto puede tomar unos segundos</p>
        </div>
      )}

      {/* Statistics Cards */}
      {!isLoading && !isError && repairs.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-3 sm:p-4 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-500 rounded-lg">
                <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-blue-900 truncate">
                  {repairStats.count}
                </div>
                <div className="text-xs sm:text-sm text-blue-700">Total reparaciones</div>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-green-50 to-green-100 p-3 sm:p-4 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-green-500 rounded-lg">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-green-900 truncate">
                  {formatCurrency(repairStats.completedValue)}
                </div>
                <div className="text-xs sm:text-sm text-green-700">Completadas</div>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-amber-50 to-amber-100 p-3 sm:p-4 rounded-lg border border-amber-200">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-amber-500 rounded-lg">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-amber-900 truncate">
                  {formatCurrency(repairStats.pendingValue)}
                </div>
                <div className="text-xs sm:text-sm text-amber-700">Por confirmar</div>
              </div>
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-purple-50 to-purple-100 p-3 sm:p-4 rounded-lg border border-purple-200">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-purple-500 rounded-lg">
                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-lg sm:text-2xl font-bold text-purple-900 truncate">
                  {formatCurrency(repairStats.totalValue)}
                </div>
                <div className="text-xs sm:text-sm text-purple-700">Valor total</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs de estado con contadores */}
      <div>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {tabOrder.map((tabValue) => {
            if (tabValue === 'all') {
              return (
                <button
                  key="all"
                  onClick={() => setActiveTab('all')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all min-h-[44px] ${
                    activeTab === 'all'
                      ? 'bg-gray-900 text-white shadow-md'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Todos
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {statusCounts['all']}
                  </span>
                </button>
              );
            }

            const status = STATUS_OPTIONS.find((s) => s.value === tabValue);
            if (status) {
              const colors = getStatusColor(status.color);
              const isActive = activeTab === status.value;
              const count = statusCounts[status.value];
              const Icon = status.icon;
              return (
                <button
                  key={status.value}
                  onClick={() => setActiveTab(status.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all min-h-[44px] ${
                    isActive
                      ? `${colors.headerBg} ${colors.text} shadow-md border ${colors.border}`
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{status.label}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                    isActive ? `${colors.bg} ${colors.text}` : 'bg-gray-100 text-gray-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            }

            const pt = PAYMENT_TABS.find((p) => p.value === tabValue);
            if (!pt) return null;
            const isActive = activeTab === pt.value;
            const count = statusCounts[pt.value];
            const Icon = pt.icon;
            return (
              <button
                key={pt.value}
                onClick={() => setActiveTab(pt.value)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all min-h-[44px] ${
                  isActive
                    ? `${pt.bgActive} ${pt.textActive} shadow-md border ${pt.border}`
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{pt.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  isActive ? `${pt.badgeBg} ${pt.textActive}` : 'bg-gray-100 text-gray-600'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}

          {/* Botón para personalizar el orden de las pestañas */}
          <button
            onClick={() => setIsTabOrderDialogOpen(true)}
            title="Ordenar pestañas"
            className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all min-h-[44px] bg-white text-gray-400 border border-dashed border-gray-300 hover:bg-gray-50 hover:text-gray-600"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>

        {/* Diálogo para reordenar pestañas */}
        <Dialog open={isTabOrderDialogOpen} onOpenChange={setIsTabOrderDialogOpen}>
          <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Ordenar pestañas</DialogTitle>
              <DialogDescription>
                Usa las flechas para acomodar las pestañas a tu gusto. El orden se guarda en este dispositivo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              {tabOrder.map((tabValue, index) => {
                const label =
                  tabValue === 'all'
                    ? 'Todos'
                    : STATUS_OPTIONS.find((s) => s.value === tabValue)?.label ||
                      PAYMENT_TABS.find((p) => p.value === tabValue)?.label ||
                      tabValue;
                return (
                  <div key={tabValue} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-gray-200 bg-gray-50">
                    <span className="text-sm font-medium text-gray-700">{index + 1}. {label}</span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => moveTab(index, -1)}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-7 w-7" disabled={index === tabOrder.length - 1} onClick={() => moveTab(index, 1)}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter className="flex-row justify-between gap-2">
              <Button variant="outline" onClick={resetTabOrder}>Restablecer</Button>
              <Button onClick={() => setIsTabOrderDialogOpen(false)}>Listo</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Lista filtrada */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="animate-pulse">
                <CardHeader className="pb-2">
                  <div className="h-6 bg-gray-200 rounded w-2/3 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                </CardContent>
              </Card>
            ))
          ) : displayedRepairs.length === 0 ? (
            <div className="text-center py-8">
              <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-yellow-100 to-yellow-200 flex items-center justify-center mb-4">
                <Wrench className="w-8 h-8 text-yellow-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {debouncedSearch ? "No se encontraron reparaciones" : activeTab ? `No hay reparaciones "${activeTab}"` : "No hay reparaciones"}
              </h3>
              <p className="text-sm text-gray-600">
                {debouncedSearch ? "Intenta con otros términos de búsqueda." : "Crea una nueva reparación para comenzar."}
              </p>
            </div>
          ) : (
            displayedRepairs.map((repair) => (
              <RepairCard key={repair.id} repair={repair} />
            ))
          )}
        </div>
      </div>

    </div>
  );
}

interface RepairCardProps {
  repair: Repair;
}

const toDateInputValue = (d: any): string => {
  if (!d) return "";
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return "";
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
};

const getMexicoCityToday = (): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatMexicoCityDate = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

const RepairCard = memo(function RepairCard({ repair }: RepairCardProps) {
  const [, setLocation] = useLocation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDatesDialog, setShowDatesDialog] = useState(false);
  const [editReceivedDate, setEditReceivedDate] = useState<string>("");
  const [editDeliveryDate, setEditDeliveryDate] = useState<string>("");
  const [isCapturingLiquidatedDate, setIsCapturingLiquidatedDate] = useState(false);
  const [liquidatedDateInput, setLiquidatedDateInput] = useState("");

  const openDatesDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditReceivedDate(toDateInputValue((repair as any).receivedDate));
    setEditDeliveryDate(toDateInputValue((repair as any).deliveryDate));
    setShowDatesDialog(true);
  };

  const datesMutation = useMutation({
    mutationFn: async (payload: { receivedDate: string | null; deliveryDate: string | null }) => {
      return apiRequest(`/api/repairs/${repair.id}/dates`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    },
    onMutate: async (payload) => {
      // Cerrar diálogo y actualizar UI de inmediato
      setShowDatesDialog(false);
      await queryClient.cancelQueries({ queryKey: ['/api/repairs'] });
      const previousRepairs = queryClient.getQueryData<Repair[]>(['/api/repairs']);
      const optimisticReceived = payload.receivedDate ? new Date(payload.receivedDate + 'T12:00:00').toISOString() : null;
      const optimisticDelivery = payload.deliveryDate ? new Date(payload.deliveryDate + 'T12:00:00').toISOString() : null;
      queryClient.setQueryData<Repair[]>(['/api/repairs'],
        (old) => old ? old.map(r =>
          r.id === repair.id
            ? { ...r, receivedDate: optimisticReceived as any, deliveryDate: optimisticDelivery as any }
            : r
        ) : old
      );
      return { previousRepairs };
    },
    onSuccess: (updated: any) => {
      queryClient.setQueryData<Repair[]>(['/api/repairs'],
        (old) => old ? old.map(r =>
          r.id === repair.id
            ? { ...r, receivedDate: updated?.receivedDate ?? r.receivedDate, deliveryDate: updated?.deliveryDate ?? r.deliveryDate }
            : r
        ) : old
      );
      queryClient.invalidateQueries({ queryKey: ['/api/accounts-receivable'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      toast({
        title: "Fechas actualizadas",
        description: "Las fechas de la reparación se guardaron correctamente.",
      });
    },
    onError: (error: any, _payload, context: any) => {
      if (context?.previousRepairs) {
        queryClient.setQueryData(['/api/repairs'], context.previousRepairs);
      }
      toast({
        title: "Error",
        description: error?.message || "No se pudieron actualizar las fechas.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/repairs'] });
    },
  });

  const handleSaveDates = () => {
    datesMutation.mutate({
      receivedDate: editReceivedDate || null,
      deliveryDate: editDeliveryDate || null,
    });
  };

  const finalTotal = Number(repair.total || 0);

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return apiRequest(`/api/repairs/${repair.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
    },
    onMutate: async (newStatus: string) => {
      await queryClient.cancelQueries({ queryKey: ['/api/repairs'] });
      const previousRepairs = queryClient.getQueryData<Repair[]>(['/api/repairs']);
      if (previousRepairs) {
        queryClient.setQueryData<Repair[]>(['/api/repairs'], 
          previousRepairs.map(r => 
            r.id === repair.id ? { ...r, status: newStatus } : r
          )
        );
      }
      return { previousRepairs };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/repairs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts-receivable'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      toast({
        title: "Estado actualizado",
        description: "El estado de la reparación se actualizó correctamente.",
      });
    },
    onError: (error: any, _newStatus, context) => {
      if (context?.previousRepairs) {
        queryClient.setQueryData(['/api/repairs'], context.previousRepairs);
      }
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el estado.",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (e: React.MouseEvent, newStatus: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (newStatus !== repair.status) {
      statusMutation.mutate(newStatus);
    }
  };

  const liquidatedDateMutation = useMutation({
    mutationFn: async (liquidatedAt: string) => apiRequest(`/api/repairs/${repair.id}/payment-status`, {
      method: 'PATCH',
      body: JSON.stringify({ paymentStatus: "Pagada", liquidatedAt }),
    }),
    onSuccess: () => {
      setIsCapturingLiquidatedDate(false);
      setLiquidatedDateInput("");
      queryClient.invalidateQueries({ queryKey: ['/api/repairs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/repairs', repair.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts-receivable'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      toast({
        title: "Fecha de liquidación guardada",
        description: "La fecha se guardó correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error al guardar la fecha",
        description: error?.message || "No se pudo guardar la fecha de liquidación.",
        variant: "destructive",
      });
    },
  });

  const getStatusStyles = (status: string) => {
    const normalized = status?.toLowerCase() || '';
    if (normalized === 'espera de confirmación') return "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200";
    if (normalized === 'diagnóstico') return "bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200";
    if (normalized === 'en proceso') return "bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200";
    if (normalized === 'entregada') return "bg-green-100 text-green-800 border-green-300 hover:bg-green-200";
    if (normalized === 'terminada') return "bg-teal-100 text-teal-800 border-teal-300 hover:bg-teal-200";
    if (normalized === 'no entregada') return "bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200";
    if (normalized === 'no autorizado') return "bg-red-100 text-red-800 border-red-300 hover:bg-red-200";
    return "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200";
  };

  const getStatusIcon = (status: string) => {
    const normalized = status?.toLowerCase() || '';
    if (normalized === 'entregada' || normalized === 'terminada') {
      return <CheckCircle className="w-3 h-3" />;
    }
    if (normalized === 'no entregada') {
      return <PackageX className="w-3 h-3" />;
    }
    return <Clock className="w-3 h-3" />;
  };

  const getStatusLabel = (status: string) => {
    const normalized = status?.toLowerCase() || '';
    if (normalized === 'espera de confirmación') return 'Espera confirm.';
    if (normalized === 'diagnóstico') return 'Diagnóstico';
    if (normalized === 'en proceso') return 'En Proceso';
    if (normalized === 'entregada') return 'Entregada';
    if (normalized === 'terminada') return 'Terminada';
    if (normalized === 'no entregada') return 'No Entregada';
    if (normalized === 'no autorizado') return 'No Autorizado';
    return status || 'Sin estado';
  };

  const statusOptions = [
    { value: 'Espera de confirmación', label: 'Espera de confirmación' },
    { value: 'Diagnóstico', label: 'Diagnóstico' },
    { value: 'En Proceso', label: 'En Proceso' },
    { value: 'Entregada', label: 'Entregada' },
    { value: 'Terminada', label: 'Terminada' },
    { value: 'No Entregada', label: 'No Entregada' },
    { value: 'No autorizado', label: 'No autorizado' },
  ];

  const deleteMutation = useMutation({
    mutationFn: async (repairId: number) => {
      const response = await apiRequest(`/api/repairs/${repairId}`, {
        method: 'DELETE',
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Reparación eliminada",
        description: "La reparación ha sido eliminada correctamente.",
      });
      setShowDeleteDialog(false);
      queryClient.invalidateQueries({ queryKey: ['/api/repairs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts-receivable'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error al eliminar",
        description: error.message || "No se pudo eliminar la reparación.",
        variant: "destructive",
      });
    },
  });

  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);

  const handleDownloadPDF = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDownloadingPDF(true);
    try {
      const { downloadRepairPDF } = await import('@/lib/pdf-generator');
      await downloadRepairPDF(repair.id);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo generar el PDF. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handleEditClick = (e: React.MouseEvent, repairId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setLocation(`/repairs/${repairId}/edit`);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  return (
    <div className="relative">
      <Card className="peza-card hover:shadow-xl transition-all duration-300 border-l-4 border-l-blue-500 group">
        {/* Header clickeable para navegar al detalle */}
        <CardHeader
          className="peza-card-header pb-2 sm:pb-3 pr-12 cursor-pointer"
          onClick={() => setLocation(`/repairs/${repair.id}`)}
        >
          <div className="flex justify-between items-start gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors flex-shrink-0">
                <Wrench className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
              </div>
              <div className="min-w-0 flex-1">
                <CardTitle className="text-base sm:text-lg font-bold text-gray-900 truncate">{repair.repairNumber}</CardTitle>
                <p className="text-xs sm:text-sm text-gray-600 truncate">
                  {(repair as any).clientName || repair.client?.name || "Cliente no especificado"}
                </p>
              </div>
            </div>
            {/* Dropdown de estado — stopPropagation para no activar el navigate del header */}
            <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${getStatusStyles(repair.status)} ${statusMutation.isPending ? 'opacity-50' : ''}`}
                    disabled={statusMutation.isPending}
                  >
                    {getStatusIcon(repair.status)}
                    <span>{getStatusLabel(repair.status)}</span>
                    <ChevronDown className="w-3 h-3 ml-0.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {statusOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onSelect={() => {
                        if (option.value !== repair.status) {
                          statusMutation.mutate(option.value);
                        }
                      }}
                      className={`cursor-pointer ${repair.status === option.value ? 'bg-gray-100 font-medium' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        {getStatusIcon(option.value)}
                        <span>{option.label}</span>
                        {repair.status === option.value && (
                          <CheckCircle className="w-3 h-3 ml-auto text-green-600" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-3 pt-3">
          <button
            onClick={handleDownloadPDF}
            disabled={isDownloadingPDF}
            className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileDown className="w-3.5 h-3.5" />
            {isDownloadingPDF ? "Generando PDF..." : "Descargar PDF"}
          </button>
          <RepairReviewPayment repair={repair} busy={liquidatedDateMutation.isPending} />
          {(repair as any).paymentStatus === "Pagada" && (
            <div
              className="rounded-md border border-green-100 bg-green-50/70 px-2.5 py-2 text-xs sm:text-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-gray-700">Liquidado el:</span>
                <span className="text-gray-800">
                  {formatMexicoCityDate((repair as any).liquidatedAt) || "Fecha no registrada"}
                </span>
                {!(repair as any).liquidatedAt && !isCapturingLiquidatedDate && (
                  <button
                    type="button"
                    className="ml-auto text-blue-700 underline underline-offset-2 hover:text-blue-900"
                    onClick={() => {
                      setLiquidatedDateInput("");
                      setIsCapturingLiquidatedDate(true);
                    }}
                  >
                    Capturar fecha
                  </button>
                )}
              </div>
              {isCapturingLiquidatedDate && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`liquidated-date-${repair.id}`} className="text-xs font-medium text-gray-700">
                      Fecha de liquidación
                    </label>
                    <input
                      id={`liquidated-date-${repair.id}`}
                      type="date"
                      value={liquidatedDateInput}
                      max={getMexicoCityToday()}
                      onChange={(e) => setLiquidatedDateInput(e.target.value)}
                      className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs"
                      aria-describedby={`liquidated-date-help-${repair.id}`}
                      disabled={liquidatedDateMutation.isPending}
                    />
                    <span id={`liquidated-date-help-${repair.id}`} className="text-[11px] text-gray-500">
                      No se puede elegir una fecha futura.
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    onClick={() => liquidatedDateMutation.mutate(liquidatedDateInput)}
                    disabled={
                      !liquidatedDateInput ||
                      liquidatedDateInput > getMexicoCityToday() ||
                      liquidatedDateMutation.isPending
                    }
                  >
                    {liquidatedDateMutation.isPending ? "Guardando..." : "Guardar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => {
                      setIsCapturingLiquidatedDate(false);
                      setLiquidatedDateInput("");
                    }}
                    disabled={liquidatedDateMutation.isPending}
                  >
                    Cancelar
                  </Button>
                  {liquidatedDateMutation.isError && (
                    <p role="alert" className="w-full text-xs text-red-700">
                      {(liquidatedDateMutation.error as Error)?.message || "No se pudo guardar la fecha. Inténtalo de nuevo."}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Info estática — clickeable para navegar */}
          <div
            className="flex items-center gap-2 text-gray-700 cursor-pointer"
            onClick={() => setLocation(`/repairs/${repair.id}`)}
          >
            <Package className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-medium">Equipo:</span>
            <span className="text-xs sm:text-sm ml-auto truncate">{repair.equipment}</span>
          </div>
          <div
            className="flex items-center gap-2 text-gray-700 cursor-pointer"
            onClick={() => setLocation(`/repairs/${repair.id}`)}
          >
            <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-xs sm:text-sm font-medium">Recibido:</span>
            <span className="text-xs sm:text-sm ml-auto whitespace-nowrap">
              {new Date(repair.receivedDate).toLocaleDateString('es-MX', { 
                day: '2-digit', 
                month: '2-digit', 
                year: '2-digit' 
              })}
            </span>
          </div>
          {repair.deliveryDate && (
            <div
              className="flex items-center gap-2 text-gray-700 cursor-pointer"
              onClick={() => setLocation(`/repairs/${repair.id}`)}
            >
              <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium">Entrega:</span>
              <span className="text-xs sm:text-sm ml-auto whitespace-nowrap">
                {new Date(repair.deliveryDate).toLocaleDateString('es-MX', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: '2-digit' 
                })}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={openDatesDialog}
            className="w-full mt-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors min-h-[36px]"
          >
            <CalendarCog className="w-3.5 h-3.5" />
            Editar fechas
          </button>
        </CardContent>
        <CardFooter className="bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200 py-2 sm:py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-3">
          <div
            className="flex justify-between items-center flex-1 cursor-pointer"
            onClick={() => setLocation(`/repairs/${repair.id}`)}
          >
            <span className="text-xs sm:text-sm font-semibold text-gray-700">Total:</span>
            <span className="text-base sm:text-xl font-bold text-gray-900">{formatCurrency(finalTotal)}</span>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button 
              className="flex-1 sm:flex-none px-2 sm:px-3 py-1 sm:py-1.5 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-xs sm:text-sm font-medium flex items-center justify-center gap-1 flex-shrink-0 min-h-[32px] sm:min-h-auto"
              onClick={(e) => handleEditClick(e, repair.id)}
              title="Editar reparación"
            >
              <i className="ri-edit-line text-sm sm:text-base"></i>
              <span>Editar</span>
            </button>
            <button 
              className="flex-1 sm:flex-none px-2 sm:px-3 py-1 sm:py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-xs sm:text-sm font-medium flex items-center justify-center gap-1 flex-shrink-0 min-h-[32px] sm:min-h-auto disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleDeleteClick}
              title="Eliminar reparación"
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
              <span>Eliminar</span>
            </button>
          </div>
        </CardFooter>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar reparación?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar la reparación <strong>{repair.repairNumber}</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end mt-4">
            <AlertDialogCancel className="sm:min-h-[40px]">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteMutation.mutate(repair.id)}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 sm:min-h-[40px]"
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showDatesDialog} onOpenChange={setShowDatesDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarCog className="w-5 h-5 text-indigo-600" />
              Editar fechas
            </DialogTitle>
            <DialogDescription>
              Reparación <strong>{repair.repairNumber}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor={`receivedDate-${repair.id}`} className="text-sm font-medium">
                Fecha de recibido
              </Label>
              <input
                id={`receivedDate-${repair.id}`}
                type="date"
                value={editReceivedDate}
                onChange={(e) => setEditReceivedDate(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`deliveryDate-${repair.id}`} className="text-sm font-medium">
                Fecha de entrega
              </Label>
              <input
                id={`deliveryDate-${repair.id}`}
                type="date"
                value={editDeliveryDate}
                onChange={(e) => setEditDeliveryDate(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-xs text-gray-500">
                Deja en blanco si la reparación aún no se ha entregado.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDatesDialog(false)}
              disabled={datesMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSaveDates}
              disabled={datesMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {datesMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
