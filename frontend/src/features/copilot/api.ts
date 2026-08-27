import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient';
import type { AskCopilotResponse, UsageRow } from '../../lib/types';

export function useAskCopilot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => api.post<AskCopilotResponse>('/copilot/ask', { question }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['copilot-usage'] }),
  });
}

export function useCopilotUsage() {
  return useQuery({
    queryKey: ['copilot-usage'],
    queryFn: () => api.get<UsageRow[]>('/copilot/usage'),
  });
}
