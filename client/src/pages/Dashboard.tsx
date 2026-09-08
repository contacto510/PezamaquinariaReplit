import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '@/lib/utils';
import type { Quotation, Client, ClientProject } from '@shared/schema';
import type { AccountsReceivableResponse } from '@/types/accounts-receivable';
import { AlertTriangle, ArrowRight } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

interface DashboardStats {
  totalClients: number;
  totalProjects: number;
  totalCotizaciones: number;
  totalCotizado: number;
  totalReportes: number;
  totalEnReportes: number;
}

export default function Dashboard() {
  const [timeRange, setTimeRange] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<string>('overview');

  const { data: dashboardStats, isLoading: isLoadingStats } = useQuery<DashboardStats>({
    queryKey: ['/api/stats'],
    staleTime: 120000,
  });

  const { data: quotations, isLoading: isLoadingQuotations } = useQuery<Quotation[]>({
    queryKey: ['/api/quotations'],
    staleTime: 120000,
  });

  const { data: clients, isLoading: isLoadingClients } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
    staleTime: 120000,
  });

  const { data: receivables } = useQuery<AccountsReceivableResponse>({
    queryKey: ['/api/accounts-receivable'],
    staleTime: 60000,
  });

  const topDebtors = useMemo(() => {
    if (!receivables?.clients) return [];
    return [...receivables.clients].sort((a, b) => b.balance - a.balance).slice(0, 5);
  }, [receivables]);

  // Filtrar cotizaciones según el rango de tiempo seleccionado
  const filteredQuotations = useMemo(() => {
    if (!quotations) return [];
    
    const now = new Date();
    
    switch (timeRange) {
      case 'today':
        return quotations.filter(q => {
          const date = new Date(q.createdAt);
          return date.toDateString() === now.toDateString();
        });
      case 'week':
        const oneWeekAgo = new Date(now);
        oneWeekAgo.setDate(now.getDate() - 7);
        return quotations.filter(q => new Date(q.createdAt) >= oneWeekAgo);
      case 'month':
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(now.getMonth() - 1);
        return quotations.filter(q => new Date(q.createdAt) >= oneMonthAgo);
      case 'year':
        const oneYearAgo = new Date(now);
        oneYearAgo.setFullYear(now.getFullYear() - 1);
        return quotations.filter(q => new Date(q.createdAt) >= oneYearAgo);
      case 'all':
      default:
        return quotations;
    }
  }, [quotations, timeRange]);

  // Calcular estadísticas
  const stats = useMemo(() => {
    if (!filteredQuotations.length) {
      return {
        totalQuotations: 0,
        totalAmount: 0,
        averageAmount: 0,
        totalClients: 0,
        totalWithIVA: 0,
        totalWithoutIVA: 0
      };
    }

    const totalAmount = filteredQuotations.reduce((sum, q) => sum + Number(q.total), 0);
    const uniqueClientEmails = new Set(filteredQuotations.map(q => q.clientEmail));
    const quotationsWithIVA = filteredQuotations.filter(q => Number(q.iva) > 0);
    const quotationsWithoutIVA = filteredQuotations.filter(q => Number(q.iva) <= 0);

    return {
      totalQuotations: filteredQuotations.length,
      totalAmount,
      averageAmount: totalAmount / filteredQuotations.length,
      totalClients: uniqueClientEmails.size,
      totalWithIVA: quotationsWithIVA.length,
      totalWithoutIVA: quotationsWithoutIVA.length
    };
  }, [filteredQuotations]);

  // Datos para el gráfico de tendencias
  const trendData = useMemo(() => {
    if (!filteredQuotations.length) return [];

    const sortedQuotations = [...filteredQuotations].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Agrupar por mes
    const monthlyData: Record<string, { date: string, count: number, amount: number }> = {};
    
    sortedQuotations.forEach(q => {
      const date = new Date(q.createdAt);
      const monthYear = `${date.getMonth() + 1}/${date.getFullYear()}`;
      
      if (!monthlyData[monthYear]) {
        monthlyData[monthYear] = {
          date: monthYear,
          count: 0,
          amount: 0
        };
      }
      
      monthlyData[monthYear].count += 1;
      monthlyData[monthYear].amount += Number(q.total);
    });
    
    return Object.values(monthlyData);
  }, [filteredQuotations]);

  // Datos para el gráfico de distribución por cliente
  const clientDistributionData = useMemo(() => {
    if (!filteredQuotations.length) return [];

    const clientAmounts: Record<string, { name: string, value: number }> = {};
    
    filteredQuotations.forEach(q => {
      if (!clientAmounts[q.clientName]) {
        clientAmounts[q.clientName] = {
          name: q.clientName,
          value: 0
        };
      }
      
      clientAmounts[q.clientName].value += Number(q.total);
    });
    
    // Obtener los 5 clientes principales y agrupar el resto como "Otros"
    const sortedClients = Object.values(clientAmounts).sort((a, b) => b.value - a.value);
    
    if (sortedClients.length <= 5) {
      return sortedClients;
    }
    
    const topClients = sortedClients.slice(0, 5);
    const otherValue = sortedClients.slice(5).reduce((sum, client) => sum + client.value, 0);
    
    return [
      ...topClients,
      { name: 'Otros', value: otherValue }
    ];
  }, [filteredQuotations]);

  // Calcular la distribución de IVA
  const ivaDistributionData = useMemo(() => {
    if (!filteredQuotations.length) return [];

    const withIVA = filteredQuotations.filter(q => Number(q.iva) > 0).length;
    const withoutIVA = filteredQuotations.filter(q => Number(q.iva) <= 0).length;
    
    return [
      { name: 'Con IVA', value: withIVA },
      { name: 'Sin IVA', value: withoutIVA }
    ];
  }, [filteredQuotations]);

  // Preparar cotizaciones recientes para la tabla
  const recentQuotations = useMemo(() => {
    if (!filteredQuotations.length) return [];
    
    return [...filteredQuotations]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [filteredQuotations]);

  const isLoading = isLoadingQuotations || isLoadingClients || isLoadingStats;

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header con diseño corporativo Péza */}
      <div className="peza-header rounded-xl p-6 mb-8">
        <div className="flex flex-col gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-black">
              Tablero Principal
            </h1>
            <p className="mt-2 text-lg text-black/80">
              Resumen ejecutivo de cotizaciones y estadísticas del negocio
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2">
              <i className="ri-calendar-line text-black/60"></i>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="w-[160px] bg-transparent border-none shadow-none text-sm cursor-pointer focus:ring-0"
              >
                <option value="all">Todos los períodos</option>
                <option value="today">Hoy</option>
                <option value="week">Última semana</option>
                <option value="month">Último mes</option>
                <option value="year">Último año</option>
              </select>
            </div>
            <Link href="/quotations">
              <button className="peza-button-secondary w-full sm:w-auto">
                <i className="ri-file-list-line mr-2"></i>
                Ver cotizaciones
              </button>
            </Link>
          </div>
        </div>
      </div>

      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6 bg-white shadow-lg rounded-lg p-1 border border-gray-200">
          <TabsTrigger 
            value="overview" 
            className="px-4 py-2 data-[state=active]:bg-yellow-400 data-[state=active]:text-black data-[state=active]:font-semibold transition-all duration-200"
          >
            <i className="ri-dashboard-line mr-2"></i>
            Resumen
          </TabsTrigger>
          <TabsTrigger 
            value="trends" 
            className="px-4 py-2 data-[state=active]:bg-yellow-400 data-[state=active]:text-black data-[state=active]:font-semibold transition-all duration-200"
          >
            <i className="ri-line-chart-line mr-2"></i>
            Tendencias
          </TabsTrigger>
          <TabsTrigger 
            value="clients" 
            className="px-4 py-2 data-[state=active]:bg-yellow-400 data-[state=active]:text-black data-[state=active]:font-semibold transition-all duration-200"
          >
            <i className="ri-group-line mr-2"></i>
            Clientes
          </TabsTrigger>
        </TabsList>

        {/* Tab: Resumen */}
        <TabsContent value="overview">
          {isLoading ? (
            <div className="text-center py-10">
              <p>Cargando datos...</p>
            </div>
          ) : (
            <>
              {/* KPI Cards con diseño corporativo */}
              <div className="grid gap-4 sm:gap-6 grid-cols-2 lg:grid-cols-4 mb-8">
                <div className="peza-card p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-blue-100 border-l-4 border-blue-500">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-blue-600 mb-1">
                        Cotizaciones
                      </p>
                      <p className="text-2xl sm:text-3xl font-bold text-blue-900">
                        {timeRange === 'all' ? (dashboardStats?.totalCotizaciones ?? stats.totalQuotations) : stats.totalQuotations}
                      </p>
                      <p className="text-xs text-blue-600 mt-1 hidden sm:block">
                        {timeRange === 'all' ? 'Total en el sistema' : 'En el período'}
                      </p>
                    </div>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="ri-file-text-line text-white text-lg sm:text-xl"></i>
                    </div>
                  </div>
                </div>
                
                <div className="peza-card p-4 sm:p-6 bg-gradient-to-br from-green-50 to-green-100 border-l-4 border-green-500">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-green-600 mb-1">
                        Total Cotizado
                      </p>
                      <p className="text-xl sm:text-3xl font-bold text-green-900 truncate">
                        {formatCurrency(timeRange === 'all' ? (dashboardStats?.totalCotizado ?? stats.totalAmount) : stats.totalAmount)}
                      </p>
                      <p className="text-xs text-green-600 mt-1 hidden sm:block">
                        Promedio: {formatCurrency(stats.averageAmount)}
                      </p>
                    </div>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="ri-money-dollar-circle-line text-white text-lg sm:text-xl"></i>
                    </div>
                  </div>
                </div>
                
                <div className="peza-card p-4 sm:p-6 bg-gradient-to-br from-purple-50 to-purple-100 border-l-4 border-purple-500">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-purple-600 mb-1">
                        Clientes
                      </p>
                      <p className="text-2xl sm:text-3xl font-bold text-purple-900">
                        {dashboardStats?.totalClients ?? clients?.length ?? 0}
                      </p>
                      <p className="text-xs text-purple-600 mt-1 hidden sm:block">
                        Total registrados
                      </p>
                    </div>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="ri-user-line text-white text-lg sm:text-xl"></i>
                    </div>
                  </div>
                </div>

                <div className="peza-card p-4 sm:p-6 bg-gradient-to-br from-amber-50 to-amber-100 border-l-4 border-amber-500">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-amber-600 mb-1">
                        Reportes
                      </p>
                      <p className="text-2xl sm:text-3xl font-bold text-amber-900">
                        {dashboardStats?.totalReportes ?? 0}
                      </p>
                      <p className="text-xs text-amber-600 mt-1 hidden sm:block">
                        {formatCurrency(dashboardStats?.totalEnReportes ?? 0)}
                      </p>
                    </div>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <i className="ri-file-chart-line text-white text-lg sm:text-xl"></i>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cuentas por Cobrar - Resumen */}
              <div className="peza-card mb-8 border-l-4 border-red-500">
                <div className="peza-card-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <i className="ri-money-dollar-circle-line text-red-600"></i>
                      Cuentas por Cobrar
                    </h3>
                    <p className="text-sm text-gray-600">
                      Saldo pendiente de reportes de renta
                    </p>
                  </div>
                  <Link href="/accounts-receivable">
                    <button
                      className="peza-button-secondary text-sm flex items-center gap-1"
                      data-testid="button-view-all-receivables"
                    >
                      Ver todo <ArrowRight className="h-4 w-4" />
                    </button>
                  </Link>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div className="bg-red-50 rounded-lg p-3 border-l-4 border-red-500">
                      <p className="text-xs text-red-600 font-medium">Saldo total</p>
                      <p className="text-xl sm:text-2xl font-bold text-red-900 tabular-nums truncate" data-testid="text-dashboard-total-balance">
                        {formatCurrency(receivables?.summary.totalBalance ?? 0)}
                      </p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-3 border-l-4 border-yellow-500">
                      <p className="text-xs text-yellow-700 font-medium">Clientes</p>
                      <p className="text-xl sm:text-2xl font-bold text-yellow-900">
                        {receivables?.summary.clientsCount ?? 0}
                      </p>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-3 border-l-4 border-blue-500">
                      <p className="text-xs text-blue-600 font-medium">Reportes</p>
                      <p className="text-xl sm:text-2xl font-bold text-blue-900">
                        {receivables?.summary.pendingReportsCount ?? 0}
                      </p>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-3 border-l-4 border-orange-500">
                      <p className="text-xs text-orange-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Vencidos
                      </p>
                      <p className="text-xl sm:text-2xl font-bold text-orange-900">
                        {receivables?.summary.overdueClientsCount ?? 0}
                      </p>
                    </div>
                  </div>

                  {topDebtors.length > 0 ? (
                    <>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                        Top 5 clientes con mayor deuda
                      </h4>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="font-semibold">Cliente</TableHead>
                              <TableHead className="text-center font-semibold">Reportes</TableHead>
                              <TableHead className="text-right font-semibold">Saldo</TableHead>
                              <TableHead className="text-center font-semibold">Antigüedad</TableHead>
                              <TableHead className="text-center font-semibold">Acción</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {topDebtors.map((c) => (
                              <TableRow
                                key={c.clientId}
                                className={c.hasOverdue ? "bg-red-50/40" : ""}
                                data-testid={`row-debtor-${c.clientId}`}
                              >
                                <TableCell className="font-medium text-gray-900">
                                  <div className="flex items-center gap-2">
                                    {c.hasOverdue && (
                                      <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                                    )}
                                    <span className="truncate">{c.clientName}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">{c.reportsCount}</TableCell>
                                <TableCell className="text-right font-bold tabular-nums">
                                  {formatCurrency(c.balance)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className={c.hasOverdue ? "text-red-700 font-semibold" : "text-gray-600"}>
                                    {c.oldestDays}d
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <Link href={`/clients/${c.clientId}`}>
                                    <button className="peza-action-button peza-action-edit" title="Ver cliente">
                                      <i className="ri-eye-line text-lg"></i>
                                    </button>
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      ¡No hay clientes con saldo pendiente!
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Quotations */}
              <div className="peza-card mb-8">
                <div className="peza-card-header">
                  <h3 className="text-lg font-semibold text-gray-900">Cotizaciones Recientes</h3>
                  <p className="text-sm text-gray-600">Las últimas 5 cotizaciones creadas</p>
                </div>
                <div className="p-6">
                  {recentQuotations.length > 0 ? (
                    <div className="peza-table">
                      <Table>
                        <TableHeader className="peza-table-header">
                          <TableRow>
                            <TableHead className="w-[100px] text-white font-semibold">No.</TableHead>
                            <TableHead className="text-white font-semibold">Cliente</TableHead>
                            <TableHead className="text-white font-semibold">Proyecto</TableHead>
                            <TableHead className="text-right text-white font-semibold">Total</TableHead>
                            <TableHead className="text-right text-white font-semibold">Fecha</TableHead>
                            <TableHead className="text-center text-white font-semibold">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentQuotations.map((quotation) => (
                            <TableRow key={quotation.id} className="peza-table-row">
                              <TableCell className="font-medium text-gray-900">
                                #{quotation.quotationNumber}
                              </TableCell>
                              <TableCell className="text-gray-900">{quotation.clientName}</TableCell>
                              <TableCell className="text-gray-700">{quotation.projectName || "-"}</TableCell>
                              <TableCell className="text-right font-semibold text-gray-900">
                                {formatCurrency(Number(quotation.total))}
                              </TableCell>
                              <TableCell className="text-right text-gray-700">
                                {new Date(quotation.createdAt).toLocaleDateString()}
                              </TableCell>
                              <TableCell className="text-center">
                                <Link href={`/quotation?edit=${quotation.quotationNumber}`}>
                                  <button className="peza-action-button peza-action-edit" title="Ver cotización">
                                    <i className="ri-eye-line text-lg"></i>
                                  </button>
                                </Link>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i className="ri-file-list-line text-2xl text-gray-400"></i>
                      </div>
                      <p className="text-gray-500">No hay cotizaciones recientes</p>
                    </div>
                  )}
                </div>
              </div>

              {/* IVA Distribution - Versión mejorada */}
              <div className="peza-card">
                <div className="peza-card-header">
                  <h3 className="text-lg font-semibold text-gray-900">Distribución de IVA</h3>
                  <p className="text-sm text-gray-600">Proporción de cotizaciones con y sin IVA</p>
                </div>
                <div className="p-6">
                  {ivaDistributionData.length > 0 ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Gráfico de pastel */}
                      <div className="flex justify-center">
                        <div className="w-full h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={ivaDistributionData}
                                cx="50%"
                                cy="50%"
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                              >
                                {ivaDistributionData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.name === 'Con IVA' ? '#10b981' : '#f59e0b'} />
                                ))}
                              </Pie>
                              <Tooltip formatter={(value) => [`${value} cotizaciones`, '']} />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      
                      {/* Estadísticas detalladas */}
                      <div className="flex flex-col justify-center space-y-4">
                        {ivaDistributionData.map((item, index) => {
                          const total = ivaDistributionData.reduce((sum, data) => sum + data.value, 0);
                          const percentage = total > 0 ? (item.value / total) * 100 : 0;
                          const isWithIVA = item.name === 'Con IVA';
                          
                          return (
                            <div key={index} className={`p-4 rounded-lg border-l-4 ${
                              isWithIVA 
                                ? 'bg-green-50 border-green-500' 
                                : 'bg-yellow-50 border-yellow-500'
                            }`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`w-3 h-3 rounded-full ${
                                    isWithIVA ? 'bg-green-500' : 'bg-yellow-500'
                                  }`}></div>
                                  <div>
                                    <p className={`font-semibold ${
                                      isWithIVA ? 'text-green-800' : 'text-yellow-800'
                                    }`}>
                                      {item.name}
                                    </p>
                                    <p className={`text-sm ${
                                      isWithIVA ? 'text-green-600' : 'text-yellow-600'
                                    }`}>
                                      {item.value} cotizaciones
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`text-2xl font-bold ${
                                    isWithIVA ? 'text-green-800' : 'text-yellow-800'
                                  }`}>
                                    {percentage.toFixed(0)}%
                                  </p>
                                </div>
                              </div>
                              
                              {/* Barra de progreso */}
                              <div className="mt-3">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className={`h-2 rounded-full ${
                                      isWithIVA ? 'bg-green-500' : 'bg-yellow-500'
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* Resumen total */}
                        <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <i className="ri-file-list-2-line text-gray-600"></i>
                              <span className="font-medium text-gray-800">Total de cotizaciones</span>
                            </div>
                            <span className="text-2xl font-bold text-gray-900">
                              {ivaDistributionData.reduce((sum, data) => sum + data.value, 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <i className="ri-pie-chart-line text-2xl text-gray-400"></i>
                        </div>
                        <p className="text-gray-500">No hay datos disponibles</p>
                        <p className="text-sm text-gray-400 mt-1">Las cotizaciones aparecerán aquí cuando se creen</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* Tab: Tendencias */}
        <TabsContent value="trends">
          {isLoading ? (
            <div className="text-center py-10">
              <p>Cargando datos...</p>
            </div>
          ) : (
            <>
              <div className="peza-card mb-8">
                <div className="peza-card-header">
                  <h3 className="text-lg font-semibold text-gray-900">Tendencia de Cotizaciones</h3>
                  <p className="text-sm text-gray-600">Número de cotizaciones generadas por mes</p>
                </div>
                <div className="p-6">
                  <div className="w-full h-80">
                    {trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={trendData}
                          margin={{ top: 20, right: 30, left: 20, bottom: 30 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip 
                            formatter={(value, name) => [
                              name === "count" ? `${value} cotizaciones` : formatCurrency(Number(value)),
                              name === "count" ? "Cantidad" : "Monto total"
                            ]}
                          />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="count"
                            name="Cantidad"
                            stroke="#ffcc00"
                            activeDot={{ r: 8 }}
                            strokeWidth={3}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="ri-line-chart-line text-2xl text-yellow-600"></i>
                          </div>
                          <p className="text-gray-500">No hay datos disponibles</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="peza-card">
                <div className="peza-card-header">
                  <h3 className="text-lg font-semibold text-gray-900">Montos por Mes</h3>
                  <p className="text-sm text-gray-600">Total de ingresos por mes</p>
                </div>
                <div className="p-6">
                  <div className="w-full h-80">
                    {trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={trendData}
                          margin={{ top: 20, right: 30, left: 20, bottom: 30 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Monto"]} />
                          <Legend />
                          <Bar dataKey="amount" name="Monto" fill="#10b981" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="ri-bar-chart-line text-2xl text-green-600"></i>
                          </div>
                          <p className="text-gray-500">No hay datos disponibles</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* Tab: Clientes */}
        <TabsContent value="clients">
          {isLoading ? (
            <div className="text-center py-10">
              <p>Cargando datos...</p>
            </div>
          ) : (
            <>
              <div className="peza-card mb-8">
                <div className="peza-card-header">
                  <h3 className="text-lg font-semibold text-gray-900">Distribución por Cliente</h3>
                  <p className="text-sm text-gray-600">Montos totales por cliente</p>
                </div>
                <div className="p-6">
                  <div className="w-full h-80">
                    {clientDistributionData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={clientDistributionData}
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }) => 
                              `${name.length > 15 ? name.substring(0, 15) + '...' : name}: ${(percent * 100).toFixed(0)}%`
                            }
                          >
                            {clientDistributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Monto"]} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <i className="ri-pie-chart-line text-2xl text-purple-600"></i>
                          </div>
                          <p className="text-gray-500">No hay datos disponibles</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Top Clients */}
              <div className="peza-card">
                <div className="peza-card-header">
                  <h3 className="text-lg font-semibold text-gray-900">Clientes Principales</h3>
                  <p className="text-sm text-gray-600">Por monto total de cotizaciones</p>
                </div>
                <div className="p-6">
                  {clientDistributionData.length > 0 ? (
                    <div className="w-full h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={clientDistributionData.filter(client => client.name !== 'Otros').slice(0, 10)}
                          layout="vertical"
                          margin={{ top: 20, right: 30, left: 40, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            width={150}
                            tick={({ x, y, payload }: any) => (
                              <text x={x} y={y} dy={4} textAnchor="end" fill="#666" fontSize={12}>
                                {payload.value?.length > 15 ? payload.value.substring(0, 15) + '...' : payload.value}
                              </text>
                            )}
                          />
                          <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Monto"]} />
                          <Bar dataKey="value" name="Monto" fill="#ffcc00" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-64">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <i className="ri-bar-chart-horizontal-line text-2xl text-yellow-600"></i>
                        </div>
                        <p className="text-gray-500">No hay datos disponibles</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}