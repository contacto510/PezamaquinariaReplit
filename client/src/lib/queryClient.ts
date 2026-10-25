import { QueryClient, QueryFunction } from "@tanstack/react-query";

function notifyUnauthorized() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("isAuthenticated");
  localStorage.removeItem("userEmail");
  window.dispatchEvent(new Event("peza:unauthorized"));
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    credentials: "include",
  });
  if (res.status === 401) notifyUnauthorized();
  return res;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (res.status === 401) notifyUnauthorized();
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  endpoint: string,
  options?: {
    method?: string;
    body?: string | FormData;
    headers?: Record<string, string>;
  }
): Promise<any> {
  const res = await authenticatedFetch(endpoint, {
    method: options?.method || "GET",
    headers: options?.body && !(options.body instanceof FormData) 
      ? { "Content-Type": "application/json", ...options?.headers } 
      : options?.headers || {},
    body: options?.body,
  });

  await throwIfResNotOk(res);
  
  // Si la respuesta está vacía, devolver un objeto vacío
  if (res.status === 204) {
    return {};
  }
  
  // Intentar parsear como JSON, si falla devolver el texto
  try {
    return await res.json();
  } catch (e) {
    return await res.text();
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
  endpoint?: string;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior, endpoint }) =>
  async ({ queryKey }) => {
    // Si se proporciona un endpoint específico, usamos ese en lugar de construirlo desde queryKey
    let url = endpoint || (queryKey[0] as string);
    
    // Si no hay endpoint y hay más elementos en queryKey, asumimos que son parámetros
    if (!endpoint && queryKey.length > 1 && queryKey[1] !== undefined) {
      const params = queryKey.slice(1);
      // Agregamos los parámetros a la URL
      url = `${url}/${params.join('/')}`;
    }
    
    // Removido console.log para prevenir memory leaks en dispositivos móviles
    const res = await authenticatedFetch(url);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    
    // Si la respuesta está vacía, devolver un objeto vacío
    if (res.status === 204) {
      return {};
    }
    
    // Intentar parsear como JSON, si falla devolver el texto
    try {
      return await res.json();
    } catch (e) {
      return await res.text();
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 120000, // 2 minutos para mantener datos frescos
      gcTime: 600000, // 10 minutos para mejor caching
      retry: 1, // Reintentar una vez en caso de error
    },
    mutations: {
      retry: false,
    },
  },
});

// Extender el objeto Window para el timeout de búsqueda
declare global {
  interface Window {
    searchTimeout: any;
  }
}
