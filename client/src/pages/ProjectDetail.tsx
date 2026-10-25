import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { 
  ArrowLeft, 
  Building2, 
  FileText, 
  Calendar, 
  DollarSign,
  Eye,
  Download,
  Plus,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";

interface ProjectQuotation {
  id: number;
  quotationNumber: number;
  clientName: string;
  projectName: string;
  totalAmount: string;
  iva: string;
  grandTotal: string;
  createdAt: string;
  items: {
    id: number;
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }[];
}

interface ProjectData {
  id: number;
  name: string;
  clientId: number;
  clientName: string;
  createdAt: string;
  quotations: ProjectQuotation[];
  totalQuotations: number;
  totalAmount: string;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(amount);
}

export default function ProjectDetail() {
  const params = useParams();
  const projectId = params.projectId;
  const clientId = params.clientId;

  const { data: project, isLoading, error } = useQuery<ProjectData>({
    queryKey: ['/api/projects', projectId, 'detailed'],
    enabled: !!projectId
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="container mx-auto p-6">
        <Card className="text-center py-12">
          <CardContent>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Proyecto no encontrado</h2>
            <p className="text-gray-600 mb-4">No se pudo cargar la información del proyecto.</p>
            <Button asChild>
              <Link href={`/clients/${clientId}`}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Volver al Cliente
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild className="text-gray-600 hover:text-gray-900">
              <Link href={`/clients/${clientId}`}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Volver al Cliente
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-lg flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-black" />
                </div>
                {project.name}
              </h1>
              <p className="text-gray-600 mt-1">
                Cliente: {project.clientName} • Creado: {format(new Date(project.createdAt), "d 'de' MMMM 'de' yyyy", { locale: es })}
              </p>
            </div>
          </div>
          <Button 
            asChild
            className="bg-yellow-500 hover:bg-yellow-600 text-black border-yellow-500 hover:border-yellow-600 font-semibold"
          >
            <Link href="/quotation">
              <Plus className="h-4 w-4 mr-1" />
              Nuevo Reporte
            </Link>
          </Button>
        </div>

        {/* Estadísticas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-white to-blue-50 border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-blue-700">
                <FileText className="w-5 h-5" />
                Total de Reportes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-blue-800">{project.totalQuotations || 0}</p>
              <p className="text-sm text-blue-600 mt-1">Reportes generados</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white to-green-50 border-l-4 border-l-green-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-green-700">
                <DollarSign className="w-5 h-5" />
                Valor Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-800">
                {formatCurrency(parseFloat(project.totalAmount || "0"))}
              </p>
              <p className="text-sm text-green-600 mt-1">Monto total cotizado</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-white to-yellow-50 border-l-4 border-l-yellow-500 hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-yellow-700">
                <Calendar className="w-5 h-5" />
                Estado del Proyecto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                Activo
              </Badge>
              <p className="text-sm text-yellow-600 mt-2">Proyecto en desarrollo</p>
            </CardContent>
          </Card>
        </div>

        {/* Reportes del Proyecto */}
        <Card className="bg-gradient-to-br from-white to-gray-50/50 border-l-4 border-l-gray-500 hover:shadow-lg transition-shadow">
          <CardHeader className="bg-gradient-to-r from-gray-900 to-black text-white">
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileText className="w-6 h-6" />
              Historial de Reportes - OBRA: {project.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {project.quotations && project.quotations.length > 0 ? (
              <div className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gradient-to-r from-gray-100 to-gray-200 hover:bg-gray-200">
                      <TableHead className="font-semibold text-gray-900">Nº Cotización</TableHead>
                      <TableHead className="font-semibold text-gray-900">Fecha</TableHead>
                      <TableHead className="font-semibold text-gray-900">Conceptos</TableHead>
                      <TableHead className="font-semibold text-gray-900 text-right">Subtotal</TableHead>
                      <TableHead className="font-semibold text-gray-900 text-right">IVA</TableHead>
                      <TableHead className="font-semibold text-gray-900 text-right">Total</TableHead>
                      <TableHead className="font-semibold text-gray-900 text-center">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.quotations.map((quotation, index) => (
                      <TableRow 
                        key={quotation.id} 
                        className={`hover:bg-yellow-50 transition-colors ${
                          index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                        }`}
                      >
                        <TableCell className="font-bold text-gray-900">
                          COT-{quotation.quotationNumber.toString().padStart(4, '0')}
                        </TableCell>
                        <TableCell className="text-gray-700">
                          {format(new Date(quotation.createdAt), "d/MM/yyyy", { locale: es })}
                        </TableCell>
                        <TableCell className="text-gray-700">
                          {quotation.items ? quotation.items.length : 0} conceptos
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-900">
                          {formatCurrency(parseFloat(quotation.totalAmount || "0"))}
                        </TableCell>
                        <TableCell className="text-right font-medium text-gray-700">
                          {formatCurrency(parseFloat(quotation.iva || "0"))}
                        </TableCell>
                        <TableCell className="text-right font-bold text-green-700 text-lg">
                          {formatCurrency(parseFloat(quotation.grandTotal || "0"))}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            >
                              <Link href={`/quotations/${quotation.id}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 hover:text-green-800 hover:bg-green-50"
                              onClick={() => {
                                // TODO: Implementar descarga de PDF
                                console.log(`Descargando PDF de cotización ${quotation.quotationNumber}`);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12 bg-gradient-to-br from-yellow-50 to-yellow-100/50">
                <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-black" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">No hay reportes</h3>
                <p className="text-gray-600 mb-4 max-w-md mx-auto">
                  Este proyecto aún no tiene reportes asociados. Crea la primera cotización para comenzar a trabajar en este proyecto.
                </p>
                <Button 
                  asChild
                  className="bg-yellow-500 hover:bg-yellow-600 text-black border-yellow-500 hover:border-yellow-600 font-semibold"
                >
                  <Link href="/quotation">
                    <Plus className="h-4 w-4 mr-1" />
                    Nuevo Reporte
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}