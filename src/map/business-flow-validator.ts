import type {
  BusinessFlow,
  BusinessFlowTransitionDefinition,
  BusinessNode,
  MapIssue,
} from "../contracts/map.js";

export function validateBusinessFlows(
  flows: readonly BusinessFlow[],
  nodeById: ReadonlyMap<string, BusinessNode>,
): readonly MapIssue[] {
  const issues: MapIssue[] = [];
  validateFlowIdentities(flows, issues);

  for (const flow of flows) {
    validateFlow(flow, nodeById, issues);
  }

  return issues;
}

function validateFlowIdentities(flows: readonly BusinessFlow[], issues: MapIssue[]): void {
  const ownerById = new Map<string, BusinessFlow>();
  for (const flow of flows) {
    const existing = ownerById.get(flow.id);
    if (existing) {
      issues.push(flowIssue(
        flow,
        "DUPLICATE_FLOW_ID",
        flow.id,
        `Flow '${flow.id}' is also declared by ${existing.documentPath}`,
      ));
      continue;
    }
    ownerById.set(flow.id, flow);
  }
}

function validateFlow(
  flow: BusinessFlow,
  nodeById: ReadonlyMap<string, BusinessNode>,
  issues: MapIssue[],
): void {
  const scenario = nodeById.get(flow.scenario);
  if (!scenario) {
    issues.push(flowIssue(
      flow,
      "FLOW_SCENARIO_MISSING",
      flow.scenario,
      `Flow '${flow.id}' references missing scenario '${flow.scenario}'`,
    ));
  } else if (scenario.kind !== "scenario") {
    issues.push(flowIssue(
      flow,
      "FLOW_SCENARIO_KIND_MISMATCH",
      flow.scenario,
      `Flow '${flow.id}' must belong to a scenario, not ${scenario.kind} '${flow.scenario}'`,
    ));
  }

  const stepById = indexSteps(flow, issues);
  validateStepConcepts(flow, nodeById, issues);
  if (!stepById.has(flow.startsAt)) {
    issues.push(flowIssue(
      flow,
      "FLOW_START_STEP_MISSING",
      flow.startsAt,
      `Flow '${flow.id}' starts at missing step '${flow.startsAt}'`,
    ));
  }

  const validTransitions = validateTransitionEndpoints(flow, stepById, issues);
  validateTransitionIdentities(flow, validTransitions, issues);
  validateStepBranches(flow, validTransitions, issues);
  validateReachability(flow, validTransitions, stepById, issues);
}

function indexSteps(flow: BusinessFlow, issues: MapIssue[]): ReadonlyMap<string, BusinessFlow["steps"][number]> {
  const stepById = new Map<string, BusinessFlow["steps"][number]>();
  for (const step of flow.steps) {
    if (stepById.has(step.id)) {
      issues.push(flowIssue(
        flow,
        "DUPLICATE_FLOW_STEP_ID",
        step.id,
        `Flow '${flow.id}' declares step '${step.id}' more than once`,
      ));
      continue;
    }
    stepById.set(step.id, step);
  }
  return stepById;
}

function validateStepConcepts(
  flow: BusinessFlow,
  nodeById: ReadonlyMap<string, BusinessNode>,
  issues: MapIssue[],
): void {
  for (const step of flow.steps) {
    if (!step.concept || nodeById.has(step.concept)) continue;
    issues.push(flowIssue(
      flow,
      "FLOW_CONCEPT_MISSING",
      step.concept,
      `Flow '${flow.id}' step '${step.id}' references missing concept '${step.concept}'`,
    ));
  }
}

function validateTransitionEndpoints(
  flow: BusinessFlow,
  stepById: ReadonlyMap<string, BusinessFlow["steps"][number]>,
  issues: MapIssue[],
): readonly BusinessFlowTransitionDefinition[] {
  const valid: BusinessFlowTransitionDefinition[] = [];
  for (const transition of flow.transitions) {
    const missingEndpoints = [transition.from, transition.to]
      .filter((stepId) => !stepById.has(stepId));
    if (missingEndpoints.length > 0) {
      issues.push(flowIssue(
        flow,
        "FLOW_TRANSITION_ENDPOINT_MISSING",
        transitionIdentity(transition),
        `Flow '${flow.id}' transition '${transitionIdentity(transition)}' references missing step '${missingEndpoints.join("', '")}'`,
      ));
      continue;
    }
    valid.push(transition);
  }
  return valid;
}

