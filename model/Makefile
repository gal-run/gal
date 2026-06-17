.PHONY: validate test session-audit-adapter-smoke session-archive-adapter-smoke runtime-record-adapter-smoke trainable-trace-adapter-smoke governance-ledger-adapter-smoke governance-ledger-reviewed-adapter-smoke governance-reviewed-dataset-bundle-smoke github-pr-review-adapter-smoke kaggle-toxicity-adapter-smoke huggingface-dataset-adapter-smoke stackoverflow-moderation-adapter-smoke publish-bundle-smoke huggingface-publish-dry-run kaggle-model-stage-smoke build-dataset-smoke runpod-bundle-smoke runpod-job-bundle-smoke runpod-local-e2e-smoke data-smoke train-smoke train-resnet-smoke infer-smoke onnx-export-smoke onnx-infer-smoke eval-smoke eval-resnet-smoke bench-smoke bench-resnet-smoke runtime-benchmark-smoke runtime-benchmark-resnet-smoke sample-runtime-cases runtime-benchmark-live runpod-endpoint-preflight openai-baseline-benchmark-live compare-benchmarks llm-baseline-benchmark-sample openai-baseline-benchmark-sample

PYTHON ?= python3
PYTHON_RUNPOD ?= $(if $(findstring /,$(PYTHON)),$(abspath $(PYTHON)),$(PYTHON))
AUDIT_EVENTS ?= data/fixtures/audit_events.jsonl
SESSION_AUDIT ?= data/fixtures/session_audit_entries.json
SESSION_ARCHIVE ?= data/fixtures/session_archive_entries.ndjson
CLAUDE_CODE_TRANSCRIPT ?= data/fixtures/claude_code_transcript.jsonl
TRAINABLE_TRACE ?= data/fixtures/trainable_trace_records.jsonl
GOVERNANCE_LEDGER ?= data/fixtures/governance_ledger_entries.jsonl
GOVERNANCE_REVIEWS ?= data/fixtures/governance_review_entries.jsonl
GITHUB_PR_FIXTURE ?= data/fixtures/github_pr_reviews.json
GITHUB_PR_OUTPUT ?= tmp/github-pr-review-events.jsonl
KAGGLE_TOXICITY_FIXTURE ?= data/fixtures/kaggle_toxicity_sample.csv
KAGGLE_TOXICITY_OUTPUT ?= tmp/kaggle-toxicity-events.jsonl
HF_DATASET_OUTPUT ?= tmp/hf-dataset-events.jsonl
SO_MODERATION_OUTPUT ?= tmp/so-moderation-events.jsonl
GAL_API_BASE_URL ?= http://localhost:3000
GAL_API_ORG ?=
GAL_API_SESSION_IDS ?=
GAL_API_EXPORT_OUTPUT_DIR ?= artifacts/gal-api-session-export
GAL_API_EXPORT_SOURCE ?= auto
GAL_API_DISCOVER_LIMIT ?= 5
GAL_API_SOURCE_LANE ?= gal_session_archive_weak_labels
GAL_API_REVIEWER_STATUS ?= pending_review
DATASET ?= data/fixtures/civil_scene_safety.jsonl
DATASET_MANIFEST ?= data/fixtures/dataset-manifest.json
RUNTIME_BENCHMARK ?= benchmarks/fixtures/runtime-governance-smoke.jsonl
RUNTIME_BENCHMARK_SAMPLE_OUTPUT ?= tmp/runtime-benchmark-sample.jsonl
RUNTIME_BENCHMARK_SAMPLE_CASES ?= 40
RUNTIME_BENCHMARK_SAMPLE_SEED ?= 7
BUILDER_OUTPUT_DIR ?= tmp/audit-dataset-smoke
SESSION_ADAPTER_OUTPUT ?= tmp/session-audit-events.jsonl
GOVERNANCE_REVIEWED_OUTPUT_DIR ?= tmp/gal-code-governance-reviewed-bundle
RUNPOD_BUNDLE ?= tmp/gal-model-runpod-bundle.tar.gz
RUNPOD_JOB_BUNDLE ?= tmp/gal-model-runpod-job-bundle.tar.gz
RUNPOD_LOCAL_E2E_DIR ?= tmp/runpod-local-e2e
OUTPUT_DIR ?= tmp/train-smoke
MODEL_PATH ?= $(OUTPUT_DIR)/gal-governance-decision.pt
LIVE_MODEL_PATH ?= artifacts/gal-api-session-export-gal-run-live-25-train-mlp/gal-governance-decision.pt
RUNTIME_BENCHMARK_OUTPUT ?= tmp/runtime-benchmark-live.json
ONNX_OUTPUT_DIR ?= tmp/onnx-export-smoke
ONNX_MODEL_PATH ?= $(ONNX_OUTPUT_DIR)/gal-governance-decision.onnx
ONNX_ARTIFACT_PATH ?= $(ONNX_OUTPUT_DIR)/runtime-artifact.json
PUBLISH_BUNDLE_DIR ?= tmp/publish-bundle-smoke
HF_REPO_ID ?= local/gal-governance-decision
HF_REPO_TYPE ?= model
HF_VISIBILITY ?= private
KAGGLE_STAGE_DIR ?= tmp/kaggle-model-bundle-smoke
KAGGLE_OWNER_SLUG ?= local-owner
KAGGLE_MODEL_SLUG ?= gal-governance-decision
KAGGLE_MODEL_TITLE ?= GAL Governance Decision
KAGGLE_INSTANCE_SLUG ?= onnx-sidecar
KAGGLE_FRAMEWORK ?= onnx
RESNET_OUTPUT_DIR ?= tmp/train-smoke-resnet
RESNET_MODEL_PATH ?= $(RESNET_OUTPUT_DIR)/gal-governance-decision.pt
EXAMPLE ?= data/fixtures/inference_request.json
LLM_BASELINE_OUTPUT ?= tmp/llm-baseline-benchmark.json
LLM_BASELINE_CASE_LIMIT ?= 40
LLM_BASELINE_MODEL ?= deepseek-chat
OPENAI_BASELINE_OUTPUT ?= tmp/openai-baseline-benchmark.json
OPENAI_BASELINE_CASE_LIMIT ?= 40
OPENAI_BASELINE_MODEL ?= baseline-model
OPENAI_BASELINE_ENDPOINT ?= http://localhost:8000/v1/chat/completions
RUNPOD_PREFLIGHT_TIMEOUT ?= 300
RUNPOD_PREFLIGHT_POLL_INTERVAL ?= 10
RUNPOD_PREFLIGHT_OUTPUT ?= tmp/runpod-endpoint-preflight.json
COMPARE_BENCHMARKS_OUTPUT ?= tmp/runtime-benchmark-comparison.json

