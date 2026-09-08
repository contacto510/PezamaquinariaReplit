import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn, formatCurrency } from "@/lib/utils";
import { conceptMatches, conceptFilter } from "@/lib/concept-filter";
import { authenticatedFetch } from "@/lib/queryClient";
import type { QuotationItemData, Concept } from "@shared/schema";

interface QuotationItemsTableProps {
  items: (QuotationItemData & { id?: number })[];
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onUpdateItem: (index: number, item: QuotationItemData) => void;
  subtotal: number;
  iva: number;
  total: number;
}

interface QuantityInputProps {
  value: number;
  index: number;
  onCommit: (value: number) => void;
}

/**
 * Conserva el texto mientras el usuario escribe. Esto permite estados
 * intermedios como "", "1." o "1," en teclados móviles sin transformarlos
 * inmediatamente en 0, 1 o 15.
 */
function QuantityInput({ value, index, onCommit }: QuantityInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value));
    }
  }, [value, isFocused]);

  const handleChange = (rawValue: string) => {
    const normalized = rawValue.replace(",", ".");
    const sanitized = normalized.replace(/[^\d.]/g, "");
    const parts = sanitized.split(".");
    const cleanValue =
      parts[0] + (parts.length > 1 ? "." + parts.slice(1).join("") : "");
    setDraft(cleanValue);
  };

  const commitValue = () => {
    const quantity = Number.parseFloat(draft);
    const finalValue = Number.isFinite(quantity) && quantity > 0
      ? quantity
      : (value > 0 ? value : 1);

    setDraft(String(finalValue));
    setIsFocused(false);
    onCommit(finalValue);
  };

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(event) => handleChange(event.target.value)}
      onFocus={(event) => {
        setIsFocused(true);
        event.currentTarget.select();
      }}
      onBlur={commitValue}
      aria-label={`Cantidad del concepto ${index + 1}`}
      className="shadow-sm block w-full text-sm rounded-md py-1.5 px-2 text-center"
    />
  );
}

