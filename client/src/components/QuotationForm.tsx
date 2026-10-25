import { useEffect, useState, useRef } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { quotationFormSchema, type QuotationFormData, type Client } from "@shared/schema";

interface QuotationFormProps {
  quotationNumber: number | null;
  clientInfo: QuotationFormData;
  setClientInfo: (info: QuotationFormData) => void;
  isLoading: boolean;
}

export default function QuotationForm({ 
  quotationNumber, 
  clientInfo, 
  setClientInfo, 
  isLoading 
}: QuotationFormProps) {
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [clientSearchValue, setClientSearchValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Initialize form with react-hook-form
  const form = useForm<QuotationFormData>({
    resolver: zodResolver(quotationFormSchema),
    defaultValues: clientInfo,
  });

  // Fetch clients for autocomplete
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
    enabled: clientSearchValue.length > 2, // Only search when user has typed at least 3 characters
  });

  // Filter clients based on search
  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(clientSearchValue.toLowerCase()) ||
    (client.email ?? "").toLowerCase().includes(clientSearchValue.toLowerCase())
  );

  // Update form when clientInfo changes
  useEffect(() => {
    // Si el email es "N/A", lo tratamos como vacío para que el placeholder sea visible
    const displayInfo = {
      ...clientInfo,
      clientEmail: clientInfo.clientEmail === "N/A" ? "" : clientInfo.clientEmail
    };
    form.reset(displayInfo);
  }, [clientInfo, form]);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setClientSearchOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle form submission
  const onSubmit = (data: QuotationFormData) => {
    // Aseguramos que si está vacío se guarde como N/A
    const finalData = {
      ...data,
      clientEmail: data.clientEmail && data.clientEmail.trim() !== "" ? data.clientEmail : "N/A"
    };
    setClientInfo(finalData);
  };

  // Update parent component when form values change
  const handleChange = () => {
    const data = form.getValues();
    // No transformamos aquí para permitir que el usuario escriba, 
    // la transformación final ocurre en onSubmit o antes de enviar a la API
    setClientInfo(data);
  };

  // Handle client selection from autocomplete
  const handleClientSelect = (client: Client) => {
    form.setValue("clientName", client.name);
    form.setValue("clientEmail", client.email ?? "");
    setClientSearchValue(client.name);
    setClientSearchOpen(false);
    handleChange();
  };

  return (
    <Form {...form}>
      <form onChange={handleChange} onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 w-full">
        {/* Información básica - Primera fila */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Número de cotización */}
          <div className="md:col-span-3 md:col-start-1">
            <Label htmlFor="quotation-number" className="text-sm font-medium text-gray-700">
              <i className="ri-hashtag mr-2 text-gray-500"></i>
              Número de Cotización
            </Label>
            <div className="mt-2">
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Input
                  id="quotation-number"
                  value={quotationNumber ? `COT-${quotationNumber}` : ""}
                  readOnly
                  className="bg-yellow-50 border-yellow-200 text-gray-900 font-medium w-full"
                />
              )}
            </div>
          </div>

          {/* Cliente con Autocompletado */}
          <FormField
            control={form.control}
            name="clientName"
            render={({ field }) => (
              <FormItem className="md:col-span-6">
                <FormLabel className="text-sm font-medium text-gray-700">
                  <i className="ri-user-line mr-2 text-gray-500"></i>
                  Nombre del Cliente / Empresa
                </FormLabel>
                <FormControl>
                  <div className="relative" ref={dropdownRef}>
                    <Input
                      placeholder="Ej: Constructora ABC S.A. de C.V. o Juan Pérez García"
                      value={field.value}
                      onChange={(e) => {
                        field.onChange(e);
                        setClientSearchValue(e.target.value);
                        if (e.target.value.length > 2) {
                          setClientSearchOpen(true);
                        } else {
                          setClientSearchOpen(false);
                        }
                        handleChange();
                      }}
                      className="w-full mt-1 border-gray-300 focus:border-yellow-400 focus:ring-yellow-400"
                    />
                    {clientSearchOpen && filteredClients.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                        {filteredClients.map((client) => (
                          <div
                            key={client.id}
                            onClick={() => handleClientSelect(client)}
                            className="px-4 py-3 hover:bg-yellow-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-900">{client.name}</span>
                              <span className="text-sm text-gray-500">{client.email}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </FormControl>
                <p className="text-xs text-gray-500 mt-1">
                  Escribe el nombre del cliente - se mostraran sugerencias de clientes existentes
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Vendedor */}
          <FormField
            control={form.control}
            name="salesperson"
            render={({ field }) => (
              <FormItem className="md:col-span-3">
                <FormLabel className="text-sm font-medium text-gray-700">
                  <i className="ri-user-star-line mr-2 text-gray-500"></i>
                  Vendedor <span className="text-red-600" aria-hidden="true">*</span>
                </FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Ej: Juan Pérez" 
                    {...field}
                    required
                    aria-required="true"
                    onChange={(event) => {
                      field.onChange(event);
                      setClientInfo({ ...form.getValues(), salesperson: event.target.value });
                    }}
                    className="w-full mt-1 border-gray-300 focus:border-yellow-400 focus:ring-yellow-400" 
                  />
                </FormControl>
                <p className="text-xs text-gray-500 mt-1">
                  Obligatorio: nombre del vendedor que atendió al cliente
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Información adicional - Segunda fila */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Correo */}
          <FormField
            control={form.control}
            name="clientEmail"
            render={({ field }) => (
              <FormItem className="md:col-span-4">
                <FormLabel className="text-sm font-medium text-gray-700">
                  <i className="ri-mail-line mr-2 text-gray-500"></i>
                  Correo Electrónico (Opcional)
                </FormLabel>
                <FormControl>
                  <Input 
                    placeholder="N/A" 
                    {...field} 
                    value={field.value === "N/A" ? "" : field.value}
                    className="w-full mt-1 border-gray-300 focus:border-yellow-400 focus:ring-yellow-400" 
                  />
                </FormControl>
                <p className="text-xs text-gray-500 mt-1">
                  Si se deja vacío, se guardará como "N/A"
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Obra */}
          <FormField
            control={form.control}
            name="projectName"
            render={({ field }) => (
              <FormItem className="md:col-span-4">
                <FormLabel className="text-sm font-medium text-gray-700">
                  <i className="ri-building-line mr-2 text-gray-500"></i>
                  Obra / Proyecto
                </FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Ej: Construcción Plaza Comercial Norte" 
                    {...field} 
                    className="w-full mt-1 border-gray-300 focus:border-yellow-400 focus:ring-yellow-400" 
                  />
                </FormControl>
                <p className="text-xs text-gray-500 mt-1">
                  Nombre del proyecto o ubicación de la obra
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Período de Renta */}
          <FormField
            control={form.control}
            name="rentalPeriod"
            render={({ field }) => (
              <FormItem className="md:col-span-4">
                <FormLabel className="text-sm font-medium text-gray-700">
                  <i className="ri-calendar-event-line mr-2 text-gray-500"></i>
                  Período de Renta
                </FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Ej: 15 días (01/05/2025 - 15/05/2025)" 
                    {...field} 
                    className="w-full mt-1 border-gray-300 focus:border-yellow-400 focus:ring-yellow-400"
                  />
                </FormControl>
                <p className="text-xs text-gray-500 mt-1">
                  Duración estimada del proyecto
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Opción de IVA y información adicional - Tercera fila */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          <FormField
            control={form.control}
            name="includeIVA"
            render={({ field }) => (
              <FormItem className="md:col-span-6 flex flex-row items-center justify-between rounded-lg border border-gray-200 p-4 bg-gray-50">
                <div className="space-y-0.5">
                  <FormLabel className="text-base font-medium text-gray-800">
                    <i className="ri-percent-line mr-2 text-gray-600"></i>
                    Incluir IVA (16%)
                  </FormLabel>
                  <FormDescription className="text-sm text-gray-600">
                    Activa esta opción para calcular e incluir IVA en la cotización
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                      setClientInfo({ ...form.getValues(), includeIVA: checked });
                    }}
                    className="data-[state=checked]:bg-yellow-400"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          
          {/* Información adicional */}
          <div className="md:col-span-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <i className="ri-information-line text-blue-600"></i>
              </div>
              <div>
                <h4 className="text-sm font-medium text-blue-900 mb-2">
                  Información Importante
                </h4>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li>• Todos los precios están en pesos mexicanos (MXN)</li>
                  <li>• La cotización tiene validez de 30 días</li>
                  <li>• Los equipos incluyen operador certificado</li>
                  <li>• Combustible y mantenimiento incluidos</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
