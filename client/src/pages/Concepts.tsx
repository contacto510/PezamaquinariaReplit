import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogClose
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from '@/lib/queryClient';
import { formatCurrency } from '@/lib/utils';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Concept, ConceptFormData, conceptSchema } from '@shared/schema';

export default function Concepts() {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showInactive, setShowInactive] = useState<boolean>(false);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState<boolean>(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false);
  const [isDuplicatesDialogOpen, setIsDuplicatesDialogOpen] = useState<boolean>(false);
  const { toast } = useToast();

  // Obtener conceptos
  const { data: concepts, isLoading, isError, refetch } = useQuery<Concept[]>({
    queryKey: ['/api/concepts', showInactive ? 'all' : 'active_only'],
    queryFn: async () => {
      const url = showInactive 
        ? '/api/concepts' 
        : '/api/concepts?active=true';
      return apiRequest(url);
    }
  });

  // Normaliza texto quitando acentos para búsqueda flexible
  const normalize = (str: string) =>
    str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // Filtrar conceptos según búsqueda (con o sin acento)
  const filteredConcepts = concepts?.filter(concept =>
    normalize(concept.name).includes(normalize(searchTerm))
  );

  // Grupos de conceptos duplicados (solo se consulta al abrir el diálogo)
  const { data: duplicateGroups, isLoading: duplicatesLoading } = useQuery<Concept[][]>({
    queryKey: ['/api/concepts/duplicates'],
    enabled: isDuplicatesDialogOpen,
  });

  // Extraer el mensaje de error que envía el servidor (ej. aviso de duplicado)
  const extractErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof Error) {
      const jsonStart = error.message.indexOf('{');
      if (jsonStart >= 0) {
        try {
          const parsed = JSON.parse(error.message.slice(jsonStart));
          if (parsed?.message) return parsed.message;
        } catch {
          // Ignorar errores de parseo y usar el mensaje genérico
        }
      }
    }
    return fallback;
  };

  // Formulario para añadir concepto
  const addForm = useForm<ConceptFormData>({
    resolver: zodResolver(conceptSchema),
    defaultValues: {
      name: '',
      description: '',
      defaultUnit: '',
      defaultPrice: 0,
      active: true
    }
  });

  // Formulario para editar concepto
  const editForm = useForm<ConceptFormData>({
    resolver: zodResolver(conceptSchema),
    defaultValues: {
      name: '',
      description: '',
      defaultUnit: '',
      defaultPrice: 0,
      active: true
    }
  });

  // Effect para cargar datos en el formulario de edición
  useEffect(() => {
    if (selectedConcept && isEditDialogOpen) {
      editForm.reset({
        name: selectedConcept.name,
        description: selectedConcept.description || '',
        defaultUnit: selectedConcept.defaultUnit || '',
        defaultPrice: Number(selectedConcept.defaultPrice) || 0,
        active: selectedConcept.active
      });
    }
  }, [selectedConcept, isEditDialogOpen, editForm]);

  // Mutación para crear un concepto
  const createConceptMutation = useMutation({
    mutationFn: async (data: ConceptFormData) => {
      // Convertimos defaultPrice a string si existe
      const formattedData = {
        ...data,
        defaultPrice: data.defaultPrice !== undefined ? String(data.defaultPrice) : undefined
      };
      
      return apiRequest('/api/concepts', {
        method: 'POST',
        body: JSON.stringify(formattedData),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Concepto creado",
        description: "El concepto ha sido creado exitosamente",
      });
      addForm.reset();
      setIsAddDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/concepts'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: extractErrorMessage(error, "No se pudo crear el concepto"),
        variant: "destructive"
      });
      console.error("Error al crear concepto:", error);
    }
  });

  // Mutación para actualizar un concepto
  const updateConceptMutation = useMutation({
    mutationFn: async (data: { id: number, concept: ConceptFormData }) => {
      // Convertimos defaultPrice a string si existe
      const formattedConcept = {
        ...data.concept,
        defaultPrice: data.concept.defaultPrice !== undefined ? String(data.concept.defaultPrice) : undefined
      };
      
      return apiRequest(`/api/concepts/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify(formattedConcept),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Concepto actualizado",
        description: "El concepto ha sido actualizado exitosamente",
      });
      editForm.reset();
      setIsEditDialogOpen(false);
      setSelectedConcept(null);
      queryClient.invalidateQueries({ queryKey: ['/api/concepts'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: extractErrorMessage(error, "No se pudo actualizar el concepto"),
        variant: "destructive"
      });
      console.error("Error al actualizar concepto:", error);
    }
  });

  // Mutación para cambiar estado de activación de un concepto
  const toggleConceptStatusMutation = useMutation({
    mutationFn: async (data: { id: number, active: boolean }) => {
      return apiRequest(`/api/concepts/${data.id}/toggle-status`, {
        method: 'PATCH',
        body: JSON.stringify({ active: data.active }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    },
    onSuccess: () => {
      toast({
        title: "Estado actualizado",
        description: "El estado del concepto ha sido actualizado",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/concepts'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del concepto",
        variant: "destructive"
      });
      console.error("Error al cambiar estado:", error);
    }
  });

  // Mutación para eliminar un concepto
  const deleteConceptMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/concepts/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      toast({
        title: "Concepto eliminado",
        description: "El concepto ha sido eliminado exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/concepts'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo eliminar el concepto",
        variant: "destructive"
      });
      console.error("Error al eliminar concepto:", error);
    }
  });

  // Mutación para unir conceptos duplicados
  const mergeConceptsMutation = useMutation({
    mutationFn: async (data: { keepId: number; removeIds: number[] }) => {
      return apiRequest('/api/concepts/merge', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    },
    onSuccess: (result: any) => {
      toast({
        title: "Duplicados unidos",
        description: `Se eliminaron ${result?.removedCount ?? 0} concepto(s) duplicado(s) del catálogo`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/concepts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/concepts/duplicates'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: extractErrorMessage(error, "No se pudieron unir los duplicados"),
        variant: "destructive"
      });
      console.error("Error al unir duplicados:", error);
    }
  });

  // Unir un grupo conservando el concepto elegido
  const handleMergeGroup = (group: Concept[], keepId: number) => {
    const keep = group.find(c => c.id === keepId);
    const removeIds = group.filter(c => c.id !== keepId).map(c => c.id);
    if (!keep || removeIds.length === 0) return;
    if (window.confirm(`Se conservará "${keep.name}" y se eliminarán ${removeIds.length} duplicado(s) del catálogo. Las cotizaciones, reportes y reparaciones ya creadas no se modifican. ¿Continuar?`)) {
      mergeConceptsMutation.mutate({ keepId, removeIds });
    }
  };

  // Función para enviar formulario de creación
  const onAddSubmit = (data: ConceptFormData) => {
    createConceptMutation.mutate(data);
  };

  // Función para enviar formulario de edición
  const onEditSubmit = (data: ConceptFormData) => {
    if (selectedConcept) {
      updateConceptMutation.mutate({
        id: selectedConcept.id,
        concept: data
      });
    }
  };

  // Función para cambiar estado de activación
  const handleToggleStatus = (concept: Concept) => {
    toggleConceptStatusMutation.mutate({
      id: concept.id,
      active: !concept.active
    });
  };

  // Función para eliminar un concepto
  const handleDelete = (concept: Concept) => {
    if (window.confirm(`¿Estás seguro de eliminar el concepto "${concept.name}"?`)) {
      deleteConceptMutation.mutate(concept.id);
    }
  };

  // Función para abrir diálogo de edición
  const handleEditConcept = (concept: Concept) => {
    setSelectedConcept(concept);
    setIsEditDialogOpen(true);
  };

  // Función para cargar conceptos iniciales
  const handleSeedInitialConcepts = async () => {
    const initialConcepts = [
      "SERVICIO ENTREGA EQUIPO",
      "SERVICIO RECOLECCION EQUIPO",
      "ROMPEDORA ELECTRICA 110V DE 30 KGS (INCLUYE 1 CINCEL)",
      "ROMPEDORA ELECTRICA 110 V DE 18 KG (INCLUYE UN CINCEL)",
      "CINCELADOR ELECTRICO 110V 12 KG (INCLUYE 1 CINCEL)",
      "CINCELADORA ELECTRICA 110V 08 KG (INCLUYE 1 CINCEL)",
      "PLANTA DE LUZ A GASOLINA 12 AMPS 120V-240V 4,000 WATTS",
      "PLANTA DE LUZ A GASOLINA 18 AMPS 120V-240V 6,500 WATTS",
      "PLANTA DE LUZ A GASOLINA 18 AMPS 120V-240V 8,000 WATTS",
      "PLANTA DE LUZ A GASOLINA 18 AMPS 120V-240V 11,000 WATTS. JORNADA 8 HRS. COSTO POR HORA EXTRA $120/HRS",
      "COMPACTADORA MOTOR A GASOLINA 4 TIEMPOS",
      "VIBRADOR PARA CONCRETO ELECTRICO CON CHICOTE 4m",
      "VIBRADOR PARA CONCRETO DE GASOLINA CON CHICOTE DE 6m",
      "CORTADORA PARA CONCRETO DISCO 14\" MOTOR A GASOLINA",
      "REVOLVEDORA UN SACO MOTOR A GASOLINA 4 TIEMPOS",
      "PLACA VIBRATORIA MOTOR A GASOLINA 4 TIEMPOS",
      "ALLANADORA 36\" MOTOR A GASOLINA 4 TIEMPOS",
      "PLATO FLOTADOR PARA ALLANADORA 36\"",
      "ALLANADORA 46\" MOTOR A GASOLINA 4 TIEMPOS",
      "HIDROLAVADORA DE GASOLINA 3,200 PSI (INCLUYE MANGUERA PRESIÓN + MANGUERA AGUA)",
      "MINI RODILLO 250 KG A GASOLINA(MANUAL)",
      "RODILLO HOMBRE A BORDO 1.5 TON A GASOLINA. COSTO POR 8 HRS DE USO. COSTO HORA EXTRA $250/HRS.",
      "RODILLO HOMBRE A BORDO 1 TON A GASOLINA. COSTO POR 8 HRS DE USO. COSTO HORA EXTRA $200/HRS.",
      "RODILLO HOMBRE A BORDO 2.5 TON A GASOLINA. COSTO POR 8 HRS DE USO. COSTO HORA EXTRA $300/HRS.",
      "GENIE TIJERA 4046 ELECTRICA 110V",
      "GENIE ARTICULADA Z-30 ELECTRICA 110V",
      "GENIE ARTICULADA Z-45 ELECTRICA 110V",
      "GENIE ARTICULADA Z-60 ELECTRICA 110V"
    ];

    let successCount = 0;
    let failCount = 0;

    for (const conceptName of initialConcepts) {
      try {
        await apiRequest('/api/concepts', {
          method: 'POST',
          body: JSON.stringify({
            name: conceptName,
            defaultUnit: 'Día',
            active: true
          }),
          headers: {
            'Content-Type': 'application/json'
          }
        });
        successCount++;
      } catch (error) {
        console.error(`Error al crear concepto "${conceptName}":`, error);
        failCount++;
      }
    }

    toast({
      title: "Conceptos iniciales cargados",
      description: `Se han creado ${successCount} conceptos. ${failCount > 0 ? `Fallaron ${failCount} conceptos.` : ''}`,
    });

    queryClient.invalidateQueries({ queryKey: ['/api/concepts'] });
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      {/* Header with Péza Corporate Design */}
      <div className="peza-header rounded-xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-black">
              Conceptos
            </h1>
            <p className="mt-2 text-lg text-black/80">
              Catálogo de conceptos y servicios para cotizaciones
            </p>
          </div>
          <div className="mt-4 sm:mt-0 sm:ml-4 flex flex-col sm:flex-row gap-3">
            <button 
              onClick={() => handleSeedInitialConcepts()}
              className="peza-button-secondary w-full sm:w-auto order-2 sm:order-1"
              disabled={createConceptMutation.isPending}
            >
              <i className="ri-database-2-line mr-2"></i>
              Cargar conceptos iniciales
            </button>
            <button 
              onClick={() => setIsDuplicatesDialogOpen(true)}
              className="peza-button-secondary w-full sm:w-auto order-3 sm:order-2"
            >
              <i className="ri-file-copy-2-line mr-2"></i>
              Revisar duplicados
            </button>
            <button 
              onClick={() => setIsAddDialogOpen(true)}
              className="peza-button-primary w-full sm:w-auto order-1 sm:order-3"
            >
              <i className="ri-add-line mr-2"></i>
              Nuevo Concepto
            </button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="peza-card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1">
            <Input
              placeholder="Buscar concepto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 peza-search-input"
            />
            <i className="ri-search-line absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
          </div>
          <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-lg">
            <Checkbox 
              id="showInactive" 
              checked={showInactive} 
              onCheckedChange={() => setShowInactive(!showInactive)}
              className="data-[state=checked]:bg-yellow-500 data-[state=checked]:border-yellow-500"
            />
            <Label htmlFor="showInactive" className="text-sm font-medium">
              Mostrar conceptos inactivos
            </Label>
          </div>
        </div>
      </div>

      {/* Tabla de conceptos */}
      {isLoading ? (
        <div className="text-center py-10">
          <p>Cargando conceptos...</p>
        </div>
      ) : isError ? (
        <div className="text-center py-10 text-red-500">
          <p>Error al cargar conceptos</p>
          <Button onClick={() => refetch()} variant="outline" className="mt-2">
            Reintentar
          </Button>
        </div>
      ) : filteredConcepts && filteredConcepts.length > 0 ? (
        <div className="peza-table">
          <Table>
            <TableCaption className="text-gray-600 font-medium">
              Lista de conceptos disponibles para cotizaciones ({filteredConcepts.length} conceptos)
            </TableCaption>
            <TableHeader className="peza-table-header">
              <TableRow>
                <TableHead className="w-[400px] text-white font-semibold">Nombre del Concepto</TableHead>
                <TableHead className="text-white font-semibold">Unidad</TableHead>
                <TableHead className="text-right text-white font-semibold">Precio Sugerido</TableHead>
                <TableHead className="text-center text-white font-semibold">Estado</TableHead>
                <TableHead className="text-center text-white font-semibold">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredConcepts.map((concept, index) => (
                <TableRow key={concept.id} className={`peza-table-row ${!concept.active ? "opacity-60" : ""}`}>
                  <TableCell className="font-medium text-gray-900">{concept.name}</TableCell>
                  <TableCell className="text-gray-700">{concept.defaultUnit || "-"}</TableCell>
                  <TableCell className="text-right font-semibold text-gray-900">
                    {concept.defaultPrice ? formatCurrency(Number(concept.defaultPrice)) : "-"}
                  </TableCell>
                  <TableCell className="text-center">
                    <span 
                      className={concept.active ? "peza-status-active" : "peza-status-inactive"}
                    >
                      {concept.active ? "Activo" : "Inactivo"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-2 flex-wrap">
                      <button 
                        onClick={() => handleEditConcept(concept)}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-sm font-medium flex items-center gap-1"
                        title="Editar concepto"
                      >
                        <i className="ri-edit-line"></i>
                        Editar
                      </button>
                      <button 
                        onClick={() => handleToggleStatus(concept)}
                        className={`px-3 py-1.5 rounded-md hover:opacity-80 transition-all text-sm font-medium flex items-center gap-1 ${
                          concept.active 
                            ? 'bg-yellow-100 text-yellow-700' 
                            : 'bg-gray-100 text-gray-700'
                        }`}
                        title={concept.active ? "Desactivar concepto" : "Activar concepto"}
                      >
                        <i className={`ri-${concept.active ? 'close' : 'check'}-circle-line`}></i>
                        {concept.active ? "Desactivar" : "Activar"}
                      </button>
                      <button 
                        onClick={() => handleDelete(concept)}
                        className="px-3 py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-sm font-medium flex items-center gap-1"
                        title="Eliminar concepto"
                      >
                        <i className="ri-delete-bin-line"></i>
                        Eliminar
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="peza-card text-center py-12">
          <div className="max-w-sm mx-auto">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="ri-price-tag-3-line text-2xl text-yellow-600"></i>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay conceptos disponibles</h3>
            <p className="text-gray-600 mb-6">
              Comienza agregando conceptos para crear cotizaciones más rápidamente
            </p>
            <button 
              onClick={() => setIsAddDialogOpen(true)}
              className="peza-button-primary"
            >
              <i className="ri-add-line mr-2"></i>
              Añadir nuevo concepto
            </button>
          </div>
        </div>
      )}

      {/* Diálogo de conceptos duplicados */}
      <Dialog open={isDuplicatesDialogOpen} onOpenChange={setIsDuplicatesDialogOpen}>
        <DialogContent className="sm:max-w-[680px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisar conceptos duplicados</DialogTitle>
            <DialogDescription>
              Estos grupos tienen el mismo nombre (ignorando mayúsculas, acentos y espacios extra).
              Elige cuál conservar en cada grupo; los demás se eliminarán del catálogo.
              Las cotizaciones, reportes y reparaciones ya creadas no se modifican.
            </DialogDescription>
          </DialogHeader>
          {duplicatesLoading ? (
            <div className="text-center py-8 text-gray-600">Buscando duplicados...</div>
          ) : duplicateGroups && duplicateGroups.length > 0 ? (
            <div className="space-y-4">
              {duplicateGroups.map((group, groupIndex) => (
                <div key={group[0]?.id ?? groupIndex} className="border rounded-lg p-4">
                  <p className="font-semibold text-gray-900 mb-3 break-words">
                    {group[0]?.name}
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({group.length} repetidos)
                    </span>
                    <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full align-middle ${
                      group[0]?.description?.includes('[REPAIR]')
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {group[0]?.description?.includes('[REPAIR]') ? 'Reparación' : 'Cotizaciones'}
                    </span>
                  </p>
                  <div className="space-y-2">
                    {group.map((concept) => (
                      <div
                        key={concept.id}
                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-gray-50 rounded-md p-3"
                      >
                        <div className="text-sm text-gray-700 min-w-0">
                          <p className="font-medium text-gray-900 break-words">{concept.name}</p>
                          <p>
                            Unidad: {concept.defaultUnit || "-"} · Precio: {concept.defaultPrice ? formatCurrency(Number(concept.defaultPrice)) : "-"} ·{" "}
                            <span className={concept.active ? "text-green-700" : "text-gray-500"}>
                              {concept.active ? "Activo" : "Inactivo"}
                            </span>
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          disabled={mergeConceptsMutation.isPending}
                          onClick={() => handleMergeGroup(group, concept.id)}
                        >
                          {mergeConceptsMutation.isPending ? "Uniendo..." : "Conservar este"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <i className="ri-check-line text-xl text-green-600"></i>
              </div>
              <p className="text-gray-700 font-medium">No hay conceptos duplicados</p>
              <p className="text-sm text-gray-500">El catálogo está limpio</p>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">Cerrar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo para añadir concepto */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Añadir Nuevo Concepto</DialogTitle>
            <DialogDescription>
              Ingresa los detalles del nuevo concepto para cotizaciones.
            </DialogDescription>
          </DialogHeader>
          <Form {...addForm}>
            <form onSubmit={addForm.handleSubmit(onAddSubmit)} className="space-y-4">
              <FormField
                control={addForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Concepto*</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: SERVICIO DE INSTALACIÓN" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Input placeholder="Descripción detallada" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={addForm.control}
                  name="defaultUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidad Predeterminada</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Día, Hora, Servicio" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addForm.control}
                  name="defaultPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio Sugerido</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="text"
                            inputMode="decimal"
                            className="pl-7"
                            placeholder="0.00" 
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => {
                              // Permitir solo números y puntos
                              const value = e.target.value.replace(/[^\d.]/g, '');
                              // Evitar múltiples puntos
                              const parts = value.split('.');
                              const cleanValue = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
                              
                              field.onChange(cleanValue === '' ? 0 : Number(cleanValue));
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={addForm.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Activo</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Los conceptos activos aparecerán en el autocompletado de cotizaciones
                      </p>
                    </div>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancelar</Button>
                </DialogClose>
                <Button 
                  type="submit" 
                  disabled={createConceptMutation.isPending || !addForm.formState.isValid}
                >
                  {createConceptMutation.isPending ? "Guardando..." : "Guardar Concepto"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Diálogo para editar concepto */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Concepto</DialogTitle>
            <DialogDescription>
              Actualiza los detalles del concepto seleccionado.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Concepto*</FormLabel>
                    <FormControl>
                      <Input placeholder="Ej: SERVICIO DE INSTALACIÓN" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Input placeholder="Descripción detallada" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="defaultUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidad Predeterminada</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Día, Hora, Servicio" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="defaultPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio Sugerido</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">$</span>
                          <Input 
                            type="text"
                            inputMode="decimal"
                            className="pl-7"
                            placeholder="0.00" 
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => {
                              // Permitir solo números y puntos
                              const value = e.target.value.replace(/[^\d.]/g, '');
                              // Evitar múltiples puntos
                              const parts = value.split('.');
                              const cleanValue = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
                              
                              field.onChange(cleanValue === '' ? 0 : Number(cleanValue));
                            }}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editForm.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Activo</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Los conceptos activos aparecerán en el autocompletado de cotizaciones
                      </p>
                    </div>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancelar</Button>
                </DialogClose>
                <Button 
                  type="submit" 
                  disabled={updateConceptMutation.isPending || !editForm.formState.isValid}
                >
                  {updateConceptMutation.isPending ? "Actualizando..." : "Actualizar Concepto"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}