export default function QuotationItemsTable({
  items,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  subtotal,
  iva,
  total
}: QuotationItemsTableProps) {
  // Estado para controlar el popover de conceptos
  const [openConceptPopover, setOpenConceptPopover] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  
  // Obtener la lista de conceptos
  const { data: concepts } = useQuery<Concept[]>({
    queryKey: ['/api/concepts'],
    queryFn: async () => {
      const res = await authenticatedFetch('/api/concepts?active=true');
      if (!res.ok) throw new Error("Error obteniendo conceptos");
      return res.json();
    }
  });

  // Función para seleccionar un concepto de la lista
  const selectConcept = (index: number, concept: Concept) => {
    const updatedItem = { 
      ...items[index], 
      concept: concept.name,
      unit: concept.defaultUnit || items[index].unit,
      unitPrice: concept.defaultPrice ? Number(concept.defaultPrice) : items[index].unitPrice
    };
    onUpdateItem(index, updatedItem);
    setOpenConceptPopover(null);
  };

  // Handle concept change
  const handleConceptChange = (index: number, value: string) => {
    onUpdateItem(index, { ...items[index], concept: value });
    setSearchTerm(value);
  };

  // Handle unit change
  const handleUnitChange = (index: number, value: string) => {
    onUpdateItem(index, { ...items[index], unit: value });
  };

  // Handle price change
  const handlePriceChange = (index: number, value: string) => {
    // Permitir solo números, puntos decimales y borrar caracteres
    const sanitizedValue = value.replace(/[^\d.]/g, '');
    
    // Evitar múltiples puntos decimales
    const parts = sanitizedValue.split('.');
    const cleanValue = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
    
    // Convertir a número después de la limpieza
    const unitPrice = parseFloat(cleanValue);
    
    if (sanitizedValue === '' || sanitizedValue === '.') {
      // Permitir campo vacío o solo punto decimal
      onUpdateItem(index, { ...items[index], unitPrice: 0 });
    } else if (!isNaN(unitPrice) && unitPrice >= 0) {
      onUpdateItem(index, { ...items[index], unitPrice });
    }
  };

  // Calculate item subtotal
  const calculateItemSubtotal = (item: QuotationItemData): number => {
    return item.quantity * item.unitPrice;
  };

  return (
    <div className="bg-white shadow-sm border border-gray-200 overflow-hidden sm:rounded-lg w-full mx-auto">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-100 rounded-lg">
            <i className="ri-list-check-2 text-yellow-600 text-lg"></i>
          </div>
          <div>
            <h3 className="text-lg leading-6 font-semibold text-gray-900">
              Elementos de la Cotización
            </h3>
            <p className="text-sm text-gray-600">
              {items.length} {items.length === 1 ? 'elemento' : 'elementos'} agregados
            </p>
          </div>
        </div>
        <button onClick={onAddItem} className="peza-button-primary w-full sm:w-auto">
          <i className="ri-add-line mr-2"></i>
          Agregar Elemento
        </button>
      </div>
      
      <div className="overflow-x-auto pb-4">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-2 sm:px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12 sm:w-16">
                No.
              </th>
              <th scope="col" className="px-2 sm:px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Concepto
              </th>
              <th scope="col" className="px-2 sm:px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24 sm:w-28">
                Cantidad
              </th>
              <th scope="col" className="px-2 sm:px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24 sm:w-28">
                Unidad
              </th>
              <th scope="col" className="px-2 sm:px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32 sm:w-40">
                Precio Unitario
              </th>
              <th scope="col" className="px-2 sm:px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-32 sm:w-40">
                Subtotal
              </th>
              <th scope="col" className="px-2 sm:px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12 sm:w-16">
                Eliminar
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center justify-center space-y-4">
                    <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                      <i className="ri-list-check-2 text-2xl text-yellow-600"></i>
                    </div>
                    <div className="text-center">
                      <h3 className="text-sm font-medium text-gray-900">No hay elementos</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        Agregue equipos y servicios para comenzar a cotizar
                      </p>
                    </div>
                    <button 
                      onClick={onAddItem}
                      className="peza-button-primary text-sm"
                    >
                      <i className="ri-add-line mr-2"></i>
                      Agregar Primer Elemento
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr key={index}>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                    {index + 1}
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 text-sm text-gray-900 text-center">
                    <Popover open={openConceptPopover === index} onOpenChange={(open) => { setOpenConceptPopover(open ? index : null); setSearchTerm(""); }}>
                      <PopoverTrigger asChild>
                        <div className="relative w-full">
                          <Input
                            value={item.concept}
                            onChange={(e) => handleConceptChange(index, e.target.value)}
                            className="shadow-sm block w-full text-sm rounded-md py-1.5 px-2 pr-8"
                            onClick={() => setOpenConceptPopover(index)}
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                            <i className="ri-arrow-down-s-line text-gray-400"></i>
                          </div>
                        </div>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[min(92vw,520px)] max-h-[300px]" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput 
                            placeholder="Buscar concepto..." 
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                          />
                          <CommandList>
                            <CommandEmpty>No se encontraron conceptos</CommandEmpty>
                            <CommandGroup>
                              {concepts?.filter(concept => 
                                conceptMatches(concept.name, searchTerm || item.concept)
                              ).sort((a, b) =>
                                conceptFilter(b.name, searchTerm || item.concept) -
                                conceptFilter(a.name, searchTerm || item.concept)
                              ).map((concept) => (
                                <CommandItem
                                  key={concept.id}
                                  value={concept.name}
                                  onSelect={() => selectConcept(index, concept)}
                                  className="flex items-start justify-between gap-2"
                                >
                                  <div className="flex-1 whitespace-normal break-words leading-snug text-left">{concept.name}</div>
                                  {concept.name === item.concept && <Check size={16} className="mt-0.5 shrink-0" />}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                     <QuantityInput
                       value={item.quantity}
                       index={index}
                       onCommit={(quantity) =>
                         onUpdateItem(index, { ...items[index], quantity })
                       }
                     />
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                    <Input
                      value={item.unit}
                      onChange={(e) => handleUnitChange(index, e.target.value)}
                      className="shadow-sm block w-full text-sm rounded-md py-1.5 px-2 text-center"
                    />
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                    <div className="relative rounded-md shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-2 sm:pl-3 flex items-center pointer-events-none">
                        <span className="text-gray-500 text-xs sm:text-sm">$</span>
                      </div>
                      <Input
                        type="text" 
                        inputMode="decimal"
                        value={item.unitPrice}
                        onChange={(e) => handlePriceChange(index, e.target.value)}
                        className="pl-6 sm:pl-7 block w-full text-sm rounded-md py-1.5 px-2 text-center"
                      />
                    </div>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-sm text-gray-900 font-medium text-center">
                    <div>
                      {formatCurrency(calculateItemSubtotal(item))}
                    </div>
                  </td>
                  <td className="px-2 sm:px-4 py-2 sm:py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                    <button
                      onClick={() => onRemoveItem(index)}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 transition-colors duration-200"
                      aria-label="Eliminar elemento"
                      title="Eliminar elemento"
                    >
                      <i className="ri-delete-bin-line text-lg"></i>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Totals Section - Diseño corporativo mejorado */}
      <div className="px-4 py-6 sm:px-6 bg-gray-50 border-t border-gray-200">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <i className="ri-calculator-line text-green-600 text-lg"></i>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-900">Resumen Financiero</h4>
              <p className="text-sm text-gray-600">Cálculos de la cotización</p>
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-md">
                <span className="text-sm font-medium text-gray-700">
                  <i className="ri-subtract-line mr-2 text-gray-500"></i>
                  Subtotal:
                </span>
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 bg-blue-50 rounded-md">
                <span className="text-sm font-medium text-blue-700">
                  <i className="ri-percent-line mr-2 text-blue-500"></i>
                  IVA (16%):
                </span>
                <span className="text-sm font-semibold text-blue-900">{formatCurrency(iva)}</span>
              </div>
              <div className="flex justify-between items-center gap-2 py-3 px-4 bg-yellow-50 rounded-md border-2 border-yellow-200 min-h-[56px]">
                <span className="text-base sm:text-lg font-bold text-yellow-800 whitespace-nowrap flex-shrink-0">
                  <i className="ri-money-dollar-circle-line mr-2 text-yellow-600"></i>
                  Total:
                </span>
                <span className="text-base sm:text-lg font-bold text-yellow-900 text-right truncate">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
