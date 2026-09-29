import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import QuotationForm from "@/components/QuotationForm";
import QuotationItemsTable from "@/components/QuotationItemsTable";
import { Button } from "@/components/ui/button";
import { calculateTotal, calculateIVA, preparePDFWindowForIOS } from "@/lib/utils";
import type { 
  QuotationFormData, 
  QuotationItemData,
  Quotation,
  QuotationItem
} from "@shared/schema";

export default function Quotation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editQuotationNumber, setEditQuotationNumber] = useState<number | null>(null);
  const [quotationNumber, setQuotationNumber] = useState<number | null>(null);
  const [linkedClientId, setLinkedClientId] = useState<number | null>(null);
  const [clientInfo, setClientInfo] = useState<QuotationFormData>({
    clientName: "",
    clientEmail: "",
    projectName: "",
    rentalPeriod: "",
    salesperson: "",
    includeIVA: true,
  });

  const [items, setItems] = useState<(QuotationItemData & { id?: number })[]>([]);
  const [subtotal, setSubtotal] = useState<number>(0);
  const [iva, setIva] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [isUpdatingAndDownloading, setIsUpdatingAndDownloading] = useState(false);

  // Fetch next quotation number (solo para nuevas cotizaciones)
  const { 
    data: nextNumberData, 
    isLoading: isLoadingNumber,
    isError: isNextNumberError,
    error: nextNumberError,
    refetch: refetchNextNumber
  } = useQuery<{ nextNumber: number }>({
    queryKey: ['/api/quotations/next-number'],
    retry: 3,
    staleTime: 0, // Always get fresh data
    refetchOnWindowFocus: false,
    enabled: !isEditMode // Solo obtener número nuevo cuando NO estamos en modo edición
  });
  
  // Define un tipo para la respuesta de la API
  type QuotationWithItems = Quotation & {
    items: (QuotationItem & { id: number })[]
  };
  
  // Fetch existing quotation data when in edit mode
  const { 
    data: existingQuotation,
    isLoading: isLoadingExistingQuotation,
    isError: isExistingQuotationError,
    error: existingQuotationError
  } = useQuery<QuotationWithItems>({
    queryKey: ['/api/quotations/number', editQuotationNumber],
    enabled: isEditMode && editQuotationNumber !== null,
    refetchOnWindowFocus: false,
  });
  
  // Log para depuración
  useEffect(() => {
    if (isExistingQuotationError) {
      console.error("Error fetching quotation:", existingQuotationError);
    }
  }, [isExistingQuotationError, existingQuotationError]);
  
  // Detect edit mode from URL and auto-fill client info
  useEffect(() => {
    // Parse the URL to check if we're in edit mode
    console.log("URL actual:", window.location.href);
    
    // Usamos window.location para obtener directamente los parámetros
    const urlParams = new URLSearchParams(window.location.search);
    const editParam = urlParams.get('edit');
    const clientIdParam = urlParams.get('clientId');
    const clientNameParam = urlParams.get('clientName');
    const clientEmailParam = urlParams.get('clientEmail');
    
    console.log("Parámetro de edición:", editParam);
    console.log("Parámetros del cliente:", { clientIdParam, clientNameParam, clientEmailParam });
    
    // Si hay parámetros del cliente (viene de ClientDetail), auto-llenar la información
    if (clientIdParam) {
      const parsedClientId = parseInt(clientIdParam, 10);
      if (!isNaN(parsedClientId)) {
        setLinkedClientId(parsedClientId);
      }
      
      if (clientNameParam) {
        console.log("Auto-llenando información del cliente desde URL");
        setClientInfo({
          clientName: decodeURIComponent(clientNameParam),
          clientEmail: clientEmailParam ? decodeURIComponent(clientEmailParam) : "",
          projectName: "",
          rentalPeriod: "",
          salesperson: "",
          includeIVA: true,
        });
      }
    }
    
    if (editParam) {
      const editNumber = parseInt(editParam, 10);
      console.log("Número de edición parseado:", editNumber);
      if (!isNaN(editNumber)) {
        console.log("Activando modo de edición para cotización #", editNumber);
        setIsEditMode(true);
        setEditQuotationNumber(editNumber);
        // Temporalmente usamos el editNumber, pero lo vamos a reemplazar cuando tengamos 
        // los datos reales de la cotización
        setQuotationNumber(editNumber);
      }
    }
  }, []);
  
  // Load existing quotation data when in edit mode
  useEffect(() => {
    console.log("¿Modo edición?", isEditMode);
    console.log("Datos existentes:", existingQuotation);
    
    if (existingQuotation && isEditMode) {
      console.log("Cargando datos de cotización existente:", existingQuotation);
      
      // Actualizar el número de cotización con el valor correcto de la base de datos
      setQuotationNumber(existingQuotation.quotationNumber);
      
      // Cargar datos de la cotización
      setClientInfo({
        clientName: existingQuotation.clientName,
        clientEmail: existingQuotation.clientEmail,
        projectName: existingQuotation.projectName || "",
        rentalPeriod: existingQuotation.rentalPeriod || "",
        salesperson: existingQuotation.salesperson || "",
        includeIVA: existingQuotation.includeIVA
      });
      
      // Cargar conceptos (items)
      if (existingQuotation.items && Array.isArray(existingQuotation.items)) {
        console.log("Cargando items:", existingQuotation.items);
        const formattedItems = existingQuotation.items.map(item => ({
          id: item.id,
          concept: item.concept,
          quantity: Number(item.quantity),
          unit: item.unit,
          unitPrice: Number(item.unitPrice)
        }));
        setItems(formattedItems);
      }
      
      // Actualizar totales
      setSubtotal(Number(existingQuotation.subtotal));
      setIva(Number(existingQuotation.iva));
      setTotal(Number(existingQuotation.total));
      
      // Mostrar notificación de modo edición
      toast({
        title: "Modo de edición",
        description: `Estás editando la cotización #${existingQuotation.quotationNumber}`,
      });
    }
  }, [existingQuotation, isEditMode, toast]);

  useEffect(() => {
    if (nextNumberData && 'nextNumber' in nextNumberData) {
      console.log(`Estableciendo número de cotización: ${nextNumberData.nextNumber}`);
      setQuotationNumber(nextNumberData.nextNumber);
    } else if (isNextNumberError) {
      console.error("Error al obtener el número de cotización:", nextNumberError);
      toast({
        title: "Error",
        description: "No se pudo obtener el número de cotización. Intente recargar la página.",
        variant: "destructive"
      });
    }
  }, [nextNumberData, isNextNumberError, nextNumberError, toast]);

  // Update totals when items change or includeIVA changes
  useEffect(() => {
    const newSubtotal = items.reduce((sum, item) => 
      sum + (item.quantity * item.unitPrice), 0);
    
    // Solo calculamos IVA si la opción está activada
    const newIva = clientInfo.includeIVA ? calculateIVA(newSubtotal) : 0;
    
    // El total es el subtotal + IVA (que puede ser 0)
    const newTotal = clientInfo.includeIVA 
      ? calculateTotal(newSubtotal) 
      : newSubtotal;
    
    setSubtotal(newSubtotal);
    setIva(newIva);
    setTotal(newTotal);
  }, [items, clientInfo.includeIVA]);

  // Save/Update quotation mutation
  const saveQuotationMutation = useMutation({
    mutationFn: async () => {
      if (!quotationNumber) throw new Error("No hay número de cotización");
      if (!clientInfo.clientName) throw new Error("El nombre del cliente es requerido");
      const salesperson = clientInfo.salesperson.trim();
      if (!salesperson) throw new Error("El vendedor es requerido");
      
      // Aseguramos que el email sea N/A si está vacío antes de enviar
      const finalEmail = clientInfo.clientEmail && clientInfo.clientEmail.trim() !== "" 
        ? clientInfo.clientEmail 
        : "N/A";

      if (items.length === 0) throw new Error("Debe agregar al menos un concepto a la cotización");

      const quotationData = {
        quotation: {
          quotationNumber,
          ...(linkedClientId && !isEditMode ? { clientId: linkedClientId } : {}),
          clientName: clientInfo.clientName,
          clientEmail: finalEmail,
          projectName: clientInfo.projectName || "",
          rentalPeriod: clientInfo.rentalPeriod || "",
          salesperson,
          includeIVA: clientInfo.includeIVA,
          subtotal: subtotal.toString(),
          iva: iva.toString(),
          total: total.toString()
        },
        items: items.map(item => ({
          id: item.id, // Incluir el ID si existe (para actualizaciones)
          concept: item.concept,
          quantity: item.quantity.toString(),
          unit: item.unit,
          unitPrice: item.unitPrice.toString(),
          subtotal: (item.quantity * item.unitPrice).toString()
        }))
      };

      // Si estamos en modo edición, usamos PUT para actualizar
      if (isEditMode && existingQuotation) {
        return apiRequest(`/api/quotations/${existingQuotation.id}`, {
          method: "PUT",
          body: JSON.stringify(quotationData)
        });
      } else {
        // Si es nueva, usamos POST para crear
        return apiRequest("/api/quotations", {
          method: "POST",
          body: JSON.stringify(quotationData)
        });
      }
    },
    onSuccess: async () => {
      // Verificar si viene de un cliente específico ANTES de invalidar cachés
      const urlParams = new URLSearchParams(window.location.search);
      const clientIdParam = urlParams.get('clientId');
      
      toast({
        title: isEditMode ? "¡Cotización actualizada!" : "¡Cotización guardada!",
        description: `La cotización #${quotationNumber} ha sido ${isEditMode ? 'actualizada' : 'guardada'} exitosamente.`,
      });

      // Invalidar cachés para refrescar datos
      queryClient.invalidateQueries({ queryKey: ['/api/quotations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quotations/next-number'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quotations/number', editQuotationNumber] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      
      // CRÍTICO: Invalidar caché del cliente específico si viene de detalle de cliente
      if (clientIdParam) {
        queryClient.invalidateQueries({ queryKey: ['/api/clients', parseInt(clientIdParam)] });
      }
      
      // Si viene de un cliente específico, regresar a ese cliente después de guardar
      if (clientIdParam && !isEditMode) {
        // Pequeño delay para que el usuario vea el toast de confirmación
        setTimeout(() => {
          navigate(`/clients/${clientIdParam}`);
        }, 1500);
      } else if (!isEditMode) {
        // Si no viene de un cliente, resetear el formulario para crear otra cotización
        setClientInfo({
          clientName: "",
          clientEmail: "",
          projectName: "",
          rentalPeriod: "",
          salesperson: "",
          includeIVA: true,
        });
        setItems([]);
      }
    },
    onError: (error) => {
      toast({
        title: `Error al ${isEditMode ? 'actualizar' : 'guardar'}`,
        description: error instanceof Error ? error.message : `Ocurrió un error al ${isEditMode ? 'actualizar' : 'guardar'} la cotización`,
        variant: "destructive"
      });
    }
  });

  // Handle adding a new item
  const handleAddItem = () => {
    const newItem: QuotationItemData = {
      concept: "",
      quantity: 1,
      unit: "Días",
      unitPrice: 0
    };
    setItems([...items, newItem]);
  };

  // Handle removing an item
  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  // Handle updating an item
  const handleUpdateItem = (index: number, updatedItem: QuotationItemData) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updatedItem };
    setItems(newItems);
  };

  // Handle saving the quotation
  const handleSaveQuotation = () => {
    saveQuotationMutation.mutate();
  };

  // En edición, guardar primero y descargar después para asegurar que el PDF
  // incluya los cambios que el usuario acaba de capturar.
  const handleUpdateAndDownload = async () => {
    if (!isEditMode || !quotationNumber) return;

    // Debe ocurrir sincrónicamente durante el toque para evitar que iOS Safari
    // bloquee la pestaña del PDF después de esperar el guardado.
    const preparedPDFWindow = preparePDFWindowForIOS();
    setIsUpdatingAndDownloading(true);
    let updateCompleted = false;
    try {
      await saveQuotationMutation.mutateAsync();
      updateCompleted = true;
      const { downloadEnhancedQuotationPDF } = await import("@/lib/enhanced-pdf-generator");
      await downloadEnhancedQuotationPDF(quotationNumber, preparedPDFWindow);
    } catch (error) {
      if (preparedPDFWindow && !preparedPDFWindow.closed) {
        preparedPDFWindow.close();
      }
      // Los errores de guardado ya son mostrados por la mutación. Este aviso
      // solo corresponde a un fallo posterior durante la generación del PDF.
      if (updateCompleted) {
        toast({
          title: "No se pudo descargar",
          description: error instanceof Error
            ? error.message
            : "La cotización se actualizó, pero no se pudo descargar el PDF.",
          variant: "destructive",
        });
      }
    } finally {
      setIsUpdatingAndDownloading(false);
    }
  };
  
  // Handle cancel and return to appropriate page
  const handleCancel = () => {
    // Obtener parámetros de URL para detectar si viene de un cliente específico
    const urlParams = new URLSearchParams(window.location.search);
    const clientIdParam = urlParams.get('clientId');
    
    // Si viene de un cliente específico, regresar a ese cliente
    if (clientIdParam) {
      navigate(`/clients/${clientIdParam}`);
    } else {
      // Si no viene de un cliente, ir a la lista general de cotizaciones
      navigate("/quotations");
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header con diseño corporativo Péza */}
      <div className="peza-header rounded-xl p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-black">
              {isEditMode ? `Editar Cotización #${quotationNumber}` : "Nueva Cotización"}
            </h1>
            <p className="mt-2 text-lg text-black/80">
              {isEditMode 
                ? "Modifica los detalles de la cotización existente" 
                : "Crea una nueva cotización para equipos de construcción"}
            </p>
            {quotationNumber && (
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-black/10 text-black">
                  <i className="ri-hashtag mr-1"></i>
                  COT-{quotationNumber}
                </span>
                {isEditMode && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    <i className="ri-edit-line mr-1"></i>
                    Modo Edición
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 md:mt-0 md:ml-4 flex flex-wrap items-center gap-2 sm:gap-4">
            <button 
              onClick={handleCancel}
              className="peza-button-secondary whitespace-nowrap"
            >
              <i className="ri-arrow-left-line mr-1 sm:mr-2"></i>
              <span className="hidden sm:inline">Volver</span>
              <span className="sm:hidden">Atrás</span>
            </button>
            <button 
              onClick={handleSaveQuotation}
              disabled={saveQuotationMutation.isPending || isLoadingNumber || isLoadingExistingQuotation}
              className="peza-button-primary whitespace-nowrap"
            >
              <i className="ri-save-line mr-1 sm:mr-2"></i>
              {saveQuotationMutation.isPending ? (
                <span>Guardando...</span>
              ) : (
                <span>{isEditMode ? "Actualizar" : "Guardar"}</span>
              )}
            </button>
             {isEditMode && (
               <button
                 onClick={handleUpdateAndDownload}
                 disabled={saveQuotationMutation.isPending || isUpdatingAndDownloading || isLoadingExistingQuotation}
                 className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-white px-4 py-3 font-semibold text-gray-900 shadow-md transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                 aria-label="Actualizar y descargar cotización"
               >
                 <i className={`${isUpdatingAndDownloading ? "ri-loader-4-line animate-spin" : "ri-download-2-line"} mr-1 sm:mr-2`}></i>
                 <span>{isUpdatingAndDownloading ? "Descargando..." : "Descargar"}</span>
               </button>
             )}
          </div>
        </div>
      </div>

      {/* Formulario con diseño mejorado */}
      <div className="peza-card mb-8">
        <div className="peza-card-header">
          <h3 className="text-lg font-semibold text-gray-900">Información del Cliente</h3>
          <p className="text-sm text-gray-600">Complete los datos del cliente y proyecto</p>
        </div>
        <div className="p-6">
          <QuotationForm 
            quotationNumber={quotationNumber} 
            clientInfo={clientInfo}
            setClientInfo={setClientInfo}
            isLoading={isLoadingNumber}
          />
        </div>
      </div>

      {/* Tabla de conceptos con diseño mejorado */}
      <div className="peza-card mb-8">
        <div className="peza-card-header">
          <h3 className="text-lg font-semibold text-gray-900">Conceptos y Equipos</h3>
          <p className="text-sm text-gray-600">Agregue los equipos y servicios a cotizar</p>
        </div>
        <div className="p-6">
          <QuotationItemsTable 
            items={items}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onUpdateItem={handleUpdateItem}
            subtotal={subtotal}
            iva={iva}
            total={total}
          />
        </div>
      </div>

      {/* Botones de acción con diseño mejorado */}
      <div className="flex flex-col sm:flex-row justify-end gap-4 mb-8">
        <button 
          onClick={handleCancel}
          className="peza-button-secondary w-full sm:w-auto order-2 sm:order-1"
        >
          <i className="ri-arrow-left-line mr-2"></i>
          Cancelar y Volver
        </button>
        <button 
          onClick={handleSaveQuotation}
          disabled={saveQuotationMutation.isPending || isLoadingNumber || isLoadingExistingQuotation}
          className="peza-button-primary w-full sm:w-auto order-1 sm:order-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className="ri-save-line mr-2"></i>
          {saveQuotationMutation.isPending ? (
            <>
              <i className="ri-loader-4-line mr-2 animate-spin"></i>
              Guardando...
            </>
          ) : (
            isEditMode ? "Actualizar Cotización" : "Guardar Cotización"
          )}
        </button>
      </div>
    </div>
  );
}
