import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient';
import type { Locale, Profile } from '../../lib/types';

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (input: { fullName?: string; jobTitle?: string; locale?: Locale }) => api.patch<Profile>('/me', input),
  });
}

export function useDeactivateAccount() {
  return useMutation({
    mutationFn: () => api.delete('/me'),
  });
}

/** Resuelve nombre y cargo de un lote de usuarios (para mostrar remitentes en la lista de mensajes). */
export function useProfiles(ids: string[]) {
  const uniqueSortedIds = Array.from(new Set(ids)).sort();

  return useQuery({
    queryKey: ['profiles', uniqueSortedIds],
    queryFn: () => api.get<Profile[]>('/users', { ids: uniqueSortedIds.join(',') }),
    enabled: uniqueSortedIds.length > 0,
    staleTime: 5 * 60_000,
  });
}
