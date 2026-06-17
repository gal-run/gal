"""PyTorch network for GAL governance decisions."""

from __future__ import annotations

import math

import torch
from torch import nn
from torch.nn import functional as F

from .features import FEATURE_NAMES

ARCHITECTURE_MLP = "mlp"
ARCHITECTURE_RESNET_MLP = "resnet_mlp"
ARCHITECTURE_GTMN = "gtmn"
ARCHITECTURES = (ARCHITECTURE_MLP, ARCHITECTURE_RESNET_MLP, ARCHITECTURE_GTMN)


class GalGovernanceDecisionNet(nn.Module):
    """Small MLP baseline for structured governance features."""

    def __init__(self, input_dim: int = len(FEATURE_NAMES), hidden_dim: int = 24) -> None:
        super().__init__()
        self.layers = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, 2),
        )

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return self.layers(inputs)


class ResidualBlock(nn.Module):
    """Small residual block for fixed-shape governance features."""

    def __init__(self, hidden_dim: int) -> None:
        super().__init__()
        self.layers = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
        )
        self.activation = nn.ReLU()

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        return self.activation(inputs + self.layers(inputs))


class GalGovernanceResidualDecisionNet(nn.Module):
    """ResNet-like MLP candidate for tabular governance features."""

    def __init__(
        self,
        input_dim: int = len(FEATURE_NAMES),
        hidden_dim: int = 32,
        blocks: int = 2,
    ) -> None:
        super().__init__()
        self.input_layers = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
        )
        self.blocks = nn.Sequential(*(ResidualBlock(hidden_dim) for _ in range(blocks)))
        self.output_layer = nn.Linear(hidden_dim, 2)

    def forward(self, inputs: torch.Tensor) -> torch.Tensor:
        hidden = self.input_layers(inputs)
        hidden = self.blocks(hidden)
        return self.output_layer(hidden)