validate: test session-audit-adapter-smoke session-archive-adapter-smoke runtime-record-adapter-smoke trainable-trace-adapter-smoke governance-ledger-adapter-smoke governance-ledger-reviewed-adapter-smoke governance-reviewed-dataset-bundle-smoke github-pr-review-adapter-smoke build-dataset-smoke runpod-bundle-smoke runpod-job-bundle-smoke runpod-local-e2e-smoke data-smoke train-smoke infer-smoke onnx-export-smoke onnx-infer-smoke eval-smoke bench-smoke runtime-benchmark-smoke train-resnet-smoke eval-resnet-smoke bench-resnet-smoke runtime-benchmark-resnet-smoke

test:
	PYTHONPATH=src $(PYTHON) -m unittest discover -s tests

session-audit-adapter-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.session_audit_adapter --input "$(SESSION_AUDIT)" --output "$(SESSION_ADAPTER_OUTPUT)" --split train --application gal-session-audit-fixture
	PYTHONPATH=src $(PYTHON) -m gal_model.audit_dataset_builder --events "$(SESSION_ADAPTER_OUTPUT)" --output-dir "tmp/session-audit-dataset-smoke" --dataset-ref "gal-dataset://governance-decision/v0/session-audit-fixture-smoke" --source-lane synthetic_fixture --reviewer-status fixture_smoke --benchmark-splits train
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "tmp/session-audit-dataset-smoke/dataset-manifest.json"

