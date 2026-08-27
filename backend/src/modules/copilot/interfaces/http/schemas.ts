import { z } from 'zod';

export const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
});

export const usageQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
