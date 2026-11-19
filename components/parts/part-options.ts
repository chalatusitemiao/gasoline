"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { FuelOptions } from "@/lib/fuel";

type ProjectOption = { id: string; name: string; isActive: boolean };

export function usePartOptions() {
  const vehicles = useQuery({
    queryKey: ["fuel", "options"],
    queryFn: ({ signal }) => apiFetch<FuelOptions>("/api/fuel/options", { signal }),
  });
  const projects = useQuery({
    queryKey: ["fuel", "projects", "options"],
    queryFn: ({ signal }) => apiFetch<ProjectOption[]>("/api/fuel/projects/options", { signal }),
  });

  return {
    vehicles,
    projects,
    vehicleOptions: vehicles.data?.vehicles.map(({ id, plate }) => ({ label: plate, value: id })),
    projectOptions: projects.data?.map(({ id, name, isActive }) => ({
      label: isActive ? name : `${name}（已停用）`,
      value: id,
    })),
  };
}