session-archive-adapter-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.session_archive_adapter --input "$(SESSION_ARCHIVE)" --output "tmp/session-archive-events.jsonl" --split validation --application gal-session-archive-fixture --org fixture-org --session-id fixture-session
	PYTHONPATH=src $(PYTHON) -m gal_model.audit_dataset_builder --events "tmp/session-archive-events.jsonl" --output-dir "tmp/session-archive-dataset-smoke" --dataset-ref "gal-dataset://governance-decision/v0/session-archive-fixture-smoke" --source-lane gal_session_archive_weak_labels --reviewer-status pending_review --benchmark-splits validation
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "tmp/session-archive-dataset-smoke/dataset-manifest.json"

runtime-record-adapter-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.multi_agent_runtime_adapters --input "$(CLAUDE_CODE_TRANSCRIPT)" --output "tmp/runtime-record-events.jsonl" --runtime-type claude-code --split validation --application gal-runtime-record-fixture --org fixture-org --session-id fixture-session
	PYTHONPATH=src $(PYTHON) -m gal_model.audit_dataset_builder --events "tmp/runtime-record-events.jsonl" --output-dir "tmp/runtime-record-dataset-smoke" --dataset-ref "gal-dataset://governance-decision/v0/runtime-record-fixture-smoke" --source-lane gal_session_archive_weak_labels --reviewer-status pending_review --benchmark-splits validation
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "tmp/runtime-record-dataset-smoke/dataset-manifest.json"

trainable-trace-adapter-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.trainable_trace_adapter --input "$(TRAINABLE_TRACE)" --output "tmp/trainable-trace-events.jsonl" --application gal-trainable-trace-fixture --train-ratio 0 --validation-ratio 100 --test-ratio 0
	PYTHONPATH=src $(PYTHON) -m gal_model.audit_dataset_builder --events "tmp/trainable-trace-events.jsonl" --output-dir "tmp/trainable-trace-dataset-smoke" --dataset-ref "gal-dataset://governance-decision/v0/trainable-trace-fixture-smoke" --source-lane canonical_gal_structured_dataset --reviewer-status pending_review --benchmark-splits validation
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "tmp/trainable-trace-dataset-smoke/dataset-manifest.json"

governance-ledger-adapter-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.gal_code_governance_adapter --input "$(GOVERNANCE_LEDGER)" --output "tmp/gal-code-governance-events.jsonl" --application gal-code-governance-fixture --train-ratio 100 --validation-ratio 0 --test-ratio 0
	PYTHONPATH=src $(PYTHON) -m gal_model.audit_dataset_builder --events "tmp/gal-code-governance-events.jsonl" --output-dir "tmp/gal-code-governance-dataset-smoke" --dataset-ref "gal-dataset://governance-decision/v0/gal-code-governance-fixture-smoke" --source-lane gal_code_governance_ledger_weak_labels --reviewer-status pending_review --benchmark-splits train
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "tmp/gal-code-governance-dataset-smoke/dataset-manifest.json"

governance-ledger-reviewed-adapter-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.gal_code_governance_adapter --input "$(GOVERNANCE_LEDGER)" --reviews "$(GOVERNANCE_REVIEWS)" --reviewed-only --output "tmp/gal-code-governance-reviewed-events.jsonl" --application gal-code-governance-reviewed-fixture --train-ratio 0 --validation-ratio 100 --test-ratio 0
	PYTHONPATH=src $(PYTHON) -m gal_model.audit_dataset_builder --events "tmp/gal-code-governance-reviewed-events.jsonl" --output-dir "tmp/gal-code-governance-reviewed-dataset-smoke" --dataset-ref "gal-dataset://governance-decision/v0/gal-code-governance-reviewed-fixture-smoke" --source-lane gal_code_governance_ledger_reviewed --reviewer-status human_reviewed --benchmark-splits validation
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "tmp/gal-code-governance-reviewed-dataset-smoke/dataset-manifest.json"

