/**
 * Linear onboarding: prompt -> plan -> build -> preview -> publish.
 */

export type OnboardingStepId = "prompt" | "plan" | "build" | "preview" | "publish";

export interface OnboardingStep {
  id: OnboardingStepId;
  label: string;
  done: boolean;
  active: boolean;
}

export function computeOnboardingSteps(state: {
  hasGoal: boolean;
  planApproved: boolean;
  buildFinished: boolean;
  previewReady: boolean;
  published: boolean;
}): OnboardingStep[] {
  const order: OnboardingStepId[] = ["prompt", "plan", "build", "preview", "publish"];
  const doneMap: Record<OnboardingStepId, boolean> = {
    prompt: state.hasGoal,
    plan: state.planApproved,
    build: state.buildFinished,
    preview: state.previewReady,
    publish: state.published,
  };
  const labels: Record<OnboardingStepId, string> = {
    prompt: "Describe",
    plan: "Plan",
    build: "Build",
    preview: "Preview",
    publish: "Publish",
  };
  let activeSet = false;
  return order.map((id) => {
    const done = doneMap[id];
    let active = false;
    if (!done && !activeSet) {
      active = true;
      activeSet = true;
    }
    return { id, label: labels[id], done, active };
  });
}
