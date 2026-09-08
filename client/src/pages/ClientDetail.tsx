import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, savePDFMobile } from "@/lib/utils";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Client, ClientProject, Quotation, Report, clientSchema, ReportPayment, reportPaymentInsertSchema } from "@shared/schema";
import { 
  ArrowLeft, 
  Building2, 
  Calendar, 
  FilePlus, 
  Loader2, 
  Pencil, 
  Plus, 
  Trash2, 
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  DollarSign,
  TrendingUp,
  Eye,
  FileBarChart,
  Download,
  Edit,
  BarChart3,
  Filter,
  Calculator,
  Edit3,
  PieChart,
  FileSpreadsheet,
  Wallet,
  CreditCard,
  Banknote,
  X,
  Copy
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { generateReportPDF } from "@/lib/report-pdf-generator";
import { downloadAccountStatementPDF } from "@/lib/account-statement-pdf-generator";
import { downloadPaymentNoticePDF } from "@/lib/payment-notice-pdf-generator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

const getPaymentStatusBadge = (status: string) => {
  switch (status) {
    case 'pagado':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Pagado</Badge>;
    case 'facturado':
      return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Facturado</Badge>;
    case 'vencido':
      return <Badge className="bg-red-100 text-red-800 border-red-200">Vencido</Badge>;
    case 'pendiente':
    default:
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pendiente</Badge>;
  }
};

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newProjectName, setNewProjectName] = useState("");
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleteReportDialogOpen, setIsDeleteReportDialogOpen] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<any>(null);
  const [isDeleteProjectDialogOpen, setIsDeleteProjectDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<any>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  
  // Estados para gestión de abonos
  const [isPaymentsDialogOpen, setIsPaymentsDialogOpen] = useState(false);
  const [selectedReportForPayments, setSelectedReportForPayments] = useState<any>(null);
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentMethod, setNewPaymentMethod] = useState("");
  const [newPaymentReference, setNewPaymentReference] = useState("");
  const [newPaymentNotes, setNewPaymentNotes] = useState("");
  const [newPaymentDate, setNewPaymentDate] = useState<Date>(new Date());

  // Estados para un abono distribuido entre varios reportes
  const [isPartialPaymentDialogOpen, setIsPartialPaymentDialogOpen] = useState(false);
  const [partialPaymentDate, setPartialPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [partialPaymentMethod, setPartialPaymentMethod] = useState("");
  const [partialPaymentReference, setPartialPaymentReference] = useState("");
  const [partialPaymentNotes, setPartialPaymentNotes] = useState("");
  const [partialPaymentTotal, setPartialPaymentTotal] = useState("");
  const [partialAllocations, setPartialAllocations] = useState<Record<number, string>>({});
  
  // Estados para edición de abonos
  const [isEditPaymentDialogOpen, setIsEditPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<ReportPayment | null>(null);
  const [editPaymentMethod, setEditPaymentMethod] = useState("");
  const [editPaymentReference, setEditPaymentReference] = useState("");
  const [editPaymentNotes, setEditPaymentNotes] = useState("");
  const [editPaymentDate, setEditPaymentDate] = useState<Date>(new Date());
  
  // Estados para filtros de fecha personalizada
  const [periodFilter, setPeriodFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();

  // Especificamos el tipo Client para evitar errores de tipado
  const { data: client, isLoading, isError } = useQuery<Client & { reports?: any[], totalReports?: number, totalReportAmount?: string }>({
    queryKey: ['/api/clients', id],
    queryFn: getQueryFn({
      on401: "throw",
      endpoint: `/api/clients/${id}`
    }),
    staleTime: 60000, // Cache durante 1 minuto
    gcTime: 300000, // Limpiar cache después de 5 minutos de inactividad
  });

  // Memoización de reportes agrupados por proyecto para evitar recálculos innecesarios
  const reportsByProject = useMemo(() => {
    if (!client?.reports) return {};
    const grouped = (client.reports as Report[]).reduce((acc: Record<string, Report[]>, report: Report) => {
      const projectName = report.nombreObra || 'Sin Proyecto';
      if (!acc[projectName]) acc[projectName] = [];
      acc[projectName].push(report);
      return acc;
    }, {} as Record<string, Report[]>);
    Object.values(grouped).forEach((arr: any[]) => arr.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    return grouped;
  }, [client?.reports]);

  // Memoización de totales calculados
  const accountStats = useMemo(() => {
    const totalAmount = parseFloat(client?.totalReportAmount || "0");
    const totalReports = client?.totalReports || 0;
    const averagePerReport = totalReports > 0 ? totalAmount / totalReports : 0;
    const pendingAmount = parseFloat((client as any)?.totalPendingAmount || "0");
    
    return { totalAmount, totalReports, averagePerReport, pendingAmount };
  }, [client?.totalReportAmount, client?.totalReports, (client as any)?.totalPendingAmount]);

  const collectibleReports = useMemo(() => {
    const statuses = new Set(["pendiente", "facturado", "vencido"]);
    return ((client?.reports || []) as any[])
      .map(report => ({
        ...report,
        balance: Math.max(0, Number(report.paymentSummary?.remaining ?? report.total ?? 0))
      }))
      .filter(report => statuses.has(report.paymentStatus || "pendiente") && report.balance >= 0.01)
      .sort((a, b) => new Date(a.fechaReporte || a.createdAt).getTime() - new Date(b.fechaReporte || b.createdAt).getTime());
  }, [client?.reports]);

  const partialTotalCents = Math.round((Number(partialPaymentTotal) || 0) * 100);
  const partialAllocatedCents = collectibleReports.reduce(
    (sum, report) => sum + Math.round((Number(partialAllocations[report.id]) || 0) * 100),
    0
  );
  const partialDifferenceCents = partialTotalCents - partialAllocatedCents;

  const form = useForm<z.infer<typeof clientSchema>>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      email: "",
    },
  });

  // Actualizar los valores del formulario cuando se carga el cliente
  useEffect(() => {
    if (client && typeof client === 'object') {
      form.reset({
        name: client.name || "",
        email: client.email || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client]);

  // Mutación para actualizar cliente
  const updateClientMutation = useMutation({
    mutationFn: async (data: z.infer<typeof clientSchema>) => {
      return apiRequest(`/api/clients/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "Cliente actualizado",
        description: "La información del cliente ha sido actualizada con éxito.",
      });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el cliente: " + (error.message || "Error desconocido"),
        variant: "destructive",
      });
    },
  });

  // Mutación para crear proyecto
  const createProjectMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest(`/api/clients/${id}/projects`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Proyecto creado",
        description: "El proyecto ha sido creado con éxito.",
      });
      setNewProjectName("");
      setIsAddingProject(false);
      queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo crear el proyecto: " + (error.message || "Error desconocido"),
        variant: "destructive",
      });
    },
  });

  // Mutación para eliminar proyecto
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      return apiRequest(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      toast({
        title: "Proyecto eliminado",
        description: "El proyecto ha sido eliminado exitosamente.",
      });
      setIsDeleteProjectDialogOpen(false);
      setProjectToDelete(null);
      // Forzar actualización inmediata de los datos del cliente
      queryClient.removeQueries({ queryKey: ['/api/clients', id] });
      await queryClient.refetchQueries({ 
        queryKey: ['/api/clients', id],
        type: 'active'
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el proyecto.",
        variant: "destructive",
      });
    },
  });

  // Mutación para actualizar nombre de proyecto
  const updateProjectMutation = useMutation({
    mutationFn: async ({ projectId, name }: { projectId: number; name: string }) => {
      return apiRequest(`/api/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Proyecto actualizado",
        description: "El nombre del proyecto se actualizó correctamente.",
      });
      setEditingProjectId(null);
      setEditingProjectName("");
      queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar el proyecto.",
        variant: "destructive",
      });
    },
  });

  // Mutación para eliminar cliente
  const deleteClientMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/clients/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Cliente eliminado",
        description: "El cliente ha sido eliminado con éxito.",
      });
      setIsDeleteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      setLocation("/clients");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo eliminar el cliente: " + (error.message || "Error desconocido"),
        variant: "destructive",
      });
    },
  });

  // Funciones para manejar reportes
  const [downloadingQuotationId, setDownloadingQuotationId] = useState<number | null>(null);

  const handleDownloadQuotationPDF = async (quotation: any) => {
    setDownloadingQuotationId(quotation.id);
    try {
      const { downloadEnhancedQuotationPDF } = await import('@/lib/enhanced-pdf-generator');
      await downloadEnhancedQuotationPDF(quotation.quotationNumber);
      toast({
        title: "PDF descargado",
        description: `La cotización COT-${quotation.quotationNumber} se ha descargado exitosamente.`
      });
    } catch (error) {
      console.error("Error generating quotation PDF:", error);
      toast({
        title: "Error",
        description: "No se pudo generar el PDF de la cotización.",
        variant: "destructive"
      });
    } finally {
      setDownloadingQuotationId(null);
    }
  };

  const handleDownloadReportPDF = async (report: any) => {
    try {
      // Obtener los items del reporte
      console.log('🔍 Obteniendo reporte:', report.id);
      const reportWithItems = await apiRequest(`/api/reports/${report.id}`);
      console.log('📊 Report data recibido:', reportWithItems);
      console.log('📋 Items en reporte:', reportWithItems.items);
      
      const pdf = await generateReportPDF(
        reportWithItems,
        reportWithItems.items || [],
        reportWithItems.payments || []
      );
      const reportFileName = `Reporte_${reportWithItems.folioReporte || reportWithItems.reportNumber}_${reportWithItems.clientName.replace(/\s+/g, '_')}.pdf`;
      savePDFMobile(pdf, reportFileName);
      
      toast({
        title: "PDF descargado",
        description: "El PDF del reporte se ha descargado exitosamente."
      });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error",
        description: "No se pudo generar el PDF del reporte.",
        variant: "destructive"
      });
    }
  };

  const handleDuplicateReport = (report: any) => {
    duplicateReportMutation.mutate(report.id);
  };

  // Mutación para duplicar reporte
  const duplicateReportMutation = useMutation({
    mutationFn: async (reportId: number) => {
      return apiRequest(`/api/reports/${reportId}/duplicate`, {
        method: "POST"
      });
    },
    onSuccess: async (duplicatedReport: any) => {
      // PASO 1: Actualización optimista inmediata del cache local
      queryClient.setQueryData(['/api/clients', id], (oldData: any) => {
        if (!oldData) return oldData;
        
        // Agregar el nuevo reporte duplicado a la lista de reportes
        const updatedReports = oldData.reports 
          ? [...oldData.reports, duplicatedReport]
          : [duplicatedReport];
        
        return {
          ...oldData,
          reports: updatedReports,
          totalReports: (oldData.totalReports || 0) + 1
        };
      });
      
      // PASO 2: Mostrar toast inmediatamente
      toast({
        title: "✅ Reporte duplicado",
        description: `El reporte se ha duplicado exitosamente como "${duplicatedReport.folioReporte}".`
      });
      
      // PASO 3: Sincronizar con el servidor en segundo plano
      // Esto asegura que los datos se mantengan correctos
      queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo duplicar el reporte.",
        variant: "destructive"
      });
    }
  });

  // Mutación para eliminar reporte
  const deleteReportMutation = useMutation({
    mutationFn: async (reportId: number) => {
      return apiRequest(`/api/reports/${reportId}`, {
        method: "DELETE"
      });
    },
    onSuccess: async () => {
      toast({
        title: "Reporte eliminado",
        description: "El reporte se ha eliminado exitosamente."
      });
      setIsDeleteReportDialogOpen(false);
      setReportToDelete(null);
      // Forzar actualización inmediata de los datos del cliente
      await queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
      await queryClient.refetchQueries({ queryKey: ['/api/clients', id] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el reporte.",
        variant: "destructive"
      });
    }
  });

  // Función para generar estado de cuenta PDF
  const handleDownloadAccountStatement = async () => {
    try {
      // Invalidar cache para asegurar datos más recientes
      await queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
      await queryClient.refetchQueries({ queryKey: ['/api/clients', id] });
      
      await downloadAccountStatementPDF(parseInt(id!), client?.name || '');
      toast({
        title: "PDF generado",
        description: "El estado de cuenta se ha descargado exitosamente."
      });
    } catch (error) {
      console.error("Error generating account statement:", error);
      toast({
        title: "Error",
        description: "No se pudo generar el estado de cuenta.",
        variant: "destructive"
      });
    }
  };

  const handleDownloadSummaryStatement = async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
      await queryClient.refetchQueries({ queryKey: ['/api/clients', id] });

      await downloadPaymentNoticePDF(parseInt(id!), client?.name || '');
      toast({
        title: "PDF generado",
        description: "El estado de cuenta resumido se ha descargado exitosamente."
      });
    } catch (error) {
      console.error("Error generating summary statement:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo generar el estado de cuenta resumido.",
        variant: "destructive"
      });
    }
  };

  // Función para actualizar estado de pago de un reporte
  const updateReportPaymentStatus = useMutation({
    mutationFn: async ({ reportId, status }: { reportId: number, status: string }) => {
      return apiRequest(`/api/reports/${reportId}/payment-status`, {
        method: "PATCH",
        body: JSON.stringify({ paymentStatus: status })
      });
    },
    onMutate: async ({ reportId, status }) => {
      // Actualización optimista inmediata: refleja el cambio en la UI sin esperar al servidor
      await queryClient.cancelQueries({ queryKey: ['/api/clients', id] });
      const previousClient = queryClient.getQueryData<any>(['/api/clients', id]);
      if (previousClient?.reports) {
        queryClient.setQueryData<any>(['/api/clients', id], {
          ...previousClient,
          reports: previousClient.reports.map((r: any) =>
            r.id === reportId ? { ...r, paymentStatus: status } : r
          ),
        });
      }
      return { previousClient };
    },
    onSuccess: async (data, variables) => {
      toast({
        title: "Estado actualizado",
        description: `Estado de pago cambiado a "${variables.status}".`
      });
      // Refetch explícito para sincronizar con el servidor (puede haber cambios automáticos en abonos)
      await queryClient.refetchQueries({ queryKey: ['/api/clients', id] });
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
      queryClient.invalidateQueries({ queryKey: [`/api/reports/${variables.reportId}/payments`] });
    },
    onError: (error: any, _variables, context: any) => {
      // Restaurar el estado previo si la mutación falla
      if (context?.previousClient) {
        queryClient.setQueryData(['/api/clients', id], context.previousClient);
      }
      toast({
        title: "Error",
        description: error?.message || "No se pudo actualizar el estado de pago.",
        variant: "destructive"
      });
    }
  });

  // Query para obtener abonos de un reporte
  const { data: reportPayments, refetch: refetchPayments } = useQuery({
    queryKey: [`/api/reports/${selectedReportForPayments?.id}/payments`],
    queryFn: getQueryFn({ 
      on401: "throw", 
      endpoint: `/api/reports/${selectedReportForPayments?.id}/payments` 
    }),
    enabled: !!selectedReportForPayments?.id,
  });

  // Mutación para agregar abono
  const addPaymentMutation = useMutation({
    mutationFn: async (paymentData: {
      amount: string;
      paymentDate: Date;
      paymentMethod: string;
      reference?: string;
      notes?: string;
    }) => {
      return apiRequest(`/api/reports/${selectedReportForPayments?.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          ...paymentData,
          createdBy: "Usuario"
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Abono agregado",
        description: "El abono se ha registrado exitosamente."
      });
      // Limpiar formulario
      setNewPaymentAmount("");
      setNewPaymentMethod("");
      setNewPaymentReference("");
      setNewPaymentNotes("");
      setNewPaymentDate(new Date());
      // Refrescar datos
      refetchPayments();
      queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo agregar el abono.",
        variant: "destructive"
      });
    }
  });

  const partialPaymentMutation = useMutation({
    mutationFn: async () => {
      const allocations = collectibleReports
        .map(report => ({
          reportId: report.id,
          amount: Math.round((Number(partialAllocations[report.id]) || 0) * 100) / 100
        }))
        .filter(allocation => allocation.amount > 0);
      return apiRequest(`/api/clients/${id}/partial-payment`, {
        method: "POST",
        body: JSON.stringify({
          paymentDate: partialPaymentDate,
          paymentMethod: partialPaymentMethod,
          reference: partialPaymentReference || undefined,
          notes: partialPaymentNotes || undefined,
          totalAmount: partialTotalCents / 100,
          allocations
        })
      });
    },
    onSuccess: async () => {
      toast({
        title: "Abono parcial registrado",
        description: "El pago se distribuyó correctamente entre los reportes."
      });
      setIsPartialPaymentDialogOpen(false);
      setPartialPaymentMethod("");
      setPartialPaymentReference("");
      setPartialPaymentNotes("");
      setPartialPaymentTotal("");
      setPartialAllocations({});
      await queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
      await queryClient.refetchQueries({ queryKey: ['/api/clients', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/reports'] });
      queryClient.invalidateQueries({ queryKey: ['/api/accounts-receivable'] });
    },
    onError: (error: any) => {
      toast({
        title: "No se pudo registrar el abono",
        description: error?.message || "Verifica los montos e inténtalo nuevamente.",
        variant: "destructive"
      });
    }
  });

  // Mutación para eliminar abono
  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: number) => {
      return apiRequest(`/api/reports/${selectedReportForPayments?.id}/payments/${paymentId}`, {
        method: "DELETE"
      });
    },
    onSuccess: () => {
      toast({
        title: "Abono eliminado",
        description: "El abono se ha eliminado exitosamente."
      });
      refetchPayments();
      queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el abono.",
        variant: "destructive"
      });
    }
  });

  // Mutación para editar abono
  const editPaymentMutation = useMutation({
    mutationFn: async (paymentData: {
      paymentId: number;
      paymentDate: Date;
      paymentMethod: string;
      reference?: string;
      notes?: string;
    }) => {
      const { paymentId, ...updateData } = paymentData;
      return apiRequest(`/api/reports/${selectedReportForPayments?.id}/payments/${paymentId}`, {
        method: "PATCH",
        body: JSON.stringify(updateData)
      });
    },
    onSuccess: () => {
      toast({
        title: "Abono actualizado",
        description: "El abono se ha actualizado exitosamente."
      });
      
      // Cerrar diálogo y limpiar estado solo después del éxito
      setIsEditPaymentDialogOpen(false);
      setEditingPayment(null);
      
      // Refrescar datos
      refetchPayments();
      
      // Invalidar cachés relevantes
      queryClient.invalidateQueries({ queryKey: ['/api/clients', id] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      if (selectedReportForPayments?.id) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/reports', selectedReportForPayments.id, 'payments'] 
        });
      }
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "No se pudo actualizar el abono.";
      const errorDetails = error?.errors 
        ? error.errors.map((e: any) => e.message).join(", ")
        : "";
      
      toast({
        title: "Error al actualizar abono",
        description: errorDetails || errorMessage,
        variant: "destructive"
      });
      
      // El diálogo permanece abierto para que el usuario pueda corregir el error
    }
  });

  // Convierte un Date a string YYYY-MM-DD para input type="date" de forma segura
  const toDateInputValue = (date: Date | null | undefined): string => {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) return '';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  // Parsea el valor de un input type="date" (YYYY-MM-DD) a Date local
  const parseDateInput = (value: string): Date | null => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    const d = new Date(year, month - 1, day);
    return isNaN(d.getTime()) ? null : d;
  };

  // Formatea una fecha de pago de forma segura para mostrar en pantalla
  const safeFormatPaymentDate = (paymentDate: any): string => {
    try {
      const d = paymentDate instanceof Date ? paymentDate : new Date(paymentDate);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' });
    } catch {
      return '—';
    }
  };

  // Función para abrir diálogo de abonos
  const handleOpenPaymentsDialog = (report: any) => {
    setSelectedReportForPayments(report);
    setIsPaymentsDialogOpen(true);
  };

  const distributePartialPayment = () => {
    let remainingCents = partialTotalCents;
    const allocations: Record<number, string> = {};
    for (const report of collectibleReports) {
      const balanceCents = Math.round(report.balance * 100);
      const assignedCents = Math.min(balanceCents, Math.max(0, remainingCents));
      allocations[report.id] = assignedCents > 0 ? (assignedCents / 100).toFixed(2) : "";
      remainingCents -= assignedCents;
    }
    setPartialAllocations(allocations);
  };

  const canSavePartialPayment =
    partialTotalCents > 0 &&
    partialAllocatedCents === partialTotalCents &&
    partialPaymentDate !== "" &&
    partialPaymentMethod !== "" &&
    !collectibleReports.some(report =>
      Math.round((Number(partialAllocations[report.id]) || 0) * 100) > Math.round(report.balance * 100)
    );

  // Función para agregar abono
  const handleAddPayment = () => {
    if (!newPaymentAmount || !newPaymentMethod) {
      toast({
        title: "Error",
        description: "Monto y método de pago son obligatorios.",
        variant: "destructive"
      });
      return;
    }

    const amount = parseFloat(newPaymentAmount);
    if (amount <= 0) {
      toast({
        title: "Error",
        description: "El monto debe ser mayor a 0.",
        variant: "destructive"
      });
      return;
    }

    addPaymentMutation.mutate({
      amount: newPaymentAmount,
      paymentDate: newPaymentDate,
      paymentMethod: newPaymentMethod,
      reference: newPaymentReference || undefined,
      notes: newPaymentNotes || undefined
    });
  };

  // Función para abrir diálogo de edición de abono
  const handleOpenEditPayment = (payment: ReportPayment) => {
    setEditingPayment(payment);
    setEditPaymentMethod(payment.paymentMethod || "");
    setEditPaymentReference(payment.reference || "");
    setEditPaymentNotes(payment.notes || "");
    
    // Validación segura de fecha
    const paymentDate = payment.paymentDate instanceof Date 
      ? payment.paymentDate 
      : new Date(payment.paymentDate);
    
    // Verificar que la fecha es válida
    if (!isNaN(paymentDate.getTime())) {
      setEditPaymentDate(paymentDate);
    } else {
      setEditPaymentDate(new Date());
    }
    
    setIsEditPaymentDialogOpen(true);
  };

  // Función para guardar cambios de edición de abono
  const handleSaveEditPayment = () => {
    if (!editingPayment) {
      toast({
        title: "Error",
        description: "No hay un abono seleccionado para editar.",
        variant: "destructive"
      });
      return;
    }

    if (!editPaymentMethod) {
      toast({
        title: "Error",
        description: "El método de pago es obligatorio.",
        variant: "destructive"
      });
      return;
    }

    editPaymentMutation.mutate({
      paymentId: editingPayment.id,
      paymentDate: editPaymentDate,
      paymentMethod: editPaymentMethod,
      reference: editPaymentReference || undefined,
      notes: editPaymentNotes || undefined
    });
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (newProjectName.trim()) {
      createProjectMutation.mutate(newProjectName.trim());
    }
  };

  const onSubmit = (data: z.infer<typeof clientSchema>) => {
    updateClientMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !client) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center h-64">
          <h1 className="text-2xl font-bold mb-4">Cliente no encontrado</h1>
          <p className="text-muted-foreground mb-4">El cliente solicitado no existe o ha sido eliminado.</p>
          <Button asChild>
            <Link href="/clients">
              <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Clientes
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6 bg-gradient-to-br from-gray-50 to-yellow-50/20 min-h-screen">
      {/* Header con gradiente corporativo */}
      <div className="bg-gradient-to-r from-gray-900 to-black p-6 rounded-lg shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              asChild
              className="text-white hover:bg-gray-800 hover:text-yellow-400 transition-colors"
            >
              <Link href="/clients">
                <ArrowLeft className="h-4 w-4 mr-1" /> Volver
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center">
                <Building2 className="w-6 h-6 text-black" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">
                  {isEditing ? "Editar Cliente" : client.name}
                </h1>
                <p className="text-gray-300 flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  {client.email}
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {!isEditing && (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditing(true)}
                  className="bg-yellow-500 hover:bg-yellow-600 text-black border-yellow-500 hover:border-yellow-600 font-semibold"
                >
                  <Pencil className="h-4 w-4 mr-1" /> Editar
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {isEditing ? (
        <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-l-4 border-l-yellow-500">
          <CardHeader className="bg-gradient-to-r from-gray-900 to-black text-white">
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Editar Información de Cliente
            </CardTitle>
            <CardDescription className="text-gray-300">
              Actualiza los datos de contacto del cliente
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 font-semibold">Nombre</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="Nombre del cliente" 
                          {...field} 
                          className="border-gray-300 focus:border-yellow-500 focus:ring-yellow-500"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 font-semibold">Correo Electrónico</FormLabel>
                      <FormControl>
                        <Input 
                          type="email" 
                          placeholder="correo@ejemplo.com" 
                          {...field} 
                          className="border-gray-300 focus:border-yellow-500 focus:ring-yellow-500"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsEditing(false)}
                    className="border-gray-300 hover:bg-gray-50"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit"
                    disabled={updateClientMutation.isPending}
                    className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold"
                  >
                    {updateClientMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Guardar Cambios
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Información del cliente */}
          <Card className="lg:col-span-1 bg-gradient-to-br from-white to-yellow-50/30 border-l-4 border-l-yellow-500 hover:shadow-lg transition-shadow">
            <CardHeader className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-black">
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Información del Cliente
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Building2 className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="text-gray-600 text-sm font-medium">Nombre</p>
                  <p className="font-bold text-gray-900">{client.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Mail className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="text-gray-600 text-sm font-medium">Correo Electrónico</p>
                  <p className="font-bold text-gray-900">{client.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Calendar className="w-5 h-5 text-yellow-600" />
                <div>
                  <p className="text-gray-600 text-sm font-medium">Fecha de Registro</p>
                  <p className="font-bold text-gray-900">
                    {format(new Date(client.createdAt), "d 'de' MMMM 'de' yyyy", { locale: es })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estadísticas */}
          <Card className="lg:col-span-2 bg-gradient-to-br from-white to-gray-50 border-l-4 border-l-gray-500 hover:shadow-lg transition-shadow">
            <CardHeader className="bg-gradient-to-r from-gray-900 to-black text-white">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Resumen de Actividad
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-x divide-gray-200">
                <div className="p-6 text-center bg-gradient-to-br from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-150 transition-all duration-200">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Building2 className="w-6 h-6 text-blue-600" />
                    <p className="text-gray-700 font-semibold">Proyectos</p>
                  </div>
                  <p className="text-3xl font-bold text-blue-700">
                    {(client as any).projects ? (client as any).projects.length : 0}
                  </p>
                </div>
                <div className="p-6 text-center bg-gradient-to-br from-green-50 to-green-100/50 hover:from-green-100 hover:to-green-150 transition-all duration-200">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <FileText className="w-6 h-6 text-green-600" />
                    <p className="text-gray-700 font-semibold">Cotizaciones</p>
                  </div>
                  <p className="text-3xl font-bold text-green-700">{client.totalQuotations || 0}</p>
                </div>
                <div className="p-6 text-center bg-gradient-to-br from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-150 transition-all duration-200">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <DollarSign className="w-6 h-6 text-purple-600" />
                    <p className="text-gray-700 font-semibold">Total Cotizado</p>
                  </div>
                  <p className="text-3xl font-bold text-purple-700">
                    {formatCurrency(parseFloat(client.totalAmount || "0"))}
                  </p>
                </div>
                <div className="p-6 text-center bg-gradient-to-br from-yellow-50 to-yellow-100/50 hover:from-yellow-100 hover:to-yellow-150 transition-all duration-200">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <DollarSign className="w-6 h-6 text-yellow-600" />
                    <p className="text-gray-700 font-semibold">Total Facturado</p>
                  </div>
                  <p className="text-3xl font-bold text-yellow-700">
                    {formatCurrency(parseFloat((client as any).totalReportAmount || "0"))}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>
      )}

      {/* Sección de Proyectos y Cotizaciones */}
      <Card className="bg-gradient-to-br from-white to-gray-50/50 border-l-4 border-l-gray-500 hover:shadow-lg transition-shadow">
        <Tabs defaultValue="projects">
          <CardHeader className="bg-gradient-to-r from-gray-900 to-black text-white pb-6">
            <div className="flex flex-col gap-3">
              <CardTitle className="flex items-center gap-2 text-xl">
                <FileText className="w-6 h-6" />
                Actividad del Cliente
              </CardTitle>
              
              {/* Tabs - Grid 2x2 en mobile pequeño (<450px), scroll horizontal en tablets, inline en desktop */}
              <div className="w-full">
                <TabsList className="bg-gray-800 text-gray-300 w-full grid grid-cols-2 gap-2 [@media(min-width:450px)]:inline-flex [@media(min-width:450px)]:w-auto">
                  <TabsTrigger 
                    value="projects" 
                    className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap flex items-center justify-center"
                  >
                    <Building2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                    Proyectos
                  </TabsTrigger>
                  <TabsTrigger 
                    value="quotations"
                    className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap flex items-center justify-center"
                  >
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                    Cotizaciones
                  </TabsTrigger>
                  <TabsTrigger 
                    value="reports"
                    className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap flex items-center justify-center"
                  >
                    <FileBarChart className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                    Reportes
                  </TabsTrigger>
                  <TabsTrigger 
                    value="account-statement"
                    className="data-[state=active]:bg-yellow-500 data-[state=active]:text-black text-xs sm:text-sm px-2 sm:px-3 whitespace-nowrap flex items-center justify-center"
                  >
                    <FileSpreadsheet className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
                    <span className="hidden sm:inline">Estado de Cuenta</span>
                    <span className="sm:hidden">Estado</span>
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>
          </CardHeader>
          
          <TabsContent value="projects" className="m-0">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-yellow-600" />
                  Proyectos del Cliente
                </h3>
                {!isAddingProject ? (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsAddingProject(true)}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black border-yellow-500 hover:border-yellow-600 font-semibold"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Nuevo Proyecto
                  </Button>
                ) : (
                  <form 
                    onSubmit={handleCreateProject} 
                    className="flex flex-col md:flex-row gap-2"
                  >
                    <Input
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      placeholder="Nombre del proyecto"
                      className="w-full md:w-64 border-gray-300 focus:border-yellow-500 focus:ring-yellow-500"
                    />
                    <div className="flex gap-2">
                      <Button 
                        type="submit" 
                        size="sm" 
                        disabled={!newProjectName.trim() || createProjectMutation.isPending}
                        className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                      >
                        {createProjectMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Guardar"
                        )}
                      </Button>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setIsAddingProject(false);
                          setNewProjectName("");
                        }}
                        className="border-gray-300 hover:bg-gray-50"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}
              </div>

              {client.projects && client.projects.length > 0 ? (
                <div className="grid gap-4">
                  {client.projects.map((project) => (
                    <Card key={project.id} className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-l-4 border-l-yellow-500 hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        {/* Layout Desktop: Flex horizontal */}
                        <div className="hidden [@media(min-width:450px)]:flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <Building2 className="w-5 h-5 text-black" />
                            </div>
                            <div className="flex-1 min-w-0">
                              {editingProjectId === project.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={editingProjectName}
                                    onChange={(e) => setEditingProjectName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const trimmed = editingProjectName.trim();
                                        if (trimmed && trimmed !== project.name) {
                                          updateProjectMutation.mutate({ projectId: project.id, name: trimmed });
                                        } else {
                                          setEditingProjectId(null);
                                        }
                                      } else if (e.key === "Escape") {
                                        setEditingProjectId(null);
                                        setEditingProjectName("");
                                      }
                                    }}
                                    autoFocus
                                    className="h-9 max-w-md font-bold"
                                    placeholder="Nombre del proyecto"
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      const trimmed = editingProjectName.trim();
                                      if (trimmed && trimmed !== project.name) {
                                        updateProjectMutation.mutate({ projectId: project.id, name: trimmed });
                                      } else {
                                        setEditingProjectId(null);
                                      }
                                    }}
                                    disabled={updateProjectMutation.isPending || !editingProjectName.trim()}
                                    className="bg-green-600 hover:bg-green-700 text-white h-9"
                                  >
                                    Guardar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingProjectId(null);
                                      setEditingProjectName("");
                                    }}
                                    className="h-9"
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <h4 className="font-bold text-gray-900">{project.name}</h4>
                                  <p className="text-sm text-gray-600">
                                    Creado: {format(new Date(project.createdAt), "d 'de' MMMM 'de' yyyy", { locale: es })}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>
                          {editingProjectId !== project.id && (
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  setEditingProjectId(project.id);
                                  setEditingProjectName(project.name);
                                }}
                                className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                title="Editar nombre"
                              >
                                <Pencil className="h-4 w-4 mr-1" /> Editar
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                asChild
                                className="text-gray-600 hover:text-gray-900 hover:bg-yellow-100"
                              >
                                <Link href={`/clients/${client.id}/projects/${project.id}`}>
                                  <Eye className="h-4 w-4 mr-1" /> Ver
                                </Link>
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                asChild
                                className="text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50"
                              >
                                <Link href={`/clients/${id}/projects/${project.id}/report`}>
                                  <FileBarChart className="h-4 w-4 mr-1" /> Crear Reporte
                                </Link>
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-red-600 hover:text-red-800 hover:bg-red-50"
                                onClick={() => {
                                  setProjectToDelete(project);
                                  setIsDeleteProjectDialogOpen(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Layout Mobile (<450px): Grid 2 filas */}
                        <div className="[@media(min-width:450px)]:hidden space-y-3">
                          {editingProjectId === project.id ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center flex-shrink-0">
                                  <Building2 className="w-5 h-5 text-black" />
                                </div>
                                <Input
                                  value={editingProjectName}
                                  onChange={(e) => setEditingProjectName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const trimmed = editingProjectName.trim();
                                      if (trimmed && trimmed !== project.name) {
                                        updateProjectMutation.mutate({ projectId: project.id, name: trimmed });
                                      } else {
                                        setEditingProjectId(null);
                                      }
                                    } else if (e.key === "Escape") {
                                      setEditingProjectId(null);
                                      setEditingProjectName("");
                                    }
                                  }}
                                  autoFocus
                                  className="h-9 text-sm font-bold flex-1"
                                  placeholder="Nombre del proyecto"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const trimmed = editingProjectName.trim();
                                    if (trimmed && trimmed !== project.name) {
                                      updateProjectMutation.mutate({ projectId: project.id, name: trimmed });
                                    } else {
                                      setEditingProjectId(null);
                                    }
                                  }}
                                  disabled={updateProjectMutation.isPending || !editingProjectName.trim()}
                                  className="bg-green-600 hover:bg-green-700 text-white h-9 flex-1"
                                >
                                  Guardar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingProjectId(null);
                                    setEditingProjectName("");
                                  }}
                                  className="h-9 flex-1"
                                >
                                  Cancelar
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {/* Fila 1: Nombre + Fecha | Botón Ver */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Building2 className="w-5 h-5 text-black" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-gray-900 text-sm truncate">{project.name}</h4>
                                    <p className="text-xs text-gray-600">
                                      {format(new Date(project.createdAt), "d 'de' MMMM 'de' yyyy", { locale: es })}
                                    </p>
                                  </div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  asChild
                                  className="text-gray-600 hover:text-gray-900 hover:bg-yellow-100 flex-shrink-0"
                                >
                                  <Link href={`/clients/${client.id}/projects/${project.id}`}>
                                    <Eye className="h-4 w-4 mr-1" /> Ver
                                  </Link>
                                </Button>
                              </div>

                              {/* Fila 2: Editar | Crear Reporte | Eliminar */}
                              <div className="flex items-center gap-2">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => {
                                    setEditingProjectId(project.id);
                                    setEditingProjectName(project.name);
                                  }}
                                  className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 flex-1"
                                >
                                  <Pencil className="h-4 w-4 mr-1" /> Editar
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  asChild
                                  className="text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 flex-1"
                                >
                                  <Link href={`/clients/${id}/projects/${project.id}/report`}>
                                    <FileBarChart className="h-4 w-4 mr-1" /> Reporte
                                  </Link>
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  className="text-red-600 hover:text-red-800 hover:bg-red-50"
                                  onClick={() => {
                                    setProjectToDelete(project);
                                    setIsDeleteProjectDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-gradient-to-br from-yellow-50 to-yellow-100/50 rounded-lg border border-yellow-200">
                  <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Building2 className="h-8 w-8 text-black" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">No hay proyectos</h3>
                  <p className="text-gray-600 mb-4 max-w-md mx-auto">
                    Este cliente aún no tiene proyectos asociados. Crea el primer proyecto para organizar mejor las cotizaciones.
                  </p>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsAddingProject(true)}
                    className="bg-yellow-500 hover:bg-yellow-600 text-black border-yellow-500 hover:border-yellow-600 font-semibold"
                  >
                    <Plus className="h-4 w-4 mr-1" /> Nuevo Proyecto
                  </Button>
                </div>
              )}
            </CardContent>
          </TabsContent>

          <TabsContent value="quotations" className="m-0">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-yellow-600" />
                  Cotizaciones del Cliente
                </h3>
                <Button 
                  variant="outline" 
                  size="sm" 
                  asChild
                  className="bg-yellow-500 hover:bg-yellow-600 text-black border-yellow-500 hover:border-yellow-600 font-semibold"
                >
                  <Link href={`/quotation?clientId=${client.id}&clientName=${encodeURIComponent(client.name || '')}&clientEmail=${encodeURIComponent(client.email || '')}`}>
                    <FilePlus className="h-4 w-4 mr-1" /> Nueva Cotización
                  </Link>
                </Button>
              </div>

              {client.quotations && client.quotations.length > 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gradient-to-r from-gray-900 to-black text-white hover:bg-gray-900">
                        <TableHead className="text-white font-semibold">Nº Cotización</TableHead>
                        <TableHead className="text-white font-semibold">Fecha</TableHead>
                        <TableHead className="text-white font-semibold">Proyecto</TableHead>
                        <TableHead className="text-white font-semibold text-right">Total</TableHead>
                        <TableHead className="text-white font-semibold text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {client.quotations.map((quotation, index) => (
                        <TableRow key={quotation.id} className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                          <TableCell className="font-bold text-yellow-700">
                            COT-{quotation.quotationNumber}
                          </TableCell>
                          <TableCell className="text-gray-700">
                            {format(new Date(quotation.createdAt), "dd/MM/yyyy")}
                          </TableCell>
                          <TableCell className="text-gray-700">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-yellow-600" />
                              {quotation.projectName || "Sin proyecto"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-green-700">
                            {formatCurrency(parseFloat(quotation.total))}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                asChild
                                className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                              >
                                <Link href={`/quotation?edit=${quotation.quotationNumber}`}>
                                  <Eye className="h-4 w-4 mr-1" /> Ver
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownloadQuotationPDF(quotation)}
                                disabled={downloadingQuotationId === quotation.id}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                                title="Descargar PDF"
                              >
                                {downloadingQuotationId === quotation.id ? (
                                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                  </svg>
                                ) : (
                                  <Download className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 bg-gradient-to-br from-yellow-50 to-yellow-100/50 rounded-lg border border-yellow-200">
                  <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText className="h-8 w-8 text-black" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">No hay cotizaciones</h3>
                  <p className="text-gray-600 mb-4 max-w-md mx-auto">
                    Este cliente aún no tiene cotizaciones asociadas. Crea la primera cotización para comenzar.
                  </p>
                  <Button 
                    variant="outline" 
                    asChild
                    className="bg-yellow-500 hover:bg-yellow-600 text-black border-yellow-500 hover:border-yellow-600 font-semibold"
                  >
                    <Link href={`/quotation?clientId=${client.id}&clientName=${encodeURIComponent(client.name || '')}&clientEmail=${encodeURIComponent(client.email || '')}`}>
                      <Plus className="h-4 w-4 mr-1" /> Nueva Cotización
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </TabsContent>

          <TabsContent value="reports" className="m-0">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <FileBarChart className="w-5 h-5 text-yellow-600" />
                  Reportes del Cliente
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-sm text-gray-600">
                    Total de reportes: {(client as any).totalReports || 0}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsPartialPaymentDialogOpen(true)}
                    disabled={collectibleReports.length === 0}
                    className="bg-purple-600 hover:bg-purple-700 text-white border-purple-600 font-semibold"
                  >
                    <Wallet className="h-4 w-4 mr-1" />
                    Registrar abono parcial
                  </Button>
                  <Button 
                    variant="outline" 
                    asChild
                    className="bg-green-500 hover:bg-green-600 text-white border-green-500 hover:border-green-600 font-semibold"
                  >
                    <Link href={`/clients/${client.id}/projects/${(client as any).projects?.[0]?.id || 1}/report?clientId=${client.id}&clientName=${encodeURIComponent(client.name || '')}`}>
                      <FilePlus className="h-4 w-4 mr-1" /> Nuevo Reporte
                    </Link>
                  </Button>
                </div>
              </div>

              {(client as any).reports && (client as any).reports.length > 0 ? (
                <>
                  {/* Vista Desktop - Tabla */}
                  <div className="hidden lg:block overflow-x-auto bg-white rounded-lg border border-gray-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gradient-to-r from-yellow-50 to-yellow-100 hover:bg-yellow-100">
                          <TableHead className="font-bold text-gray-800 text-center">Folio</TableHead>
                          <TableHead className="font-bold text-gray-800 text-center">Fecha</TableHead>
                          <TableHead className="font-bold text-gray-800 text-center">Proyecto</TableHead>
                          <TableHead className="font-bold text-gray-800 text-center">Período de Renta</TableHead>
                          <TableHead className="font-bold text-gray-800 text-center">Total</TableHead>
                          <TableHead className="font-bold text-gray-800 text-center">Estado</TableHead>
                          <TableHead className="font-bold text-gray-800 text-center">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...(client as any).reports].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((report: any, index: number) => (
                          <TableRow key={report.id} className={index % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                            <TableCell className="font-bold text-blue-700">
                              {report.folioReporte}
                            </TableCell>
                            <TableCell className="text-gray-700 text-center">
                              {format(new Date(report.createdAt), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell className="text-gray-700">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-yellow-600" />
                                {report.nombreObra || "Sin proyecto"}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-gray-700">
                              {report.items && report.items.length > 0 && report.items[0].periodoRenta
                                ? report.items[0].periodoRenta
                                : (report.periodoRentaInicio && report.periodoRentaFin
                                    ? `${format(new Date(report.periodoRentaInicio), "dd/MM/yyyy")} - ${format(new Date(report.periodoRentaFin), "dd/MM/yyyy")}`
                                    : "-")}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-700">
                              {formatCurrency(parseFloat(report.subtotal || "0"))}
                            </TableCell>
                            <TableCell className="text-center">
                              {getPaymentStatusBadge(report.paymentStatus || 'pendiente')}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex gap-2 justify-center flex-wrap">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="bg-blue-500 hover:bg-blue-600 text-white font-semibold"
                                  asChild
                                >
                                  <Link href={`/reports/${report.id}/edit?clientId=${client.id}&projectId=${report.projectId}`}>
                                    <Edit className="h-4 w-4 mr-1" /> Ver
                                  </Link>
                                </Button>
                                
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="bg-green-500 hover:bg-green-600 text-white font-semibold"
                                  onClick={() => handleDownloadReportPDF(report)}
                                >
                                  <Download className="h-4 w-4 mr-1" /> PDF
                                </Button>
                                
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="bg-purple-500 hover:bg-purple-600 text-white font-semibold"
                                  onClick={() => handleOpenPaymentsDialog(report)}
                                >
                                  <Wallet className="h-4 w-4 mr-1" /> Abonos
                                </Button>
                                
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="bg-orange-500 hover:bg-orange-600 text-white font-semibold"
                                  onClick={() => handleDuplicateReport(report)}
                                >
                                  <Copy className="h-4 w-4 mr-1" /> Duplicar
                                </Button>
                                
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="bg-red-500 hover:bg-red-600 text-white font-semibold"
                                  onClick={() => {
                                    setReportToDelete(report);
                                    setIsDeleteReportDialogOpen(true);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Vista Mobile/Tablet - Cards */}
                  <div className="lg:hidden space-y-4">
                    {[...(client as any).reports].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((report: any, index: number) => (
                      <Card key={report.id} className="overflow-hidden border-l-4 border-l-yellow-500">
                        <CardContent className="p-4">
                          {/* Header del Card */}
                          <div className="flex justify-between items-start mb-3 pb-3 border-b">
                            <div>
                              <div className="font-bold text-blue-700 text-lg mb-1">
                                {report.folioReporte}
                              </div>
                              <div className="text-sm text-gray-500 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(report.createdAt), "dd/MM/yyyy")}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-gray-500 mb-1">Total</div>
                              <div className="font-bold text-green-700 text-lg">
                                {formatCurrency(parseFloat(report.subtotal || "0"))}
                              </div>
                            </div>
                          </div>

                          {/* Información del Reporte */}
                          <div className="space-y-2 mb-4">
                            <div className="flex items-start gap-2 justify-between">
                              <div className="flex items-start gap-2 flex-1">
                                <Building2 className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <div className="text-xs text-gray-500">Proyecto</div>
                                  <div className="text-sm font-medium text-gray-700">
                                    {report.nombreObra || "Sin proyecto"}
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                {getPaymentStatusBadge(report.paymentStatus || 'pendiente')}
                              </div>
                            </div>
                            {(report.items && report.items.length > 0 && report.items[0].periodoRenta) || (report.periodoRentaInicio && report.periodoRentaFin) ? (
                              <div className="flex items-start gap-2">
                                <Calendar className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <div>
                                  <div className="text-xs text-gray-500">Período de Renta</div>
                                  <div className="text-sm font-medium text-gray-700">
                                    {report.items && report.items.length > 0 && report.items[0].periodoRenta
                                      ? report.items[0].periodoRenta
                                      : `${format(new Date(report.periodoRentaInicio), "dd/MM/yyyy")} - ${format(new Date(report.periodoRentaFin), "dd/MM/yyyy")}`}
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>

                          {/* Acciones - Grid Responsivo */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold w-full"
                              asChild
                            >
                              <Link href={`/reports/${report.id}/edit?clientId=${client.id}&projectId=${report.projectId}`}>
                                <Edit className="h-4 w-4 mr-1" /> Ver
                              </Link>
                            </Button>
                            
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="bg-green-500 hover:bg-green-600 text-white font-semibold w-full"
                              onClick={() => handleDownloadReportPDF(report)}
                            >
                              <Download className="h-4 w-4 mr-1" /> PDF
                            </Button>
                            
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="bg-purple-500 hover:bg-purple-600 text-white font-semibold w-full"
                              onClick={() => handleOpenPaymentsDialog(report)}
                            >
                              <Wallet className="h-4 w-4 mr-1" /> Abonos
                            </Button>
                            
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold w-full"
                              onClick={() => handleDuplicateReport(report)}
                            >
                              <Copy className="h-4 w-4 mr-1" /> Copiar
                            </Button>
                            
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="bg-red-500 hover:bg-red-600 text-white font-semibold w-full sm:col-span-2"
                              onClick={() => {
                                setReportToDelete(report);
                                setIsDeleteReportDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg border border-blue-200">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileBarChart className="h-8 w-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">No hay reportes</h3>
                  <p className="text-gray-600 mb-4 max-w-md mx-auto">
                    Este cliente aún no tiene reportes asociados. Los reportes aparecerán aquí cuando se creen desde los proyectos.
                  </p>
                </div>
              )}
            </CardContent>
          </TabsContent>

          <TabsContent value="account-statement" className="m-0">
            <CardContent className="p-6">
              <div className="space-y-6">
                {/* Header con filtros */}
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-yellow-600" />
                      Estado de Cuenta del Cliente
                    </h3>
                    <p className="text-gray-600 text-sm mt-1">
                      Resumen completo de reportes facturados y montos pendientes
                    </p>
                  </div>
                  
                  {/* Botones de generar PDF */}
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button 
                      onClick={handleDownloadAccountStatement}
                      className="bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-black font-semibold w-full sm:w-auto"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Generar Estado de Cuenta PDF</span>
                      <span className="sm:hidden">Estado de Cuenta PDF</span>
                    </Button>
                    <Button 
                      onClick={handleDownloadSummaryStatement}
                      variant="outline"
                      className="border-yellow-500 text-yellow-700 hover:bg-yellow-50 font-semibold w-full sm:w-auto"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      <span>Estado de Cuenta Resumido PDF</span>
                    </Button>
                  </div>
                </div>

                {/* Filtros avanzados */}
                <div className="bg-gray-50 p-4 rounded-lg border">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Período</Label>
                      <select
                        value={periodFilter}
                        onChange={(e) => setPeriodFilter(e.target.value)}
                        className="mt-1 w-full h-10 text-sm border border-gray-300 rounded-md px-3 bg-white cursor-pointer"
                      >
                        <option value="all">Todos los períodos</option>
                        <option value="current-month">Mes actual</option>
                        <option value="last-month">Mes anterior</option>
                        <option value="current-quarter">Trimestre actual</option>
                        <option value="current-year">Año actual</option>
                        <option value="custom">Personalizado</option>
                      </select>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Proyecto</Label>
                      <select
                        defaultValue="all"
                        className="mt-1 w-full h-10 text-sm border border-gray-300 rounded-md px-3 bg-white cursor-pointer"
                      >
                        <option value="all">Todos los proyectos</option>
                        {(client as any)?.projects?.map((project: any) => (
                          <option key={project.id} value={project.id.toString()}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-gray-700">Estado</Label>
                      <select
                        defaultValue="all"
                        className="mt-1 w-full h-10 text-sm border border-gray-300 rounded-md px-3 bg-white cursor-pointer"
                      >
                        <option value="all">Todos los estados</option>
                        <option value="facturado">Facturado</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="pagado">Pagado</option>
                      </select>
                    </div>
                    
                    <div className="flex items-end">
                      <Button variant="outline" className="w-full">
                        <Filter className="h-4 w-4 mr-2" />
                        Aplicar Filtros
                      </Button>
                    </div>
                  </div>
                  
                  {/* Filtros de fecha personalizada */}
                  {periodFilter === "custom" && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Seleccionar Período Personalizado</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium text-gray-700">Fecha Desde</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={`mt-1 w-full justify-start text-left font-normal ${
                                  !customDateFrom && "text-muted-foreground"
                                }`}
                              >
                                <Calendar className="mr-2 h-4 w-4" />
                                {customDateFrom ? format(customDateFrom, "dd/MM/yyyy", { locale: es }) : "Seleccionar fecha"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={customDateFrom}
                                onSelect={setCustomDateFrom}
                                disabled={(date) =>
                                  date > new Date() || date < new Date("1900-01-01")
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        
                        <div>
                          <Label className="text-sm font-medium text-gray-700">Fecha Hasta</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={`mt-1 w-full justify-start text-left font-normal ${
                                  !customDateTo && "text-muted-foreground"
                                }`}
                              >
                                <Calendar className="mr-2 h-4 w-4" />
                                {customDateTo ? format(customDateTo, "dd/MM/yyyy", { locale: es }) : "Seleccionar fecha"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <CalendarComponent
                                mode="single"
                                selected={customDateTo}
                                onSelect={setCustomDateTo}
                                disabled={(date) => {
                                  if (date > new Date() || date < new Date("1900-01-01")) {
                                    return true;
                                  }
                                  if (customDateFrom && date < customDateFrom) {
                                    return true;
                                  }
                                  return false;
                                }}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      
                      {customDateFrom && customDateTo && (
                        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                          <p className="text-sm text-green-800">
                            <strong>Período seleccionado:</strong> {format(customDateFrom, "dd/MM/yyyy", { locale: es })} - {format(customDateTo, "dd/MM/yyyy", { locale: es })}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Métricas resumen - Responsive */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <Card className="bg-gradient-to-br from-green-50 to-green-100 border-l-4 border-l-green-500 hover:shadow-lg transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Total Facturado</p>
                          <p className="text-lg sm:text-2xl font-bold text-green-700 truncate">
                            {formatCurrency(accountStats.totalAmount)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-l-4 border-l-yellow-500 hover:shadow-lg transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <Calculator className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Reportes Totales</p>
                          <p className="text-lg sm:text-2xl font-bold text-yellow-700 truncate">
                            {accountStats.totalReports}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Promedio por Reporte</p>
                          <p className="text-lg sm:text-2xl font-bold text-blue-700 truncate">
                            {formatCurrency(accountStats.averagePerReport)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-gradient-to-br from-red-50 to-red-100 border-l-4 border-l-red-500 hover:shadow-lg transition-shadow">
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                          <Wallet className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-gray-600 truncate">Pendiente de Pago</p>
                          <p className="text-lg sm:text-2xl font-bold text-red-700 truncate">
                            {formatCurrency(accountStats.pendingAmount)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Tabla de reportes detallada */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <FileBarChart className="w-5 h-5 text-yellow-600" />
                    Detalle de Reportes por Proyecto
                  </h4>
                  
                  {Object.keys(reportsByProject).length > 0 ? (
                    <div className="space-y-4">
                      {/* Usar reportes memoizados agrupados por proyecto */}
                      {Object.entries(reportsByProject).map(([projectName, reports]: [string, Report[]]) => (
                          <Card key={projectName} className="overflow-hidden">
                            <CardHeader className="bg-gradient-to-r from-gray-100 to-gray-200 py-3">
                              <div className="flex justify-between items-center">
                                <h5 className="font-semibold text-gray-800 flex items-center gap-2">
                                  <Building2 className="w-4 h-4 text-yellow-600" />
                                  Proyecto: {projectName}
                                </h5>
                                <div className="text-right">
                                  <p className="text-sm text-gray-600">
                                    {reports.length} reporte{reports.length !== 1 ? 's' : ''}
                                  </p>
                                  <p className="font-bold text-gray-800">
                                    Total: {formatCurrency(
                                      reports.reduce((sum: number, r: Report) => sum + parseFloat(r.total || "0"), 0)
                                    )}
                                  </p>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent className="p-0">
                              {/* Tabla responsive con scroll horizontal en móviles */}
                              <div className="overflow-x-auto">
                                <Table className="min-w-full">
                                  <TableHeader>
                                    <TableRow className="bg-gray-50">
                                      <TableHead className="font-semibold min-w-[100px]">Folio</TableHead>
                                      <TableHead className="font-semibold min-w-[90px]">Fecha</TableHead>
                                      <TableHead className="font-semibold min-w-[90px]">Conceptos</TableHead>
                                      <TableHead className="font-semibold text-right min-w-[100px]">Subtotal</TableHead>
                                      <TableHead className="font-semibold text-right min-w-[80px]">IVA</TableHead>
                                      <TableHead className="font-semibold text-right min-w-[100px]">Total</TableHead>
                                      <TableHead className="font-semibold text-center min-w-[120px]">Estado</TableHead>
                                      <TableHead className="font-semibold text-center min-w-[140px]">Acciones</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                <TableBody>
                                  {reports.map((report: Report, idx: number) => (
                                    <TableRow key={report.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                      <TableCell className="font-medium">
                                        {report.folioReporte || report.reportNumber}
                                      </TableCell>
                                      <TableCell>
                                        {format(new Date(report.createdAt), "dd/MM/yyyy", { locale: es })}
                                      </TableCell>
                                      <TableCell>
                                        <div className="text-sm">
                                          {report.items?.length || 0} concepto{(report.items?.length || 0) !== 1 ? 's' : ''}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right font-medium">
                                        {formatCurrency(parseFloat(report.subtotal || "0"))}
                                      </TableCell>
                                      <TableCell className="text-right font-medium">
                                        {formatCurrency(parseFloat(report.iva || "0"))}
                                      </TableCell>
                                      <TableCell className="text-right font-bold text-green-600">
                                        {formatCurrency(parseFloat(report.total || "0"))}
                                      </TableCell>
                                      <TableCell>
                                        <select
                                          value={report.paymentStatus || 'pendiente'}
                                          onChange={(e) => 
                                            updateReportPaymentStatus.mutate({ reportId: report.id, status: e.target.value })
                                          }
                                          className={`w-full min-w-[120px] h-9 text-sm font-medium border rounded-md px-2 cursor-pointer appearance-none bg-no-repeat bg-[length:12px] bg-[right_6px_center] ${
                                            report.paymentStatus === 'pagado' ? 'bg-green-100 text-green-800 border-green-300' :
                                            report.paymentStatus === 'facturado' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                                            report.paymentStatus === 'vencido' ? 'bg-gray-100 text-gray-800 border-gray-300' :
                                            'bg-red-100 text-red-800 border-red-300'
                                          }`}
                                          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
                                        >
                                          <option value="pendiente">🔴 Pendiente</option>
                                          <option value="facturado">🟡 Facturado</option>
                                          <option value="pagado">🟢 Pagado</option>
                                          <option value="vencido">⚫ Vencido</option>
                                        </select>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex flex-col sm:flex-row gap-1 justify-center items-center">
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="text-blue-600 hover:bg-blue-50 w-full sm:w-auto min-h-[36px]"
                                            onClick={() => {
                                              // Funcionalidad de vista (opcional para futuro)
                                              toast({
                                                title: "Vista de reporte",
                                                description: "Funcionalidad de vista próximamente disponible."
                                              });
                                            }}
                                          >
                                            <Eye className="h-4 w-4 sm:mr-0" />
                                            <span className="sm:hidden ml-2">Ver</span>
                                          </Button>
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="text-green-600 hover:bg-green-50 w-full sm:w-auto min-h-[36px]"
                                            onClick={async () => {
                                              try {
                                                // Cargar el reporte completo (incluye items y abonos)
                                                const fullReport = await apiRequest(`/api/reports/${report.id}`);
                                                const pdf = await generateReportPDF(
                                                  fullReport,
                                                  fullReport.items || [],
                                                  fullReport.payments || []
                                                );
                                                const reportFileName = `Reporte_${fullReport.folioReporte}_${fullReport.clientName.replace(/\s+/g, '_')}.pdf`;
                                                savePDFMobile(pdf, reportFileName);
                                                toast({
                                                  title: "PDF generado",
                                                  description: "El reporte se ha descargado exitosamente."
                                                });
                                              } catch (error) {
                                                console.error("Error generating PDF:", error);
                                                toast({
                                                  title: "Error",
                                                  description: "No se pudo generar el PDF del reporte.",
                                                  variant: "destructive"
                                                });
                                              }
                                            }}
                                          >
                                            <Download className="h-4 w-4 sm:mr-0" />
                                            <span className="sm:hidden ml-2">PDF</span>
                                          </Button>
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="text-yellow-600 hover:bg-yellow-50 w-full sm:w-auto min-h-[36px]"
                                            onClick={() => {
                                              setLocation(`/reports/${report.id}/edit`);
                                            }}
                                          >
                                            <Edit3 className="h-4 w-4 sm:mr-0" />
                                            <span className="sm:hidden ml-2">Editar</span>
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <FileBarChart className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-semibold text-gray-600 mb-2">
                        No hay reportes disponibles
                      </h3>
                      <p className="text-gray-500">
                        Este cliente aún no tiene reportes facturados registrados.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>

      {/* Confirmación de Eliminación de Cliente */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Estás seguro?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Esto eliminará permanentemente el cliente 
              <span className="font-semibold"> {client.name}</span> y toda su información asociada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteClientMutation.mutate()}
              disabled={deleteClientMutation.isPending}
            >
              {deleteClientMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de Eliminación de Reporte */}
      <Dialog open={isDeleteReportDialogOpen} onOpenChange={setIsDeleteReportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar Reporte?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el reporte 
              <span className="font-semibold"> {reportToDelete?.folioReporte}</span> y toda su información.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDeleteReportDialogOpen(false);
              setReportToDelete(null);
            }}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => reportToDelete && deleteReportMutation.mutate(reportToDelete.id)}
              disabled={deleteReportMutation.isPending}
            >
              {deleteReportMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Eliminar Reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de Eliminación de Proyecto */}
      <Dialog open={isDeleteProjectDialogOpen} onOpenChange={setIsDeleteProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Eliminar Proyecto?</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el proyecto 
              <span className="font-semibold"> {projectToDelete?.name}</span> y toda su información asociada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsDeleteProjectDialogOpen(false);
              setProjectToDelete(null);
            }}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => projectToDelete && deleteProjectMutation.mutate(projectToDelete.id)}
              disabled={deleteProjectMutation.isPending}
            >
              {deleteProjectMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Eliminar Proyecto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo para distribuir un abono entre reportes */}
      <Dialog open={isPartialPaymentDialogOpen} onOpenChange={setIsPartialPaymentDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-purple-600" />
              Registrar abono parcial
            </DialogTitle>
            <DialogDescription>
              Distribuye el total recibido entre los reportes pendientes, sin modificar sus conceptos ni totales.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="partial-date">Fecha de pago*</Label>
                <Input
                  id="partial-date"
                  type="date"
                  value={partialPaymentDate}
                  onChange={event => setPartialPaymentDate(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="partial-method">Método de pago*</Label>
                <select
                  id="partial-method"
                  value={partialPaymentMethod}
                  onChange={event => setPartialPaymentMethod(event.target.value)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2"
                >
                  <option value="">Seleccionar método</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="deposito">Depósito</option>
                </select>
              </div>
              <div>
                <Label htmlFor="partial-reference">Referencia</Label>
                <Input
                  id="partial-reference"
                  maxLength={200}
                  value={partialPaymentReference}
                  onChange={event => setPartialPaymentReference(event.target.value)}
                  placeholder="Folio, transferencia o cheque"
                />
              </div>
              <div>
                <Label htmlFor="partial-total">Total recibido*</Label>
                <Input
                  id="partial-total"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={partialPaymentTotal}
                  onChange={event => {
                    if (/^\d*(\.\d{0,2})?$/.test(event.target.value)) {
                      setPartialPaymentTotal(event.target.value);
                    }
                  }}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="partial-notes">Notas</Label>
              <Textarea
                id="partial-notes"
                maxLength={500}
                rows={2}
                value={partialPaymentNotes}
                onChange={event => setPartialPaymentNotes(event.target.value)}
                placeholder="Notas adicionales (opcional)"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="font-semibold">Asignación por reporte</h4>
                <p className="text-xs text-gray-500">Puedes distribuir por antigüedad y después ajustar cada monto.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={distributePartialPayment}
                disabled={partialTotalCents <= 0}
                className="w-full sm:w-auto"
              >
                <Calculator className="h-4 w-4 mr-2" />
                Distribuir automáticamente
              </Button>
            </div>

            <div className="space-y-2">
              {collectibleReports.map(report => {
                const assignedCents = Math.round((Number(partialAllocations[report.id]) || 0) * 100);
                const balanceCents = Math.round(report.balance * 100);
                return (
                  <div key={report.id} className="grid grid-cols-1 sm:grid-cols-[1fr_150px] gap-2 p-3 rounded-lg border bg-gray-50">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800">{report.folioReporte || report.reportNumber}</div>
                      <div className="text-sm text-gray-600 truncate">{report.nombreObra}</div>
                      <div className="text-xs text-gray-500">
                        {format(new Date(report.fechaReporte || report.createdAt), "dd/MM/yyyy")} · Saldo: {formatCurrency(report.balance)}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`allocation-${report.id}`} className="text-xs">Asignar</Label>
                      <Input
                        id={`allocation-${report.id}`}
                        type="number"
                        min="0"
                        max={(balanceCents / 100).toFixed(2)}
                        step="0.01"
                        value={partialAllocations[report.id] || ""}
                        onChange={event => {
                          if (/^\d*(\.\d{0,2})?$/.test(event.target.value)) {
                            setPartialAllocations(current => ({
                              ...current,
                              [report.id]: event.target.value
                            }));
                          }
                        }}
                        className={assignedCents > balanceCents ? "border-red-500" : ""}
                        placeholder="0.00"
                      />
                      {assignedCents > balanceCents && (
                        <p className="text-xs text-red-600 mt-1">Excede el saldo</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg bg-purple-50 border border-purple-200 p-3 text-center">
              <div>
                <p className="text-xs text-gray-600">Recibido</p>
                <p className="font-bold">{formatCurrency(partialTotalCents / 100)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Asignado</p>
                <p className="font-bold">{formatCurrency(partialAllocatedCents / 100)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Diferencia</p>
                <p className={`font-bold ${partialDifferenceCents === 0 ? "text-green-700" : "text-red-600"}`}>
                  {formatCurrency(Math.abs(partialDifferenceCents) / 100)}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsPartialPaymentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => partialPaymentMutation.mutate()}
              disabled={!canSavePartialPayment || partialPaymentMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {partialPaymentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar abono
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de gestión de abonos */}
      <Dialog open={isPaymentsDialogOpen} onOpenChange={(open) => {
        setIsPaymentsDialogOpen(open);
        if (!open) {
          setSelectedReportForPayments(null);
          // Limpiar formulario al cerrar
          setNewPaymentAmount("");
          setNewPaymentMethod("");
          setNewPaymentReference("");
          setNewPaymentNotes("");
          setNewPaymentDate(new Date());
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] w-[95vw] sm:w-full overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-purple-600" />
              Gestionar Abonos - {selectedReportForPayments?.folioReporte}
            </DialogTitle>
            <DialogDescription>
              Gestiona los abonos y pagos para el reporte {selectedReportForPayments?.folioReporte}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Resumen del reporte */}
            {selectedReportForPayments && reportPayments && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-3 sm:p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg">
                <div className="text-center p-2">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Total del Reporte</p>
                  <p className="text-lg sm:text-xl font-bold text-gray-800">
                    {formatCurrency(parseFloat(selectedReportForPayments.total || "0"))}
                  </p>
                </div>
                <div className="text-center p-2">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Total Abonado</p>
                  <p className="text-lg sm:text-xl font-bold text-green-600">
                    {formatCurrency((reportPayments as any)?.summary?.totalPaid || 0)}
                  </p>
                </div>
                <div className="text-center p-2 sm:col-span-2 lg:col-span-1">
                  <p className="text-xs sm:text-sm text-gray-600 mb-1">Saldo Pendiente</p>
                  <p className="text-lg sm:text-xl font-bold text-red-600">
                    {formatCurrency((reportPayments as any)?.summary?.remaining || 0)}
                  </p>
                </div>
              </div>
            )}

            {/* Lista de abonos existentes */}
            <div>
              <h4 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" />
                Abonos Registrados
              </h4>
              {(reportPayments as any)?.payments && (reportPayments as any).payments.length > 0 ? (
                <div className="space-y-3">
                  {(reportPayments as any).payments.map((payment: ReportPayment) => (
                    <div key={payment.id} className="bg-gray-50 rounded-lg p-3">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="flex-1 space-y-2">
                          {/* Fila principal con monto y fecha */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Banknote className="h-4 w-4 text-green-600" />
                              <span className="font-bold text-lg text-green-600">
                                {formatCurrency(parseFloat(payment.amount))}
                              </span>
                            </div>
                            <div className="text-sm text-gray-600 sm:hidden">
                              {safeFormatPaymentDate(payment.paymentDate)}
                            </div>
                          </div>
                          
                          {/* Información adicional */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <div className="hidden sm:block text-sm text-gray-600">
                              {safeFormatPaymentDate(payment.paymentDate)}
                            </div>
                            <div className="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded w-fit">
                              {payment.paymentMethod}
                            </div>
                            {payment.reference && (
                              <div className="text-sm text-gray-500">
                                Ref: {payment.reference}
                              </div>
                            )}
                          </div>
                          
                          {payment.notes && (
                            <div className="text-sm text-gray-600 mt-1 p-2 bg-gray-100 rounded">
                              {payment.notes}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2 self-end sm:self-center mt-2 sm:mt-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600 hover:bg-blue-50"
                            onClick={() => handleOpenEditPayment(payment)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => deletePaymentMutation.mutate(payment.id)}
                            disabled={deletePaymentMutation.isPending}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-gray-500">
                  <CreditCard className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No hay abonos registrados</p>
                </div>
              )}
            </div>

            {/* Formulario para agregar nuevo abono */}
            {((reportPayments as any)?.summary?.remaining || 0) > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4 text-purple-600" />
                  Agregar Nuevo Abono
                </h4>
                <div className="space-y-4">
                  {/* Primera fila: Monto y Método de Pago */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="amount" className="text-sm font-medium">Monto*</Label>
                      <Input
                        id="amount"
                        type="number"
                        step="0.01"
                        value={newPaymentAmount}
                        onChange={(e) => setNewPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        className="text-base"
                      />
                    </div>
                    <div>
                      <Label htmlFor="method" className="text-sm font-medium">Método de Pago*</Label>
                      <select
                        id="method"
                        value={newPaymentMethod}
                        onChange={(e) => setNewPaymentMethod(e.target.value)}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        <option value="">Seleccionar método</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="transferencia">Transferencia</option>
                        <option value="cheque">Cheque</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="deposito">Depósito</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Segunda fila: Referencia y Fecha */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="reference" className="text-sm font-medium">Referencia</Label>
                      <Input
                        id="reference"
                        value={newPaymentReference}
                        onChange={(e) => setNewPaymentReference(e.target.value)}
                        placeholder="Número de cheque, etc."
                        className="text-base"
                      />
                    </div>
                    <div>
                      <Label htmlFor="paymentDate" className="text-sm font-medium">Fecha de Pago</Label>
                      <Input
                        id="paymentDate"
                        type="date"
                        value={toDateInputValue(newPaymentDate)}
                        onChange={(e) => {
                          const parsed = parseDateInput(e.target.value);
                          if (parsed) setNewPaymentDate(parsed);
                        }}
                        className="text-base"
                      />
                    </div>
                  </div>
                  
                  {/* Tercera fila: Notas */}
                  <div>
                    <Label htmlFor="notes" className="text-sm font-medium">Notas</Label>
                    <Textarea
                      id="notes"
                      value={newPaymentNotes}
                      onChange={(e) => setNewPaymentNotes(e.target.value)}
                      placeholder="Notas adicionales (opcional)"
                      rows={2}
                      className="text-base resize-none"
                    />
                  </div>
                </div>
                
                {/* Botón de agregar */}
                <div className="flex justify-center sm:justify-end mt-4">
                  <Button
                    onClick={handleAddPayment}
                    disabled={addPaymentMutation.isPending || !newPaymentAmount || !newPaymentMethod}
                    className="bg-purple-600 hover:bg-purple-700 w-full sm:w-auto min-h-[44px] text-base"
                  >
                    {addPaymentMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar Abono
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentsDialogOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de edición de abono */}
      <Dialog open={isEditPaymentDialogOpen} onOpenChange={setIsEditPaymentDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-900">
              Editar Abono
            </DialogTitle>
            <DialogDescription>
              Actualiza la información del abono automático con los datos reales del pago.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {editingPayment && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <div className="flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-yellow-600" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-yellow-900">
                      Abono de {formatCurrency(parseFloat(editingPayment.amount))}
                    </p>
                    <p className="text-xs text-yellow-700">
                      Creado por: {editingPayment.createdBy}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Método de pago */}
            <div>
              <Label htmlFor="edit-method" className="text-sm font-medium">Método de Pago*</Label>
              <select
                id="edit-method"
                value={editPaymentMethod}
                onChange={(e) => setEditPaymentMethod(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Seleccionar método</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="deposito">Depósito</option>
                <option value="Sistema">Sistema</option>
              </select>
            </div>

            {/* Fecha de pago */}
            <div>
              <Label htmlFor="edit-payment-date" className="text-sm font-medium">Fecha de Pago</Label>
              <Input
                id="edit-payment-date"
                type="date"
                value={toDateInputValue(editPaymentDate)}
                onChange={(e) => {
                  const parsed = parseDateInput(e.target.value);
                  if (parsed) setEditPaymentDate(parsed);
                }}
                className="text-base"
              />
            </div>

            {/* Referencia */}
            <div>
              <Label htmlFor="edit-reference" className="text-sm font-medium">Referencia</Label>
              <Input
                id="edit-reference"
                value={editPaymentReference}
                onChange={(e) => setEditPaymentReference(e.target.value)}
                placeholder="Número de cheque, transferencia, etc."
                className="text-base"
              />
            </div>

            {/* Notas */}
            <div>
              <Label htmlFor="edit-notes" className="text-sm font-medium">Notas</Label>
              <Textarea
                id="edit-notes"
                value={editPaymentNotes}
                onChange={(e) => setEditPaymentNotes(e.target.value)}
                placeholder="Notas adicionales (opcional)"
                rows={3}
                className="text-base resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsEditPaymentDialogOpen(false);
                setEditingPayment(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEditPayment}
              disabled={editPaymentMutation.isPending || !editPaymentMethod}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editPaymentMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Edit className="mr-2 h-4 w-4" />
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

