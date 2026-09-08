import { useState, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface AdaptiveDatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

export function AdaptiveDatePicker({
  value,
  onChange,
  placeholder = "Selecciona fecha",
  disabled = false,
  className,
  minDate,
  maxDate
}: AdaptiveDatePickerProps) {
  const [isMobile, setIsMobile] = useState(false);

  // Detectar si es mobile de forma segura
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Convertir Date a string para input nativo (YYYY-MM-DD)
  const dateToInputValue = (date: Date | undefined): string => {
    if (!date) return '';
    try {
      // Usar fecha local sin conversión de zona horaria
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  // Convertir string de input nativo a Date
  const inputValueToDate = (value: string): Date | undefined => {
    if (!value) return undefined;
    try {
      // Crear fecha en zona horaria local
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    } catch {
      return undefined;
    }
  };

  // Mobile: Input nativo
  if (isMobile) {
    return (
      <Input
        type="date"
        value={dateToInputValue(value)}
        onChange={(e) => onChange(inputValueToDate(e.target.value))}
        disabled={disabled}
        min={minDate ? dateToInputValue(minDate) : undefined}
        max={maxDate ? dateToInputValue(maxDate) : undefined}
        className={cn("h-10 text-base", className)}
      />
    );
  }

  // Desktop: Popover con Calendar
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full pl-3 text-left font-normal h-10",
            !value && "text-muted-foreground",
            className
          )}
        >
          {value ? (
            format(value, "dd/MM/yyyy", { locale: es })
          ) : (
            <span>{placeholder}</span>
          )}
          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          disabled={(date) => {
            if (minDate && date < minDate) return true;
            if (maxDate && date > maxDate) return true;
            return date < new Date("1900-01-01");
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