governance-reviewed-dataset-bundle-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.build_reviewed_governance_dataset --input "$(GOVERNANCE_LEDGER)" --reviews "$(GOVERNANCE_REVIEWS)" --output-dir "$(GOVERNANCE_REVIEWED_OUTPUT_DIR)" --dataset-ref "gal-dataset://governance-decision/v0/gal-code-governance-reviewed-bundle-smoke" --application gal-code-governance-reviewed-fixture --train-ratio 0 --validation-ratio 100 --test-ratio 0 --benchmark-splits validation
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "$(GOVERNANCE_REVIEWED_OUTPUT_DIR)/dataset-manifest.json"

github-pr-review-adapter-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.github_pr_review_adapter --repos fixture-org/test-repo --mock "$(GITHUB_PR_FIXTURE)" --output "$(GITHUB_PR_OUTPUT)" --train-ratio 70 --validation-ratio 20 --test-ratio 10
	PYTHONPATH=src $(PYTHON) -m gal_model.audit_dataset_builder --events "$(GITHUB_PR_OUTPUT)" --output-dir "tmp/github-pr-review-dataset-smoke" --dataset-ref "gal-dataset://governance-decision/v0/github-pr-review-fixture-smoke" --source-lane github_pr_review_weak_labels --reviewer-status pending_review --benchmark-splits validation
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "tmp/github-pr-review-dataset-smoke/dataset-manifest.json"

kaggle-toxicity-adapter-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.kaggle_toxicity_adapter --input "$(KAGGLE_TOXICITY_FIXTURE)" --output "$(KAGGLE_TOXICITY_OUTPUT)"
	PYTHONPATH=src $(PYTHON) -m gal_model.audit_dataset_builder --events "$(KAGGLE_TOXICITY_OUTPUT)" --output-dir "tmp/kaggle-toxicity-dataset-smoke" --dataset-ref "gal-dataset://governance-decision/v0/kaggle-toxicity-fixture-smoke" --source-lane kaggle_toxicity_weak_labels --reviewer-status pending_review --benchmark-splits validation
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "tmp/kaggle-toxicity-dataset-smoke/dataset-manifest.json"

huggingface-dataset-adapter-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.huggingface_dataset_adapter --dataset google/civil_comments --max-rows 20 --output "$(HF_DATASET_OUTPUT)"
	PYTHONPATH=src $(PYTHON) -m gal_model.audit_dataset_builder --events "$(HF_DATASET_OUTPUT)" --output-dir "tmp/hf-dataset-smoke" --dataset-ref "gal-dataset://governance-decision/v0/hf-dataset-fixture-smoke" --source-lane huggingface_public_dataset --reviewer-status pending_review --benchmark-splits validation
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "tmp/hf-dataset-smoke/dataset-manifest.json"

stackoverflow-moderation-adapter-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.stackoverflow_moderation_adapter --input data/fixtures/audit_events.jsonl --output "$(SO_MODERATION_OUTPUT)"

publish-bundle-smoke: onnx-export-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.build_publish_bundle --artifact-dir "$(ONNX_OUTPUT_DIR)" --output-dir "$(PUBLISH_BUNDLE_DIR)"

huggingface-publish-dry-run: publish-bundle-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.publish_huggingface --folder "$(PUBLISH_BUNDLE_DIR)" --repo-id "$(HF_REPO_ID)" --repo-type "$(HF_REPO_TYPE)" --visibility "$(HF_VISIBILITY)"

kaggle-model-stage-smoke: publish-bundle-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.publish_kaggle_model --source-dir "$(PUBLISH_BUNDLE_DIR)" --staging-dir "$(KAGGLE_STAGE_DIR)" --owner-slug "$(KAGGLE_OWNER_SLUG)" --model-slug "$(KAGGLE_MODEL_SLUG)" --title "$(KAGGLE_MODEL_TITLE)" --instance-slug "$(KAGGLE_INSTANCE_SLUG)" --framework "$(KAGGLE_FRAMEWORK)"

