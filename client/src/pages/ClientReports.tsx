import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Search, Download, TrendingUp, Users, DollarSign } from "lucide-react";

interface ClientReport {
  clientId: number;
  clientName: string;
  clientEmail: string;
  totalQuotations: number;
  totalAmount: number;
  lastQuotationDate: string;
  averageQuotationValue: number;
}

export default function ClientReports() {
  const [searchTerm, setSearchTerm] = useState("");
  
  const { data: clientReports, isLoading } = useQuery({
    queryKey: ["/api/reports/clients"],
    enabled: true
  });

  const filteredReports = (clientReports || []).filter((report: ClientReport) =>
    report.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.clientEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalRevenue = filteredReports.reduce((sum: number, report: ClientReport) => sum + report.totalAmount, 0);
  const totalClients = filteredReports.length;
  const averageRevenuePerClient = totalClients > 0 ? totalRevenue / totalClients : 0;

  const handleExportReport = () => {
    // Crear CSV de los reportes
    const csvContent = [
      ["Cliente", "Email", "Total Cotizaciones", "Monto Total", "Última Cotización", "Promedio por Cotización"],
      ...filteredReports.map((report: ClientReport) => [
        report.clientName,
        report.clientEmail,
        report.totalQuotations.toString(),
        report.totalAmount.toString(),
        new Date(report.lastQuotationDate).toLocaleDateString("es-MX"),
        report.averageQuotationValue.toString()
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `reporte_clientes_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Generando reportes de clientes...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold">Reportes de Clientes</h1>
          <p className="text-muted-foreground">
            Análisis detallado de ventas y actividad por cliente
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleExportReport} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClients}</div>
            <p className="text-xs text-muted-foreground">
              Clientes con cotizaciones activas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              Suma de todas las cotizaciones
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Promedio por Cliente</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(averageRevenuePerClient)}</div>
            <p className="text-xs text-muted-foreground">
              Ingreso promedio por cliente
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Busca y filtra los reportes de clientes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o email del cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
            />
          </div>
        </CardContent>
      </Card>

      {/* Reports Table */}
      <Card>
        <CardHeader>
          <CardTitle>Reporte Detallado de Clientes</CardTitle>
          <CardDescription>
            Información completa de actividad y ventas por cliente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-center">Cotizaciones</TableHead>
                  <TableHead className="text-right">Monto Total</TableHead>
                  <TableHead className="text-right">Promedio</TableHead>
                  <TableHead className="text-center">Última Actividad</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="text-muted-foreground">
                        {searchTerm ? "No se encontraron clientes que coincidan con la búsqueda" : "No hay reportes de clientes disponibles"}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReports.map((report: ClientReport) => (
                    <TableRow key={report.clientId}>
                      <TableCell className="font-medium">
                        {report.clientName}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {report.clientEmail}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">
                          {report.totalQuotations}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(report.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(report.averageQuotationValue)}
                      </TableCell>
                      <TableCell className="text-center">
                        {new Date(report.lastQuotationDate).toLocaleDateString("es-MX")}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={report.totalAmount > 1000 ? "default" : "secondary"}
                        >
                          {report.totalAmount > 1000 ? "Cliente Premium" : "Cliente Regular"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}