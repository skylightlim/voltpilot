export const runtime = "edge";

import IntakeStepPage from "@/components/intake/IntakeStep";

export default async function StepRoute({
  params,
}: {
  params: Promise<{ step: string }>;
}) {
  const { step } = await params;
  const n = parseInt(step, 10);
  return <IntakeStepPage step={Number.isFinite(n) ? n : 1} />;
}