build-dataset-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.audit_dataset_builder --events "$(AUDIT_EVENTS)" --output-dir "$(BUILDER_OUTPUT_DIR)" --dataset-ref "gal-dataset://governance-decision/v0/audit-fixture-smoke" --source-lane synthetic_fixture --reviewer-status fixture_smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "$(BUILDER_OUTPUT_DIR)/dataset-manifest.json"

runpod-bundle-smoke:
	OUT="$(RUNPOD_BUNDLE)" bash scripts/runpod/build_training_bundle.sh
	bash -n scripts/runpod/train_gal_sidecar.sh
	bash -n scripts/runpod/build_training_bundle.sh
	bash -n scripts/runpod/build_training_job_bundle.sh
	bash -n scripts/runpod/create_sidecar_pod.sh

runpod-job-bundle-smoke: build-dataset-smoke
	DATASET_DIR="$(BUILDER_OUTPUT_DIR)" OUT="$(RUNPOD_JOB_BUNDLE)" bash scripts/runpod/build_training_job_bundle.sh

runpod-local-e2e-smoke: runpod-job-bundle-smoke
	rm -rf "$(RUNPOD_LOCAL_E2E_DIR)"
	mkdir -p "$(RUNPOD_LOCAL_E2E_DIR)"
	tar -xzf "$(RUNPOD_JOB_BUNDLE)" -C "$(RUNPOD_LOCAL_E2E_DIR)"
	cd "$(RUNPOD_LOCAL_E2E_DIR)" && PYTHON_BIN="$(PYTHON_RUNPOD)" OUTPUT_ROOT="artifacts/gal-sidecar-runpod" DEVICE="cpu" REQUIRE_CUDA="0" bash RUNPOD_COMMAND.sh

data-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.validate_data --manifest "$(DATASET_MANIFEST)"

train-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.train --dataset "$(DATASET)" --output-dir "$(OUTPUT_DIR)" --epochs 8 --seed 7

train-resnet-smoke:
	PYTHONPATH=src $(PYTHON) -m gal_model.train --dataset "$(DATASET)" --output-dir "$(RESNET_OUTPUT_DIR)" --epochs 8 --seed 7 --architecture resnet_mlp

infer-smoke: train-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.infer --model "$(MODEL_PATH)" --example "$(EXAMPLE)"

onnx-export-smoke: train-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.onnx_export --model "$(MODEL_PATH)" --output-dir "$(ONNX_OUTPUT_DIR)" --dataset "$(DATASET)" --min-decision-match-rate 1

onnx-infer-smoke: onnx-export-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.onnx_infer --model "$(ONNX_MODEL_PATH)" --artifact "$(ONNX_ARTIFACT_PATH)" --example "$(EXAMPLE)"

eval-smoke: train-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.evaluate --model "$(MODEL_PATH)" --dataset "$(DATASET)" --min-accuracy 0.75

eval-resnet-smoke: train-resnet-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.evaluate --model "$(RESNET_MODEL_PATH)" --dataset "$(DATASET)" --min-accuracy 0.75

bench-smoke: train-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.benchmark --model "$(MODEL_PATH)" --example "$(EXAMPLE)" --warmup 5 --iterations 50

bench-resnet-smoke: train-resnet-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.benchmark --model "$(RESNET_MODEL_PATH)" --example "$(EXAMPLE)" --warmup 5 --iterations 50

runtime-benchmark-smoke: train-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.runtime_benchmark --model "$(MODEL_PATH)" --cases "$(RUNTIME_BENCHMARK)" --max-false-clear-rate 0 --max-false-hold-rate 0 --min-operator-review-recall 1 --min-escalation-precision 0.5 --max-p95-latency-ms 10 --min-schema-rejection-rate 1 --min-audit-metadata-completeness 1