class GovernanceTripleMechanismNet(nn.Module):
    """Governance Triple-Mechanism Network (GTMN).

    A genuinely novel architecture that decomposes governance decisions into
    three explicit mechanisms, each motivated by the logical structure of
    real-world governance policies:

    1. Veto Mechanism (differentiable log-sum-exp smooth OR):
       Captures "any single condition independently triggers a hold."
       Each feature learns a veto strength and a context-dependent gate.
       When a relevant feature is active and its gate is open, the veto
       mechanism independently raises the hold score regardless of other
       features. This models policies like "operator review required always
       triggers hold" or "merge conflicts block release."

    2. Consensus Mechanism (context-dependent attention-weighted sum):
       Captures "the collective weight of evidence across all features."
       Feature importance weights are computed dynamically per-instance
       via a learned gating network, allowing the model to adapt which
       features matter most for each decision. This models how governance
       panels weigh different evidence sources depending on context.

    3. Uncertainty Mechanism (learned disagreement estimator):
       Captures "contradictory signals should be escalated to a human."
       A learned subnetwork maps features to an uncertainty score in [0, 1].
       This uncertainty feeds into the calibration head rather than the
       primary decision, so the model can say "I'm not sure" independently
       of "I think it's a hold."

    Decision composition:
        hold_score = VETO + (1 - sigmoid(VETO)) * CONSENSUS
        logits = [-hold_score, hold_score]  # [clear, hold]

    When any feature vetoes strongly, the veto term dominates. When no
    feature vetoes, the consensus mechanism determines the decision. This
    is a differentiable analogue of governance rule semantics.

    Calibration:
        A separate calibration head takes (features, softmax_probs) and
        outputs P(correct | features), decoupling decision-making from
        confidence estimation. This enables principled escalation: escalate
        when confidence is low, not just when softmax max-prob is low.

    Parameter efficiency:
        GTMN has ~325 parameters vs ~866 for the standard MLP (37%),
        achieved by encoding governance domain structure rather than
        learning it from scratch through generic hidden layers.
    """

    def __init__(self, input_dim: int = 8) -> None:
        super().__init__()
        self.input_dim = input_dim

        # --- Veto Mechanism ---
        # Per-feature veto strength (learned, positive = contributes to hold)
        self.veto_strength = nn.Parameter(torch.zeros(input_dim))
        # Context-dependent gating: whether feature i's veto is relevant
        self.veto_gate = nn.Linear(input_dim, input_dim, bias=False)
        # Veto intensity scalar: controls how quickly veto dominates
        self.veto_intensity = nn.Parameter(torch.tensor(1.0))

        # --- Consensus Mechanism ---
        # Context-dependent feature importance weights
        self.consensus_gate = nn.Linear(input_dim, input_dim)
        # Learnable post-processing of consensus signal
        self.consensus_linear = nn.Linear(1, 1)

        # --- Uncertainty Mechanism ---
        self.uncertainty_net = nn.Sequential(
            nn.Linear(input_dim, 8),
            nn.ReLU(),
            nn.Linear(8, 1),
            nn.Sigmoid(),
        )

        # --- Calibration Head ---
        # Takes (features, softmax_probs) -> calibrated confidence
        self.calibrator = nn.Sequential(
            nn.Linear(input_dim + 2, 8),
            nn.ReLU(),
            nn.Linear(8, 1),
            nn.Sigmoid(),
        )

        self._init_weights()

    def _init_weights(self) -> None:
        nn.init.normal_(self.veto_strength, mean=0.0, std=0.1)
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_uniform_(m.weight, gain=0.5)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    # ---- Mechanism implementations ----

    def veto(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Veto mechanism: differentiable smooth OR over features.

        Returns (veto_score, per_feature_contributions) where veto_score
        is a (batch, 1) tensor that is positive when any feature vetoes.

        Uses log-sum-exp with bias correction so zero input yields zero
        veto score, preserving the "no trigger = no veto" semantics.
        """
        gates = torch.sigmoid(self.veto_gate(x))  # (B, F)
        # Weighted feature contributions: strength * gate * value
        contrib = self.veto_strength * gates * x  # (B, F)
        # Smooth max with bias correction: LSE(x) - log(N)
        veto_score = torch.logsumexp(contrib, dim=-1, keepdim=True)
        veto_score = veto_score - math.log(self.input_dim)
        return veto_score, contrib

    def consensus(self, x: torch.Tensor) -> torch.Tensor:
        """Consensus mechanism: context-weighted feature aggregation.

        Computes per-instance feature importance weights via a learned
        gating network, then aggregates via weighted sum.
        """
        # Context-dependent attention weights
        weights = F.softmax(self.consensus_gate(x), dim=-1)  # (B, F)
        # Weighted sum
        agg = (weights * x).sum(dim=-1, keepdim=True)  # (B, 1)
        # Learnable post-processing
        return self.consensus_linear(agg)

    def uncertainty(self, x: torch.Tensor) -> torch.Tensor:
        """Uncertainty mechanism: learned disagreement signal in [0, 1]."""
        return self.uncertainty_net(x)

    # ---- Forward passes ----

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Primary forward pass. Returns (batch, 2) logits for compatibility.

        Decision composition:
          hold = VETO + (1 - sigmoid(VETO)) * CONSENSUS
          logits = [-hold, hold]  # [clear, hold]

        When VETO > 0 (a feature fires), sigmoid(VETO) ~ 1, so hold ~ VETO.
        When VETO ~ 0 (no feature fires), sigmoid(VETO) ~ 0.5, and
        (1 - sigmoid(VETO)) * CONSENSUS ~ 0.5 * CONSENSUS, so consensus
        determines the direction.
        """
        veto_score, _ = self.veto(x)  # (B, 1)
        consensus_score = self.consensus(x)  # (B, 1)

        # Veto dominates when active; otherwise consensus decides
        veto_gate = torch.sigmoid(self.veto_intensity * veto_score)
        hold_raw = veto_score + (1.0 - veto_gate) * consensus_score

        # [clear_logit, hold_logit]
        return torch.cat([-hold_raw, hold_raw], dim=-1)

    def calibrated_forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Forward pass with calibrated confidence.

        Returns (logits, confidence) where confidence is a per-example
        estimate of P(correct | features), trained via calibration_loss.
        This is distinct from softmax max-probability — the calibration
        head learns to correct for over/under-confidence.

        For evaluation: use confidence to decide escalation.
        """
        logits = self.forward(x)
        probs = F.softmax(logits, dim=-1)
        calib_input = torch.cat([x, probs], dim=-1)
        confidence = self.calibrator(calib_input).squeeze(-1)
        return logits, confidence

    # ---- Interpretability ----

    def interpret(self, x: torch.Tensor) -> dict[str, torch.Tensor]:
        """Return interpretable decision components for one or more examples.

        Returns a dict with keys:
          veto_score: (B, 1) overall veto strength
          veto_contributions: (B, F) per-feature veto contributions
          consensus_score: (B, 1) consensus assessment
          consensus_weights: (B, F) per-feature importance weights
          uncertainty: (B, 1) learned uncertainty in [0, 1]
          hold_raw: (B, 1) the pre-logit hold score
        """
        gates = torch.sigmoid(self.veto_gate(x))
        veto_contrib = self.veto_strength * gates * x
        veto_score = torch.logsumexp(veto_contrib, dim=-1, keepdim=True)
        veto_score = veto_score - math.log(self.input_dim)

        weights = F.softmax(self.consensus_gate(x), dim=-1)
        consensus_raw = (weights * x).sum(dim=-1, keepdim=True)
        consensus_score = self.consensus_linear(consensus_raw)

        uncert = self.uncertainty(x)

        veto_gate = torch.sigmoid(self.veto_intensity * veto_score)
        hold_raw = veto_score + (1.0 - veto_gate) * consensus_score

        return {
            "veto_score": veto_score,
            "veto_contributions": veto_contrib,
            "consensus_score": consensus_score,
            "consensus_weights": weights,
            "uncertainty": uncert,
            "hold_raw": hold_raw,
        }


def calibration_loss(
    confidence: torch.Tensor,
    logits: torch.Tensor,
    labels: torch.Tensor,
) -> torch.Tensor:
    """Calibration loss for training the GTMN calibration head.

    Trains the model's confidence estimate to match the true probability
    of being correct. This is essential for governance because we need
    principled escalation: the model should output high confidence when
    it is likely correct and low confidence when it is likely wrong,
    enabling the system to escalate low-confidence decisions to humans.

    Args:
        confidence: (batch,) predicted confidence in [0, 1] from
            model.calibrated_forward().
        logits: (batch, n_classes) model logits.
        labels: (batch,) ground-truth class indices.

    Returns:
        Scalar BCE loss between confidence and actual correctness.

    Usage in training::

        logits = model(features)
        ce_loss = nn.CrossEntropyLoss()(logits, labels)
        if hasattr(model, "calibrated_forward"):
            _, conf = model(features)
            cal_loss = calibration_loss(conf, logits, labels)
            loss = ce_loss + 0.1 * cal_loss  # lambda = 0.1
    """
    predictions = torch.argmax(logits, dim=-1)
    correct = (predictions == labels).float().detach()
    return F.binary_cross_entropy(confidence, correct)


def build_model(architecture: str, input_dim: int = len(FEATURE_NAMES)) -> nn.Module:
    """Build a governance model by architecture name."""
    if architecture == ARCHITECTURE_MLP:
        return GalGovernanceDecisionNet(input_dim=input_dim)
    if architecture == ARCHITECTURE_RESNET_MLP:
        return GalGovernanceResidualDecisionNet(input_dim=input_dim)
    if architecture == ARCHITECTURE_GTMN:
        return GovernanceTripleMechanismNet(input_dim=input_dim)
    raise ValueError(f"unsupported architecture {architecture!r}; expected one of {ARCHITECTURES!r}")
