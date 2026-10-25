import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Concept, ConceptFormData, conceptSchema } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
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
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

export default function RepairConcepts() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingConcept, setEditingConcept] = useState<Concept | null>(null);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openEditDialog, setOpenEditDialog] = useState(false);
  const [deleteConceptId, setDeleteConceptId] = useState<number | null>(null);

  // Formulario para añadir/editar concepto
  const form = useForm<ConceptFormData>({
    resolver: zodResolver(conceptSchema),
    defaultValues: {
      name: "",
      description: "",
      defaultPrice: 0, // Usar número en lugar de string para defaultPrice
      defaultUnit: "pza",
      category: "repair", // Siempre guardar como categoría de reparación
      active: true
    }
  });

  // Obtener todos los conceptos de reparación
  const { data: concepts = [], isLoading } = useQuery({
    queryKey: ['/api/concepts'],
    queryFn: async () => {
      try {
        // Obtenemos todos los conceptos y filtramos manualmente para reparaciones
        const response = await apiRequest('/api/concepts');
        // Filtramos para mostrar solo los conceptos que tienen [REPAIR] en su descripción
        return (response as Concept[]).filter(concept => 
          concept.description?.includes('[REPAIR]') || false
        );
      } catch (error) {
        console.error("Error al cargar conceptos:", error);
        return [];
      }
    },
    refetchOnWindowFocus: false,
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

  // Conceptos filtrados por término de búsqueda
  const filteredConcepts = searchTerm
    ? concepts.filter(concept => 
        concept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (concept.description && concept.description.toLowerCase().includes(searchTerm.toLowerCase())))
    : concepts;

  // Mutación para crear un nuevo concepto
  const addMutation = useMutation({
    mutationFn: async (data: ConceptFormData) => {
      // Crear una descripción que incluya el marcador de reparación
      const description = data.description 
        ? `[REPAIR] ${data.description}` 
        : "[REPAIR]";
      
      // Crear objeto simple con solo los campos necesarios
      const payload = {
        name: data.name,
        description: description,
        defaultUnit: data.defaultUnit || "pza",
        defaultPrice: data.defaultPrice !== undefined 
          ? data.defaultPrice.toString() 
          : "0",
        active: true,
        category: 'repair' // Para que la prevención de duplicados compare contra el catálogo de reparación
      };
      
      console.log("Enviando concepto:", payload);
      
      return apiRequest('/api/concepts', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/concepts'] });
      toast({
        title: "Concepto creado",
        description: "El concepto ha sido creado correctamente.",
      });
      setOpenAddDialog(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: extractErrorMessage(error, "No se pudo crear el concepto"),
        variant: "destructive",
      });
    },
  });

  // Mutación para actualizar un concepto existente
  const updateMutation = useMutation({
    mutationFn: async (data: { id: number, concept: ConceptFormData }) => {
      // Convertir defaultPrice a string para la API (si existe)
      const defaultPrice = data.concept.defaultPrice !== undefined 
        ? data.concept.defaultPrice.toString() 
        : "0";
      
      // Mantener el marcador de reparación en la descripción
      const description = data.concept.description
        ? `[REPAIR] ${data.concept.description.replace('[REPAIR] ', '').replace('[REPAIR]', '')}`
        : "[REPAIR]";
        
      return apiRequest(`/api/concepts/${data.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          ...data.concept,
          description,
          defaultPrice,
          category: 'repair', // Siempre categoría de reparación
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/concepts'] });
      toast({
        title: "Concepto actualizado",
        description: "El concepto ha sido actualizado correctamente.",
      });
      setOpenEditDialog(false);
      setEditingConcept(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: extractErrorMessage(error, "No se pudo actualizar el concepto"),
        variant: "destructive",
      });
    },
  });

  // Mutación para cambiar el estado activo/inactivo
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number, active: boolean }) => {
      return apiRequest(`/api/concepts/${id}/toggle-status`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/concepts'] });
      toast({
        title: "Estado actualizado",
        description: "El estado del concepto ha sido actualizado.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `No se pudo actualizar el estado: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Mutación para eliminar un concepto
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/concepts/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/concepts'] });
      toast({
        title: "Concepto eliminado",
        description: "El concepto ha sido eliminado correctamente.",
      });
      setDeleteConceptId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `No se pudo eliminar el concepto: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Manejar envío del formulario para añadir nuevo concepto
  const onAddSubmit = (data: ConceptFormData) => {
    // Asegurar que defaultPrice sea un número antes de usar toString
    const defaultPrice = typeof data.defaultPrice === 'number' 
      ? data.defaultPrice 
      : (data.defaultPrice ? parseFloat(String(data.defaultPrice)) : 0);
      
    addMutation.mutate({
      ...data,
      defaultPrice,
      category: 'repair',
    });
  };

  // Manejar envío del formulario para editar concepto existente
  const onEditSubmit = (data: ConceptFormData) => {
    if (!editingConcept) return;
    
    // Aseguramos que defaultPrice sea un número antes de convertirlo a string
    const defaultPrice = typeof data.defaultPrice === 'number' 
      ? data.defaultPrice 
      : parseFloat(String(data.defaultPrice || 0));
    
    updateMutation.mutate({
      id: editingConcept.id,
      concept: {
        ...data,
        defaultPrice,
        category: 'repair',
      }
    });
  };

  // Función para abrir el diálogo de edición y cargar los datos del concepto
  const handleEditConcept = (concept: Concept) => {
    setEditingConcept(concept);
    
    // Convertir defaultPrice de string a número para el formulario
    let defaultPriceNum = 0;
    if (concept.defaultPrice) {
      try {
        defaultPriceNum = parseFloat(concept.defaultPrice.toString());
      } catch (e) {
        defaultPriceNum = 0;
      }
    }
    
    form.reset({
      name: concept.name,
      description: concept.description || "",
      defaultPrice: defaultPriceNum,
      defaultUnit: concept.defaultUnit || "pza",
      category: (concept as any).category || "repair",
      active: concept.active,
    });
    setOpenEditDialog(true);
  };

  // Función para manejar el cambio de estado activo/inactivo
  const handleToggleStatus = (concept: Concept) => {
    toggleStatusMutation.mutate({
      id: concept.id,
      active: !concept.active
    });
  };

  // Función para manejar la eliminación de conceptos
  const handleDelete = (concept: Concept) => {
    setDeleteConceptId(concept.id);
  };

  // Función para confirmar la eliminación
  const confirmDelete = () => {
    if (deleteConceptId) {
      deleteMutation.mutate(deleteConceptId);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-words">Conceptos de Reparación</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Gestiona los conceptos específicos para órdenes de reparación.
          </p>
        </div>
        <Dialog open={openAddDialog} onOpenChange={setOpenAddDialog}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto min-h-[44px] sm:min-h-auto text-sm sm:text-base">
              <i className="ri-add-line mr-2"></i>
              Nuevo Concepto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>Añadir nuevo concepto</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onAddSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del Concepto</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Textarea {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="defaultPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Precio por Defecto</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="0"
                            step="0.01"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="defaultUnit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unidad por Defecto</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            {...field}
                          >
                            <option value="pza">Pieza</option>
                            <option value="hr">Hora</option>
                            <option value="serv">Servicio</option>
                            <option value="m">Metro</option>
                            <option value="kg">Kilogramo</option>
                            <option value="l">Litro</option>
                            <option value="dia">Día</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Activo
                        </FormLabel>
                        <FormMessage />
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
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button 
                    type="submit" 
                    disabled={addMutation.isPending}
                  >
                    {addMutation.isPending ? (
                      <>
                        <span className="animate-spin mr-2">⟳</span>
                        Guardando...
                      </>
                    ) : (
                      <>
                        <i className="ri-save-line mr-2"></i>
                        Guardar Concepto
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs de navegación - Responsive */}
      <div className="flex gap-1 sm:gap-0 bg-white rounded-lg p-1 sm:p-0 sm:border-b sm:border-gray-200 overflow-x-auto">
        <a href="/repairs" className={`px-2 sm:px-4 py-2 font-medium text-xs sm:text-base whitespace-nowrap ${location.toString().includes("/repairs") && !location.toString().includes("/edit") && !location.toString().includes("/repair-concepts") ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-md sm:rounded-none sm:border-b-2 sm:border-blue-600 sm:text-blue-600 sm:bg-transparent" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100 sm:hover:bg-transparent rounded-md sm:rounded-none"}`}>
          Reparaciones
        </a>
        <a href="/repair-concepts" className={`px-2 sm:px-4 py-2 font-medium text-xs sm:text-base whitespace-nowrap ${location.toString().includes("/repair-concepts") ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-black rounded-md sm:rounded-none sm:border-b-2 sm:border-blue-600 sm:text-blue-600 sm:bg-transparent" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100 sm:hover:bg-transparent rounded-md sm:rounded-none"}`}>
          Conceptos
        </a>
      </div>

      <div className="space-y-4">
        <div className="flex items-center w-full">
          <Input
            type="text"
            placeholder="Buscar conceptos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:max-w-sm text-sm"
          />
        </div>

        <Card className="overflow-x-auto">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[150px] sm:w-[250px] text-xs sm:text-base">Nombre</TableHead>
                  <TableHead className="hidden sm:table-cell min-w-[200px] text-xs sm:text-base">Descripción</TableHead>
                  <TableHead className="hidden md:table-cell text-right text-xs sm:text-base">Precio</TableHead>
                  <TableHead className="text-center text-xs sm:text-base min-w-[80px]">Estado</TableHead>
                  <TableHead className="text-right text-xs sm:text-base min-w-[120px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredConcepts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-xs sm:text-base text-muted-foreground px-2 sm:px-4">
                      {searchTerm ? (
                        "No se encontraron conceptos que coincidan con tu búsqueda."
                      ) : (
                        "No hay conceptos registrados. Crea tu primer concepto para comenzar."
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredConcepts.map((concept) => (
                    <TableRow key={concept.id}>
                      <TableCell className="font-medium text-xs sm:text-sm">{concept.name}</TableCell>
                      <TableCell className="hidden sm:table-cell max-w-[200px] truncate text-xs sm:text-sm">
                        {concept.description || "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-right text-xs sm:text-sm">
                        {concept.defaultPrice ? formatCurrency(parseFloat(concept.defaultPrice.toString())) : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={concept.active ? "default" : "outline"} className={`text-xs sm:text-sm ${concept.active ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-gray-100 text-gray-800 hover:bg-gray-200"}`}>
                          {concept.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 sm:gap-2 flex-wrap">
                          <button 
                            onClick={() => handleEditConcept(concept)}
                            className="px-2 sm:px-3 py-1 sm:py-1.5 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 transition-colors text-xs sm:text-sm font-medium flex items-center gap-0.5 sm:gap-1 min-h-[32px] sm:min-h-[36px] whitespace-nowrap"
                            title="Editar concepto"
                          >
                            <i className="ri-edit-line text-sm sm:text-base"></i>
                            <span>Editar</span>
                          </button>
                          <button 
                            onClick={() => handleToggleStatus(concept)}
                            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md hover:opacity-80 transition-all text-xs sm:text-sm font-medium flex items-center gap-0.5 sm:gap-1 min-h-[32px] sm:min-h-[36px] whitespace-nowrap ${
                              concept.active 
                                ? 'bg-yellow-100 text-yellow-700' 
                                : 'bg-gray-100 text-gray-700'
                            }`}
                            title={concept.active ? "Desactivar concepto" : "Activar concepto"}
                          >
                            <i className={`ri-${concept.active ? 'close' : 'check'}-circle-line text-sm sm:text-base`}></i>
                            <span>{concept.active ? "Desactivar" : "Activar"}</span>
                          </button>
                          <button 
                            onClick={() => handleDelete(concept)}
                            className="px-2 sm:px-3 py-1 sm:py-1.5 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors text-xs sm:text-sm font-medium flex items-center gap-0.5 sm:gap-1 min-h-[32px] sm:min-h-[36px] whitespace-nowrap"
                            title="Eliminar concepto"
                          >
                            <i className="ri-delete-bin-line text-sm sm:text-base"></i>
                            <span>Eliminar</span>
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Diálogo para editar concepto */}
      <Dialog open={openEditDialog} onOpenChange={setOpenEditDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Editar concepto</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Concepto</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="defaultPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio por Defecto</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min="0"
                          step="0.01"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="defaultUnit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidad por Defecto</FormLabel>
                      <FormControl>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          {...field}
                        >
                          <option value="pza">Pieza</option>
                          <option value="hr">Hora</option>
                          <option value="serv">Servicio</option>
                          <option value="m">Metro</option>
                          <option value="kg">Kilogramo</option>
                          <option value="l">Litro</option>
                          <option value="dia">Día</option>
                        </select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Activo
                      </FormLabel>
                      <FormMessage />
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
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">Cancelar</Button>
                </DialogClose>
                <Button 
                  type="submit" 
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <>
                      <span className="animate-spin mr-2">⟳</span>
                      Guardando...
                    </>
                  ) : (
                    <>
                      <i className="ri-save-line mr-2"></i>
                      Actualizar Concepto
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Diálogo para confirmar eliminación */}
      <AlertDialog open={deleteConceptId !== null} onOpenChange={(open) => !open && setDeleteConceptId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente el concepto y no podrá ser recuperado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Eliminando...
                </>
              ) : (
                "Eliminar"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}