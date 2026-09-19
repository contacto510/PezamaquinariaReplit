import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import type { Quotation } from "@shared/schema";
import { formatCurrency } from "@/lib/utils";
import { downloadEnhancedQuotationPDF, generateEnhancedQuotationPDF } from "@/lib/enhanced-pdf-generator";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function QuotationList() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "number" | "client" | "email">("all");
  const [sortBy, setSortBy] = useState<"date" | "number" | "total">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [emailDialog, setEmailDialog] = useState<{open: boolean, quotation?: Quotation, emailContent?: string}>({ open: false });
  const [selectedQuotations, setSelectedQuotations] = useState<number[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState<{open: boolean, quotationId?: number, isMultiple?: boolean}>({ open: false });
  const [duplicatingQuotationId, setDuplicatingQuotationId] = useState<number | null>(null);
  const duplicateInFlightRef = useRef(false);

  // Fetch quotations
  const { data: quotations, isLoading, isError } = useQuery<Quotation[]>({
    queryKey: ['/api/quotations'],
  });

  // Filter quotations based on search term and filter type
  const filteredQuotations = quotations?.filter(q => {
    if (!searchTerm) return true;
    
    switch (filterType) {
      case "number":
        return q.quotationNumber.toString().includes(searchTerm);
      case "client":
        return q.clientName.toLowerCase().includes(searchTerm.toLowerCase());
      case "email":
        return q.clientEmail.toLowerCase().includes(searchTerm.toLowerCase());
      case "all":
        return (
          q.quotationNumber.toString().includes(searchTerm) ||
          q.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          q.clientEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
          q.projectName?.toLowerCase().includes(searchTerm.toLowerCase())
        );
      default:
        return true;
    }
  });

  // Sort quotations
  const sortedQuotations = filteredQuotations?.sort((a, b) => {
    let comparison = 0;
    
    switch (sortBy) {
      case "date":
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        break;
      case "number":
        comparison = a.quotationNumber - b.quotationNumber;
        break;
      case "total":
        comparison = Number(a.total) - Number(b.total);
        break;
    }
    
    return sortOrder === "asc" ? comparison : -comparison;
  });

  // Handle download PDF
  const handleDownloadPDF = async (quotationNumber: number) => {
    try {
      toast({
        title: "Preparando PDF",
        description: `Generando PDF para la cotización #${quotationNumber}`
      });
      
      await downloadEnhancedQuotationPDF(quotationNumber);
      
      toast({
        title: "PDF generado",
        description: `El PDF para la cotización #${quotationNumber} ha sido descargado con iconos de redes sociales`
      });
    } catch (error) {
      console.error("Error downloading PDF:", error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : "No se pudo generar el PDF. Intente nuevamente.";
      
      toast({
        title: "Error al generar PDF",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  // Handle send email
  const handleSendEmail = async (quotation: Quotation) => {
    try {
      if (!quotation.clientEmail) {
        toast({
          title: "Email no disponible",
          description: "El cliente no tiene un email registrado",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Preparando email",
        description: `Generando PDF y abriendo Zoho Mail para cotización #${quotation.quotationNumber}`
      });

      const subject = `Cotización #${quotation.quotationNumber} - Péza Maquinaria`;
      const totalAmount = typeof quotation.total === 'string' ? parseFloat(quotation.total) : quotation.total;
      
      const emailBody = `Estimado(a) ${quotation.clientName},

Adjunto encontrará la cotización #${quotation.quotationNumber} solicitada.

Detalles de la cotización:
- Cliente: ${quotation.clientName}
- Proyecto: ${quotation.projectName || 'N/A'}
- Total: $${totalAmount?.toFixed(2)} MXN

Si tiene alguna pregunta o requiere modificaciones, no dude en contactarnos.

Atentamente,
Péza Maquinaria
contacto@pezamaquinaria.com.mx
www.pezamaquinaria.com.mx`;

      setEmailDialog({
        open: true,
        quotation: quotation,
        emailContent: emailBody
      });

      try {
        await downloadEnhancedQuotationPDF(quotation.quotationNumber);
        toast({
          title: "PDF descargado",
          description: `PDF generado correctamente. Ahora puedes copiar la información del email.`,
          duration: 5000
        });
      } catch (pdfError) {
        console.error("Error específico al descargar PDF:", pdfError);
        toast({
          title: "Error al generar PDF",
          description: "No se pudo generar el PDF, pero puedes continuar con el email.",
          variant: "destructive"
        });
      }

    } catch (error) {
      console.error("Error general en handleSendEmail:", error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : "No se pudo preparar el email. Intente nuevamente.";
      
      toast({
        title: "Error al preparar email",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };
  
  // Handle edit quotation
  const handleEditQuotation = (quotationNumber: number) => {
    window.location.href = `/quotation?edit=${quotationNumber}`;
  };

  // Handle duplicate quotation
  const handleDuplicateQuotation = async (quotation: Quotation) => {
    // State updates are asynchronous, so use a ref to guard rapid double clicks.
    if (duplicateInFlightRef.current) return;

    duplicateInFlightRef.current = true;
    setDuplicatingQuotationId(quotation.id);

    try {
      const duplicatedQuotation = await apiRequest(`/api/quotations/${quotation.id}/duplicate`, {
        method: "POST"
      }) as Quotation;

      if (!duplicatedQuotation?.quotationNumber) {
        throw new Error("El servidor no devolvió el número de la nueva cotización.");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/quotations'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/clients'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/stats'] })
      ]);

      toast({
        title: "Cotización duplicada",
        description: `Se creó la cotización COT-${duplicatedQuotation.quotationNumber}.`
      });

      handleEditQuotation(duplicatedQuotation.quotationNumber);
    } catch (error) {
      console.error("Error duplicating quotation:", error);

      let errorMessage = "No se pudo duplicar la cotización. Intente nuevamente.";
      if (error instanceof Error && error.message) {
        const responseMessage = error.message.replace(/^\d+:\s*/, "");
        try {
          const parsed = JSON.parse(responseMessage);
          errorMessage = parsed.message || parsed.error || responseMessage;
        } catch {
          errorMessage = responseMessage;
        }
      }

      toast({
        title: "Error al duplicar",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      duplicateInFlightRef.current = false;
      setDuplicatingQuotationId(null);
    }
  };

  // Handle selection changes
  const handleSelectQuotation = (quotationId: number, checked: boolean) => {
    if (checked) {
      setSelectedQuotations(prev => [...prev, quotationId]);
    } else {
      setSelectedQuotations(prev => prev.filter(id => id !== quotationId));
    }
  };

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = sortedQuotations?.map(q => q.id) || [];
      setSelectedQuotations(allIds);
    } else {
      setSelectedQuotations([]);
    }
  };

  // Handle delete single quotation
  const handleDeleteSingle = (quotationId: number) => {
    setShowDeleteDialog({ open: true, quotationId, isMultiple: false });
  };

  // Handle delete multiple quotations
  const handleDeleteMultiple = () => {
    setShowDeleteDialog({ open: true, isMultiple: true });
  };

  // Confirm delete operation
  const confirmDelete = async () => {
    try {
      const idsToDelete = showDeleteDialog.isMultiple 
        ? selectedQuotations 
        : showDeleteDialog.quotationId ? [showDeleteDialog.quotationId] : [];

      if (idsToDelete.length === 0) return;

      toast({
        title: "Eliminando cotizaciones",
        description: `Eliminando ${idsToDelete.length} cotización(es)...`
      });

      for (const id of idsToDelete) {
        await apiRequest(`/api/quotations/${id}`, {
          method: 'DELETE'
        });
      }

      queryClient.invalidateQueries({ queryKey: ['/api/quotations'] });
      setSelectedQuotations([]);
      setShowDeleteDialog({ open: false });

      toast({
        title: "Cotizaciones eliminadas",
        description: `Se eliminaron ${idsToDelete.length} cotización(es) exitosamente`
      });

    } catch (error) {
      console.error("Error deleting quotations:", error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : "No se pudieron eliminar las cotizaciones. Intente nuevamente.";
      
      toast({
        title: "Error al eliminar",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  // Render modern table view
  const renderTableView = () => (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      <div className="w-full overflow-hidden">
        <Table className="w-full table-fixed">
          <TableHeader>
            <TableRow className="bg-gradient-to-r from-yellow-50 to-gray-50 border-b-2 border-yellow-200">
              <TableHead className="w-[5%] px-2">
                <Checkbox
                  checked={selectedQuotations.length === sortedQuotations?.length && sortedQuotations.length > 0}
                  onCheckedChange={handleSelectAll}
                  className="border-gray-400"
                />
              </TableHead>
              <TableHead className="w-[11%] px-2 font-semibold text-gray-800">
                <div className="flex flex-wrap items-center gap-1">
                  <i className="ri-hashtag text-yellow-600"></i>
                  No. Cotización
                </div>
              </TableHead>
              <TableHead className="w-[13%] px-2 font-semibold text-gray-800">
                <div className="flex flex-wrap items-center gap-1">
                  <i className="ri-user-line text-blue-600"></i>
                  Cliente
                </div>
              </TableHead>
              <TableHead className="w-[17%] px-2 font-semibold text-gray-800">
                <div className="flex flex-wrap items-center gap-1">
                  <i className="ri-mail-line text-green-600"></i>
                  Email
                </div>
              </TableHead>
              <TableHead className="w-[13%] px-2 font-semibold text-gray-800">
                <div className="flex flex-wrap items-center gap-1">
                  <i className="ri-building-line text-purple-600"></i>
                  Proyecto
                </div>
              </TableHead>
              <TableHead className="w-[11%] px-2 text-right font-semibold text-gray-800">
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <i className="ri-money-dollar-circle-line text-green-600"></i>
                  Total
                </div>
              </TableHead>
              <TableHead className="w-[11%] px-2 text-right font-semibold text-gray-800">
                <div className="flex flex-wrap items-center justify-end gap-1">
                  <i className="ri-calendar-line text-indigo-600"></i>
                  Fecha
                </div>
              </TableHead>
              <TableHead className="w-[19%] px-2 text-center font-semibold text-gray-800">
                <div className="flex flex-wrap items-center justify-center gap-1">
                  <i className="ri-settings-line text-gray-600"></i>
                  Acciones
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedQuotations?.map((quotation, index) => (
              <TableRow 
                key={quotation.id} 
                className={`
                  ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} 
                  hover:bg-yellow-50 transition-colors duration-200 border-b border-gray-100
                `}
              >
                <TableCell className="px-2">
                  <Checkbox
                    checked={selectedQuotations.includes(quotation.id)}
                    onCheckedChange={(checked) => handleSelectQuotation(quotation.id, checked as boolean)}
                    className="border-gray-400"
                  />
                </TableCell>
                <TableCell className="px-2 font-bold text-gray-900">
                  <div className="flex min-w-0 items-center">
                    <Badge variant="outline" className="max-w-full whitespace-normal break-all bg-yellow-100 text-yellow-800 border-yellow-300">
                      COT-{quotation.quotationNumber}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="px-2 font-medium text-gray-800">
                  <span className="block break-words">{quotation.clientName}</span>
                </TableCell>
                <TableCell className="px-2 text-gray-600">
                  <div className="min-w-0">
                    <span className="block break-all text-sm">{quotation.clientEmail}</span>
                  </div>
                </TableCell>
                <TableCell className="px-2 text-gray-600">
                  <span className="block break-words">
                    {quotation.projectName || <span className="text-gray-400 italic">Sin proyecto</span>}
                  </span>
                </TableCell>
                <TableCell className="px-2 text-right">
                  <div className="break-words font-bold text-green-700">
                    {formatCurrency(Number(quotation.total))}
                  </div>
                </TableCell>
                <TableCell className="px-2 text-right text-gray-600">
                  <div className="flex flex-col items-end">
                    <span className="text-sm">
                      {new Date(quotation.createdAt).toLocaleDateString('es-MX', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(quotation.createdAt).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="px-2 text-center">
                  <div className="grid grid-cols-2 gap-1">
                    <Button 
                      size="sm"
                      onClick={() => handleEditQuotation(quotation.quotationNumber)}
                      className="h-auto min-w-0 whitespace-normal bg-blue-500 px-1 py-1 text-xs leading-tight text-white transition-colors hover:bg-blue-600"
                      title="Editar cotización"
                    >
                      <i className="ri-edit-line mr-1 text-xs"></i>
                      Editar
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => handleDownloadPDF(quotation.quotationNumber)}
                      className="h-auto min-w-0 whitespace-normal bg-red-500 px-1 py-1 text-xs leading-tight text-white transition-colors hover:bg-red-600"
                      title="Descargar PDF"
                    >
                      <i className="ri-file-pdf-line mr-1 text-xs"></i>
                      PDF
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => handleSendEmail(quotation)}
                      disabled={!quotation.clientEmail}
                      className="h-auto min-w-0 whitespace-normal bg-green-500 px-1 py-1 text-xs leading-tight text-white transition-colors hover:bg-green-600 disabled:opacity-50"
                      title={!quotation.clientEmail ? "Sin email registrado" : "Enviar por email"}
                    >
                      <i className="ri-mail-send-line mr-1 text-xs"></i>
                      Email
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleDuplicateQuotation(quotation)}
                      disabled={duplicatingQuotationId !== null}
                      className="col-span-2 h-auto min-w-0 whitespace-normal bg-amber-500 px-1 py-1 text-xs leading-tight text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
                      title="Duplicar cotización"
                    >
                      <i className={`${duplicatingQuotationId === quotation.id ? "ri-loader-4-line animate-spin" : "ri-file-copy-line"} mr-1 text-xs`}></i>
                      {duplicatingQuotationId === quotation.id ? "Duplicando..." : "Duplicar Cotización"}
                    </Button>
                    <Button 
                      size="sm"
                      onClick={() => handleDeleteSingle(quotation.id)}
                      className="col-span-2 h-auto min-w-0 whitespace-normal bg-red-600 px-1 py-1 text-xs leading-tight text-white transition-colors hover:bg-red-700"
                      title="Eliminar cotización"
                    >
                      <i className="ri-delete-bin-line mr-1 text-xs"></i>
                      Eliminar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  // Render modern cards view
  const renderCardsView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {sortedQuotations?.map((quotation) => (
        <Card key={quotation.id} className="group hover:shadow-xl transition-all duration-300 border-gray-200 hover:border-yellow-300">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedQuotations.includes(quotation.id)}
                  onCheckedChange={(checked) => handleSelectQuotation(quotation.id, checked as boolean)}
                  className="border-gray-400"
                />
                <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                  COT-{quotation.quotationNumber}
                </Badge>
              </div>
              <div className="text-right">
                <div className="font-bold text-green-700 text-lg">
                  {formatCurrency(Number(quotation.total))}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(quotation.createdAt).toLocaleDateString('es-MX')}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <i className="ri-user-line"></i>
                  <span>Cliente</span>
                </div>
                <div className="font-medium text-gray-900 break-words">
                  {quotation.clientName}
                </div>
              </div>
              
              <div>
                <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                  <i className="ri-mail-line"></i>
                  <span>Email</span>
                </div>
                <div className="text-sm text-gray-700 break-all">
                  {quotation.clientEmail}
                </div>
              </div>
              
              {quotation.projectName && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <i className="ri-building-line"></i>
                    <span>Proyecto</span>
                  </div>
                  <div className="text-sm text-gray-700 break-words">
                    {quotation.projectName}
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-gray-100">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleEditQuotation(quotation.quotationNumber)}
                  className="w-full text-blue-600 border-blue-300 hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-colors"
                >
                  <i className="ri-edit-line mr-1"></i>
                  Editar
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleDownloadPDF(quotation.quotationNumber)}
                  className="w-full text-red-600 border-red-300 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                >
                  <i className="ri-file-pdf-line mr-1"></i>
                  PDF
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleSendEmail(quotation)}
                  disabled={!quotation.clientEmail}
                  className="w-full text-green-600 border-green-300 hover:bg-green-500 hover:text-white hover:border-green-500 disabled:opacity-50 transition-colors"
                >
                  <i className="ri-mail-send-line mr-1"></i>
                  Email
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDuplicateQuotation(quotation)}
                  disabled={duplicatingQuotationId !== null}
                  className="h-auto w-full whitespace-normal border-amber-300 text-amber-700 transition-colors hover:border-amber-500 hover:bg-amber-500 hover:text-white disabled:opacity-50"
                >
                  <i className={`${duplicatingQuotationId === quotation.id ? "ri-loader-4-line animate-spin" : "ri-file-copy-line"} mr-1`}></i>
                  {duplicatingQuotationId === quotation.id ? "Duplicando..." : "Duplicar Cotización"}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleDeleteSingle(quotation.id)}
                  className="h-auto w-full whitespace-normal text-red-600 border-red-300 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                >
                  <i className="ri-delete-bin-line mr-1"></i>
                  Eliminar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="w-full max-w-7xl mx-auto p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-lg">
              <i className="ri-file-list-3-line text-white text-xl"></i>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Cotizaciones
            </h1>
          </div>
          <p className="text-gray-600">
            Administra todas las cotizaciones de Péza Maquinaria
          </p>
        </div>
        <div className="mt-4 lg:mt-0 lg:ml-4">
          <Link href="/quotation">
            <Button className="w-full lg:w-auto bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-black font-semibold shadow-lg">
              <i className="ri-add-line mr-2"></i>
              Nueva Cotización
            </Button>
          </Link>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              <Input
                type="text"
                placeholder="Buscar cotizaciones..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10 border-gray-300 focus:border-yellow-400 focus:ring-yellow-400"
              />
            </div>
          </div>
          
          {/* Filter Type */}
          <div className="lg:w-48">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as "all" | "number" | "client" | "email")}
              className="w-full h-10 text-sm border border-gray-300 rounded-md px-3 bg-white cursor-pointer focus:border-yellow-400 focus:ring-yellow-400"
            >
              <option value="all">Todos los campos</option>
              <option value="number">Número</option>
              <option value="client">Cliente</option>
              <option value="email">Email</option>
            </select>
          </div>
          
          {/* Sort */}
          <div className="lg:w-48">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "date" | "number" | "total")}
              className="w-full h-10 text-sm border border-gray-300 rounded-md px-3 bg-white cursor-pointer focus:border-yellow-400 focus:ring-yellow-400"
            >
              <option value="date">Fecha</option>
              <option value="number">Número</option>
              <option value="total">Total</option>
            </select>
          </div>
          
          {/* Sort Order */}
          <div className="lg:w-40">
            <Button
              variant="outline"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="h-10 w-full border-gray-300 hover:border-yellow-400"
              title={`Ordenar ${sortOrder === "asc" ? "descendente" : "ascendente"}`}
            >
              <i className={`ri-sort-${sortOrder === "asc" ? "asc" : "desc"}-line mr-2`}></i>
              {sortOrder === "asc" ? "Menor a Mayor" : "Mayor a Menor"}
            </Button>
          </div>
          
          {/* View Mode */}
          <div className="hidden lg:flex border border-gray-300 rounded-lg overflow-hidden">
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="rounded-none h-10 px-4"
            >
              <i className="ri-table-line"></i>
            </Button>
            <Button
              variant={viewMode === "cards" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("cards")}
              className="rounded-none h-10 px-4"
            >
              <i className="ri-grid-line"></i>
            </Button>
          </div>
        </div>
      </div>

      {/* Delete selected banner */}
      {selectedQuotations.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <i className="ri-checkbox-multiple-line text-red-600 text-xl"></i>
              <span className="text-red-700 font-medium">
                {selectedQuotations.length} cotización(es) seleccionada(s)
              </span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteMultiple}
              className="hover:bg-red-600"
            >
              <i className="ri-delete-bin-line mr-2"></i>
              Eliminar Seleccionadas
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500"></div>
            <span className="text-gray-600">Cargando cotizaciones...</span>
          </div>
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <div className="inline-flex items-center gap-3 text-red-500">
            <i className="ri-error-warning-line text-xl"></i>
            <span>Error al cargar las cotizaciones</span>
          </div>
        </div>
      ) : sortedQuotations && sortedQuotations.length > 0 ? (
        <>
          {/* Statistics */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <i className="ri-file-list-line text-white"></i>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-900">
                    {sortedQuotations.length}
                  </div>
                  <div className="text-sm text-blue-700">Total de cotizaciones</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500 rounded-lg">
                  <i className="ri-money-dollar-circle-line text-white"></i>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-900">
                    {formatCurrency(sortedQuotations.reduce((sum, q) => sum + Number(q.total), 0))}
                  </div>
                  <div className="text-sm text-green-700">Valor total</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 p-4 rounded-lg border border-yellow-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500 rounded-lg">
                  <i className="ri-calendar-line text-white"></i>
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-900">
                    {formatCurrency(sortedQuotations.reduce((sum, q) => sum + Number(q.total), 0) / sortedQuotations.length)}
                  </div>
                  <div className="text-sm text-yellow-700">Promedio</div>
                </div>
              </div>
            </div>
          </div>

          {/* Content based on view mode */}
          <div className="hidden lg:block">
            {viewMode === "table" ? renderTableView() : renderCardsView()}
          </div>
          <div className="lg:hidden">{renderCardsView()}</div>
        </>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-gray-100 rounded-full">
              <i className="ri-file-list-line text-4xl text-gray-400"></i>
            </div>
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No se encontraron cotizaciones
              </h3>
              {searchTerm ? (
                <div className="space-y-2">
                  <p className="text-gray-500">
                    No hay cotizaciones que coincidan con "{searchTerm}"
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={() => setSearchTerm("")}
                    className="hover:bg-gray-50"
                  >
                    <i className="ri-close-line mr-2"></i>
                    Limpiar búsqueda
                  </Button>
                </div>
              ) : (
                <p className="text-gray-500">
                  Comienza creando tu primera cotización
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Email Dialog */}
      <Dialog open={emailDialog.open} onOpenChange={(open) => setEmailDialog({ open })}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <i className="ri-mail-send-line text-green-600"></i>
              Enviar Cotización por Email
            </DialogTitle>
          </DialogHeader>
          
          {emailDialog.quotation && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="font-semibold text-base flex items-center gap-2">
                    <i className="ri-user-line text-blue-600"></i>
                    Para:
                  </label>
                  <div className="p-3 bg-gray-50 rounded border mt-1">
                    {emailDialog.quotation.clientEmail}
                  </div>
                </div>
                <div>
                  <label className="font-semibold text-base flex items-center gap-2">
                    <i className="ri-price-tag-line text-purple-600"></i>
                    Asunto:
                  </label>
                  <div className="p-3 bg-gray-50 rounded border mt-1">
                    Cotización #{emailDialog.quotation.quotationNumber} - Péza Maquinaria
                  </div>
                </div>
              </div>

              <div>
                <label className="font-semibold text-base flex items-center gap-2">
                  <i className="ri-message-line text-green-600"></i>
                  Mensaje:
                </label>
                <Textarea 
                  value={emailDialog.emailContent || ''} 
                  readOnly
                  className="h-64 font-mono text-sm mt-2"
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={() => {
                    window.open('https://mail.zoho.com/zm/#compose', '_blank');
                    
                    const emailInfo = `Para: ${emailDialog.quotation?.clientEmail}
Asunto: Cotización #${emailDialog.quotation?.quotationNumber} - Péza Maquinaria

${emailDialog.emailContent}`;
                    
                    navigator.clipboard.writeText(emailInfo);
                    
                    toast({
                      title: "Zoho Mail abierto",
                      description: "Se abrió Zoho Mail web y se copió toda la información al portapapeles. Solo pega el contenido y adjunta el PDF descargado.",
                      duration: 8000
                    });
                  }}
                  className="flex-1 bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-black"
                >
                  <i className="ri-mail-line mr-2"></i>
                  Abrir Zoho Mail + Copiar Todo
                </Button>
                
                <Button 
                  onClick={() => {
                    navigator.clipboard.writeText(emailDialog.quotation?.clientEmail || '');
                    toast({
                      title: "Email copiado",
                      description: "Email del cliente copiado al portapapeles"
                    });
                  }}
                  variant="outline"
                  size="sm"
                  className="hover:bg-gray-50"
                >
                  <i className="ri-at-line mr-2"></i>
                  Copiar Email
                </Button>
                
                <Button 
                  onClick={() => {
                    const subject = `Cotización #${emailDialog.quotation?.quotationNumber} - Péza Maquinaria`;
                    navigator.clipboard.writeText(subject);
                    toast({
                      title: "Asunto copiado",
                      description: "Asunto copiado al portapapeles"
                    });
                  }}
                  variant="outline"
                  size="sm"
                  className="hover:bg-gray-50"
                >
                  <i className="ri-price-tag-3-line mr-2"></i>
                  Copiar Asunto
                </Button>
                
                <Button 
                  onClick={() => {
                    navigator.clipboard.writeText(emailDialog.emailContent || '');
                    toast({
                      title: "Mensaje copiado",
                      description: "Mensaje copiado al portapapeles"
                    });
                  }}
                  variant="outline"
                  size="sm"
                  className="hover:bg-gray-50"
                >
                  <i className="ri-file-copy-line mr-2"></i>
                  Copiar Mensaje
                </Button>
              </div>

              <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
                <div className="flex items-start gap-3">
                  <i className="ri-information-line text-blue-600 mt-0.5"></i>
                  <div>
                    <strong>Instrucciones:</strong>
                    <br />
                    1. Se descargó el PDF automáticamente: <strong>Cotizacion_{emailDialog.quotation?.quotationNumber}.pdf</strong>
                    <br />
                    2. Haz clic en "Abrir Zoho Mail + Copiar Todo" para abrir Zoho Mail
                    <br />
                    3. En Zoho Mail: pega la información (Ctrl+V) y adjunta manualmente el PDF descargado
                    <br />
                    4. El PDF estará en tu carpeta de Descargas
                    <br />
                    <br />
                    <strong>Nota:</strong> Por seguridad del navegador, no es posible adjuntar automáticamente archivos. Debes adjuntarlo manualmente.
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog.open} onOpenChange={(open) => setShowDeleteDialog({ open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <i className="ri-delete-bin-line text-red-600"></i>
              Confirmar eliminación
            </AlertDialogTitle>
            <AlertDialogDescription>
              {showDeleteDialog.isMultiple 
                ? `¿Está seguro de que desea eliminar ${selectedQuotations.length} cotización(es)? Esta acción no se puede deshacer.`
                : "¿Está seguro de que desea eliminar esta cotización? Esta acción no se puede deshacer."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              <i className="ri-delete-bin-line mr-2"></i>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}