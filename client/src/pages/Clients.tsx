import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { getQueryFn } from "@/lib/queryClient";
import { Client } from "@shared/schema";
import { Loader2, Plus, Search, User, Building2, FileText, DollarSign, Calendar, Mail, Phone, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Clients() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  // Debounce para la búsqueda
  const handleSearchChange = (value: string) => {
    setSearch(value);
    // Debounce de 300ms
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  // Consulta para obtener clientes
  const { data: clients, isLoading } = useQuery({
    queryKey: ['/api/clients', debouncedSearch],
    queryFn: getQueryFn({
      on401: "throw",
      endpoint: `/api/clients${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`
    }),
  });

  // Consulta para obtener estadísticas generales (sin paginación)
  const { data: stats } = useQuery<{
    totalClients: number;
    totalProjects: number;
    totalCotizaciones: number;
    totalCotizado: number;
    totalReportes: number;
    totalEnReportes: number;
  }>({
    queryKey: ['/api/stats'],
    queryFn: getQueryFn({
      on401: "throw",
      endpoint: '/api/stats'
    }),
  });

  return (
    <div className="container mx-auto py-6 space-y-6 bg-gradient-to-br from-gray-50 to-yellow-50/20 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-yellow-600 to-yellow-700 bg-clip-text text-transparent">
            Clientes
          </h1>
          <p className="text-gray-600 font-medium">
            Gestiona tus clientes y sus proyectos
          </p>
        </div>
        <Button 
          onClick={() => setLocation("/clients/new")}
          className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
        >
          <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
        </Button>
      </div>

      {/* Estadísticas rápidas */}
      {stats ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-black">
            <CardContent className="flex items-center p-4">
              <div className="flex-shrink-0">
                <User className="h-8 w-8 text-black" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium">Total Clientes</p>
                <p className="text-2xl font-bold">{stats.totalClients}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-400 to-blue-500 text-white">
            <CardContent className="flex items-center p-4">
              <div className="flex-shrink-0">
                <Building2 className="h-8 w-8 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium">Total Proyectos</p>
                <p className="text-2xl font-bold">{stats.totalProjects}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-400 to-green-500 text-white">
            <CardContent className="flex items-center p-4">
              <div className="flex-shrink-0">
                <FileText className="h-8 w-8 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium">Total Cotizaciones</p>
                <p className="text-2xl font-bold">{stats.totalCotizaciones}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-400 to-purple-500 text-white">
            <CardContent className="flex items-center p-4">
              <div className="flex-shrink-0">
                <DollarSign className="h-8 w-8 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium">Total Cotizado</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(stats.totalCotizado)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-400 to-orange-500 text-white">
            <CardContent className="flex items-center p-4">
              <div className="flex-shrink-0">
                <ClipboardList className="h-8 w-8 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium">Total en Reportes</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(stats.totalEnReportes)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="flex gap-2 items-center max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            type="search"
            placeholder="Buscar por nombre o email..."
            className="pl-8 border-gray-300 focus:border-yellow-500 focus:ring-yellow-500"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : clients && Array.isArray(clients) && clients.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((client: Client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center h-64 bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-l-4 border-l-yellow-500">
          <CardContent className="pt-10 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <User className="h-10 w-10 text-black" />
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">No se encontraron clientes</h3>
            <p className="text-gray-600 mt-2 max-w-md">
              {debouncedSearch
                ? "No hay clientes que coincidan con tu búsqueda. Intenta con otros términos."
                : "Aún no has agregado ningún cliente. Agrega tu primer cliente para comenzar a gestionar tus proyectos."}
            </p>
            {debouncedSearch ? (
              <Button 
                className="mt-6 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold" 
                onClick={() => handleSearchChange("")}
              >
                Limpiar búsqueda
              </Button>
            ) : (
              <Button 
                className="mt-6 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold shadow-lg hover:shadow-xl transition-all duration-200" 
                onClick={() => setLocation("/clients/new")}
              >
                <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ClientCardProps {
  client: Client;
}

function ClientCard({ client }: ClientCardProps) {
  return (
    <Card className="overflow-hidden hover:shadow-xl transition-all duration-300 border-l-4 border-l-yellow-500 bg-gradient-to-br from-white to-yellow-50/30 group">
      <CardHeader className="bg-gradient-to-r from-gray-900 to-black text-white pb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center">
            <Building2 className="w-6 h-6 text-black" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="truncate text-white hover:text-yellow-400 transition-colors">
              <Link href={`/clients/${client.id}`} className="hover:underline">
                {client.name}
              </Link>
            </CardTitle>
            <CardDescription className="truncate text-gray-300 flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {client.email}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="grid grid-cols-2 divide-x divide-gray-200">
          <div className="p-4 text-center bg-gradient-to-br from-yellow-50 to-yellow-100/50 hover:from-yellow-100 hover:to-yellow-150 transition-all duration-200">
            <div className="flex items-center justify-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-yellow-600" />
              <p className="text-gray-700 text-sm font-medium">Proyectos</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{(client as any).projects ? (client as any).projects.length : 0}</p>
          </div>
          <div className="p-4 text-center bg-gradient-to-br from-gray-50 to-gray-100/50 hover:from-gray-100 hover:to-gray-150 transition-all duration-200">
            <div className="flex items-center justify-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-gray-600" />
              <p className="text-gray-700 text-sm font-medium">Cotizaciones</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{client.totalQuotations || 0}</p>
          </div>
        </div>
        
        <div className="p-4 bg-gradient-to-r from-yellow-400/10 to-yellow-500/10 border-t border-yellow-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-yellow-600" />
              <p className="text-gray-700 text-sm font-medium">Total Facturado</p>
            </div>
            <p className="text-xl font-bold text-yellow-700">
              {formatCurrency(parseFloat(client.totalAmount || "0"))}
            </p>
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="bg-gradient-to-r from-gray-900 to-black justify-between py-3">
        <div className="flex items-center gap-1 text-gray-400 text-xs">
          <Calendar className="w-3 h-3" />
          {new Date(client.createdAt).toLocaleDateString('es-MX', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          })}
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          asChild
          className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold transition-all duration-200"
        >
          <Link href={`/clients/${client.id}`}>Ver Detalles</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}