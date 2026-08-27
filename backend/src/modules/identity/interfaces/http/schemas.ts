import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const listProfilesQuerySchema = z.object({
  ids: z
    .string()
    .transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(100)),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1).max(160).optional(),
  jobTitle: z.string().trim().min(1).max(160).optional(),
  locale: z.enum(['es', 'en']).optional(),
});
