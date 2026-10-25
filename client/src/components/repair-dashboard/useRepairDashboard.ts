import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { RepairDashboardResponse } from "@shared/repair-dashboard";

export const repairDashboardQueryKey = ["/api/repairs-dashboard"] as const;

export function useRepairDashboard() {
  return useQuery<RepairDashboardResponse>({
    queryKey: repairDashboardQueryKey,
    queryFn: () => apiRequest("/api/repairs-dashboard") as Promise<RepairDashboardResponse>,
    staleTime: 60_000,
    retry: 1,
  });
}
