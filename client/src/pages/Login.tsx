import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Mail, Lock, LogIn } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const response = await apiRequest('/api/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      return response;
    },
    onSuccess: (data: any) => {
      console.log('Login successful:', data);
      
      // Guardar token/sesión en localStorage INMEDIATAMENTE
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('userEmail', email);
      
      // Pre-cargar datos del Dashboard en paralelo
      queryClient.prefetchQuery({
        queryKey: ['/api/quotations'],
      }).catch(() => {});
      
      queryClient.prefetchQuery({
        queryKey: ['/api/clients'],
      }).catch(() => {});

      queryClient.prefetchQuery({
        queryKey: ['/api/repair-concepts'],
      }).catch(() => {});
      
      // Toast y redirección ultrarrápida
      toast({
        title: "Bienvenido",
        description: "Iniciaste sesión correctamente.",
      });
      
      // Redirección INMEDIATA (sin delay)
      window.location.href = "/dashboard";
    },
    onError: (error: any) => {
      console.error('Login failed:', error);
      toast({
        title: "Error de autenticación",
        description: error.message || "Correo o contraseña incorrectos.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast({
        title: "Campos requeridos",
        description: "Por favor completa todos los campos.",
        variant: "destructive",
      });
      return;
    }

    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      {/* Fondo decorativo oscuro */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-yellow-600 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-600 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
      </div>

      {/* Card de Login */}
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-0 bg-gray-900">
        <CardContent className="pt-8 pb-8">
          {/* Logo y Título */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full shadow-lg mb-6">
              <span className="text-4xl font-bold text-white">P</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Peza Maquinaria
            </h1>
            <p className="text-gray-400 text-sm">
              Sistema de Gestión de Reparaciones y Cotizaciones
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Input */}
            <div className="relative">
              <label htmlFor="email" className="block text-sm font-medium text-white mb-2">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@correo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-11 bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-yellow-500 focus:ring-yellow-500"
                  disabled={loginMutation.isPending}
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="relative">
              <label htmlFor="password" className="block text-sm font-medium text-white mb-2">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-11 bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:border-yellow-500 focus:ring-yellow-500"
                  disabled={loginMutation.isPending}
                />
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full h-11 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white font-semibold rounded-lg transition-all shadow-md hover:shadow-lg"
            >
              {loginMutation.isPending ? (
                <>
                  <span className="animate-spin mr-2">⟳</span>
                  Iniciando sesión...
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5 mr-2 inline" />
                  Iniciar Sesión
                </>
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-700 text-center">
            <p className="text-xs text-gray-500">
              © 2025 Peza Maquinaria. Todos los derechos reservados.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
