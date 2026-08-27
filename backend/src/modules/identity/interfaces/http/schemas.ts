import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(160).optional(),
  jobTitle: z.string().trim().min(1).max(160).optional(),
  locale: z.enum(['es', 'en']).optional(),
});
