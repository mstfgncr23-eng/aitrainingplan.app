import { z } from "zod";

export const UserProfileSchema = z.object({
  goal: z.string().min(2), level: z.enum(["Başlangıç", "Orta", "İleri"]),
  weeklyDays: z.number().int().min(1).max(7), duration: z.number().int().min(15).max(120),
  equipment: z.string().min(2), limitations: z.string()
});
export const ExerciseSchema = z.object({ name: z.string(), sets: z.number().int().positive(), reps: z.string(), restSeconds: z.number().int().nonnegative(), estimatedMinutes: z.number().positive() });
export const DaySchema = z.object({ day: z.string(), focus: z.string(), estimatedDuration: z.number().positive(), exercises: z.array(ExerciseSchema).min(1) });
export const PlanSchema = z.object({ title: z.string(), summary: z.string(), days: z.array(DaySchema).min(1) });
export const ValidationSchema = z.object({ approved: z.boolean(), feedback: z.array(z.string()), checks: z.object({ duration: z.boolean(), equipment: z.boolean(), limitations: z.boolean(), completeness: z.boolean(), weeklyDays: z.boolean() }) });
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Validation = z.infer<typeof ValidationSchema>;
