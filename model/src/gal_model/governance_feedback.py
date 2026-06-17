"""Recursive governance feedback loop: auto-prompts agents for deeper verification.

When GAL scores an action below the confidence threshold, this module generates
a structured governance prompt that asks the agent to verify specific concerns.
The agent's revised response is re-scored, looping until confidence reaches the
threshold or max rounds are exhausted.

Pattern: "Are you sure?" → Agent re-checks → GAL re-scores → repeat until satisfied.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

PROMPT_TEMPLATES = {
    "incomplete_evidence": (
        "The change '{title}' has incomplete evidence ({missing}). "
        "Please verify: (1) Are all required CI checks passing? "
        "(2) Have all required reviewers approved? "
        "(3) Is there any missing documentation or test coverage? "
        "Re-evaluate and confirm the change is safe to proceed."
    ),
    "security_concern": (
        "The change '{title}' touches potentially sensitive areas. "
        "Please verify: (1) Does this change introduce any new data collection or external communication? "
        "(2) Are there any dependency updates that could introduce vulnerabilities? "
        "(3) Has a security review been performed? "
        "Re-evaluate and confirm the change is safe to proceed."
    ),
    "large_change": (
        "The change '{title}' modifies {count} files across multiple subsystems. "
        "Please verify: (1) Is every modified file necessary for the stated purpose? "
        "(2) Could this be split into smaller, reviewable changes? "
        "(3) Are there any unintended side effects from cross-subsystem changes? "
        "Re-evaluate and confirm the change is safe to proceed."
    ),
    "no_human_review": (
        "The change '{title}' has no human reviewer participation. "
        "Please verify: (1) Is this change safe to automate without human oversight? "
        "(2) Does the change modify production-critical paths? "
        "(3) Would a human reviewer likely raise concerns about this change? "
        "Re-evaluate and confirm the change is safe to proceed."
    ),
    "generic_hold": (
        "The governance model flagged the change '{title}' for review. "
        "Please re-examine: (1) What are the concrete risks of this change? "
        "(2) What mitigations are in place? "
        "(3) Is there any additional context that would change the risk assessment? "
        "Re-evaluate and confirm the change is safe to proceed."
    ),
}

SATISFACTION_THRESHOLD = 0.85
MAX_FEEDBACK_ROUNDS = 3


@dataclass
class GovernanceFeedbackResult:
    """Result of one feedback loop cycle."""

    original_decision: str
    original_confidence: float
    final_decision: str
    final_confidence: float
    rounds: int
    feedback_prompts: list[str] = field(default_factory=list)
    agent_responses: list[str] = field(default_factory=list)
    satisfied: bool = False
    escalated: bool = False


def select_prompt_template(features: dict[str, Any], title: str = "") -> str:
    """Select the most appropriate governance prompt based on feature analysis."""
    reasons: list[str] = []

    if not features.get("evidence_complete", True):
        missing = []
        if not features.get("approval_refs_complete"):
            missing.append("approvals not complete")
        if features.get("obstacles_present"):
            missing.append("obstacles detected")
        reasons.append(f"incomplete_evidence|{','.join(missing) if missing else 'evidence incomplete'}")

    if features.get("detection_count", 0) >= 10:
        reasons.append(f"large_change|{features['detection_count']}")

    if not features.get("people_present") and features.get("vehicles_present"):
        reasons.append("no_human_review|bot-only change")

    # Default: use the first relevant template, or generic
    if not reasons:
        template_key = "generic_hold"
        extra = ""
    else:
        key, extra = reasons[0].split("|", 1)
        template_key = key

    template = PROMPT_TEMPLATES.get(template_key, PROMPT_TEMPLATES["generic_hold"])
    return template.format(title=title or "untitled change", count=extra if template_key == "large_change" else "", missing=extra)


def run_feedback_loop(
    features: dict[str, Any],
    title: str,
    *,
    model,
    embedder=None,
    satisfaction_threshold: float = SATISFACTION_THRESHOLD,
    max_rounds: int = MAX_FEEDBACK_ROUNDS,
    agent_callback=None,
) -> GovernanceFeedbackResult:
    """Run the recursive governance feedback loop.

    Args:
        features: The 8 structured governance features
        title: PR/change title
        model: GAL model instance
        embedder: Optional text embedding model for augmented scoring
        satisfaction_threshold: Confidence threshold for satisfaction (default 0.85)
        max_rounds: Maximum feedback rounds before escalating (default 3)
        agent_callback: Optional callback(governance_prompt) -> agent_response.
                       If not provided, the prompt is returned for external handling.

    Returns:
        GovernanceFeedbackResult with the complete feedback loop trace.
    """
    import torch
    from .features import encode_features
    from .constants import INDEX_TO_LABEL

    result = GovernanceFeedbackResult(
        original_decision="",
        original_confidence=0.0,
        final_decision="",
        final_confidence=0.0,
        rounds=0,
    )

    # Initial scoring
    struct_vec = encode_features(features)
    tensor = None

    if embedder is not None:
        title_emb = embedder.encode([title], show_progress_bar=False)[0].tolist()
        tensor = torch.tensor([struct_vec + title_emb], dtype=torch.float32)
    else:
        tensor = torch.tensor([struct_vec], dtype=torch.float32)

    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1)[0]
        conf = float(probs.max().item())
        decision = INDEX_TO_LABEL[int(torch.argmax(probs).item())]

    result.original_decision = decision
    result.original_confidence = conf
    result.final_decision = decision
    result.final_confidence = conf

    # If already satisfied, no feedback needed
    if decision == "clear_for_operator_review" and conf >= satisfaction_threshold:
        result.satisfied = True
        return result

    if decision == "hold_for_operator_review" and conf >= satisfaction_threshold:
        result.satisfied = True
        return result

    # Feedback loop
    current_title = title
    for round_num in range(max_rounds):
        # Generate governance prompt
        prompt = select_prompt_template(features, current_title)
        result.feedback_prompts.append(prompt)

        # Get agent response
        if agent_callback:
            agent_response = agent_callback(prompt)
            result.agent_responses.append(agent_response)
            # Update title with agent's response context
            current_title = f"{title} [agent verified: {agent_response[:100]}]"
        else:
            # No agent callback — return the prompt for external handling
            result.escalated = True
            break

        # Re-score with updated context
        if embedder is not None:
            title_emb = embedder.encode([current_title], show_progress_bar=False)[0].tolist()
            tensor = torch.tensor([struct_vec + title_emb], dtype=torch.float32)
        else:
            tensor = torch.tensor([struct_vec], dtype=torch.float32)

        with torch.no_grad():
            logits = model(tensor)
            probs = torch.softmax(logits, dim=1)[0]
            conf = float(probs.max().item())
            decision = INDEX_TO_LABEL[int(torch.argmax(probs).item())]

        result.rounds = round_num + 1
        result.final_decision = decision
        result.final_confidence = conf

        if decision == "clear_for_operator_review" and conf >= satisfaction_threshold:
            result.satisfied = True
            break

    if not result.satisfied and result.rounds >= max_rounds:
        result.escalated = True

    return result


def governance_gate(
    features: dict[str, Any],
    title: str,
    *,
    model,
    embedder=None,
    satisfaction_threshold: float = SATISFACTION_THRESHOLD,
) -> dict[str, Any]:
    """Single-pass governance gate — score and either pass or initiate feedback.

    Returns a dict suitable for integration into agent runtimes:
    {
        "decision": "clear" | "hold" | "feedback",
        "confidence": 0.0-1.0,
        "governance_prompt": null | str,
        "satisfied": bool,
    }
    """
    import torch
    from .features import encode_features
    from .constants import INDEX_TO_LABEL

    struct_vec = encode_features(features)
    if embedder is not None:
        title_emb = embedder.encode([title], show_progress_bar=False)[0].tolist()
        tensor = torch.tensor([struct_vec + title_emb], dtype=torch.float32)
    else:
        tensor = torch.tensor([struct_vec], dtype=torch.float32)

    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1)[0]
        conf = float(probs.max().item())
        decision = INDEX_TO_LABEL[int(torch.argmax(probs).item())]

    if decision == "clear_for_operator_review" and conf >= satisfaction_threshold:
        return {"decision": "clear", "confidence": conf, "governance_prompt": None, "satisfied": True}

    if conf >= satisfaction_threshold:
        return {"decision": "hold", "confidence": conf, "governance_prompt": None, "satisfied": True}

    # Below threshold — initiate feedback
    prompt = select_prompt_template(features, title)
    return {"decision": "feedback", "confidence": conf, "governance_prompt": prompt, "satisfied": False}
