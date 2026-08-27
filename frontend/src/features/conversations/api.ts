import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient';
import type { ConversationSummary, HistoryPage, Message, SearchHit } from '../../lib/types';

const HISTORY_PAGE_SIZE = 30;

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.get<ConversationSummary[]>('/channels'),
  });
}

export function useChannelHistory(channelId: string | null) {
  return useInfiniteQuery({
    queryKey: ['messages', channelId],
    queryFn: ({ pageParam }) =>
      api.get<HistoryPage>(`/channels/${channelId}/messages`, {
        cursor: pageParam ?? undefined,
        limit: HISTORY_PAGE_SIZE,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: channelId !== null,
  });
}

/** Aplana las paginas (mas nueva primero) a orden cronologico ascendente para renderizar el chat. */
export function flattenHistory(pages: HistoryPage[] | undefined): Message[] {
  if (!pages) return [];
  return pages
    .slice()
    .reverse()
    .flatMap((page) => [...page.items].reverse());
}

export function useSendMessage(channelId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; clientMsgId: string; replyToId?: string }) =>
      api.post<Message>(`/channels/${channelId}/messages`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useEditMessage(channelId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { messageId: string; body: string }) =>
      api.patch<Message>(`/messages/${input.messageId}`, { body: input.body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['messages', channelId] }),
  });
}

export function useDeleteMessage(channelId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => api.delete<Message>(`/messages/${messageId}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['messages', channelId] }),
  });
}

export function useMarkChannelRead(channelId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ marked: number }>(`/channels/${channelId}/read`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useSearchMessages(term: string) {
  return useQuery({
    queryKey: ['search', term],
    queryFn: () => api.get<SearchHit[]>('/search', { q: term, limit: 20 }),
    enabled: term.trim().length > 0,
  });
}
