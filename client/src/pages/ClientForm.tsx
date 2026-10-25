import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { clientSchema } from "@shared/schema";
import { ArrowLeft, Loader2 } from "lucide-react";
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

export default function ClientForm() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof clientSchema>>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      email: "",
    },
  });

  // Mutación para crear cliente
  const createClientMutation = useMutation({
    mutationFn: async (data: z.infer<typeof clientSchema>) => {
      return apiRequest('/api/clients', {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Cliente creado",
        description: "El cliente ha sido creado con éxito.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      // Redirigir a la página de detalles del cliente
      if (data && typeof data === 'object' && 'id' in data) {
        setLocation(`/clients/${data.id}`);
      } else {
        setLocation('/clients');
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo crear el cliente: " + (error.message || "Error desconocido"),
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof clientSchema>) => {
    createClientMutation.mutate(data);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/clients">
            <ArrowLeft className="h-4 w-4 mr-1" /> Volver
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Nuevo Cliente</h1>
      </div>

      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Información del Cliente</CardTitle>
          <CardDescription>
            Ingresa los datos del nuevo cliente para registrarlo en el sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del cliente" {...field} />
                    </FormControl>
                    <FormDescription>
                      Nombre completo o razón social del cliente
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correo Electrónico <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <FormControl>
                      <Input 
                        type="email" 
                        placeholder="correo@ejemplo.com" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Correo de contacto principal del cliente
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setLocation("/clients")}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit"
                  disabled={createClientMutation.isPending}
                >
                  {createClientMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Guardar Cliente
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}