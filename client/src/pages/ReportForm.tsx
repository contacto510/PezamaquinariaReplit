import { useState, useEffect, useRef, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { AdaptiveDatePicker } from "@/components/ui/adaptive-date-picker";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn, savePDFMobile } from "@/lib/utils";
import { conceptFilter } from "@/lib/concept-filter";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Client, Concept } from "@shared/schema";
import { 
  ArrowLeft, 
  Building2, 
  Calendar, 
  Plus, 
  Trash2, 
  Save,
  FileText,
  Calculator,
  CreditCard,
  Info
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { generateReportPDF } from "@/lib/report-pdf-generator";

// Schema para validación del formulario de reporte
const reportFormSchema = z.object({
  clientId: z.number().min(1, "Debe seleccionar un cliente"),
  clientName: z.string().min(1, "El nombre del cliente es requerido"),
  projectId: z.number().min(1, "Debe seleccionar un proyecto"),
  folioReporte: z.string().min(1, "El folio del reporte es requerido"),
  diasUso: z.string().optional(),
  nombreObra: z.string().min(1, "El nombre de la obra es requerido"),
  fechaReporte: z.date({ required_error: "La fecha del reporte es requerida" }),
  periodoRentaInicio: z.date({ required_error: "La fecha de inicio del período de renta es requerida" }),
  periodoRentaFin: z.date({ required_error: "La fecha de fin del período de renta es requerida" }),
  includeIva: z.boolean().default(true),
  items: z.array(z.object({
    numero: z.string().min(1, "El número es requerido"),
    concepto: z.string().min(1, "El concepto es requerido"),
    obra: z.string().min(1, "La obra es requerida"),
    diasUso: z.string().optional(),
    cantidad: z.number().min(1, "La cantidad debe ser mayor a 0"),
    unidad: z.string().min(1, "La unidad es requerida"),
    precioUnitario: z.number().min(0, "El precio unitario debe ser válido"),
    subtotal: z.number().min(0, "El subtotal debe ser válido")
  })).min(1, "Debe agregar al menos un concepto")
});

type ReportFormData = z.infer<typeof reportFormSchema>;


/**
 * Celda numérica robusta para mobile:
 * - Usa type="text" inputMode="decimal" para evitar los quirks de type="number" en iOS/Android.
 * - Mantiene su propio estado de texto mientras el usuario escribe, evitando que el cursor "salte"
 *   por la conversión a Number en cada tecla.
 * - Acepta coma o punto como separador decimal.
 * - Commit del valor parseado al padre al detectar un número válido o al perder el foco.
 */
const NumericCell = memo(function NumericCell({
  value,
  onCommit,
  className,
  placeholder,
  ariaLabel,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const toText = (v: number) => (v === 0 || v == null || Number.isNaN(v) ? "" : String(v));
  const [text, setText] = useState<string>(toText(value));
  const focusedRef = useRef(false);

  // Sincronizar desde fuera solo cuando NO estamos editando (evita pisar lo que el usuario escribe).
  useEffect(() => {
    if (!focusedRef.current) {
      const next = toText(value);
      setText((prev) => (prev === next ? prev : next));
    }
  }, [value]);

  const parse = (s: string): number | null => {
    if (s == null || s.trim() === "") return 0;
    const normalized = s.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={text}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(e) => {
        const raw = e.target.value;
        // Permitir vacío y dígitos con coma o punto (un solo separador). No bloquear estados intermedios.
        if (raw === "" || /^\d*[.,]?\d*$/.test(raw)) {
          setText(raw);
          // Solo hacer commit cuando el texto representa un número estable
          // (no termina en separador decimal ni está vacío con solo un separador).
          const endsWithSep = raw.endsWith(".") || raw.endsWith(",");
          if (!endsWithSep) {
            const parsed = parse(raw);
            if (parsed !== null) onCommit(parsed);
          }
        }
      }}
      onBlur={() => {
        focusedRef.current = false;
        const parsed = parse(text);
        const finalVal = parsed === null ? 0 : parsed;
        onCommit(finalVal);
        setText(toText(finalVal));
      }}
      className={className}
    />
  );
});

export default function ReportForm() {
  const { clientId, projectId, id } = useParams<{ clientId: string; projectId: string; id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditMode = !!id;
  
  // Estado y refs para scroll inteligente
  const [lastAddedIndex, setLastAddedIndex] = useState<number | null>(null);
  const rowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);
  const tableElRef = useRef<HTMLTableElement | null>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  // Estado controlado para los Popovers de conceptos (evita que se traben)
  const [openPopovers, setOpenPopovers] = useState<{ [key: number]: boolean }>({});
  // Ref para evitar que form.reset() se ejecute más de una vez al cargar
  const formInitialized = useRef(false);

  // ===== Abonos / Adelantos =====
  // Abonos pendientes de guardar (los que el usuario agrega en este formulario antes de submit)
  type PendingAbono = {
    paymentDate: Date;
    paymentMethod: "efectivo" | "transferencia" | "cheque" | "tarjeta" | "deposito";
    amount: number;
    reference?: string;
    notes?: string;
  };
  const [pendingAbonos, setPendingAbonos] = useState<PendingAbono[]>([]);
  const [abonoDialogOpen, setAbonoDialogOpen] = useState(false);
  const [abonoDraft, setAbonoDraft] = useState<PendingAbono>({
    paymentDate: new Date(),
    paymentMethod: "transferencia",
    amount: 0,
    reference: "",
    notes: ""
  });

  // Obtener datos del reporte si estamos en modo edición
  const { data: reportData } = useQuery<any>({
    queryKey: [`/api/reports/${id}`],
    enabled: isEditMode,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    queryFn: getQueryFn({
      on401: "throw",
      endpoint: `/api/reports/${id}`
    })
  });

  // Obtener datos del cliente
  const { data: client } = useQuery<any>({
    queryKey: [`/api/clients/${clientId || reportData?.clientId}`],
    enabled: !!clientId || !!reportData?.clientId
  });

  // Obtener datos del proyecto si hay projectId
  const { data: project } = useQuery<any>({
    queryKey: [`/api/projects/${projectId || reportData?.projectId}/detailed`],
    enabled: !!projectId || !!reportData?.projectId,
    queryFn: getQueryFn({
      on401: "throw",
      endpoint: `/api/projects/${projectId || reportData?.projectId}/detailed`
    })
  });

  // Obtener conceptos disponibles
  const { data: concepts } = useQuery<Concept[]>({
    queryKey: ['/api/concepts'],
    queryFn: async () => {
      return apiRequest('/api/concepts?active=true');
    }
  });

  // Configuración del formulario
  const form = useForm<ReportFormData>({
    resolver: zodResolver(reportFormSchema),
    defaultValues: {
      clientId: clientId ? parseInt(clientId) : 1,
      clientName: "",
      projectId: projectId ? parseInt(projectId) : 1,
      folioReporte: "",
      diasUso: "",
      nombreObra: "",
      fechaReporte: new Date(),
      periodoRentaInicio: new Date(),
      periodoRentaFin: new Date(),
      includeIva: true,
      items: [{
        numero: "1",
        concepto: "",
        obra: "",
        diasUso: "",
        cantidad: 1,
        unidad: "",
        precioUnitario: 0,
        subtotal: 0
      }]
    }
  });

  const { fields, append, remove, insert } = useFieldArray({
    control: form.control,
    name: "items"
  });

  // El número visible se renderiza directamente desde el índice (index + 1)
  // y el campo `numero` se reasigna al enviar el formulario (ver onSubmit).
  // No se necesita renumerar en runtime — hacerlo provoca re-renders que
  // desincronizan los Controllers de react-hook-form y bloquean la edición
  // de algunos inputs después de eliminar/insertar filas.

  // Establecer el nombre del cliente cuando se carguen los datos
  useEffect(() => {
    if (client && typeof client === 'object' && 'name' in client) {
      form.setValue("clientName", (client as any).name);
    }
  }, [client, form]);

  // Cargar datos del reporte cuando está en modo edición (solo la primera vez)
  useEffect(() => {
    if (isEditMode && reportData && !formInitialized.current) {
      formInitialized.current = true;
      form.reset({
        clientId: reportData.clientId || 0,
        clientName: reportData.clientName || "",
        projectId: reportData.projectId || 0,
        folioReporte: reportData.folioReporte || "",
        diasUso: reportData.diasUso || "",
        nombreObra: reportData.nombreObra || "",
        fechaReporte: new Date(reportData.fechaReporte),
        periodoRentaInicio: reportData.periodoRentaInicio ? new Date(reportData.periodoRentaInicio) : new Date(),
        periodoRentaFin: reportData.periodoRentaFin ? new Date(reportData.periodoRentaFin) : new Date(),
        includeIva: reportData.includeIva,
        items: reportData.items?.map((item: any, index: number) => ({
          numero: (index + 1).toString(),
          concepto: item.concepto,
          obra: item.obra,
          diasUso: item.diasUso || "",
          cantidad: Number(item.cantidad) || 1,
          unidad: item.unidad || "",
          precioUnitario: Number(item.precioUnitario) || 0,
          subtotal: Number(item.subtotal) || 0
        })) || []
      });
    }
  }, [isEditMode, reportData, form]);

  // Autorrellenar el campo de obra cuando se cargan los datos del proyecto
  useEffect(() => {
    if (project && typeof project === 'object' && 'name' in project) {
      const projectName = (project as any).name;
      
      // Solo autorrellenar en modo creación; en edición los datos vienen del reporte guardado
      if (!isEditMode) {
        form.setValue("nombreObra", projectName);
        const currentItems = form.getValues("items");
        currentItems.forEach((_, index) => {
          form.setValue(`items.${index}.obra`, projectName);
        });
      }
    }
  }, [project, form, isEditMode]);



  // Calcular subtotal automáticamente
  const calculateSubtotal = (index: number, newCantidad?: number, newPrecio?: number) => {
    const cantidad = newCantidad ?? form.getValues(`items.${index}.cantidad`);
    const precioUnitario = newPrecio ?? form.getValues(`items.${index}.precioUnitario`);
    const subtotal = cantidad * precioUnitario;
    form.setValue(`items.${index}.subtotal`, subtotal);
    console.log(`💰 Calculated subtotal for item ${index}:`, {
      cantidad,
      precioUnitario,
      subtotal
    });
  };

  // Calcular totales
  const items = form.watch("items") || [];
  const includeIva = form.watch("includeIva");
  const subtotal = items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const iva = includeIva ? subtotal * 0.16 : 0;
  const total = subtotal + iva;

  // Abonos ya guardados (sólo en modo edición)
  const existingAbonos: Array<{ id: number; paymentDate: any; paymentMethod: string; amount: any; reference?: string | null; notes?: string | null }> =
    isEditMode && reportData?.payments ? reportData.payments : [];
  const totalAbonosExistentes = existingAbonos.reduce(
    (sum, p) => sum + parseFloat(String(p.amount || "0")),
    0
  );
  const totalAbonosPendientes = pendingAbonos.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalAbonos = totalAbonosExistentes + totalAbonosPendientes;
  const saldoPendiente = total - totalAbonos;


  // Sincronizar scroll horizontal entre la barra superior y el scroller de la tabla
  // y mantener el ancho de la barra superior igual al ancho real del contenido
  useEffect(() => {
    // En mobile usamos solo el scroll nativo del contenedor inferior.
    // Saltamos la barra superior y el ResizeObserver porque la aparición/desaparición
    // del teclado virtual dispara loops de resize que terminan tumbando la página.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches) {
      return;
    }
    const top = topScrollRef.current;
    const bottom = bottomScrollRef.current;
    const tableEl = tableElRef.current;
    if (!top || !bottom || !tableEl) return;

    let rafId = 0;
    // Sincronización idempotente sin bandera de tiempo: solo escribimos cuando
    // el valor difiere, así no se generan bucles de eventos.
    const onTopScroll = () => {
      if (bottom.scrollLeft !== top.scrollLeft) bottom.scrollLeft = top.scrollLeft;
    };
    const onBottomScroll = () => {
      if (top.scrollLeft !== bottom.scrollLeft) top.scrollLeft = bottom.scrollLeft;
    };

    // Permitir hacer scroll horizontal con la rueda vertical del mouse al estar sobre la barra superior
    const onTopWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 && e.deltaX === 0) {
        e.preventDefault();
        top.scrollLeft += e.deltaY;
      }
    };

    top.addEventListener("scroll", onTopScroll, { passive: true });
    bottom.addEventListener("scroll", onBottomScroll, { passive: true });
    top.addEventListener("wheel", onTopWheel, { passive: false });

    const updateWidth = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // Tomar el mayor ancho real disponible: el contenido desbordado del
          // contenedor inferior y el ancho propio de la tabla (w-max). Así la
          // barra superior siempre refleja el ancho verdadero y puede desplazarse.
          const w = Math.max(
            bottom.scrollWidth,
            tableEl.scrollWidth,
            tableEl.offsetWidth,
            0
          );
          setTableScrollWidth((prev) => (prev === w ? prev : w));
        });
      });
    };
    updateWidth();
    const t1 = window.setTimeout(updateWidth, 100);
    const t2 = window.setTimeout(updateWidth, 500);
    const t3 = window.setTimeout(updateWidth, 1500);
    const ro = new ResizeObserver(updateWidth);
    ro.observe(tableEl);
    ro.observe(bottom);
    window.addEventListener("resize", updateWidth);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      top.removeEventListener("scroll", onTopScroll);
      bottom.removeEventListener("scroll", onBottomScroll);
      top.removeEventListener("wheel", onTopWheel);
      ro.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, [fields.length, isEditMode, reportData]);

  // Scroll automático al último concepto agregado
  useEffect(() => {
    if (lastAddedIndex !== null && rowRefs.current[lastAddedIndex]) {
      setTimeout(() => {
        rowRefs.current[lastAddedIndex]?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        // Quitar el resaltado después de 2 segundos
        setTimeout(() => setLastAddedIndex(null), 2000);
      }, 100);
    }
  }, [lastAddedIndex]);

  // Agregar nuevo concepto al final
  const addConcept = () => {
    const newIndex = fields.length;
    append({
      numero: (newIndex + 1).toString(),
      concepto: "",
      obra: form.getValues("nombreObra") || "",
      diasUso: "",
      cantidad: 1,
      unidad: "",
      precioUnitario: 0,
      subtotal: 0
    });
    setLastAddedIndex(newIndex);
  };

  // Insertar concepto después de un índice específico
  const insertAfter = (afterIndex: number) => {
    const newIndex = afterIndex + 1;
    const newItem = {
      numero: (newIndex + 1).toString(),
      concepto: "",
      obra: form.getValues("nombreObra") || "",
      diasUso: "",
      cantidad: 1,
      unidad: "",
      precioUnitario: 0,
      subtotal: 0
    };
    insert(newIndex, newItem);
    setOpenPopovers(prev => {
      const updated: { [key: number]: boolean } = {};
      Object.entries(prev).forEach(([key, value]) => {
        const k = Number(key);
        if (k < newIndex) {
          updated[k] = value;
        } else {
          updated[k + 1] = value;
        }
      });
      return updated;
    });
    setTimeout(() => {
      setLastAddedIndex(newIndex);
    }, 0);
  };

  // Aplicar concepto predefinido
  const applyConcept = (index: number, conceptId: string) => {
    if (concepts && Array.isArray(concepts)) {
      const concept = concepts.find((c: any) => c.id === parseInt(conceptId));
      if (concept) {
        form.setValue(`items.${index}.concepto`, concept.name);
        form.setValue(`items.${index}.unidad`, concept.defaultUnit || "");
        const price = typeof concept.defaultPrice === 'string' 
          ? parseFloat(concept.defaultPrice) 
          : (concept.defaultPrice || 0);
        form.setValue(`items.${index}.precioUnitario`, price);
        calculateSubtotal(index);
      }
    }
  };

  // Mutación para crear o actualizar el reporte
  const createReportMutation = useMutation({
    mutationFn: async (data: ReportFormData) => {
      if (isEditMode) {
        return apiRequest(`/api/reports/${id}`, {
          method: "PUT",
          body: JSON.stringify(data)
        });
      } else {
        return apiRequest("/api/reports", {
          method: "POST",
          body: JSON.stringify(data)
        });
      }
    },
    onSuccess: async (reportResult) => {
      toast({
        title: isEditMode ? "Reporte actualizado" : "Reporte creado",
        description: isEditMode ? "El reporte se ha actualizado exitosamente." : "El reporte se ha creado exitosamente."
      });

      // Guardar los abonos pendientes (si los hay) en la misma tabla reportPayments
      const savedPendingPayments: any[] = [];
      const failedAbonos: PendingAbono[] = [];
      if (pendingAbonos.length > 0 && reportResult?.id) {
        for (const abono of pendingAbonos) {
          try {
            const saved = await apiRequest(`/api/reports/${reportResult.id}/payments`, {
              method: "POST",
              body: JSON.stringify({
                amount: String(abono.amount),
                paymentDate: abono.paymentDate,
                paymentMethod: abono.paymentMethod,
                reference: abono.reference || null,
                notes: abono.notes || null,
                createdBy: "Usuario"
              })
            });
            savedPendingPayments.push(saved?.payment || saved);
          } catch (err: any) {
            console.error("Error guardando abono:", err);
            failedAbonos.push(abono);
          }
        }
        // Invalidar caches relacionados a abonos
        queryClient.invalidateQueries({ queryKey: [`/api/reports/${reportResult.id}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/reports/${reportResult.id}/payments`] });
        queryClient.invalidateQueries({ queryKey: ['/api/reports', reportResult.id, 'payments'] });

        // Conservar sólo los abonos que fallaron, para que el usuario pueda reintentar
        setPendingAbonos(failedAbonos);

        if (failedAbonos.length > 0) {
          toast({
            title: "Algunos abonos no se guardaron",
            description: `${failedAbonos.length} de ${pendingAbonos.length} abonos no pudieron registrarse. Revisa los datos e intenta de nuevo. El reporte sí se guardó.`,
            variant: "destructive"
          });
          // No navegamos ni generamos PDF: dejamos al usuario en el formulario para reintentar.
          return;
        }
      }

      // Generar y descargar PDF automáticamente (incluyendo abonos)
      try {
        const allPayments = [
          ...(reportResult.payments || existingAbonos || []),
          ...savedPendingPayments
        ];
        const pdf = await generateReportPDF(reportResult, reportResult.items || [], allPayments);
        const reportFileName = `Reporte_${reportResult.folioReporte}_${reportResult.clientName.replace(/\s+/g, '_')}.pdf`;
        savePDFMobile(pdf, reportFileName);
        
        toast({
          title: "PDF generado",
          description: "El PDF del reporte se ha descargado automáticamente."
        });
      } catch (error) {
        console.error("Error generating PDF:", error);
        toast({
          title: "Error en PDF",
          description: "El reporte se guardó pero hubo un error generando el PDF.",
          variant: "destructive"
        });
      }
      
      // Navegar de regreso al cliente
      const targetClientId = clientId || reportResult.clientId || reportData?.clientId;
      if (targetClientId) {
        setLocation(`/clients/${targetClientId}`);
        queryClient.invalidateQueries({ queryKey: [`/api/clients/${targetClientId}`] });
      } else {
        setLocation('/clients');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || (isEditMode ? "No se pudo actualizar el reporte." : "No se pudo crear el reporte."),
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: ReportFormData) => {
    // Asignar números correctos y recalcular subtotales antes de guardar
    const dataWithCorrectNumbers = {
      ...data,
      items: data.items.map((item, i) => {
        const cantidad = Number(item.cantidad) || 0;
        const precioUnitario = Number(item.precioUnitario) || 0;
        return {
          ...item,
          numero: (i + 1).toString(),
          cantidad,
          precioUnitario,
          subtotal: cantidad * precioUnitario
        };
      })
    };
    createReportMutation.mutate(dataWithCorrectNumbers);
  };

  if (!client) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-700">Cargando...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Button 
            variant="ghost" 
            asChild
            className="text-gray-600 hover:text-gray-800"
          >
            <Link href={`/clients/${clientId || reportData?.clientId || ''}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver al Cliente
            </Link>
          </Button>
        </div>
        
        <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-black p-6 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="bg-black/10 p-3 rounded-full">
              <FileText className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">{isEditMode ? 'Editar Reporte' : 'Crear Nuevo Reporte'}</h1>
              <p className="text-black/80 text-lg">
                Cliente: {client && typeof client === 'object' && 'name' in client ? (client as any).name : 'Cargando...'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
          console.log("❌ FORM VALIDATION ERRORS:", errors);
          toast({
            title: "Error en el formulario",
            description: "Por favor revise los campos requeridos.",
            variant: "destructive"
          });
        })} className="space-y-8">
          
          {/* Información General */}
          <Card className="border-l-4 border-l-yellow-500">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100">
              <CardTitle className="flex items-center gap-2 text-gray-800">
                <Building2 className="h-5 w-5" />
                Información General del Reporte
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-6">
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <FormControl>
                        <Input {...field} disabled className="bg-gray-50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="folioReporte"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Folio del Reporte</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ej: FOL-001" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="fechaReporte"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha del Reporte</FormLabel>
                      <FormControl>
                        <AdaptiveDatePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Selecciona fecha"
                          maxDate={new Date()}
                          minDate={new Date("1900-01-01")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                
                <FormField
                  control={form.control}
                  name="nombreObra"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de la OBRA</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ej: Construcción Plaza Central" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="periodoRentaInicio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Período de Renta - Inicio</FormLabel>
                      <FormControl>
                        <AdaptiveDatePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Fecha inicio"
                          minDate={new Date("1900-01-01")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="periodoRentaFin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Período de Renta - Fin</FormLabel>
                      <FormControl>
                        <AdaptiveDatePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Fecha fin"
                          minDate={new Date("1900-01-01")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Conceptos */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <Calculator className="h-5 w-5" />
                Conceptos del Reporte
              </CardTitle>
              <CardDescription>
                Agregue los conceptos, equipos o servicios incluidos en este reporte
                <br />
                <span className="text-xs text-blue-600 font-medium">
                  💡 Tip: Use el botón "+ Agregar Nuevo Concepto" o el botón "+" en cada fila para agregar más conceptos
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {/* Barra de scroll horizontal superior (espejo de la tabla) */}
                <div
                  ref={topScrollRef}
                  className="peza-top-scroll rounded hidden md:block"
                  style={{ height: 16 }}
                  aria-label="Barra de desplazamiento horizontal superior"
                >
                  <div style={{ width: tableScrollWidth || 1, height: 1 }} />
                </div>
                <div ref={bottomScrollRef} className="overflow-x-auto overflow-y-hidden">
                <table ref={tableElRef} className="w-max min-w-full caption-bottom text-sm">
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-16">N°</TableHead>
                        <TableHead className="min-w-52">Concepto</TableHead>
                        <TableHead className="min-w-40">Obra</TableHead>
                        <TableHead className="min-w-[160px]">Días de Uso</TableHead>
                        <TableHead className="min-w-[120px]">Cantidad</TableHead>
                        <TableHead className="min-w-[140px]">Unidad</TableHead>
                        <TableHead className="min-w-[180px]">Precio Unit.</TableHead>
                        <TableHead className="min-w-[160px]">Subtotal</TableHead>
                        <TableHead className="w-20">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.map((field, index) => (
                        <TableRow 
                          key={`${field.id}-${index}`}
                          ref={(el) => (rowRefs.current[index] = el)}
                          className={cn(
                            "transition-colors duration-500",
                            lastAddedIndex === index && "bg-green-100 border-l-4 border-l-green-500"
                          )}
                        >
                          <TableCell>
                            <div className="w-12 h-9 flex items-center justify-center font-bold text-gray-700 bg-gray-100 rounded border text-sm">
                              {index + 1}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <Popover
                                open={openPopovers[index] ?? false}
                                onOpenChange={(open) => setOpenPopovers(prev => ({ ...prev, [index]: open }))}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between"
                                  >
                                    {form.watch(`items.${index}.concepto`) || "Seleccionar concepto..."}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-0">
                                  <Command filter={conceptFilter}>
                                    <CommandInput placeholder="Buscar concepto..." />
                                    <CommandEmpty>No se encontró ningún concepto.</CommandEmpty>
                                    <CommandGroup>
                                      {concepts && Array.isArray(concepts) ? concepts.map((concept: any) => (
                                        <CommandItem
                                          key={concept.id}
                                          value={concept.name}
                                          onSelect={() => {
                                            applyConcept(index, concept.id.toString());
                                            setOpenPopovers(prev => ({ ...prev, [index]: false }));
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              form.watch(`items.${index}.concepto`) === concept.name
                                                ? "opacity-100"
                                                : "opacity-0"
                                            )}
                                          />
                                          <div className="flex flex-col">
                                            <span className="font-medium">{concept.name}</span>
                                            <span className="text-sm text-gray-500">
                                              {concept.defaultUnit} - ${concept.defaultPrice}
                                            </span>
                                          </div>
                                        </CommandItem>
                                      )) : null}
                                    </CommandGroup>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                              <FormField
                                control={form.control}
                                name={`items.${index}.concepto`}
                                render={({ field }) => (
                                  <Input
                                    {...field}
                                    value={field.value ?? ""}
                                    onChange={(e) => field.onChange(e.target.value)}
                                    placeholder="O escribir concepto personalizado..."
                                  />
                                )}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.obra`}
                              render={({ field }) => (
                                <Input
                                  {...field}
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value)}
                                  placeholder="Nombre de obra"
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.diasUso`}
                              render={({ field }) => (
                                <Input 
                                  {...field}
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value)}
                                  placeholder="Ej: 1 Sept, 2 Sept, 3 Sept"
                                  className="w-full min-w-[160px] text-center bg-orange-50 border-orange-300 focus:border-orange-500 focus:bg-orange-100"
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.cantidad`}
                              render={({ field }) => (
                                <NumericCell
                                  value={Number(field.value) || 0}
                                  onCommit={(n) => {
                                    field.onChange(n);
                                    calculateSubtotal(index, n);
                                  }}
                                  placeholder="1"
                                  ariaLabel="Cantidad"
                                  className="w-full min-w-[120px] text-center font-mono text-base bg-blue-50 border-blue-300 focus:border-blue-500 focus:bg-blue-100"
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.unidad`}
                              render={({ field }) => (
                                <Input
                                  {...field}
                                  value={field.value ?? ""}
                                  onChange={(e) => field.onChange(e.target.value)}
                                  placeholder="Unidad"
                                  className="w-full min-w-[140px]"
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <FormField
                              control={form.control}
                              name={`items.${index}.precioUnitario`}
                              render={({ field }) => (
                                <NumericCell
                                  value={Number(field.value) || 0}
                                  onCommit={(n) => {
                                    field.onChange(n);
                                    calculateSubtotal(index, undefined, n);
                                  }}
                                  placeholder="0.00"
                                  ariaLabel="Precio unitario"
                                  className="w-full min-w-[180px] text-right font-mono text-base bg-yellow-50 border-yellow-300 focus:border-yellow-500 focus:bg-yellow-100"
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="bg-green-50 border border-green-300 rounded px-3 py-2 text-right">
                              <span className="font-mono font-bold text-green-700 text-base">
                                ${form.watch(`items.${index}.subtotal`)?.toFixed(2) || "0.00"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => insertAfter(index)}
                                className="text-green-600 hover:text-green-800 hover:bg-green-50"
                                title="Agregar concepto después de esta fila"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              
                              {fields.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    remove(index);
                                    setOpenPopovers(prev => {
                                      const updated: { [key: number]: boolean } = {};
                                      Object.entries(prev).forEach(([key, value]) => {
                                        const k = Number(key);
                                        if (k < index) {
                                          updated[k] = value;
                                        } else if (k > index) {
                                          updated[k - 1] = value;
                                        }
                                      });
                                      return updated;
                                    });
                                  }}
                                  className="text-red-600 hover:text-red-800 hover:bg-red-50"
                                  title="Eliminar este concepto"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </table>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 sm:items-center">
                  <Button 
                    type="button" 
                    onClick={addConcept}
                    variant="outline"
                    className="border-blue-500 text-blue-600 hover:bg-blue-50 w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Nuevo Concepto
                  </Button>
                  
                  <div className="text-sm text-gray-600 flex items-center justify-center sm:justify-start">
                    <span>Total de conceptos: {fields.length}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Adelantos / Abonos */}
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-purple-100">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="flex items-center gap-2 text-purple-800">
                  <CreditCard className="h-5 w-5" />
                  Adelantos / Abonos
                </CardTitle>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setAbonoDraft({
                      paymentDate: new Date(),
                      paymentMethod: "transferencia",
                      amount: 0,
                      reference: "",
                      notes: ""
                    });
                    setAbonoDialogOpen(true);
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Abono
                </Button>
              </div>
              <CardDescription className="text-purple-700">
                Registra cualquier pago o adelanto que el cliente haya entregado. Se restará automáticamente del total para mostrar el saldo pendiente.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              {isEditMode && existingAbonos.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                    <Info className="h-4 w-4 text-gray-500" />
                    <span className="font-medium">Abonos ya registrados ({existingAbonos.length})</span>
                  </div>
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead>Referencia</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {existingAbonos.map((p) => {
                          const d = p.paymentDate ? new Date(p.paymentDate) : null;
                          const dateStr = d && !isNaN(d.getTime())
                            ? format(d, "dd/MM/yyyy", { locale: es })
                            : "-";
                          return (
                            <TableRow key={p.id}>
                              <TableCell>{dateStr}</TableCell>
                              <TableCell className="capitalize">{p.paymentMethod}</TableCell>
                              <TableCell className="text-gray-600">{p.reference || "-"}</TableCell>
                              <TableCell className="text-right font-medium text-green-700">
                                ${parseFloat(String(p.amount || "0")).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Para editar o eliminar abonos ya registrados, usa el botón "Abonos" del reporte en la pestaña de Reportes del cliente.
                  </p>
                </div>
              )}

              {pendingAbonos.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                    <Plus className="h-4 w-4 text-purple-600" />
                    <span className="font-medium">Nuevos abonos a guardar ({pendingAbonos.length})</span>
                  </div>
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Fecha</TableHead>
                          <TableHead>Método</TableHead>
                          <TableHead>Referencia</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead className="w-12"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingAbonos.map((p, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{format(p.paymentDate, "dd/MM/yyyy", { locale: es })}</TableCell>
                            <TableCell className="capitalize">{p.paymentMethod}</TableCell>
                            <TableCell className="text-gray-600">{p.reference || "-"}</TableCell>
                            <TableCell className="text-right font-medium text-purple-700">
                              ${p.amount.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setPendingAbonos(prev => prev.filter((_, i) => i !== idx))}
                                className="text-red-500 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {existingAbonos.length === 0 && pendingAbonos.length === 0 && (
                <div className="text-center py-6 text-gray-500 border-2 border-dashed rounded-lg">
                  <CreditCard className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">Aún no hay abonos registrados</p>
                  <p className="text-xs text-gray-400 mt-1">Haz clic en "Agregar Abono" para registrar un adelanto</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Totales e IVA */}
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="bg-gradient-to-r from-green-50 to-green-100">
              <CardTitle className="flex items-center gap-2 text-green-800">
                <Calculator className="h-5 w-5" />
                Totales
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <FormField
                    control={form.control}
                    name="includeIva"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <FormLabel className="text-base font-medium">
                            Incluir IVA (16%)
                          </FormLabel>
                          <p className="text-sm text-gray-600">
                            Agregar 16% de IVA al total
                          </p>
                        </div>
                        <FormControl>
                          <Switch 
                            checked={field.value} 
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                    <span className="font-medium">Subtotal:</span>
                    <span className="font-bold text-lg">${subtotal.toFixed(2)}</span>
                  </div>
                  {includeIva && (
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded">
                      <span className="font-medium">IVA (16%):</span>
                      <span className="font-bold text-lg text-blue-600">${iva.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={cn(
                    "flex justify-between items-center p-4 rounded-lg",
                    totalAbonos > 0
                      ? "bg-gray-100 text-gray-800"
                      : "bg-gradient-to-r from-yellow-400 to-yellow-500 text-black"
                  )}>
                    <span className="font-bold text-lg">TOTAL:</span>
                    <span className="font-bold text-2xl">${total.toFixed(2)}</span>
                  </div>
                  {totalAbonos > 0 && (
                    <>
                      <div className="flex justify-between items-center p-3 bg-purple-50 rounded">
                        <span className="font-medium text-purple-800">Abonos:</span>
                        <span className="font-bold text-lg text-purple-700">
                          -${totalAbonos.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-4 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-lg">
                        <span className="font-bold text-lg">SALDO PENDIENTE:</span>
                        <span className="font-bold text-2xl">${saldoPendiente.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Diálogo para agregar un abono */}
          <Dialog open={abonoDialogOpen} onOpenChange={setAbonoDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-purple-600" />
                  Registrar Abono / Adelanto
                </DialogTitle>
                <DialogDescription>
                  Captura los datos del pago recibido. Se restará del total del reporte.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-sm font-medium">Fecha del pago</Label>
                  <AdaptiveDatePicker
                    value={abonoDraft.paymentDate}
                    onChange={(d) => d && setAbonoDraft(prev => ({ ...prev, paymentDate: d }))}
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium">Método de pago</Label>
                  <Select
                    value={abonoDraft.paymentMethod}
                    onValueChange={(v) =>
                      setAbonoDraft(prev => ({ ...prev, paymentMethod: v as PendingAbono["paymentMethod"] }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="transferencia">Transferencia</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="deposito">Depósito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm font-medium">Monto</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={abonoDraft.amount === 0 ? "" : abonoDraft.amount}
                    onChange={(e) => {
                      const v = e.target.value;
                      setAbonoDraft(prev => ({ ...prev, amount: v === "" ? 0 : parseFloat(v) || 0 }));
                    }}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium">Referencia (opcional)</Label>
                  <Input
                    value={abonoDraft.reference || ""}
                    onChange={(e) => setAbonoDraft(prev => ({ ...prev, reference: e.target.value }))}
                    placeholder="No. de cheque, folio de transferencia, etc."
                  />
                </div>

                <div>
                  <Label className="text-sm font-medium">Notas (opcional)</Label>
                  <Textarea
                    rows={2}
                    value={abonoDraft.notes || ""}
                    onChange={(e) => setAbonoDraft(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Ej. Adelanto recibido al firmar contrato"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAbonoDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => {
                    if (!abonoDraft.amount || abonoDraft.amount <= 0) {
                      toast({
                        title: "Monto inválido",
                        description: "El monto del abono debe ser mayor a 0.",
                        variant: "destructive"
                      });
                      return;
                    }
                    setPendingAbonos(prev => [...prev, { ...abonoDraft }]);
                    setAbonoDialogOpen(false);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Botones de acción */}
          <div className="flex justify-end gap-4">
            <Button 
              type="button" 
              variant="outline"
              asChild
            >
              <Link href={`/clients/${clientId}`}>
                Cancelar
              </Link>
            </Button>
            <Button 
              type="submit"
              disabled={createReportMutation.isPending}
              className="bg-yellow-500 hover:bg-yellow-600 text-black"
            >
              {createReportMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></div>
                  {isEditMode ? 'Actualizando...' : 'Creando...'}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isEditMode ? 'Actualizar Reporte' : 'Crear Reporte'}
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}