runtime-benchmark-resnet-smoke: train-resnet-smoke
	PYTHONPATH=src $(PYTHON) -m gal_model.runtime_benchmark --model "$(RESNET_MODEL_PATH)" --cases "$(RUNTIME_BENCHMARK)" --max-false-clear-rate 0 --max-false-hold-rate 0 --min-operator-review-recall 1 --min-escalation-precision 0.5 --max-p95-latency-ms 10 --min-schema-rejection-rate 1 --min-audit-metadata-completeness 1

sample-runtime-cases:
	PYTHONPATH=src $(PYTHON) -m gal_model.sample_runtime_cases --cases "$(RUNTIME_BENCHMARK)" --output "$(RUNTIME_BENCHMARK_SAMPLE_OUTPUT)" --max-cases "$(RUNTIME_BENCHMARK_SAMPLE_CASES)" --seed "$(RUNTIME_BENCHMARK_SAMPLE_SEED)"

runtime-benchmark-live:
	PYTHONPATH=src $(PYTHON) -m gal_model.runtime_benchmark --model "$(LIVE_MODEL_PATH)" --cases "$(RUNTIME_BENCHMARK)" > "$(RUNTIME_BENCHMARK_OUTPUT)"

llm-baseline-benchmark-sample:
	PYTHONPATH=src $(PYTHON) -m gal_model.llm_baseline_benchmark --cases "$(RUNTIME_BENCHMARK)" --max-cases "$(LLM_BASELINE_CASE_LIMIT)" --model "$(LLM_BASELINE_MODEL)" --output "$(LLM_BASELINE_OUTPUT)"

openai-baseline-benchmark-sample:
	PYTHONPATH=src $(PYTHON) -m gal_model.openai_baseline_benchmark --cases "$(RUNTIME_BENCHMARK)" --max-cases "$(OPENAI_BASELINE_CASE_LIMIT)" --endpoint "$(OPENAI_BASELINE_ENDPOINT)" --model "$(OPENAI_BASELINE_MODEL)" --output "$(OPENAI_BASELINE_OUTPUT)"

runpod-endpoint-preflight:
	PYTHONPATH=src $(PYTHON) -m gal_model.runpod_endpoint_preflight --endpoint "$(OPENAI_BASELINE_ENDPOINT)" --api-key "$(OPENAI_API_KEY)" --model "$(OPENAI_BASELINE_MODEL)" --timeout-seconds "$(RUNPOD_PREFLIGHT_TIMEOUT)" --poll-interval-seconds "$(RUNPOD_PREFLIGHT_POLL_INTERVAL)" --output "$(RUNPOD_PREFLIGHT_OUTPUT)"

openai-baseline-benchmark-live:
	PYTHONPATH=src $(PYTHON) -m gal_model.openai_baseline_benchmark --cases "$(RUNTIME_BENCHMARK)" --endpoint "$(OPENAI_BASELINE_ENDPOINT)" --api-key "$(OPENAI_API_KEY)" --model "$(OPENAI_BASELINE_MODEL)" --output "$(OPENAI_BASELINE_OUTPUT)"

compare-benchmarks:
	PYTHONPATH=src $(PYTHON) -m gal_model.compare_benchmarks --left "$(RUNTIME_BENCHMARK_OUTPUT)" --right "$(OPENAI_BASELINE_OUTPUT)" --left-label ours --right-label baseline --output "$(COMPARE_BENCHMARKS_OUTPUT)"

gal-api-session-export:
	PYTHONPATH=src $(PYTHON) -m gal_model.gal_api_session_export --base-url "$(GAL_API_BASE_URL)" --org "$(GAL_API_ORG)" $(if $(GAL_API_SESSION_IDS),--session-ids-file "$(GAL_API_SESSION_IDS)",) --source "$(GAL_API_EXPORT_SOURCE)" --discover-limit "$(GAL_API_DISCOVER_LIMIT)" --output-dir "$(GAL_API_EXPORT_OUTPUT_DIR)" --dataset-ref "gal-dataset://governance-decision/v0/gal-api-session-export" --application gal-session-audit --source-lane "$(GAL_API_SOURCE_LANE)" --reviewer-status "$(GAL_API_REVIEWER_STATUS)"
