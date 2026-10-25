import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { useLocation } from "wouter";

export default function Home() {
  const [_, setLocation] = useLocation();

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl md:text-2xl font-bold leading-7 text-neutral-800 sm:text-3xl">
            Inicio
          </h2>
        </div>
      </div>

      {/* Cards in responsive grid */}
      <div className="responsive-grid">
        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader>
            <CardTitle>Sistema de Cotizaciones</CardTitle>
            <CardDescription>Gestión de cotizaciones para máquinas y equipos</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4">
              Bienvenido al sistema de cotizaciones. Desde aquí podrás crear nuevas cotizaciones, 
              gestionar los conceptos y calcular automáticamente los totales con IVA.
            </p>
            <Button 
              onClick={() => setLocation("/quotation")}
              className="w-full"
            >
              <i className="ri-file-list-3-line mr-2"></i>
              Crear nueva cotización
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader>
            <CardTitle>Funcionalidades</CardTitle>
            <CardDescription>Características principales</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 list-disc list-inside">
              <li>Numeración automática de cotizaciones</li>
              <li>Cálculo automático de subtotales e IVA</li>
              <li>Gestión de datos del cliente</li>
              <li>Múltiples conceptos por cotización</li>
              <li>Formato en Pesos Mexicanos (MXN)</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-md hover:shadow-lg transition-shadow duration-300">
          <CardHeader>
            <CardTitle>Instrucciones</CardTitle>
            <CardDescription>Cómo usar el sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Haz clic en "Cotizador" en el menú lateral</li>
              <li>Completa los datos del cliente y proyecto</li>
              <li>Agrega los conceptos (máquinas) a cotizar</li>
              <li>Establece cantidades y precios unitarios</li>
              <li>Guarda la cotización cuando esté completa</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Mobile quick action */}
      <div className="mt-6 sm:hidden">
        <Button 
          onClick={() => setLocation("/quotation")}
          className="w-full"
          size="lg"
        >
          <i className="ri-file-list-3-line mr-2"></i>
          Crear nueva cotización
        </Button>
      </div>
    </div>
  );
}
