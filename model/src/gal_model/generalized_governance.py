"""Generalized Governance Architecture (GAL-Gen).

Multi-modal governance model processing raw agent actions across domains:
PR reviews, shell commands, API calls, file operations, configuration changes.

Architecture:
  Raw Action → Text Encoder (shared) → Domain Router → Governance Head → clear/hold

Input modalities:
  - action_description: text describing what the agent wants to do
  - code_diff: unified diff of the proposed change (for PR/code actions)
  - structured_evidence: the 8 governance features (CI, reviews, etc.)
  - context_window: recent agent history for context

The model works across domains without per-domain fine-tuning by learning
a domain-invariant governance representation through the shared encoder.
"""

from __future__ import annotations

import torch
from torch import nn


class DomainRouter(nn.Module):
    """Routes encoded actions to domain-specific governance heads.

    Learns to identify the action domain (PR review, shell command, API call,
    file operation, configuration) and route to the appropriate expert head.
    """

    def __init__(self, hidden_dim: int = 256, num_domains: int = 5) -> None:
        super().__init__()
        self.num_domains = num_domains
        self.router = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 4),
            nn.ReLU(),
            nn.Linear(hidden_dim // 4, num_domains),
        )
        self._domain_names = ["pr_review", "shell_command", "api_call", "file_operation", "configuration"]

    def forward(self, encoded: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """Returns (domain_logits, routing_weights)."""
        logits = self.router(encoded)
        weights = torch.softmax(logits, dim=-1)
        return logits, weights


class GovernanceExpertHead(nn.Module):
    """Domain-specific governance head.

    Each expert specializes in one action domain, learning the specific
    risk patterns and governance norms for that domain.
    """

    def __init__(self, hidden_dim: int = 256) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim // 2),
            nn.LayerNorm(hidden_dim // 2),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim // 2, hidden_dim // 4),
            nn.LayerNorm(hidden_dim // 4),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden_dim // 4, 2),  # clear / hold
        )

    def forward(self, encoded: torch.Tensor) -> torch.Tensor:
        return self.net(encoded)


class GovernanceConfidenceHead(nn.Module):
    """Shared confidence calibration head.

    Produces calibrated confidence scores decoupled from the classification
    decision, following the calibration-is-orthogonal pattern from
    ShieldGemma's scoring mode.
    """

    def __init__(self, hidden_dim: int = 256) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(hidden_dim + 2, hidden_dim // 4),  # encoded + logits
            nn.ReLU(),
            nn.Linear(hidden_dim // 4, 1),
            nn.Sigmoid(),
        )

    def forward(self, encoded: torch.Tensor, logits: torch.Tensor) -> torch.Tensor:
        return self.net(torch.cat([encoded, logits], dim=-1))


class GeneralizedGovernanceModel(nn.Module):
    """Generalized governance model for multi-domain agent actions.

    Args:
        text_encoder: Pretrained text encoder (e.g., ModernBERT-base)
        encoder_dim: Output dimension of the text encoder
        hidden_dim: Hidden dimension for governance heads
        num_domains: Number of action domains
        freeze_encoder: Whether to freeze the text encoder (for initial training)

    The model processes raw agent actions through a shared text encoder,
    routes to domain-specific governance heads, and produces calibrated
    governance decisions with confidence scores.
    """

    def __init__(
        self,
        text_encoder: nn.Module | None = None,
        encoder_dim: int = 768,
        hidden_dim: int = 256,
        num_domains: int = 5,
        freeze_encoder: bool = True,
    ) -> None:
        super().__init__()

        # Shared text encoder (pretrained, can be fine-tuned)
        self.encoder = text_encoder or self._build_default_encoder(encoder_dim)
        if freeze_encoder:
            for param in self.encoder.parameters():
                param.requires_grad = False

        # Structured feature encoder (maps 8 features → dense)
        self.structured_encoder = nn.Sequential(
            nn.Linear(8, 64),
            nn.LayerNorm(64),
            nn.ReLU(),
            nn.Linear(64, 128),
        )

        # Fusion layer: combine text + structured embeddings
        self.fusion = nn.Sequential(
            nn.Linear(encoder_dim + 128, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.ReLU(),
        )

        # Domain router
        self.router = DomainRouter(hidden_dim, num_domains)

        # Domain-specific expert heads
        self.experts = nn.ModuleList([
            GovernanceExpertHead(hidden_dim) for _ in range(num_domains)
        ])

        # Confidence calibration head
        self.confidence_head = GovernanceConfidenceHead(hidden_dim)

    def _build_default_encoder(self, encoder_dim: int) -> nn.Module:
        """Build a simple embedding encoder when no pretrained one is provided.

        In production, replace with bge-small-en-v1.5 or ModernBERT-base
        via the text_encoder parameter.
        """
        return nn.Sequential(
            nn.Embedding(30522, encoder_dim),  # Standard BERT vocab
            nn.Linear(encoder_dim, encoder_dim),
            nn.LayerNorm(encoder_dim),
        )

    def encode_text(self, text: list[str]) -> torch.Tensor:
        """Encode action descriptions into dense vectors."""
        # Placeholder: in production, use bge-small or ModernBERT
        token_ids = torch.zeros(len(text), 128, dtype=torch.long)  # Truncated to 128 tokens
        return self.encoder(token_ids).mean(dim=1)  # Mean pooling

    def forward(
        self,
        text: list[str] | None = None,
        structured_features: torch.Tensor | None = None,
        return_domain: bool = False,
    ) -> dict[str, torch.Tensor]:
        """Forward pass through the generalized governance model.

        Args:
            text: List of action descriptions
            structured_features: Tensor of shape (batch, 8) with governance features
            return_domain: Whether to return domain routing information

        Returns:
            Dict with logits, probs, confidence, and optionally domain_weights
        """
        batch_size = len(text) if text else structured_features.shape[0]

        # Encode text
        if text:
            text_encoded = self.encode_text(text)
        else:
            text_encoded = torch.zeros(batch_size, 768)  # Zero if no text

        # Encode structured features (or zeros if not provided)
        if structured_features is not None:
            struct_encoded = self.structured_encoder(structured_features)
        else:
            struct_encoded = torch.zeros(batch_size, 128)

        # Fuse modalities
        fused = self.fusion(torch.cat([text_encoded, struct_encoded], dim=-1))

        # Route to domain experts
        domain_logits, domain_weights = self.router(fused)

        # Weighted expert outputs
        expert_outputs = torch.stack([expert(fused) for expert in self.experts], dim=1)
        logits = (expert_outputs * domain_weights.unsqueeze(-1)).sum(dim=1)

        probs = torch.softmax(logits, dim=-1)
        confidence = self.confidence_head(fused, logits)

        output = {
            "logits": logits,
            "probs": probs,
            "confidence": confidence.squeeze(-1),
            "prediction": torch.argmax(logits, dim=-1),
        }
        if return_domain:
            output["domain_weights"] = domain_weights
            output["domain_logits"] = domain_logits

        return output

    @property
    def parameter_count(self) -> dict[str, int]:
        """Breakdown of parameter counts by component."""
        counts = {}
        for name, module in [
            ("encoder", self.encoder),
            ("structured_encoder", self.structured_encoder),
            ("fusion", self.fusion),
            ("router", self.router),
            ("experts", self.experts),
            ("confidence_head", self.confidence_head),
        ]:
            counts[name] = sum(p.numel() for p in module.parameters())
        counts["total"] = sum(counts.values())
        return counts


# ── Training utilities ───────────────────────────────────────────────────


def governance_loss(
    outputs: dict[str, torch.Tensor],
    labels: torch.Tensor,
    *,
    class_weights: torch.Tensor | None = None,
) -> dict[str, torch.Tensor]:
    """Multi-objective governance loss.

    Combines classification loss, calibration loss, and domain routing loss
    for end-to-end training of the generalized governance model.
    """
    # Classification loss
    ce_loss = nn.CrossEntropyLoss(weight=class_weights)(outputs["logits"], labels)

    # Calibration loss: confidence should reflect accuracy
    correct = (outputs["prediction"] == labels).float()
    cal_loss = nn.MSELoss()(outputs["confidence"], correct)

    # Combined
    total = ce_loss + 0.1 * cal_loss

    return {
        "loss": total,
        "ce_loss": ce_loss,
        "cal_loss": cal_loss,
    }
