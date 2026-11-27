import { z } from 'zod';

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1));
  return date.toISOString().slice(0, 10) === value;
}

const text = z.string().max(2000);

export const saveLogSchema = z.object({
  period: z.enum(['daily', 'weekly']),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealDate, { message: 'not a real calendar date' }),
  entries: z
    .array(
      z.object({
        habitId: z.string().uuid(),
        status: z.enum(['done', 'not_done', 'not_required']),
        checkedItemIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .min(1),
  note: text.optional(),
  reviewText: text.optional(),
  supportRequestText: text.optional(),
});

export type SaveLogInput = z.infer<typeof saveLogSchema>;
