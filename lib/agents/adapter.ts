import { Plan, PlanSchema } from "@/lib/schemas";

export function adaptPlan(plan: Plan, completion: number): Plan {
  const mode = completion >= 85 ? "progress" : completion >= 60 ? "maintain" : "reduce";
  return PlanSchema.parse({ ...plan, title: `Gelecek hafta · %${completion} tamamlanma`, summary: mode === "progress" ? "Başarı yüksek: ana hareketlere küçük bir set ilerlemesi eklendi." : mode === "maintain" ? "Dengeli devam: mevcut hacim korundu." : "Toparlanma öncelikli: hacim ve seans süresi azaltıldı.", days: plan.days.map(day => ({ ...day, estimatedDuration: mode === "reduce" ? Math.max(15, day.estimatedDuration - 8) : day.estimatedDuration, exercises: day.exercises.map((e, i) => ({ ...e, sets: mode === "progress" && i < 2 ? e.sets + 1 : mode === "reduce" ? Math.max(1, e.sets - 1) : e.sets, estimatedMinutes: mode === "reduce" ? Math.max(3, e.estimatedMinutes - 2) : e.estimatedMinutes })) })) });
}