function validateTransitionIdentities(
  flow: BusinessFlow,
  transitions: readonly BusinessFlowTransitionDefinition[],
  issues: MapIssue[],
): void {
  const known = new Set<string>();
  for (const transition of transitions) {
    const identity = transitionIdentity(transition);
    if (known.has(identity)) {
      issues.push(flowIssue(
        flow,
        "DUPLICATE_FLOW_TRANSITION",
        identity,
        `Flow '${flow.id}' declares transition '${identity}' more than once`,
      ));
    }
    known.add(identity);
  }
}

function validateStepBranches(
  flow: BusinessFlow,
  transitions: readonly BusinessFlowTransitionDefinition[],
  issues: MapIssue[],
): void {
  const outgoingByStep = groupTransitionsBySource(transitions);
  for (const step of flow.steps) {
    const outgoing = outgoingByStep.get(step.id) ?? [];
    switch (step.kind) {
      case "action":
        if (outgoing.length > 1 || outgoing.some((transition) => transition.when)) {
          issues.push(flowIssue(
            flow,
            "FLOW_ACTION_BRANCH_INVALID",
            step.id,
            `Flow '${flow.id}' action '${step.id}' must have at most one unlabeled transition`,
          ));
        }
        break;
      case "decision": {
        const labels = outgoing.flatMap((transition) => transition.when ? [normalizeLabel(transition.when)] : []);
        const validLabels = labels.length === outgoing.length && new Set(labels).size === labels.length;
        if (outgoing.length < 2 || !validLabels) {
          issues.push(flowIssue(
            flow,
            "FLOW_DECISION_BRANCH_INVALID",
            step.id,
            `Flow '${flow.id}' decision '${step.id}' requires at least two transitions with unique branch labels`,
          ));
        }
        break;
      }
      case "outcome":
        if (outgoing.length > 0) {
          issues.push(flowIssue(
            flow,
            "FLOW_OUTCOME_HAS_TRANSITION",
            step.id,
            `Flow '${flow.id}' outcome '${step.id}' cannot continue to another step`,
          ));
        }
        break;
    }
  }
}

function validateReachability(
  flow: BusinessFlow,
  transitions: readonly BusinessFlowTransitionDefinition[],
  stepById: ReadonlyMap<string, BusinessFlow["steps"][number]>,
  issues: MapIssue[],
): void {
  if (!stepById.has(flow.startsAt)) return;
  const targetsBySource = new Map<string, string[]>();
  for (const transition of transitions) {
    const targets = targetsBySource.get(transition.from) ?? [];
    targets.push(transition.to);
    targetsBySource.set(transition.from, targets);
  }

  const reachable = new Set<string>();
  const pending = [flow.startsAt];
  while (pending.length > 0) {
    const stepId = pending.shift()!;
    if (reachable.has(stepId)) continue;
    reachable.add(stepId);
    pending.push(...(targetsBySource.get(stepId) ?? []));
  }

  for (const step of flow.steps) {
    if (reachable.has(step.id)) continue;
    issues.push(flowIssue(
      flow,
      "FLOW_STEP_UNREACHABLE",
      step.id,
      `Flow '${flow.id}' step '${step.id}' is not reachable from '${flow.startsAt}'`,
    ));
  }
}

function groupTransitionsBySource(
  transitions: readonly BusinessFlowTransitionDefinition[],
): ReadonlyMap<string, readonly BusinessFlowTransitionDefinition[]> {
  const grouped = new Map<string, BusinessFlowTransitionDefinition[]>();
  for (const transition of transitions) {
    const outgoing = grouped.get(transition.from) ?? [];
    outgoing.push(transition);
    grouped.set(transition.from, outgoing);
  }
  return grouped;
}

function flowIssue(
  flow: BusinessFlow,
  code: MapIssue["code"],
  subject: string,
  message: string,
): MapIssue {
  return {
    code,
    document: flow.documentPath,
    subject,
    message,
  };
}

function transitionIdentity(transition: BusinessFlowTransitionDefinition): string {
  return `${transition.from} --${transition.when ?? "next"}--> ${transition.to}`;
}

function normalizeLabel(label: string): string {
  return label.trim().toLocaleLowerCase("en-US");
}
