import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, Wrench, User, Package, FileText, ClipboardList, Camera, X, Check, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { RepairFormData, repairFormSchema, RepairItemData, Concept, Client } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { calculateRepairReviewTotals } from "@shared/repair-review";
import { formatCurrency } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import RepairItemsTable from "@/components/RepairItemsTable";

// Solo las fotos subidas al almacenamiento de objetos deben borrarse ahí
// (no las vistas previas blob:, ni las fotos antiguas en Base64)
function isStoredImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("/public/") || url.startsWith("https://storage.googleapis.com/");
}

export default function RepairForm() {
  const [, navigate] = useLocation();
  // Buscamos coincidencias en ambas rutas posibles: /repairs/:id y /repairs/:id/edit
  const [matchNew, paramsNew] = useRoute("/repairs/:id");
  const [matchEdit, paramsEdit] = useRoute("/repairs/:id/edit");
  
  // Si coincide con la ruta de edición, usamos ese parámetro
  // de lo contrario, usamos el parámetro de la ruta normal si existe
  const params = matchEdit ? paramsEdit : (matchNew ? paramsNew : null);
  const match = matchEdit || matchNew;
  
  // El ID de la reparación viene del parámetro de la URL
  const repairId = params ? Number(params.id) : null;
  
  // Estamos en modo edición si no es "new" y coincide con la ruta /repairs/:id/edit
  const isEditMode = matchEdit || (matchNew && params?.id !== "new");

  const queryClient = useQueryClient();
  const [repairNumber, setRepairNumber] = useState<string | null>(null);
  const [customFolio, setCustomFolio] = useState<string>("");
  const [items, setItems] = useState<(RepairItemData & { id?: number })[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [iva, setIva] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalsError, setTotalsError] = useState("");
  const [images, setImages] = useState<{ [key: number]: string | null }>({ 1: null, 2: null, 3: null });
  const [uploadingImages, setUploadingImages] = useState<{ [key: number]: boolean }>({ 1: false, 2: false, 3: false });
  // Fotos quitadas/reemplazadas que se borrarán del almacenamiento solo tras guardar con éxito
  const pendingImageDeletions = useRef<Set<string>>(new Set());

  // Descartar las eliminaciones pendientes al cambiar de reparación o pasar a crear una nueva:
  // solo deben procesarse tras guardar la misma reparación en la que se quitaron las fotos
  useEffect(() => {
    pendingImageDeletions.current.clear();
  }, [repairId, isEditMode]);

  const form = useForm<RepairFormData>({
    resolver: zodResolver(repairFormSchema),
    defaultValues: {
      clientName: "",
      clientEmail: "",
      equipment: "",
      serialNumber: "",
      model: "",
      repairManager: "",
      repairOrder: "",
      receivedDate: new Date(),
      deliveredBy: "",
      deliveryDate: null,
      departureDate: null,
      elaborationDate: null,
      status: "Espera de confirmación",
      paymentStatus: "No Pagada",
      reviewAmount: "0",
      reviewOnly: false,
      reviewReason: "",
      clientReport: "",
      equipmentObservations: "",
      includeIVA: true,
    },
  });

  const reviewAmount = form.watch("reviewAmount");
  const reviewOnly = form.watch("reviewOnly");
  const includeIVA = form.watch("includeIVA");
  const initializedForId = useRef<number | null>(null);
  const submitting = useRef(false);
  const [isPreparingSave, setIsPreparingSave] = useState(false);

  // Obtener el siguiente número de reparación automáticamente
  const { data: nextNumberData } = useQuery({
    queryKey: ['/api/repairs/next-number'],
    queryFn: async () => {
      const response = await apiRequest('/api/repairs/next-number');
      return response as { repairNumber: string };
    },
    enabled: !isEditMode, // Solo obtener el siguiente número si no estamos en modo edición
    refetchOnWindowFocus: false,
  });

  // Estado para el combobox de clientes
  const [clientComboboxOpen, setClientComboboxOpen] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  // Consulta de clientes para autocompletar - traemos todos con límite alto
  const { data: clients = [] } = useQuery({
    queryKey: ['/api/clients', 'all'],
    queryFn: async () => {
      const response = await apiRequest('/api/clients?limit=1000');
      return response as Client[];
    },
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
  });

  // Consulta de conceptos para autocompletar
  const { data: concepts = [] } = useQuery({
    queryKey: ['/api/concepts', { active: true }],
    queryFn: async () => {
      try {
        const response = await apiRequest('/api/concepts?active=true');
        // Retornar TODOS los conceptos (tanto de reparación como generales)
        // El componente RepairItemsTable se encarga de categorizarlos
        return response as Concept[];
      } catch (error) {
        console.error("Error al cargar conceptos:", error);
        return [];
      }
    },
    refetchOnWindowFocus: false,
  });

  // Si estamos en modo edición, cargamos los datos de la reparación
  const { data: repair, isLoading } = useQuery({
    queryKey: ['/api/repairs', repairId],
    queryFn: async () => {
      if (!isEditMode) return null;
      // Llamada real a la API para obtener la reparación por ID
      const response = await apiRequest(`/api/repairs/${repairId}`);
      return response;
    },
    enabled: isEditMode,
    refetchOnWindowFocus: false,
  });

  // Mutación para crear/actualizar la reparación
  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (isEditMode) {
        // Update repair
        return apiRequest(`/api/repairs/${repairId}`, {
          method: 'PATCH',
          body: JSON.stringify(data),
        });
      } else {
        // Create new repair
        return apiRequest('/api/repairs', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      }
    },
    onSuccess: async (data) => {
      // Borrar del almacenamiento las fotos quitadas/reemplazadas (solo tras guardar con éxito).
      // Nunca borrar una URL que la reparación guardada siga usando.
      const savedUrls = new Set([data?.image1, data?.image2, data?.image3].filter(Boolean));
      const urlsToDelete = Array.from(pendingImageDeletions.current).filter(url => !savedUrls.has(url));
      pendingImageDeletions.current.clear();
      if (urlsToDelete.length > 0) {
        const results = await Promise.allSettled(
          urlsToDelete.map(url =>
            apiRequest('/api/delete-image', {
              method: 'POST',
              body: JSON.stringify({ url }),
            })
          )
        );
        const failed = results.filter(r => r.status === 'rejected').length;
        if (failed > 0) {
          console.error(`No se pudieron borrar ${failed} imagen(es) del almacenamiento.`);
          toast({
            title: "Aviso",
            description: `La reparación se guardó, pero ${failed} foto(s) antigua(s) no se pudieron borrar del almacenamiento.`,
          });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['/api/repairs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts-receivable'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      toast({
        title: isEditMode ? "Reparación actualizada" : "Reparación creada",
        description: `La orden de reparación ha sido ${isEditMode ? 'actualizada' : 'creada'} correctamente.`,
      });
      navigate(`/repairs/${data.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Hubo un problema al ${isEditMode ? 'actualizar' : 'crear'} la reparación: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Actualizar cálculos con la misma regla monetaria que el servidor.
  useEffect(() => {
    const newSubtotal = items.reduce((sum, item) => {
      const quantity = typeof item.quantity === 'string' ? parseFloat(item.quantity) : item.quantity;
      const unitPrice = typeof item.unitPrice === 'string' ? parseFloat(item.unitPrice) : item.unitPrice;
      const itemTotal = (quantity || 0) * (unitPrice || 0);
      return sum + itemTotal;
    }, 0);
    
    try {
      // Mantener texto al capturar; un separador decimal incompleto no debe
      // hacer fallar la vista previa.
      const previewFee = Number(reviewAmount || 0);
      const totals = calculateRepairReviewTotals(newSubtotal,
        Number.isFinite(previewFee) && previewFee >= 0 ? previewFee.toFixed(2) : "0",
        !!reviewOnly, !!includeIVA);
      setSubtotal(Number(totals.subtotal));
      setIva(Number(totals.iva));
      setTotal(Number(totals.total));
      setTotalsError("");
    } catch {
      setTotalsError("El importe excede el límite permitido. Corrige los conceptos o el cargo de revisión.");
    }
  }, [items, reviewAmount, reviewOnly, includeIVA]);

  // Resetear formulario cuando se navega a crear nueva reparación
  useEffect(() => {
    if (!isEditMode) {
      initializedForId.current = null;
      form.reset({
        clientName: "",
        clientEmail: "",
        equipment: "",
        serialNumber: "",
        model: "",
        repairManager: "",
        repairOrder: "",
        receivedDate: new Date(),
        deliveredBy: "",
        deliveryDate: null,
        departureDate: null,
        status: "Espera de confirmación",
        paymentStatus: "No Pagada",
        reviewAmount: "0",
        reviewOnly: false,
        reviewReason: "",
        clientReport: "",
        equipmentObservations: "",
        includeIVA: true,
      });
      setItems([]);
      setSubtotal(0);
      setIva(0);
      setTotal(0);
      setImages({ 1: null, 2: null, 3: null });
      setSelectedClientId(null);
    }
  }, [isEditMode]);

  // Inicializar el número de reparación cuando se obtiene del backend
  useEffect(() => {
    if (nextNumberData && !isEditMode) {
      setRepairNumber(nextNumberData.repairNumber);
      setCustomFolio(nextNumberData.repairNumber);
    }
  }, [nextNumberData, isEditMode]);

  // Inicializar el formulario con los datos de la reparación si estamos en modo edición
  useEffect(() => {
    if (repair && initializedForId.current !== repairId) {
      initializedForId.current = repairId;
      setRepairNumber(repair.repairNumber);
      setCustomFolio(repair.repairNumber);
      setItems(repair.items || []);

      form.reset({
        clientName: repair.client?.name || "",
        clientEmail: repair.clientEmail || "",
        equipment: repair.equipment,
        serialNumber: repair.serialNumber || "",
        model: repair.model || "",
        repairManager: repair.repairManager || "",
        repairOrder: repair.repairOrder || "",
        receivedDate: repair.receivedDate ? new Date(repair.receivedDate) : new Date(),
        deliveredBy: repair.deliveredBy || "",
        deliveryDate: repair.deliveryDate ? new Date(repair.deliveryDate) : null,
        departureDate: repair.departureDate ? new Date(repair.departureDate) : null,
        elaborationDate: repair.elaborationDate ? new Date(repair.elaborationDate) : null,
        status: repair.status || "Espera de confirmación",
        paymentStatus: repair.paymentStatus || "No Pagada",
        reviewAmount: repair.reviewAmount || "0",
        reviewOnly: !!repair.reviewOnly,
        reviewReason: repair.reviewReason || "",
        clientReport: repair.clientReport || "",
        equipmentObservations: repair.equipmentObservations || "",
        image1: repair.image1 || "",
        image2: repair.image2 || "",
        image3: repair.image3 || "",
        includeIVA: repair.includeIVA,
      });
      // Set existing images
      if (repair.image1 || repair.image2 || repair.image3) {
        setImages({
          1: repair.image1 || null,
          2: repair.image2 || null,
          3: repair.image3 || null,
        });
      }
    }
  }, [repair, repairId, isEditMode, form]);

  const handleImageChange = async (index: number, file: File) => {
    // Guardar la foto anterior para restaurarla si la subida falla
    const previousUrl = images[index];
    // Mostrar vista previa inmediata mientras se sube el archivo
    const previewUrl = URL.createObjectURL(file);
    setImages(prev => ({ ...prev, [index]: previewUrl }));
    setUploadingImages(prev => ({ ...prev, [index]: true }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('repairNumber', customFolio || repairNumber || 'nuevo');
      formData.append('imageIndex', String(index));

      const response = await apiRequest('/api/upload-image', {
        method: 'POST',
        body: formData,
      });

      setImages(prev => ({ ...prev, [index]: response.url }));
      form.setValue(`image${index}` as any, response.url);
      // Solo tras subir con éxito la nueva foto, marcar la anterior para borrar al guardar
      if (isStoredImageUrl(previousUrl) && previousUrl !== response.url) {
        pendingImageDeletions.current.add(previousUrl as string);
      }
    } catch (error) {
      console.error("Error al subir imagen:", error);
      // Restaurar la foto anterior si la subida falla (no perder la existente)
      setImages(prev => ({ ...prev, [index]: previousUrl ?? null }));
      form.setValue(`image${index}` as any, previousUrl ?? "");
      toast({
        title: "Error",
        description: "No se pudo subir la imagen. Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setUploadingImages(prev => ({ ...prev, [index]: false }));
      URL.revokeObjectURL(previewUrl);
    }
  };

  const handleRemoveImage = (index: number) => {
    const currentUrl = images[index];
    if (isStoredImageUrl(currentUrl)) {
      pendingImageDeletions.current.add(currentUrl as string);
    }
    setImages(prev => ({ ...prev, [index]: null }));
    form.setValue(`image${index}` as any, "");
  };

  const handleAddItem = () => {
    const newItem: RepairItemData = {
      itemNumber: `N${items.length + 1}`,
      concept: "",
      quantity: 1,
      unit: "pza",
      unitPrice: 0,
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => {
      const newItems = [...prev];
      newItems.splice(index, 1);
      return newItems.map((item, idx) => ({
        ...item,
        itemNumber: `N${idx + 1}`
      }));
    });
  };

  const handleInsertItem = (afterIndex: number) => {
    setItems(prev => {
      const newItems = [...prev];
      const newItem: RepairItemData = {
        itemNumber: `N${afterIndex + 2}`,
        concept: "",
        quantity: 1,
        unit: "pza",
        unitPrice: 0,
      };
      newItems.splice(afterIndex + 1, 0, newItem);
      return newItems.map((item, idx) => ({
        ...item,
        itemNumber: `N${idx + 1}`
      }));
    });
  };

  const handleUpdateItem = (index: number, updatedItem: RepairItemData) => {
    setItems(prev => {
      const newItems = [...prev];
      newItems[index] = updatedItem;
      return newItems;
    });
  };

  const handleClientSelect = (clientId: string) => {
    const selectedClient = clients.find(client => client.id === parseInt(clientId));
    if (selectedClient) {
      form.setValue("clientName", selectedClient.name);
      const email = selectedClient.email && selectedClient.email.trim() !== "" && selectedClient.email !== "N/A" ? selectedClient.email : "";
      form.setValue("clientEmail", email);
    }
  };

  const onSubmit = async (data: RepairFormData) => {
    if (submitting.current || mutation.isPending) return;
    if (Object.values(uploadingImages).some(Boolean)) {
      toast({
        title: "Fotos subiendo",
        description: "Espera a que terminen de subirse las fotos antes de guardar.",
      });
      return;
    }
    const normalizedReviewAmount = String(data.reviewAmount || "0").trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedReviewAmount) || !Number.isFinite(Number(normalizedReviewAmount)) ||
      ((data.reviewOnly || data.paymentStatus === "Revisión") && Number(normalizedReviewAmount) <= 0)) {
      form.setError("reviewAmount", { message: "Captura un importe válido con máximo dos decimales; para solo revisión debe ser mayor que cero." });
      return;
    }
    if (!data.reviewOnly && items.length === 0) {
      toast({
        title: "Error",
        description: "Debe agregar al menos un ítem a la reparación",
        variant: "destructive",
      });
      return;
    }

    submitting.current = true;
    setIsPreparingSave(true);
    // Crear conceptos nuevos automáticamente
    try {
      for (const item of data.reviewOnly ? [] : items) {
        // Verificar si el concepto ya existe en la lista
        const conceptExists = concepts.some(
          concept => concept.name.toLowerCase() === item.concept.toLowerCase()
        );

        // Si el concepto no existe, crearlo
        if (!conceptExists && item.concept.trim()) {
          console.log(`Creando nuevo concepto: ${item.concept}`);
          await apiRequest('/api/concepts', {
            method: 'POST',
            body: JSON.stringify({
              name: item.concept,
              description: `[REPAIR] ${item.concept}`,
              defaultUnit: item.unit,
              defaultPrice: item.unitPrice.toString(),
              active: true,
            }),
          });
        }
      }
    } catch (error) {
      console.error("Error creando conceptos:", error);
      toast({
        title: "Advertencia",
        description: "Algunos conceptos no pudieron guardarse, pero la reparación se guardará correctamente.",
      });
    }

    // Preparar los datos para enviar al servidor
    // Convertir valores numéricos a string para la API
    let savedTotals;
    try {
      savedTotals = calculateRepairReviewTotals(
        items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0),
        normalizedReviewAmount, !!data.reviewOnly, data.includeIVA,
      );
    } catch {
      submitting.current = false;
      setIsPreparingSave(false);
      toast({ title: "Importe inválido", description: "Corrige los conceptos o el cargo de revisión.", variant: "destructive" });
      return;
    }
    const repairData = {
      ...data,
      reviewAmount: Number(normalizedReviewAmount).toFixed(2),
      reviewOnly: !!data.reviewOnly,
      repairNumber: customFolio, // Usar el folio personalizado/editado
      image1: images[1] || null,
      image2: images[2] || null,
      image3: images[3] || null,
      items: items.map(item => ({
        ...item,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice)
      })),
      subtotal: savedTotals.subtotal,
      iva: savedTotals.iva,
      total: savedTotals.total,
      includeIVA: data.includeIVA,
    };

    console.log("Enviando datos de reparación:", repairData);
    mutation.mutate(repairData, {
      onSettled: () => {
        submitting.current = false;
        setIsPreparingSave(false);
      },
    });
  };

  if (isEditMode && isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full max-w-6xl mx-auto space-y-4 sm:space-y-6 px-3 sm:px-4 md:px-6 py-4 sm:py-6">
      {/* Header con estilo corporativo Peza */}
      <div className="peza-header rounded-xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-black break-words">
              {isEditMode ? "Editar Reparación" : "Nueva Reparación"}
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-black/80 break-words">
              {isEditMode 
                ? `Actualiza los detalles de la reparación ${repairNumber}`
                : "Crea una nueva orden de reparación para un cliente"}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="bg-white/90 backdrop-blur-sm text-gray-900 px-3 sm:px-6 py-2 sm:py-3 rounded-lg shadow-md border-2 border-yellow-600">
              <div className="flex items-center gap-1 sm:gap-2">
                <Wrench className="w-4 sm:w-5 h-4 sm:h-5 text-yellow-600" />
                <span className="font-bold text-sm sm:text-lg">{repairNumber || "R-XX"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
          {/* Campo de FOLIO/Anexo */}
          <Card className="peza-card bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-l-4 border-l-yellow-500">
            <CardHeader className="peza-card-header pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-yellow-800 text-base sm:text-lg">
                <FileText className="w-4 sm:w-5 h-4 sm:h-5" />
                <span className="font-bold">FOLIO / Anexo</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-medium text-gray-700">
                  Número de Reparación
                </label>
                <Input
                  value={customFolio}
                  onChange={(e) => {
                    setCustomFolio(e.target.value);
                    setRepairNumber(e.target.value);
                  }}
                  placeholder="R-01"
                  className="text-base sm:text-lg font-semibold bg-white border-yellow-300 focus:border-yellow-500 focus:ring-yellow-500"
                />
                <p className="text-xs text-gray-600">
                  Se asigna automáticamente pero puedes editarlo en cualquier momento
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Orden de Reparación */}
          <Card className="peza-card bg-gradient-to-br from-blue-50 to-blue-100/50 border-l-4 border-l-blue-500">
            <CardHeader className="peza-card-header pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-blue-800 text-base sm:text-lg">
                <FileText className="w-4 sm:w-5 h-4 sm:h-5" />
                <span className="font-bold">Orden de Reparación</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="repairOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Número de Orden</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Ej: ORD-2024-001"
                        className="text-base sm:text-lg font-semibold bg-white border-blue-300 focus:border-blue-500 focus:ring-blue-500"
                      />
                    </FormControl>
                    <FormMessage />
                    <p className="text-xs text-gray-600 mt-2">
                      Se debe llenar de manera manual
                    </p>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Información del cliente */}
          <Card className="peza-card border-l-4 border-l-blue-500">
            <CardHeader className="peza-card-header pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-gray-900 text-base sm:text-lg">
                <User className="w-4 sm:w-5 h-4 sm:h-5 text-blue-600" />
                <span className="font-bold">Información del Cliente</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2 col-span-1">
                <label className="text-xs sm:text-sm font-medium">Cliente registrado</label>
                <Popover open={clientComboboxOpen} onOpenChange={setClientComboboxOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientComboboxOpen}
                      className="w-full justify-between text-xs sm:text-sm font-normal min-h-[44px] h-auto py-2"
                    >
                      <span className="truncate">
                        {selectedClientId
                          ? clients.find((client) => client.id === selectedClientId)?.name || "Cliente seleccionado"
                          : "Buscar cliente..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-[400px] p-0" align="start" side="bottom" sideOffset={4}>
                    <Command>
                      <CommandInput placeholder="Buscar por nombre o correo..." className="text-sm h-11" />
                      <CommandList className="max-h-[50vh] sm:max-h-[300px]">
                        <CommandEmpty>No se encontró cliente.</CommandEmpty>
                        <CommandGroup>
                          {clients.map((client) => (
                            <CommandItem
                              key={client.id}
                              value={`${client.name} ${client.email || ''}`}
                              onSelect={() => {
                                handleClientSelect(client.id.toString());
                                setSelectedClientId(client.id);
                                setClientComboboxOpen(false);
                              }}
                              className="cursor-pointer py-3 px-3"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4 flex-shrink-0",
                                  selectedClientId === client.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium truncate">{client.name}</span>
                                {client.email && (
                                  <span className="text-xs text-muted-foreground truncate">{client.email}</span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground">
                  Busca y selecciona un cliente existente ({clients.length} clientes disponibles)
                </span>
              </div>

              <div></div>

              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Nombre del Cliente</FormLabel>
                    <FormControl>
                      <Input {...field} className="text-xs sm:text-sm" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Correo Electrónico <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="N/A" className="text-xs sm:text-sm" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Información del equipo */}
          <Card className="peza-card border-l-4 border-l-purple-500">
            <CardHeader className="peza-card-header pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-gray-900 text-base sm:text-lg">
                <Package className="w-4 sm:w-5 h-4 sm:h-5 text-purple-600" />
                <span className="font-bold">Información del Equipo</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
              <FormField
                control={form.control}
                name="equipment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Equipo</FormLabel>
                    <FormControl>
                      <Input {...field} className="text-xs sm:text-sm" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="serialNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Número de Serie</FormLabel>
                    <FormControl>
                      <Input {...field} className="text-xs sm:text-sm" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Modelo</FormLabel>
                    <FormControl>
                      <Input {...field} className="text-xs sm:text-sm" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="equipmentObservations"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2 md:col-span-2">
                    <FormLabel className="text-xs sm:text-sm">Observaciones del Equipo</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} className="text-xs sm:text-sm resize-none" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Información de la reparación */}
          <Card className="peza-card border-l-4 border-l-green-500">
            <CardHeader className="peza-card-header pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-gray-900 text-base sm:text-lg">
                <Wrench className="w-4 sm:w-5 h-4 sm:h-5 text-green-600" />
                <span className="font-bold">Detalles de la Reparación</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-2 sm:gap-3 md:gap-4">
              <FormField
                control={form.control}
                name="repairManager"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Encargado de la Reparación</FormLabel>
                    <FormControl>
                      <Input {...field} className="text-xs sm:text-sm" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deliveredBy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Entregado Por</FormLabel>
                    <FormControl>
                      <Input {...field} className="text-xs sm:text-sm" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="receivedDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-xs sm:text-sm">Fecha de Recibido</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={
                              "w-full pl-2 sm:pl-3 text-xs sm:text-sm text-left font-normal flex justify-between items-center"
                            }
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Seleccionar fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={(date) => field.onChange(date)}
                          disabled={(date) =>
                            date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="deliveryDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-xs sm:text-sm">Fecha de Entrega</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={
                              "w-full pl-2 sm:pl-3 text-xs sm:text-sm text-left font-normal flex justify-between items-center"
                            }
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Seleccionar fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={(date) => field.onChange(date)}
                          disabled={(date) =>
                            date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="elaborationDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="text-xs sm:text-sm">Fecha de Elaboración</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={
                              "w-full pl-2 sm:pl-3 text-xs sm:text-sm text-left font-normal flex justify-between items-center"
                            }
                          >
                            {field.value ? (
                              format(field.value, "PPP", { locale: es })
                            ) : (
                              <span>Seleccionar fecha</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value || undefined}
                          onSelect={(date) => field.onChange(date)}
                          disabled={(date) =>
                            date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Estado de la Reparación</FormLabel>
                    <FormControl>
                      <select
                        value={field.value || "Espera de confirmación"}
                        onChange={(e) => field.onChange(e.target.value)}
                        className="w-full h-10 text-xs sm:text-sm border border-gray-300 rounded-md px-3 bg-white cursor-pointer"
                      >
                        <option value="Espera de confirmación">Espera de confirmación</option>
                        <option value="Diagnóstico">Diagnóstico</option>
                        <option value="En Proceso">En Proceso</option>
                        <option value="Entregada">Entregada</option>
                        <option value="Terminada">Terminada</option>
                        <option value="No Entregada">No Entregada</option>
                        <option value="No autorizado">No autorizado</option>
                      </select>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="paymentStatus"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs sm:text-sm">Estado de Pago</FormLabel>
                    <FormControl>
                      <select
                        value={field.value || "No Pagada"}
                        onChange={(e) => {
                          field.onChange(e.target.value);
                          if (e.target.value === "Revisión") form.setValue("reviewOnly", true, { shouldDirty: true });
                        }}
                        className="w-full h-10 text-xs sm:text-sm border border-gray-300 rounded-md px-3 bg-white cursor-pointer"
                      >
                        <option value="No Pagada">No Pagada</option>
                        <option value="Pagada">Pagada</option>
                        <option value="Cotización">Cotización</option>
                        <option value="Revisión">Revisión</option>
                      </select>
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientReport"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2 md:col-span-2">
                    <FormLabel className="text-xs sm:text-sm">Reporte del Cliente</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} className="text-xs sm:text-sm resize-none" />
                    </FormControl>
                    <FormMessage className="text-xs" />
                  </FormItem>
                )}
              />

              {/* Image uploads */}
              <div className="md:col-span-2">
                <FormLabel className="flex items-center gap-2 text-xs sm:text-sm">
                  <Camera className="w-4 h-4 text-gray-600" />
                  <span>Fotos de la Reparación (máximo 3)</span>
                </FormLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mt-3">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="relative">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-2 sm:p-3 text-center hover:border-gray-400 transition">
                        {images[index] ? (
                          <div className="relative">
                            <img 
                              src={images[index] as string} 
                              alt={`Foto ${index}`} 
                              className={cn("w-full h-20 sm:h-24 object-cover rounded", uploadingImages[index] && "opacity-50")}
                            />
                            {uploadingImages[index] && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-600"></div>
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveImage(index)}
                              className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer block">
                            <Camera className="w-5 sm:w-6 h-5 sm:h-6 mx-auto mb-0.5 text-gray-400" />
                            <p className="text-xs text-gray-600">Foto {index}</p>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleImageChange(index, file);
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Ítems de la reparación */}
          <Card className="peza-card border-l-4 border-l-orange-500">
            <CardHeader className="peza-card-header pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-gray-900 text-base sm:text-lg">
                <ClipboardList className="w-4 sm:w-5 h-4 sm:h-5 text-orange-600" />
                <span className="font-bold">Conceptos de la Reparación</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 sm:p-4 space-y-3">
                <FormField control={form.control} name="reviewAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo de revisión antes de IVA <span className="font-normal">(opcional para reparación)</span></FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} type="text" inputMode="decimal" placeholder="0.00"
                        onBlur={() => { if (!String(field.value ?? "").trim()) field.onChange("0"); field.onBlur(); }}
                        onChange={e => field.onChange(e.target.value.replace(",", "."))} className="bg-white" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="reviewOnly" render={({ field }) => (
                  <FormItem className="space-y-2">
                    <div className="flex items-center gap-3">
                      <FormControl>
                        <Switch checked={!!field.value} onCheckedChange={checked => {
                          if (!checked && field.value && !window.confirm("Se sumará el cargo de revisión guardado a los conceptos de reparación una sola vez. El estado cambiará a No Pagada. ¿Autorizar reparación?")) return;
                          field.onChange(checked);
                          form.setValue("paymentStatus", checked ? "Revisión" : "No Pagada", { shouldDirty: true });
                        }} />
                      </FormControl>
                      <FormLabel className="font-medium">{field.value ? "Solo revisión" : "Revisión + reparación"}</FormLabel>
                    </div>
                    <p className="text-xs text-amber-900">
                      {field.value ? "Se cobra solo la revisión. Los conceptos guardados se conservan ocultos hasta autorizar la reparación." : "Se cobran los conceptos más el importe de revisión, una sola vez."}
                    </p>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              {!reviewOnly && <RepairItemsTable
                items={items}
                onAddItem={handleAddItem}
                onRemoveItem={handleRemoveItem}
                onInsertItem={handleInsertItem}
                onUpdateItem={handleUpdateItem}
                concepts={concepts}
                subtotal={subtotal}
                iva={iva}
                total={total}
              />}
              <div className="ml-auto max-w-xs space-y-1 rounded-md border p-3 text-sm">
                {Number(reviewAmount) > 0 && <div className="flex justify-between gap-3"><span>Revisión antes de IVA:</span><span>{formatCurrency(Number(reviewAmount))}</span></div>}
                <div className="flex justify-between"><span>Subtotal:</span><span>{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between"><span>IVA (16%):</span><span>{formatCurrency(iva)}</span></div>
                <div className="flex justify-between border-t pt-1 font-bold"><span>Total:</span><span>{formatCurrency(total)}</span></div>
              </div>
              {totalsError && <p role="alert" className="text-sm text-red-700">{totalsError}</p>}

              <div className="flex items-center gap-2 mt-4">
                <FormField
                  control={form.control}
                  name="includeIVA"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center gap-2 space-y-0">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">Incluir IVA (16%)</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-4 pt-4 sm:pt-6">
            <button
              type="button"
              onClick={() => navigate("/repairs")}
              className="peza-button-secondary w-full sm:w-auto text-sm sm:text-base"
            >
              <i className="ri-close-line mr-2"></i>
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={mutation.isPending || isPreparingSave || !!totalsError}
              className="peza-button-primary w-full sm:w-auto text-sm sm:text-base"
            >
              {mutation.isPending || isPreparingSave ? (
                <>
                  Guardando...
                </>
              ) : (
                <>
                  <i className="ri-save-line mr-2"></i>
                  {isEditMode ? "Actualizar Reparación" : "Crear Reparación"}
                </>
              )}
            </button>
          </div>
        </form>
      </Form>
      </div>
    </div>
  );
}