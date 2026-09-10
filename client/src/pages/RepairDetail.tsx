import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Repair, RepairItem } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency, calculateIVA, calculateTotal } from "@/lib/utils";
import { Camera } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";

export default function RepairDetail() {
  const [match, params] = useRoute("/repairs/:id");
  const [, navigate] = useLocation();
  const repairId = match ? parseInt(params?.id || "0") : 0;
  const queryClient = useQueryClient();
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

  const { data: repair, isLoading, error } = useQuery({
    queryKey: ['/api/repairs', repairId],
    queryFn: async () => {
      // Llamada real a la API para obtener la reparación por ID
      const response = await apiRequest(`/api/repairs/${repairId}`);
      return response as Repair;
    },
    enabled: !!repairId,
    refetchOnWindowFocus: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/repairs/${repairId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/repairs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts-receivable'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      toast({
        title: "Reparación eliminada",
        description: "La reparación ha sido eliminada correctamente.",
      });
      navigate("/repairs");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `No se pudo eliminar la reparación: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/repairs/${repairId}/duplicate`, {
        method: 'POST',
      });
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/repairs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts-receivable'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      toast({
        title: "Reparación duplicada",
        description: `Se ha creado una copia con el folio ${data.repairNumber}`,
      });
      navigate(`/repairs/${data.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error al duplicar",
        description: error.message || "No se pudo duplicar la reparación",
        variant: "destructive",
      });
    },
  });

  const handleGeneratePDF = async () => {
    if (!repair) return;
    
    try {
      toast({
        title: "Generando PDF",
        description: "Espere mientras generamos el PDF de la reparación...",
      });
      
      // Importar dinámicamente la función para descargar el PDF
      const { downloadRepairPDF } = await import('@/lib/pdf-generator');
      await downloadRepairPDF(repair.id);
      
      toast({
        title: "PDF generado",
        description: "El PDF de la reparación ha sido generado y descargado correctamente.",
      });
    } catch (error) {
      console.error('Error al generar PDF:', error);
      toast({
        title: "Error",
        description: "Hubo un problema al generar el PDF. Inténtelo nuevamente.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">Pendiente</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Completada</Badge>;
      case 'canceled':
        return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Cancelada</Badge>;
      default:
        return <Badge variant="outline">Desconocido</Badge>;
    }
  };

  // Calcular subtotal, IVA y total dinámicamente desde los items
  const { calculatedSubtotal, calculatedIva, calculatedTotal } = useMemo(() => {
    if (!repair || !repair.items) {
      return { calculatedSubtotal: 0, calculatedIva: 0, calculatedTotal: 0 };
    }

    const subtotal = repair.items.reduce((sum, item) => {
      const quantity = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
      const unitPrice = typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice;
      return sum + ((quantity || 0) * (unitPrice || 0));
    }, 0);

    const iva = repair.includeIVA ? calculateIVA(subtotal) : 0;
    const total = subtotal + iva;

    return {
      calculatedSubtotal: subtotal,
      calculatedIva: iva,
      calculatedTotal: total,
    };
  }, [repair]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !repair) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <h2 className="text-2xl font-bold text-gray-700 mb-4">Reparación no encontrada</h2>
        <p className="text-gray-500 mb-6">No se pudo encontrar la reparación solicitada.</p>
        <Button onClick={() => navigate("/repairs")}>Volver a Reparaciones</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2">
            Orden de Reparación {repair.repairNumber}
            {getStatusBadge(repair.status)}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Cliente: {repair.client?.name || "Cliente no especificado"}
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row sm:space-x-2">
          <Button variant="outline" onClick={() => navigate("/repairs")} className="w-full sm:w-auto">
            <i className="ri-arrow-left-line mr-2"></i>
            Atrás
          </Button>
          <Button variant="outline" onClick={handleGeneratePDF} className="w-full sm:w-auto">
            <i className="ri-file-pdf-line mr-2"></i>
            Exportar PDF
          </Button>
          <Button 
            variant="outline"
            onClick={() => navigate(`/repairs/${repairId}/edit`)}
            className="w-full sm:w-auto"
          >
            <i className="ri-edit-line mr-2"></i>
            Editar
          </Button>
          <AlertDialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full sm:w-auto">
                <i className="ri-delete-bin-line mr-2"></i>
                Eliminar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción eliminará permanentemente la reparación {repair.repairNumber} y no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex justify-end mb-4">
        <Button 
          variant="secondary" 
          className="w-full sm:w-auto bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200"
          onClick={() => duplicateMutation.mutate()}
          disabled={duplicateMutation.isPending}
        >
          <i className="ri-file-copy-line mr-2"></i>
          {duplicateMutation.isPending ? "Duplicando..." : "Duplicar Reporte Actual"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Información del Cliente */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Información del Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-1">
              <span className="font-medium text-sm text-muted-foreground">Nombre:</span>
              <span className="break-words">{repair.client?.name || "No especificado"}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="font-medium text-sm text-muted-foreground">Correo:</span>
              <span className="text-sm break-all overflow-hidden" style={{ wordBreak: 'break-all', overflowWrap: 'anywhere' }}>
                {repair.clientEmail?.trim() || "N/A"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Información del Equipo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Información del Equipo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <span className="font-medium">Equipo:</span>
              <span className="break-all">{repair.equipment}</span>
            </div>
            {repair.serialNumber && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <span className="font-medium">No. Serie:</span>
                <span className="break-all">{repair.serialNumber}</span>
              </div>
            )}
            {repair.model && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <span className="font-medium">Modelo:</span>
                <span className="break-all">{repair.model}</span>
              </div>
            )}
            {repair.equipmentObservations && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <span className="font-medium">Observaciones:</span>
                <span className="break-all">{repair.equipmentObservations}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detalles de la Reparación */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Detalles de la Reparación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {repair.repairManager && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <span className="font-medium">Encargado:</span>
                <span className="break-all">{repair.repairManager}</span>
              </div>
            )}
            {repair.deliveredBy && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <span className="font-medium">Entregado Por:</span>
                <span className="break-all">{repair.deliveredBy}</span>
              </div>
            )}
            {repair.deliveryDate && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <span className="font-medium">Fecha de Recibido:</span>
                <span>
                  {new Date(repair.deliveryDate).toLocaleDateString('es-MX')}
                </span>
              </div>
            )}
            {repair.departureDate && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <span className="font-medium">Fecha de Salida:</span>
                <span>
                  {new Date(repair.departureDate).toLocaleDateString('es-MX')}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Reporte del Cliente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Reporte del Cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              {repair.clientReport || "No hay reporte del cliente"}
            </p>
          </CardContent>
        </Card>

        {/* Fotos de la Reparación */}
        {(repair.image1 || repair.image2 || repair.image3) && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Camera className="w-5 h-5" />
                Fotos de la Reparación
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {repair.image1 && (
                  <div className="flex flex-col items-center">
                    <img 
                      src={repair.image1} 
                      alt="Foto 1" 
                      className="w-full h-40 object-cover rounded-lg border border-gray-200"
                    />
                    <p className="text-xs text-gray-500 mt-2">Foto 1</p>
                  </div>
                )}
                {repair.image2 && (
                  <div className="flex flex-col items-center">
                    <img 
                      src={repair.image2} 
                      alt="Foto 2" 
                      className="w-full h-40 object-cover rounded-lg border border-gray-200"
                    />
                    <p className="text-xs text-gray-500 mt-2">Foto 2</p>
                  </div>
                )}
                {repair.image3 && (
                  <div className="flex flex-col items-center">
                    <img 
                      src={repair.image3} 
                      alt="Foto 3" 
                      className="w-full h-40 object-cover rounded-lg border border-gray-200"
                    />
                    <p className="text-xs text-gray-500 mt-2">Foto 3</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabla de Conceptos */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Conceptos de la Reparación</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">#</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Unidad</TableHead>
                <TableHead className="text-right">Precio Unitario</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repair.items && repair.items.map((item: RepairItem, index: number) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{index + 1}</TableCell>
                  <TableCell>{item.concept}</TableCell>
                  <TableCell className="text-right">{item.quantity.toString()}</TableCell>
                  <TableCell className="text-right">{item.unit}</TableCell>
                  <TableCell className="text-right">{formatCurrency(parseFloat(item.unitPrice.toString()))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(parseFloat(item.subtotal.toString()))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="mt-4 flex justify-end">
            <div className="space-y-2 w-48">
              <div className="flex justify-between">
                <span className="font-medium">Subtotal:</span>
                <span>{formatCurrency(calculatedSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">IVA (16%):</span>
                <span>{formatCurrency(calculatedIva)}</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span>{formatCurrency(calculatedTotal)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}