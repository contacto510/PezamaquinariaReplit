import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { RepairItemData, Concept } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import RepairPriceInput from "@/components/RepairPriceInput";
import RepairConceptCatalogStatus from "@/components/RepairConceptCatalogStatus";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, parseNumber } from "@/lib/utils";
import { repairConceptDescription, searchRepairConcepts } from "@/lib/repair-concept-search";

interface RepairItemsTableProps {
  items: (RepairItemData & { id?: number })[];
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onInsertItem: (afterIndex: number) => void;
  onUpdateItem: (index: number, item: RepairItemData) => void;
  concepts: Concept[];
  conceptsLoading: boolean;
  conceptsError: boolean;
  onRetryConcepts: () => void;
  subtotal: number;
  iva: number;
  total: number;
}

export default function RepairItemsTable({
  items,
  onAddItem,
  onRemoveItem,
  onInsertItem,
  onUpdateItem,
  concepts,
  conceptsLoading,
  conceptsError,
  onRetryConcepts,
  subtotal,
  iva,
  total,
}: RepairItemsTableProps) {
  const [activeRow, setActiveRow] = useState<number | null>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const tableElRef = useRef<HTMLTableElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);

  const recomputeDropdownPos = useCallback(() => {
    const el = activeInputRef.current;
    if (!el) {
      setDropdownPos(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const desiredHeight = 240;
    const openUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const width = Math.min(Math.max(rect.width, 400), window.innerWidth - 16);
    setDropdownPos({
      top: openUp ? rect.top : rect.bottom,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      openUp,
    });
  }, []);

  useEffect(() => {
    if (activeRow === null) {
      setDropdownPos(null);
      return;
    }
    recomputeDropdownPos();
    const onScrollOrResize = () => recomputeDropdownPos();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [activeRow, recomputeDropdownPos]);

  // Si la cantidad de items cambia (insert/delete), limpiamos activeRow
  // para evitar que un dropdown stale cubra inputs invisible en posiciones desplazadas
  useEffect(() => {
    setActiveRow(null);
  }, [items.length]);

  // Sincronizar scroll horizontal entre la barra superior y el scroller de la tabla
  useEffect(() => {
    const top = topScrollRef.current;
    const bottom = bottomScrollRef.current;
    const tableEl = tableElRef.current;
    if (!top || !bottom || !tableEl) return;

    let rafId = 0;
    let isSyncing = false;
    const syncTo = (target: HTMLDivElement, value: number) => {
      if (isSyncing) return;
      isSyncing = true;
      target.scrollLeft = value;
      requestAnimationFrame(() => { isSyncing = false; });
    };
    const onTopScroll = () => syncTo(bottom, top.scrollLeft);
    const onBottomScroll = () => syncTo(top, bottom.scrollLeft);
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
          const w = bottom.scrollWidth;
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
  }, [items.length]);

  const searchTerm = activeRow === null ? "" : items[activeRow]?.concept ?? "";
  const matchingConcepts = useMemo(
    () => searchRepairConcepts(concepts, searchTerm),
    [concepts, searchTerm],
  );

  const selectConcept = (index: number, concept: Concept) => {
    const unitPrice = parseFloat(concept.defaultPrice?.toString() || "0");
    const quantity = items[index].quantity;
    const updatedItem = {
      ...items[index],
      concept: concept.name,
      unit: concept.defaultUnit || "pza",
      unitPrice: unitPrice,
      subtotal: quantity * unitPrice
    };
    onUpdateItem(index, updatedItem);
    setActiveRow(null);
  };

  const calculateItemSubtotal = (item: RepairItemData): number => {
    return item.quantity * item.unitPrice;
  };
  
  // Actualiza el item con el subtotal calculado
  const updateItemWithSubtotal = (index: number, updatedItem: RepairItemData) => {
    const subtotal = calculateItemSubtotal(updatedItem);
    onUpdateItem(index, {
      ...updatedItem,
      subtotal: subtotal
    });
  };

  return (
    <div className="space-y-4">
      <RepairConceptCatalogStatus
        loading={conceptsLoading}
        error={conceptsError}
        onRetry={onRetryConcepts}
      />
      <div
        ref={topScrollRef}
        className="peza-top-scroll rounded"
        style={{ height: 16 }}
        aria-label="Barra de desplazamiento horizontal superior"
      >
        <div style={{ width: tableScrollWidth || 1, height: 1 }} />
      </div>
      <div ref={bottomScrollRef} className="overflow-x-auto overflow-y-hidden">
      <table ref={tableElRef} className="w-max min-w-full caption-bottom text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">#</TableHead>
            <TableHead className="min-w-52">Concepto</TableHead>
            <TableHead className="text-right min-w-[120px]">Cantidad</TableHead>
            <TableHead className="text-right min-w-[140px]">Unidad</TableHead>
            <TableHead className="text-right min-w-[180px]">Precio Unitario</TableHead>
            <TableHead className="text-right min-w-[160px]">Subtotal</TableHead>
            <TableHead className="w-[120px]">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={item.id ? `id-${item.id}` : `new-${index}-${items.length}`}>
              <TableCell className="font-medium">{index + 1}</TableCell>
              <TableCell>
                <div className="relative">
                  <Input
                    value={item.concept}
                    onChange={(e) => {
                      e.preventDefault();
                      const value = e.target.value;
                      onUpdateItem(index, { ...item, concept: value });
                      activeInputRef.current = e.currentTarget;
                      setActiveRow(index);
                    }}
                    onFocus={(e) => {
                      activeInputRef.current = e.currentTarget;
                      setActiveRow(index);
                    }}
                    onBlur={() => {
                      setTimeout(() => setActiveRow(null), 200);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setActiveRow(null);
                      if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}
                    aria-label={`Concepto de reparación ${index + 1}`}
                    aria-expanded={activeRow === index && dropdownPos !== null}
                    aria-controls={activeRow === index ? "repair-concept-suggestions" : undefined}
                    autoComplete="off"
                    placeholder="Buscar por palabras: aire filtro..."
                    className="w-full"
                  />
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={item.quantity.toString()}
                  onChange={(e) => {
                    e.preventDefault(); // Prevenir el envío del formulario
                    const value = parseNumber(e.target.value);
                    if (value > 0) {
                      const updatedItem = { ...item, quantity: value };
                      updateItemWithSubtotal(index, updatedItem);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault(); // Prevenir que la tecla Enter envíe el formulario
                    }
                  }}
                  className="w-full text-right"
                />
              </TableCell>
              <TableCell className="text-right">
                <Select
                  value={item.unit}
                  onValueChange={(value) => onUpdateItem(index, { ...item, unit: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Unidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pza">Pieza</SelectItem>
                    <SelectItem value="hr">Hora</SelectItem>
                    <SelectItem value="serv">Servicio</SelectItem>
                    <SelectItem value="m">Metro</SelectItem>
                    <SelectItem value="kg">Kilogramo</SelectItem>
                    <SelectItem value="l">Litro</SelectItem>
                    <SelectItem value="dia">Día</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="text-right">
                <RepairPriceInput
                  value={Number(item.unitPrice)}
                  label={`Precio unitario del concepto ${index + 1}`}
                  onChange={unitPrice => updateItemWithSubtotal(index, { ...item, unitPrice })}
                />
              </TableCell>
              <TableCell className="text-right font-medium">
                {formatCurrency(calculateItemSubtotal(item))}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onInsertItem(index);
                    }}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:text-emerald-800 transition-colors duration-200"
                    aria-label="Insertar fila abajo"
                    title="Insertar fila abajo"
                  >
                    <i className="ri-insert-row-bottom text-lg"></i>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRemoveItem(index);
                    }}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 transition-colors duration-200"
                    aria-label="Eliminar elemento"
                    title="Eliminar elemento"
                  >
                    <i className="ri-delete-bin-line text-lg"></i>
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                No hay conceptos agregados. Haga clic en "Agregar Concepto" para comenzar.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </table>
      </div>

      <Button 
        onClick={(e) => {
          e.preventDefault(); // Prevenir que se envíe el formulario
          e.stopPropagation(); // Detener la propagación del evento
          onAddItem();
        }} 
        type="button" // Especificar que es un botón normal, no de envío
        variant="outline" 
        className="w-full"
      >
        <i className="ri-add-line mr-2"></i>
        Agregar Concepto
      </Button>

      <div className="mt-4 flex justify-end">
        <div className="space-y-2 w-48">
          <div className="flex justify-between">
            <span className="font-medium">Subtotal:</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium">IVA (16%):</span>
            <span>{formatCurrency(iva)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold">
            <span>Total:</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>

      {activeRow !== null && dropdownPos && items[activeRow] && (() => {
        const { repair, general } = matchingConcepts;
        const catalogAvailable = !conceptsLoading && !conceptsError;
        const hasResults = repair.length > 0 || general.length > 0;
        const idx = activeRow;
        const maxHeight = 240;
        const style: React.CSSProperties = {
          position: "fixed",
          left: dropdownPos.left,
          width: dropdownPos.width,
          maxHeight,
          zIndex: 9999,
          ...(dropdownPos.openUp
             ? { top: dropdownPos.top - 4, transform: "translateY(-100%)" }
            : { top: dropdownPos.top + 4 }),
        };
        return createPortal(
          <div
            id="repair-concept-suggestions"
            style={style}
            className="bg-white border-2 border-blue-300 rounded-md shadow-lg overflow-auto"
            onMouseDown={(e) => e.preventDefault()}
          >
            {!catalogAvailable && (
              <div className="px-4 py-3 text-sm text-gray-500" role="status">
                {conceptsLoading
                  ? "Cargando conceptos..."
                  : "No se pudieron cargar los conceptos. Pulsa Reintentar en el aviso del catálogo."}
              </div>
            )}
            {catalogAvailable && !hasResults && (
              <div className="px-4 py-3 text-sm text-gray-500" role="status">
                {concepts.length === 0
                  ? "No hay conceptos disponibles en el catálogo."
                  : "No se encontraron conceptos. Prueba con otras palabras."}
              </div>
            )}
            {catalogAvailable && repair.length > 0 && (
              <>
                <div className="px-4 py-2 bg-blue-100 sticky top-0 font-semibold text-sm text-blue-900 border-b border-blue-300">
                  CONCEPTOS DE REPARACIÓN
                </div>
                {repair.map((concept) => (
                  <div
                    key={concept.id}
                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer border-b border-gray-100 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectConcept(idx, concept);
                    }}
                  >
                    <div className="font-medium text-gray-900 break-words">{concept.name}</div>
                    {repairConceptDescription(concept.description) && (
                      <div className="text-xs text-gray-500 mt-0.5 break-words">{repairConceptDescription(concept.description)}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-600">
                      <span>Unidad: {concept.defaultUnit || "Sin unidad"}</span>
                      <span>Precio: {concept.defaultPrice != null && concept.defaultPrice !== ""
                        ? formatCurrency(Number(concept.defaultPrice)) : "Sin precio"}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
            {catalogAvailable && general.length > 0 && (
              <>
                <div className="px-4 py-2 bg-gray-100 sticky top-0 font-semibold text-sm text-gray-900 border-b border-gray-300">
                  CONCEPTOS GENERALES
                </div>
                {general.map((concept) => (
                  <div
                    key={concept.id}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectConcept(idx, concept);
                    }}
                  >
                    <div className="font-medium text-gray-900 break-words">{concept.name}</div>
                    {repairConceptDescription(concept.description) && (
                      <div className="text-xs text-gray-500 mt-0.5 break-words">{repairConceptDescription(concept.description)}</div>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-600">
                      <span>Unidad: {concept.defaultUnit || "Sin unidad"}</span>
                      <span>Precio: {concept.defaultPrice != null && concept.defaultPrice !== ""
                        ? formatCurrency(Number(concept.defaultPrice)) : "Sin precio"}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}