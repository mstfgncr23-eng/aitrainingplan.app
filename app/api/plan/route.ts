import { NextResponse } from "next/server";
import { adaptPlan } from "@/lib/agents/adapter";
import { generatePlan } from "@/lib/agents/generator";
import { validatePlan } from "@/lib/agents/validator";
import { UserProfileSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profile = UserProfileSchema.parse(body.profile);
    const completion = [40, 70, 100].includes(body.completion) ? body.completion : 100;
    const attempts = [];
    let feedback: string[] = []; let approvedPlan = null; let source: "openai" | "demo" = "demo";
    for (let revision = 0; revision <= 2; revision++) {
      const generated = await generatePlan(profile, feedback); source = generated.source;
      const validation = validatePlan(generated.plan, profile);
      attempts.push({ revision, plan: generated.plan, validation });
      if (validation.approved) { approvedPlan = generated.plan; break; }
      feedback = validation.feedback;
    }
    if (!approvedPlan) return NextResponse.json({ status: "rejected", source, attempts }, { status: 422 });
    return NextResponse.json({ status: "published", source, attempts, publishedPlan: approvedPlan, adaptedPlan: adaptPlan(approvedPlan, completion) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Beklenmeyen hata" }, { status: 400 });
  }
}
