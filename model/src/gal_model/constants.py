"""Constants for the GAL governance decision model."""

MODEL_REF = "gal-model://governance-decision/v0"
LABELS = ["clear_for_operator_review", "hold_for_operator_review"]
LABEL_TO_INDEX = {label: index for index, label in enumerate(LABELS)}
INDEX_TO_LABEL = {index: label for index, label in enumerate(LABELS)}
