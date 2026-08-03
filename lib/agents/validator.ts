import { Plan, PlanSchema, UserProfile, Validation, ValidationSchema } from "@/lib/schemas";

const bodyweight = ["push-up", "plank", "bridge", "bird dog", "dead bug", "squat", "lunge", "hip thrust"];
export function validatePlan(rawPlan: unknown, profile: UserProfile): Validation {
  const parsed = PlanSchema.safeParse(rawPlan);
  if (!parsed.success) return ValidationSchema.parse({ approved: false, feedback: ["Plan JSON şeması eksik veya geçersiz."], checks: { duration: false, equipment: false, limitations: false, completeness: false, weeklyDays: false } });
  const plan: Plan = parsed.data; const feedback: string[] = [];
  const duration = plan.days.every(d => d.estimatedDuration <= profile.duration && d.exercises.reduce((sum, e) => sum + e.estimatedMinutes, 0) <= profile.duration);
  const equipmentWords = profile.equipment.toLowerCase();
  const equipment = plan.days.flatMap(d => d.exercises).every(e => e.name.toLowerCase().includes("dumbbell") ? equipmentWords.includes("dumbbell") : bodyweight.some(x => e.name.toLowerCase().includes(x)));
  const kneeSensitive = profile.limitations.toLocaleLowerCase("tr").includes("diz");
  const limitations = !kneeSensitive || plan.days.flatMap(d => d.exercises).every(e => !/jump|zıpla|deep squat|derin squat/i.test(e.name));
  const completeness = plan.days.every(d => d.exercises.every(e => e.sets > 0 && !!e.reps && e.restSeconds >= 0));
  const weeklyDays = plan.days.length === profile.weeklyDays;
  if (!duration) feedback.push(`Bir veya daha fazla seans ${profile.duration} dakika sınırını aşıyor; süreyi kısalt.`);
  if (!equipment) feedback.push("Bazı egzersizler mevcut ekipmanla yapılamıyor; yalnızca belirtilen ekipmanı kullan.");
  if (!limitations) feedback.push(`Bazı hareketler “${profile.limitations}” kısıtlamasıyla çelişiyor; düşük etkili alternatif seç.`);
  if (!completeness) feedback.push("Her egzersiz için set, tekrar ve dinlenme alanlarını tamamla.");
  if (!weeklyDays) feedback.push(`Plan tam olarak ${profile.weeklyDays} gün içermeli.`);
  return ValidationSchema.parse({ approved: duration && equipment && limitations && completeness && weeklyDays, feedback, checks: { duration, equipment, limitations, completeness, weeklyDays } });
}
