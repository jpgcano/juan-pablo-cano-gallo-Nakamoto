import { z } from 'zod';

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  clientMsgId: z.string().uuid().optional(),
  replyToId: z.string().uuid().optional(),
});

export const editMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const historyQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const channelParamsSchema = z.object({
  channelId: z.string().uuid(),
});

export const messageParamsSchema = z.object({
  messageId: z.string().uuid(),
});
