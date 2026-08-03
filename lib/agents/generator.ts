import OpenAI from "openai";
import { z } from "zod";
import { Plan, PlanSchema, UserProfile } from "@/lib/schemas";

function demoPlan(profile: UserProfile, feedback: string[] = []): Plan {
  const names = profile.limitations.toLocaleLowerCase("tr").includes("diz")
    ? [["Dumbbell Floor Press", "Tek Kol Dumbbell Row", "Glute Bridge", "Dead Bug"], ["Dumbbell Romanian Deadlift", "Oturarak Dumbbell Press", "Hip Thrust", "Bird Dog"], ["Incline Push-up", "Dumbbell Row", "Box Squat (ağrısız aralık)", "Side Plank"]]
    : [["Goblet Squat", "Dumbbell Floor Press", "Tek Kol Row", "Dead Bug"], ["Romanian Deadlift", "Dumbbell Press", "Glute Bridge", "Plank"], ["Reverse Lunge", "Push-up", "Dumbbell Row", "Side Plank"]];
  const weekdays = ["Pazartesi", "Çarşamba", "Cuma", "Cumartesi", "Pazar", "Salı", "Perşembe"];
  const perExercise = Math.max(4, Math.floor((profile.duration - 8) / 4));
  return PlanSchema.parse({
    title: `${profile.goal} · ${profile.weeklyDays} günlük program`,
    summary: `${profile.level} seviyesi için sürdürülebilir tam vücut planı.${feedback.length ? " Validator geri bildirimiyle revize edildi." : ""}`,
    days: Array.from({ length: profile.weeklyDays }, (_, i) => ({
      day: weekdays[i], focus: i % 2 ? "Güç & posterior zincir" : "Tam vücut temel güç", estimatedDuration: Math.min(profile.duration, perExercise * 4 + 8),
      exercises: names[i % names.length].map((name, j) => ({ name, sets: j === 3 ? 2 : 3, reps: j === 3 ? "8–10 / taraf" : "8–12", restSeconds: j === 3 ? 45 : 75, estimatedMinutes: perExercise }))
    }))
  });
}

export async function generatePlan(profile: UserProfile, feedback: string[] = []): Promise<{ plan: Plan; source: "openai" | "demo" }> {
  if (!process.env.OPENAI_API_KEY) return { plan: demoPlan(profile, feedback), source: "demo" };
  const openai = new OpenAI();
  const response = await openai.responses.create({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", input: `Sen Plan Generator Agent'sın. Profil: ${JSON.stringify(profile)}. Önceki validator geri bildirimi: ${JSON.stringify(feedback)}. Süre ve ekipman sınırına kesin uy. Yalnızca JSON üret.`, text: { format: { type: "json_schema", name: "training_plan", strict: true, schema: z.toJSONSchema(PlanSchema) } } });
  return { plan: PlanSchema.parse(JSON.parse(response.output_text)), source: "openai" };
}
