from __future__ import annotations

import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

import torch

from gal_model.api_contract import build_inference_response, load_inference_request
from gal_model.audit_dataset_builder import build_dataset, load_audit_events, reject_disallowed_keys
from gal_model.build_publish_bundle import build_publish_bundle
from gal_model.build_reviewed_governance_dataset import build_reviewed_dataset_bundle
from gal_model.checkpoint import validate_checkpoint_metadata
from gal_model.compare_benchmarks import compare_payloads
from gal_model.constants import LABELS, MODEL_REF
from gal_model.dataset import load_examples, tensor_dataset_from_examples
from gal_model.dataset_manifest import validate_manifest
from gal_model.device import resolve_device
from gal_model.github_pr_review_adapter import (
    assign_pr_split,
    normalized_event_from_pr,
    _review_approval_count,
    _is_bot,
)
from gal_model.features import FEATURE_NAMES, RAW_FEATURE_NAMES, encode_features
from gal_model.gal_api_session_export import (
    assign_split,
    build_export_summary,
    discover_archived_sessions,
    read_session_ids,
    validate_split_ratios,
)
from gal_model.llm_baseline_benchmark import parse_baseline_response, sample_cases
from gal_model.openai_baseline_benchmark import (
    _build_headers,
    _extract_openai_text,
    _runpod_status_endpoint,
    _unwrap_runpod_output,
)
from gal_model.publish_huggingface import list_publishable_files
from gal_model.publish_kaggle_model import stage_bundle as stage_kaggle_bundle
from gal_model.runpod_endpoint_preflight import (
    _runpod_async_endpoint,
    _runpod_endpoint_prefix,
    _runpod_health_endpoint,
)
from gal_model.gal_code_governance_adapter import (
    convert_rows as convert_governance_rows,
    load_governance_rows,
    load_review_rows,
)
from gal_model.network import ARCHITECTURES, GalGovernanceDecisionNet, build_model
from gal_model.onnx_runtime import RUNTIME_ARTIFACT_SCHEMA_VERSION, validate_runtime_artifact_metadata
from gal_model.runtime_benchmark import load_cases, run_benchmark
from gal_model.sample_runtime_cases import build_sample
from gal_model.session_audit_adapter import (
    convert_entries,
    load_session_audit_entries,
    load_session_audit_payload,
)
from gal_model.session_audit_contract import validate_session_audit_log_response
from gal_model.session_archive_adapter import (
    convert_entries as convert_archive_entries,
    load_session_archive_entries,
)
from gal_model.trainable_trace_adapter import (
    convert_traces,
    load_trainable_traces,
)


class GalModelTest(unittest.TestCase):
    def test_model_ref_is_singular_deep_learning_model(self) -> None:
        self.assertEqual(MODEL_REF, "gal-model://governance-decision/v0")

    def test_feature_encoder_has_stable_width(self) -> None:
        encoded = encode_features(
            {
                "people_present": True,
                "vehicles_present": False,
                "obstacles_present": True,
                "evidence_complete": False,
                "operator_review_required": True,
                "latency_measured": True,
                "approval_refs_complete": False,
                "detection_count": 6,
            }
        )
        self.assertEqual(len(encoded), len(FEATURE_NAMES))
        self.assertEqual(encoded[0], 1.0)
        self.assertEqual(encoded[3], 0.0)

    def test_dataset_loads_fixture(self) -> None:
        examples = load_examples(Path("data/fixtures/civil_scene_safety.jsonl"))
        dataset = tensor_dataset_from_examples(examples)
        self.assertEqual(len(dataset), len(examples))

    def test_training_schema_features_match_encoder_contract(self) -> None:
        schema = json.loads(Path("schemas/training-example.schema.json").read_text(encoding="utf-8"))
        feature_schema = schema["properties"]["features"]
        self.assertFalse(feature_schema["additionalProperties"])
        self.assertEqual(
            set(feature_schema["required"]),
            set(RAW_FEATURE_NAMES),
        )
        self.assertEqual(set(feature_schema["properties"]), set(feature_schema["required"]))

    def test_network_outputs_two_decision_logits(self) -> None:
        model = GalGovernanceDecisionNet()
        logits = model(torch.zeros((3, len(FEATURE_NAMES)), dtype=torch.float32))
        self.assertEqual(tuple(logits.shape), (3, len(LABELS)))

    def test_model_factory_outputs_two_decision_logits_for_each_architecture(self) -> None:
        for architecture in ARCHITECTURES:
            with self.subTest(architecture=architecture):
                model = build_model(architecture)
                logits = model(torch.zeros((2, len(FEATURE_NAMES)), dtype=torch.float32))
                self.assertEqual(tuple(logits.shape), (2, len(LABELS)))

    def test_checkpoint_validation_rejects_feature_contract_mismatch(self) -> None:
        model = GalGovernanceDecisionNet()
        checkpoint = {
            "model_ref": MODEL_REF,
            "labels": LABELS,
            "feature_names": ["wrong_feature"],
            "state_dict": model.state_dict(),
        }
        with self.assertRaisesRegex(ValueError, "feature_names"):
            validate_checkpoint_metadata(checkpoint)

    def test_checkpoint_validation_rejects_unsupported_architecture(self) -> None:
        model = GalGovernanceDecisionNet()
        checkpoint = {
            "model_ref": MODEL_REF,
            "architecture": "not_real",
            "labels": LABELS,
            "feature_names": FEATURE_NAMES,
            "state_dict": model.state_dict(),
        }
        with self.assertRaisesRegex(ValueError, "architecture"):
            validate_checkpoint_metadata(checkpoint)

    def test_runtime_artifact_validation_rejects_feature_contract_mismatch(self) -> None:
        artifact = {
            "schema_version": RUNTIME_ARTIFACT_SCHEMA_VERSION,
            "export_format": "onnx",
            "model_ref": MODEL_REF,
            "architecture": "mlp",
            "labels": LABELS,
            "feature_names": ["wrong_feature"],
            "input_name": "features",
            "output_name": "logits",
            "opset_version": 17,
            "providers": ["CPUExecutionProvider"],
            "artifact_file": "gal-governance-decision.onnx",
            "artifact_sha256": "abc123",
            "checkpoint_file": "gal-governance-decision.pt",
        }
        with self.assertRaisesRegex(ValueError, "feature_names"):
            validate_runtime_artifact_metadata(artifact)

    def test_device_resolver_supports_cpu_and_auto(self) -> None:
        self.assertEqual(str(resolve_device("cpu")), "cpu")
        self.assertIn(str(resolve_device("auto")), {"cpu", "cuda"})

    def test_dataset_manifest_validates_fixture(self) -> None:
        result = validate_manifest(Path("data/fixtures/dataset-manifest.json"))
        self.assertTrue(result["passed"], result["errors"])
        self.assertEqual(result["splits"]["smoke"]["rows"], 8)

    def test_inference_request_contract_accepts_wrapped_fixture(self) -> None:
        request = load_inference_request(Path("data/fixtures/inference_request.json"))
        self.assertEqual(request["request_id"], "fixture-request-001")
        self.assertEqual(request["model_ref"], MODEL_REF)
        self.assertEqual(set(request["features"]), set(RAW_FEATURE_NAMES))

    def test_inference_response_preserves_application_metadata(self) -> None:
        request = load_inference_request(Path("data/fixtures/inference_request.json"))
        response = build_inference_response(
            request,
            {"model_ref": MODEL_REF, "architecture": "mlp"},
            decision="hold_for_operator_review",
            confidence=0.82,
        )
        self.assertEqual(response["request_id"], "fixture-request-001")
        self.assertEqual(response["application"], "gal-model-fixture")
        self.assertTrue(response["escalate_for_deeper_review"])
        self.assertTrue(response["advisory_only"])

    def test_benchmark_registry_tracks_competitive_landscape(self) -> None:
        registry = json.loads(Path("benchmarks/registry.json").read_text(encoding="utf-8"))
        self.assertEqual(registry["registry_version"], "gal-benchmark-registry/v0")
        self.assertGreaterEqual(len(registry["baseline_systems"]), 4)
        benchmark_ids = {item["id"] for item in registry["benchmark_suites"]}
        self.assertIn("gal_native_runtime_governance", benchmark_ids)
        self.assertIn("agentharm", benchmark_ids)
        for item in registry["baseline_systems"]:
            self.assertTrue(item["source_url"].startswith(("https://", "docs/")))

    def test_runtime_benchmark_loads_smoke_cases(self) -> None:
        cases = load_cases(Path("benchmarks/fixtures/runtime-governance-smoke.jsonl"))
        self.assertEqual(len(cases), 5)
        self.assertFalse(cases[-1]["expected"]["schema_valid"])

    def test_llm_baseline_response_parser_extracts_json_payload(self) -> None:
        parsed = parse_baseline_response(
            '```json\n{"decision":"hold_for_operator_review","confidence":0.81,"escalate_for_deeper_review":true}\n```'
        )
        self.assertEqual(parsed["decision"], "hold_for_operator_review")
        self.assertAlmostEqual(parsed["confidence"], 0.81)
        self.assertTrue(parsed["escalate_for_deeper_review"])

    def test_llm_baseline_sampler_keeps_both_decision_classes(self) -> None:
        cases = load_cases(Path("benchmarks/fixtures/runtime-governance-smoke.jsonl"))
        sample = sample_cases(cases, max_cases=4, seed=7)
        decisions = {case["expected"]["decision"] for case in sample if case["expected"].get("schema_valid", True)}
        self.assertEqual(len(sample), 4)
        self.assertEqual(decisions, {"clear_for_operator_review", "hold_for_operator_review"})

    def test_openai_baseline_extracts_message_content(self) -> None:
        text = _extract_openai_text(
            {
                "choices": [
                    {
                        "message": {
                            "content": '{"decision":"clear_for_operator_review","confidence":0.91}'
                        }
                    }
                ]
            }
        )
        self.assertIn("clear_for_operator_review", text)

    def test_openai_baseline_unwraps_runpod_output(self) -> None:
        payload = _unwrap_runpod_output(
            {
                "status": "COMPLETED",
                "output": {
                    "choices": [
                        {
                            "message": {
                                "content": '{"decision":"hold_for_operator_review","confidence":0.81}'
                            }
                        }
                    ]
                },
            }
        )
        text = _extract_openai_text(payload)
        self.assertIn("hold_for_operator_review", text)

    def test_openai_baseline_derives_runpod_status_endpoint(self) -> None:
        endpoint = "https://api.runpod.ai/v2/abc123/runsync"
        self.assertEqual(
            _runpod_status_endpoint(endpoint, "request-1"),
            "https://api.runpod.ai/v2/abc123/status/request-1",
        )

    def test_openai_baseline_uses_raw_runpod_auth_header(self) -> None:
        self.assertEqual(
            _build_headers(api_key="token-123", is_runpod=True),
            {"content-type": "application/json", "authorization": "token-123"},
        )
        self.assertEqual(
            _build_headers(api_key="token-123", is_runpod=False),
            {"content-type": "application/json", "authorization": "Bearer token-123"},
        )

    def test_runpod_preflight_derives_related_urls(self) -> None:
        endpoint = "https://api.runpod.ai/v2/abc123/runsync"
        self.assertEqual(_runpod_endpoint_prefix(endpoint), "https://api.runpod.ai/v2/abc123")
        self.assertEqual(_runpod_async_endpoint(endpoint), "https://api.runpod.ai/v2/abc123/run")
        self.assertEqual(_runpod_health_endpoint(endpoint), "https://api.runpod.ai/v2/abc123/health")

    def test_runtime_case_sampler_reports_balanced_decisions(self) -> None:
        sample, decision_counts = build_sample(
            Path("benchmarks/fixtures/runtime-governance-smoke.jsonl"),
            max_cases=4,
            seed=7,
        )
        self.assertEqual(len(sample), 4)
        self.assertLessEqual(sum(decision_counts.values()), 4)
        self.assertGreaterEqual(sum(decision_counts.values()), 2)
        self.assertIn("clear_for_operator_review", decision_counts)
        self.assertIn("hold_for_operator_review", decision_counts)

    def test_compare_benchmarks_summarizes_latency_and_match_rate(self) -> None:
        left = {
            "benchmark": "gal_native_runtime_governance",
            "cases": 2,
            "case_results": [
                {"expected_decision": "clear_for_operator_review", "passed": True},
                {"expected_decision": "hold_for_operator_review", "passed": True},
            ],
            "false_clear_rate": 0.0,
            "false_hold_rate": 0.0,
            "operator_review_recall": 1.0,
            "escalation_precision": 1.0,
            "p50_latency_ms": 0.02,
            "p95_latency_ms": 0.03,
            "errors": [],
        }
        right = {
            "benchmark": "gal_native_runtime_governance_openai_baseline",
            "cases": 2,
            "case_results": [
                {"expected_decision": "clear_for_operator_review", "passed": True},
                {"expected_decision": "hold_for_operator_review", "passed": False},
            ],
            "false_clear_rate": 0.0,
            "false_hold_rate": 0.5,
            "operator_review_recall": 0.5,
            "escalation_precision": 0.5,
            "p50_latency_ms": 20.0,
            "p95_latency_ms": 25.0,
            "errors": [],
        }
        summary = compare_payloads(left, right, left_label="ours", right_label="baseline")
        self.assertEqual(summary["faster_label"], "ours")
        self.assertEqual(summary["ours"]["decision_match_rate"], 1.0)
        self.assertEqual(summary["baseline"]["decision_match_rate"], 0.5)
        self.assertGreater(summary["latency_ratio_p50"], 100.0)

    def test_compare_benchmarks_ignores_failed_zero_latency_baseline(self) -> None:
        left = {
            "benchmark": "gal_native_runtime_governance",
            "cases": 1,
            "case_results": [{"expected_decision": "clear_for_operator_review", "passed": True}],
            "false_clear_rate": 0.0,
            "false_hold_rate": 0.0,
            "operator_review_recall": 1.0,
            "escalation_precision": 1.0,
            "p50_latency_ms": 0.02,
            "p95_latency_ms": 0.03,
            "errors": [],
        }
        right = {
            "benchmark": "gal_native_runtime_governance_openai_baseline",
            "cases": 1,
            "case_results": [{"passed": False, "error": "endpoint not found"}],
            "false_clear_rate": 0.0,
            "false_hold_rate": 0.0,
            "operator_review_recall": 0.0,
            "escalation_precision": 1.0,
            "p50_latency_ms": 0.0,
            "p95_latency_ms": 0.0,
            "errors": ["endpoint not found"],
        }
        summary = compare_payloads(left, right, left_label="ours", right_label="baseline")
        self.assertIsNone(summary["faster_label"])
        self.assertIsNone(summary["latency_ratio_p50"])

    def test_audit_dataset_builder_writes_train_manifest_and_runtime_cases(self) -> None:
        events = load_audit_events(Path("data/fixtures/audit_events.jsonl"))
        with tempfile.TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir)
            summary = build_dataset(
                events,
                output_dir,
                dataset_ref="gal-dataset://governance-decision/v0/unit",
                source_lane="synthetic_fixture",
                reviewer_status="fixture_smoke",
            )
            manifest_result = validate_manifest(output_dir / "dataset-manifest.json")
            train_examples = load_examples(output_dir / "train.jsonl")
            benchmark_cases = load_cases(output_dir / "runtime-benchmark.jsonl")

        self.assertEqual(summary["events"], 8)
        self.assertTrue(manifest_result["passed"], manifest_result["errors"])
        self.assertEqual(len(train_examples), 4)
        self.assertEqual(len(benchmark_cases), 4)

    def test_audit_dataset_builder_rejects_raw_evidence_fields(self) -> None:
        with self.assertRaisesRegex(ValueError, "disallowed"):
            reject_disallowed_keys({"raw_evidence": {"text": "private"}}, context="unit")

    def test_audit_dataset_builder_rejects_extra_event_fields(self) -> None:
        event = load_audit_events(Path("data/fixtures/audit_events.jsonl"))[0]
        event["metadata"] = {}
        with self.assertRaisesRegex(ValueError, "unsupported audit event fields"):
            build_dataset(
                [event],
                Path("tmp/not-written"),
                dataset_ref="gal-dataset://governance-decision/v0/unit",
                source_lane="synthetic_fixture",
                reviewer_status="fixture_smoke",
            )

    def test_governance_adapter_applies_review_overrides(self) -> None:
        rows = load_governance_rows(Path("data/fixtures/governance_ledger_entries.jsonl"))
        reviews = load_review_rows(Path("data/fixtures/governance_review_entries.jsonl"))
        events, summary = convert_governance_rows(
            rows,
            ratios={"train": 0, "validation": 100, "test": 0},
            application="unit-governance-reviewed",
            reviews=reviews,
            reviewed_only=True,
        )
        self.assertEqual(len(events), 2)
        self.assertEqual(summary["review_rows"], 2)
        self.assertEqual(summary["reviewed_events"], 2)
        self.assertEqual(summary["review_overrides"], 1)
        decisions = {event["event_id"]: event["outcome"]["decision"] for event in events}
        self.assertEqual(decisions["gal-code-governance-session-1-tool-1"], "clear_for_operator_review")
        self.assertEqual(decisions["gal-code-governance-session-2-tool-2"], "clear_for_operator_review")

    def test_governance_adapter_rejects_unmatched_review_rows(self) -> None:
        rows = load_governance_rows(Path("data/fixtures/governance_ledger_entries.jsonl"))
        reviews = {
            ("session-x", "tool-x"): {
                "session_id": "session-x",
                "call_id": "tool-x",
                "feedback": "correct",
            }
        }
        with self.assertRaisesRegex(ValueError, "did not match governance decisions"):
            convert_governance_rows(
                rows,
                ratios={"train": 100, "validation": 0, "test": 0},
                application="unit-governance-reviewed",
                reviews=reviews,
            )

    def test_governance_adapter_loads_rows_from_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            root.joinpath("part-a.jsonl").write_text(
                Path("data/fixtures/governance_ledger_entries.jsonl").read_text(encoding="utf-8").splitlines()[0] + "\n",
                encoding="utf-8",
            )
            nested = root / "nested"
            nested.mkdir()
            nested.joinpath("part-b.jsonl").write_text(
                "\n".join(Path("data/fixtures/governance_ledger_entries.jsonl").read_text(encoding="utf-8").splitlines()[1:]) + "\n",
                encoding="utf-8",
            )
            rows = load_governance_rows(root)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]["call_id"], "tool-1")
        self.assertEqual(rows[-1]["call_id"], "tool-2")

    def test_governance_review_rows_load_from_directory(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            lines = Path("data/fixtures/governance_review_entries.jsonl").read_text(encoding="utf-8").splitlines()
            root.joinpath("review-a.jsonl").write_text(lines[0] + "\n", encoding="utf-8")
            root.joinpath("review-b.jsonl").write_text(lines[1] + "\n", encoding="utf-8")
            reviews = load_review_rows(root)
        self.assertEqual(len(reviews), 2)
        self.assertIn(("session-1", "tool-1"), reviews)
        self.assertIn(("session-2", "tool-2"), reviews)

    def test_session_audit_adapter_converts_gal_api_response(self) -> None:
        entries = load_session_audit_entries(Path("data/fixtures/session_audit_entries.json"))
        events = convert_entries(entries, split="train", application="unit-session-audit")
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["outcome"]["decision"], "clear_for_operator_review")
        self.assertEqual(events[1]["outcome"]["decision"], "hold_for_operator_review")
        self.assertEqual(events[1]["features"]["operator_review_required"], True)
        self.assertNotIn("toolInput", json.dumps(events))

    def test_session_audit_contract_validates_fixture_response(self) -> None:
        payload = json.loads(Path("data/fixtures/session_audit_entries.json").read_text(encoding="utf-8"))
        response = validate_session_audit_log_response(payload, context="fixture")
        self.assertEqual(response["total"], 2)
        self.assertEqual(response["entries"][1]["policyAction"], "denied")
        self.assertAlmostEqual(response["tokenUsage"]["estimatedCost"], 0.0012)

    def test_session_audit_adapter_loads_payload_metadata(self) -> None:
        payload = load_session_audit_payload(Path("data/fixtures/session_audit_entries.json"))
        self.assertEqual(payload["offset"], 0)
        self.assertEqual(payload["entries"][0]["toolCallNumber"], 1)
        self.assertTrue("tokenUsage" in payload)

    def test_session_archive_adapter_converts_archive_pairs(self) -> None:
        entries = load_session_archive_entries(Path("data/fixtures/session_archive_entries.ndjson"))
        events = convert_archive_entries(
            entries,
            split="validation",
            application="unit-session-archive",
            org_name="gal-run",
            session_id="session-archive-1",
        )
        self.assertEqual(len(events), 4)
        self.assertEqual(events[0]["outcome"]["decision"], "clear_for_operator_review")
        self.assertEqual(events[1]["outcome"]["decision"], "hold_for_operator_review")
        self.assertTrue(events[2]["features"]["operator_review_required"])
        self.assertEqual(events[3]["event_id"], "session-archive-gal-run-session-archive-1-terminal")
        self.assertNotIn("toolInput", json.dumps(events))
        self.assertNotIn("gh auth login", json.dumps(events))

    def test_trainable_trace_adapter_converts_richer_closed_loop_trace(self) -> None:
        traces = load_trainable_traces(Path("data/fixtures/trainable_trace_records.jsonl"))
        events, summaries = convert_traces(
            traces,
            ratios={"train": 0, "validation": 100, "test": 0},
            application="unit-trainable-trace",
        )
        self.assertEqual(len(traces), 1)
        self.assertEqual(len(events), 4)
        self.assertEqual(len(summaries), 1)
        self.assertEqual(summaries[0]["split"], "validation")
        self.assertEqual(summaries[0]["project_context"], "gal-run/gal-code")
        self.assertEqual(events[0]["application"], "unit-trainable-trace")
        self.assertEqual(events[-1]["event_id"], "session-archive-gal-run-trace-session-1-terminal")

    def test_gal_code_governance_adapter_converts_decision_rows(self) -> None:
        rows = load_governance_rows(Path("data/fixtures/governance_ledger_entries.jsonl"))
        events, summary = convert_governance_rows(
            rows,
            ratios={"train": 100, "validation": 0, "test": 0},
            application="unit-gal-code-governance",
        )
        self.assertEqual(len(rows), 3)
        self.assertEqual(len(events), 2)
        self.assertEqual(summary["decision_rows"], 2)
        self.assertEqual(summary["result_rows"], 1)
        self.assertEqual(summary["blocked_decisions"], 1)
        self.assertEqual(events[0]["outcome"]["decision"], "clear_for_operator_review")
        self.assertEqual(events[1]["outcome"]["decision"], "hold_for_operator_review")
        self.assertEqual(events[0]["split"], "train")

    def test_build_reviewed_governance_dataset_bundle_writes_bundle_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            ledger_dir = tmp_path / "governance"
            review_dir = tmp_path / "reviews"
            output_dir = tmp_path / "bundle"
            ledger_dir.mkdir()
            review_dir.mkdir()
            (ledger_dir / "session-a.jsonl").write_text(
                Path("data/fixtures/governance_ledger_entries.jsonl").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            (review_dir / "review-a.jsonl").write_text(
                Path("data/fixtures/governance_review_entries.jsonl").read_text(encoding="utf-8"),
                encoding="utf-8",
            )

            summary = build_reviewed_dataset_bundle(
                ledger_path=ledger_dir,
                reviews_path=review_dir,
                output_dir=output_dir,
                dataset_ref="gal-dataset://governance-decision/v0/unit-reviewed-bundle",
                application="unit-reviewed-bundle",
                ratios={"train": 0, "validation": 100, "test": 0},
                source_lane="gal_code_governance_ledger_reviewed",
                reviewer_status="human_reviewed",
                benchmark_splits=("validation",),
            )

            self.assertEqual(summary["events"], 2)
            self.assertEqual(summary["reviewed_events"], 2)
            self.assertEqual(summary["review_overrides"], 1)
            self.assertTrue((output_dir / "audit-events.jsonl").exists())
            self.assertTrue((output_dir / "adapter-summary.json").exists())
            self.assertTrue((output_dir / "dataset-manifest.json").exists())
            self.assertTrue((output_dir / "build-summary.json").exists())
            self.assertTrue((output_dir / "reviewed-dataset-summary.json").exists())

            manifest = json.loads((output_dir / "dataset-manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["reviewer_status"], "human_reviewed")
            self.assertEqual(manifest["source_lanes"], ["gal_code_governance_ledger_reviewed"])
            validate_manifest(output_dir / "dataset-manifest.json")

    def test_huggingface_publish_lists_non_hidden_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            root.joinpath("gal-governance-decision.onnx").write_text("artifact", encoding="utf-8")
            root.joinpath(".hidden").write_text("skip", encoding="utf-8")
            nested = root / "nested"
            nested.mkdir()
            nested.joinpath("runtime-artifact.json").write_text("{}", encoding="utf-8")
            files = list_publishable_files(root)
        self.assertEqual(files, ["gal-governance-decision.onnx", "nested/runtime-artifact.json"])

    def test_build_publish_bundle_writes_manifest_and_readme(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            artifact_dir = tmp_path / "artifacts"
            output_dir = tmp_path / "publish"
            artifact_dir.mkdir()
            artifact_dir.joinpath("gal-governance-decision.onnx").write_text("artifact", encoding="utf-8")
            artifact_dir.joinpath("runtime-artifact.json").write_text("{}", encoding="utf-8")

            summary = build_publish_bundle(
                artifact_dir=artifact_dir,
                output_dir=output_dir,
                model_card=Path("model_cards/gal-governance-decision-v0.md"),
            )

            self.assertEqual(summary["benchmark_count"], 0)
            self.assertFalse(summary["checkpoint_included"])
            self.assertTrue((output_dir / "README.md").exists())
            self.assertTrue((output_dir / "publish-manifest.json").exists())
            manifest = json.loads((output_dir / "publish-manifest.json").read_text(encoding="utf-8"))
            self.assertFalse(manifest["reviewed_data_embedded"])
            self.assertIn("README.md", manifest["copied_files"])
            self.assertIn("gal-governance-decision.onnx", manifest["copied_files"])

    def test_kaggle_model_staging_writes_metadata_and_copies_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            source_dir = tmp_path / "source"
            staging_dir = tmp_path / "staging"
            source_dir.mkdir()
            source_dir.joinpath("gal-governance-decision.onnx").write_text("artifact", encoding="utf-8")
            source_dir.joinpath("runtime-artifact.json").write_text("{}", encoding="utf-8")

            args = type(
                "Args",
                (),
                {
                    "source_dir": source_dir,
                    "staging_dir": staging_dir,
                    "owner_slug": "fixture-owner",
                    "model_slug": "gal-governance-decision",
                    "title": "GAL Governance Decision",
                    "instance_slug": "onnx-sidecar",
                    "framework": "onnx",
                    "license_name": "Apache 2.0",
                    "subtitle": "",
                    "overview": "Fixture overview",
                    "description_file": Path("model_cards/gal-governance-decision-v0.md"),
                    "usage_file": None,
                    "training_data": ["gal-dataset://governance-decision/v0/reviewed"],
                    "visibility": "private",
                    "skip_model_create": False,
                    "execute": False,
                },
            )()

            summary = stage_kaggle_bundle(args)
            model_metadata = json.loads((staging_dir / "model-metadata.json").read_text(encoding="utf-8"))
            instance_metadata = json.loads((staging_dir / "model-instance-metadata.json").read_text(encoding="utf-8"))

            self.assertEqual(summary["copied_file_count"], 2)
            self.assertTrue((staging_dir / "gal-governance-decision.onnx").exists())
            self.assertEqual(model_metadata["slug"], "gal-governance-decision")
            self.assertTrue(model_metadata["isPrivate"])
            self.assertEqual(instance_metadata["framework"], "onnx")
            self.assertEqual(instance_metadata["trainingData"], ["gal-dataset://governance-decision/v0/reviewed"])

    def test_gal_api_session_export_split_is_deterministic(self) -> None:
        ratios = validate_split_ratios(80, 10, 10)
        self.assertEqual(assign_split("session-123", ratios), assign_split("session-123", ratios))
        self.assertIn(assign_split("session-456", ratios), {"train", "validation", "test"})

    def test_gal_api_session_export_requires_non_empty_session_ids(self) -> None:
        with self.assertRaisesRegex(ValueError, "at least one"):
            read_session_ids([], None)

    def test_gal_api_session_export_discovers_archived_sessions_across_cursor_pages(self) -> None:
        payloads = [
            {
                "sessions": [
                    {
                        "id": "sess-1",
                        "status": "TERMINATED",
                        "metadata": {
                            "eventArchive": {
                                "storagePath": "sessions/sess-1/events.jsonl",
                                "eventCount": 4,
                            }
                        },
                    },
                    {
                        "id": "sess-2",
                        "status": "RUNNING",
                        "metadata": {
                            "eventArchive": {
                                "storagePath": "sessions/sess-2/events.jsonl",
                            }
                        },
                    },
                ],
                "hasMore": True,
                "cursor": "sess-2",
            },
            {
                "sessions": [
                    {
                        "id": "sess-3",
                        "status": "COMPLETED",
                        "metadata": {
                            "eventArchive": {
                                "storagePath": "sessions/sess-3/events.jsonl",
                                "eventCount": 2,
                            }
                        },
                    },
                    {
                        "id": "sess-4",
                        "status": "FAILED",
                        "metadata": {
                            "eventArchive": {
                                "storagePath": "sessions/sess-4/events.jsonl",
                                "eventCount": 1,
                            }
                        },
                    },
                ],
                "hasMore": False,
                "cursor": None,
            },
        ]

        with patch("gal_model.gal_api_session_export._json_request", side_effect=payloads) as mock_request:
            discovered = discover_archived_sessions(
                base_url="https://gal.example.test",
                org="fixture-org",
                bearer_token="test-token",
                limit=3,
            )

        self.assertEqual([item["id"] for item in discovered], ["sess-1", "sess-3", "sess-4"])
        self.assertEqual(mock_request.call_count, 2)

    def test_gal_api_session_export_builds_lineage_summary(self) -> None:
        summary = build_export_summary(
            base_url="https://gal.example.test",
            org="fixture-org",
            application="gal-session-audit",
            dataset_ref="gal-dataset://governance-decision/v0/fixture",
            source_lane="canonical_gal_structured_dataset",
            reviewer_status="human_reviewed",
            ratios={"train": 80, "validation": 10, "test": 10},
            session_summaries=[
                {
                    "session_id": "sess-1",
                    "source_type": "gal_api_session_audit_log",
                    "split": "train",
                    "entries": 2,
                    "events": 2,
                    "policy_action_counts": {"allowed": 1, "denied": 1, "audited": 0},
                    "error_count": 0,
                    "token_usage_present": True,
                    "token_usage": {
                        "totalInputTokens": 100,
                        "totalOutputTokens": 40,
                        "estimatedCost": 0.002,
                    },
                }
            ],
            session_source_mode="auto",
        )
        self.assertEqual(summary["source_type"], "gal_api_session_audit_log")
        self.assertEqual(summary["session_source_mode"], "auto")
        self.assertEqual(summary["totals"]["sessions"], 1)
        self.assertEqual(summary["totals"]["policy_action_counts"]["denied"], 1)
        self.assertAlmostEqual(summary["totals"]["token_usage"]["estimatedCost"], 0.002)
        self.assertTrue(summary["advisory_only"])

    def test_runpod_training_script_runs_cuda_preflight_before_training(self) -> None:
        script = Path("scripts/runpod/train_gal_sidecar.sh").read_text(encoding="utf-8")
        preflight_index = script.index("-m gal_model.cuda_preflight")
        train_index = script.index("-m gal_model.train")
        install_index = script.index('if [[ "${INSTALL_PROJECT}" == "1" ]]')
        self.assertLess(preflight_index, install_index)
        self.assertLess(preflight_index, train_index)
        self.assertIn('STOP_AFTER_CUDA_PREFLIGHT="${STOP_AFTER_CUDA_PREFLIGHT:-0}"', script)
        self.assertIn('if [[ "${STOP_AFTER_CUDA_PREFLIGHT}" == "1" ]]', script)

    def test_runpod_pod_creation_script_is_dry_run_by_default(self) -> None:
        script = Path("scripts/runpod/create_sidecar_pod.sh").read_text(encoding="utf-8")
        self.assertIn("CREATE=0", script)
        self.assertIn('CONFIRM_RUNPOD_SPEND:-}" != "YES"', script)
        self.assertIn("DRY_RUN_ONLY: no pod created", script)

    def test_runtime_benchmark_reports_governance_metrics(self) -> None:
        cases = [
            {
                "case_id": "unit-clear",
                "request": {
                    "request_id": "unit-clear",
                    "application": "unit",
                    "evidence_ref": "fixture://unit/clear",
                    "features": {
                        "people_present": False,
                        "vehicles_present": False,
                        "obstacles_present": False,
                        "evidence_complete": True,
                        "operator_review_required": False,
                        "latency_measured": True,
                        "approval_refs_complete": True,
                        "detection_count": 0,
                    },
                },
                "expected": {
                    "schema_valid": True,
                    "decision": "clear_for_operator_review",
                    "escalate_for_deeper_review": False,
                },
            },
            {
                "case_id": "unit-invalid",
                "request": {
                    "request_id": "unit-invalid",
                    "application": "unit",
                    "evidence_ref": "fixture://unit/invalid",
                    "features": {
                        "people_present": False,
                        "vehicles_present": False,
                        "obstacles_present": False,
                        "evidence_complete": True,
                        "operator_review_required": False,
                        "latency_measured": True,
                        "detection_count": 0,
                    },
                },
                "expected": {"schema_valid": False},
            },
        ]
        model = GalGovernanceDecisionNet()
        result = run_benchmark(
            model,
            {"model_ref": MODEL_REF, "architecture": "mlp"},
            cases,
            device=resolve_device("cpu"),
        )
        self.assertEqual(result["benchmark"], "gal_native_runtime_governance")
        self.assertEqual(result["valid_cases"], 1)
        self.assertEqual(result["invalid_cases"], 1)
        self.assertEqual(result["schema_rejection_rate"], 1.0)
        self.assertIn("false_clear_rate", result)


    # ── GitHub PR review adapter ──────────────────────────────────────────

    def test_is_bot_detects_bot_users(self) -> None:
        self.assertTrue(_is_bot({"login": "dependabot[bot]", "type": "Bot"}))
        self.assertTrue(_is_bot({"login": "github-actions[bot]", "type": "Bot"}))
        self.assertFalse(_is_bot({"login": "dev-alice", "type": "User"}))
        self.assertFalse(_is_bot(None))

    def test_review_approval_count_excludes_bots(self) -> None:
        reviews = [
            {"user": {"login": "reviewer-tom", "type": "User"}, "state": "APPROVED"},
            {"user": {"login": "ci-bot[bot]", "type": "Bot"}, "state": "APPROVED"},
            {"user": {"login": "reviewer-sue", "type": "User"}, "state": "CHANGES_REQUESTED"},
        ]
        self.assertEqual(_review_approval_count(reviews), 1)

    def test_assign_split_deterministic_distribution(self) -> None:
        splits = [assign_pr_split(i, train_r=70, val_r=20, test_r=10) for i in range(100)]
        self.assertGreater(splits.count("train"), 55)
        self.assertGreater(splits.count("validation"), 10)
        self.assertGreater(splits.count("test"), 5)

    def test_normalized_event_merged_with_approvals_is_clear(self) -> None:
        pr = {
            "number": 1,
            "html_url": "https://github.com/o/r/pull/1",
            "merged_at": "2025-06-15T10:00:00Z",
            "created_at": "2025-06-14T08:00:00Z",
            "closed_at": "2025-06-15T10:00:00Z",
            "draft": False,
            "changed_files": 3,
            "user": {"login": "dev", "type": "User"},
            "base": {"repo": {"full_name": "o/r"}},
        }
        reviews = [
            {"user": {"login": "rev1", "type": "User"}, "state": "APPROVED"},
            {"user": {"login": "rev2", "type": "User"}, "state": "APPROVED"},
        ]
        checks = [{"name": "CI", "conclusion": "success"}]
        event = normalized_event_from_pr(pr, reviews, checks, split="train", application="test")
        self.assertEqual(event["outcome"]["decision"], "clear_for_operator_review")
        self.assertFalse(event["features"]["operator_review_required"])
        self.assertTrue(event["features"]["evidence_complete"])
        self.assertTrue(event["features"]["approval_refs_complete"])
        self.assertTrue(event["features"]["people_present"])

    def test_normalized_event_changes_requested_is_hold(self) -> None:
        pr = {
            "number": 2,
            "html_url": "https://github.com/o/r/pull/2",
            "merged_at": None,
            "created_at": "2025-06-13T12:00:00Z",
            "closed_at": "2025-06-14T14:00:00Z",
            "draft": False,
            "changed_files": 12,
            "user": {"login": "dev", "type": "User"},
            "base": {"repo": {"full_name": "o/r"}},
        }
        reviews = [
            {"user": {"login": "rev1", "type": "User"}, "state": "CHANGES_REQUESTED"},
        ]
        checks = [{"name": "CI", "conclusion": "failure"}]
        event = normalized_event_from_pr(pr, reviews, checks, split="validation", application="test")
        self.assertEqual(event["outcome"]["decision"], "hold_for_operator_review")
        self.assertTrue(event["outcome"]["escalate_for_deeper_review"])
        self.assertTrue(event["features"]["obstacles_present"])
        self.assertTrue(event["features"]["operator_review_required"])

    def test_normalized_event_draft_bot_pr_is_hold(self) -> None:
        pr = {
            "number": 4,
            "html_url": "https://github.com/o/r/pull/4",
            "merged_at": None,
            "created_at": "2025-06-14T08:00:00Z",
            "closed_at": "2025-06-14T16:00:00Z",
            "draft": True,
            "changed_files": 5,
            "user": {"login": "dependabot[bot]", "type": "Bot"},
            "base": {"repo": {"full_name": "o/r"}},
        }
        reviews = [
            {"user": {"login": "dependabot[bot]", "type": "Bot"}, "state": "APPROVED"},
        ]
        checks: list[dict] = []
        event = normalized_event_from_pr(pr, reviews, checks, split="test", application="test")
        self.assertEqual(event["outcome"]["decision"], "hold_for_operator_review")
        self.assertTrue(event["features"]["vehicles_present"])
        self.assertFalse(event["features"]["people_present"])
        self.assertFalse(event["features"]["evidence_complete"])

    def test_normalized_event_single_approval_no_failures_is_clear(self) -> None:
        pr = {
            "number": 3,
            "html_url": "https://github.com/o/r/pull/3",
            "merged_at": "2025-06-16T09:00:00Z",
            "created_at": "2025-06-15T10:00:00Z",
            "closed_at": "2025-06-16T09:00:00Z",
            "draft": False,
            "changed_files": 1,
            "user": {"login": "dev", "type": "User"},
            "base": {"repo": {"full_name": "o/r"}},
        }
        reviews = [
            {"user": {"login": "rev1", "type": "User"}, "state": "APPROVED"},
        ]
        checks = [{"name": "CI", "conclusion": "success"}]
        event = normalized_event_from_pr(pr, reviews, checks, split="train", application="test")
        self.assertEqual(event["outcome"]["decision"], "clear_for_operator_review")
        self.assertEqual(event["features"]["detection_count"], 1)

    def test_mock_adapter_smoke_produces_events(self) -> None:
        from gal_model.github_pr_review_adapter import main as adapter_main

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "events.jsonl"
            rc = adapter_main(
                [
                    "--repos", "fixture-org/test-repo",
                    "--mock", "data/fixtures/github_pr_reviews.json",
                    "--output", str(output),
                    "--train-ratio", "60",
                    "--validation-ratio", "20",
                    "--test-ratio", "20",
                ]
            )
            self.assertEqual(rc, 0)
            events = [json.loads(line) for line in output.read_text().splitlines() if line.strip()]
            self.assertEqual(len(events), 5)
            decisions = {e["outcome"]["decision"] for e in events}
            self.assertEqual(decisions, {"clear_for_operator_review", "hold_for_operator_review"})


# ── gal-model#44: unified runtime-tagged audit/output contract ───────────────

from gal_model.multi_agent_audit_contract import (
    RECORD_TYPE_GOVERNANCE_DECISION,
    RECORD_TYPE_SESSION_OUTPUT,
    RUNTIME_CLAUDE_CODE,
    RUNTIME_UNKNOWN,
    VALID_RUNTIME_TYPES,
    coerce_runtime_record_payload,
    lift_legacy_audit_entry,
    validate_runtime_record,
    validate_runtime_record_response,
)
from gal_model.multi_agent_runtime_adapters import (
    adapt_claude_code_transcript,
    adapt_codex_transcript,
    adapt_cursor_transcript,
    load_transcript_lines,
    normalized_events_from_runtime_records,
)
from gal_model.governance_sidecar_service import LazySidecar, build_server, dispatch
from gal_model.governance_eval import (
    evaluate_session_output,
    evaluate_session_outputs,
)
from gal_model.governance_eval_worker import (
    build_verdict_body,
    compact_scored_decisions,
    run_once,
)


_LEGACY_AUDIT_ENTRY = {
    "id": "tool-deny-001",
    "sessionId": "fixture-session",
    "orgName": "fixture-org",
    "toolName": "Bash",
    "toolInput": {"command": "rm -rf /"},
    "isError": False,
    "durationMs": 11,
    "policyAction": "denied",
    "policyReason": "Tool policy denied this command.",
    "matchedPolicyId": "policy-fixture-deny",
    "timestamp": "2026-05-21T00:00:01.000Z",
    "toolCallNumber": 2,
}


class MultiAgentAuditContractTest(unittest.TestCase):
    def test_lift_legacy_audit_entry_is_lossless_and_wraps_envelope(self) -> None:
        record = lift_legacy_audit_entry(_LEGACY_AUDIT_ENTRY)
        self.assertEqual(record["recordType"], RECORD_TYPE_GOVERNANCE_DECISION)
        self.assertEqual(record["runtimeType"], RUNTIME_CLAUDE_CODE)
        # Renames: orgId<-orgName, ts<-timestamp.
        self.assertEqual(record["orgId"], "fixture-org")
        self.assertEqual(record["ts"], "2026-05-21T00:00:01.000Z")
        self.assertEqual(record["id"], "tool-deny-001")
        decision = record["decision"]
        self.assertEqual(decision["policyAction"], "denied")
        self.assertEqual(decision["matchedPolicyId"], "policy-fixture-deny")
        self.assertEqual(decision["toolCallNumber"], 2)
        self.assertEqual(decision["toolInput"], {"command": "rm -rf /"})

    def test_lifted_legacy_entry_round_trips_through_validator(self) -> None:
        record = lift_legacy_audit_entry(_LEGACY_AUDIT_ENTRY)
        validated = validate_runtime_record(record, context="round-trip")
        self.assertEqual(validated, record)

    def test_runtime_type_absent_defaults_to_unknown(self) -> None:
        # runtimeType is additive: an envelope without it validates (unknown).
        record = {
            "recordType": RECORD_TYPE_GOVERNANCE_DECISION,
            "id": "r1",
            "sessionId": "s1",
            "orgId": "o1",
            "ts": "2026-06-02T00:00:00.000Z",
            "decision": {
                "toolName": "Read",
                "toolCallNumber": 1,
                "isError": False,
                "durationMs": 5,
                "policyAction": "allowed",
                "toolInput": {"path": "x"},
            },
        }
        validated = validate_runtime_record(record, context="no-runtime")
        self.assertEqual(validated["runtimeType"], RUNTIME_UNKNOWN)

    def test_orgname_and_timestamp_aliases_accepted_on_input(self) -> None:
        record = {
            "recordType": RECORD_TYPE_GOVERNANCE_DECISION,
            "runtimeType": RUNTIME_CLAUDE_CODE,
            "id": "r1",
            "sessionId": "s1",
            "orgName": "alias-org",
            "timestamp": "2026-06-02T00:00:00.000Z",
            "decision": {
                "toolName": "Read",
                "toolCallNumber": 1,
                "isError": False,
                "durationMs": 5,
                "policyAction": "allowed",
                "toolInput": {},
            },
        }
        validated = validate_runtime_record(record, context="aliases")
        self.assertEqual(validated["orgId"], "alias-org")
        self.assertEqual(validated["ts"], "2026-06-02T00:00:00.000Z")

    def test_session_output_drops_raw_content_by_default(self) -> None:
        record = {
            "recordType": RECORD_TYPE_SESSION_OUTPUT,
            "runtimeType": RUNTIME_CLAUDE_CODE,
            "id": "out-1",
            "sessionId": "s1",
            "orgId": "o1",
            "ts": "2026-06-02T00:00:00.000Z",
            "output": {
                "outcome": "complete",
                "turns": [
                    {
                        "turnNumber": 1,
                        "role": "tool",
                        "toolName": "Bash",
                        "toolInput": {"command": "secret stuff"},
                        "toolResult": "raw output text",
                        "text": "assistant said things",
                        "latencyMs": 42,
                    }
                ],
                "evalLabel": {"decision": "clear", "escalate": False},
            },
        }
        default = validate_runtime_record(record, context="no-raw")
        turn = default["output"]["turns"][0]
        self.assertNotIn("toolInput", turn)
        self.assertNotIn("toolResult", turn)
        self.assertNotIn("text", turn)
        self.assertEqual(turn["latencyMs"], 42)

        with_raw = validate_runtime_record(record, context="raw", include_raw_content=True)
        raw_turn = with_raw["output"]["turns"][0]
        self.assertEqual(raw_turn["toolInput"], {"command": "secret stuff"})
        self.assertEqual(raw_turn["toolResult"], "raw output text")
        self.assertEqual(raw_turn["text"], "assistant said things")

    def test_invalid_record_type_and_runtime_rejected(self) -> None:
        with self.assertRaises(ValueError):
            validate_runtime_record(
                {"recordType": "nope", "id": "1", "sessionId": "s", "orgId": "o", "ts": "t"},
                context="bad-type",
            )
        with self.assertRaises(ValueError):
            lift_legacy_audit_entry(_LEGACY_AUDIT_ENTRY, runtime_type="borg")

    def test_response_may_mix_record_types_and_runtimes(self) -> None:
        decision = lift_legacy_audit_entry(_LEGACY_AUDIT_ENTRY)
        output = {
            "recordType": RECORD_TYPE_SESSION_OUTPUT,
            "runtimeType": "codex",
            "id": "out-1",
            "sessionId": "s1",
            "orgId": "o1",
            "ts": "2026-06-02T00:00:00.000Z",
            "output": {
                "outcome": "error",
                "turns": [],
                "evalLabel": {"decision": "hold", "escalate": True},
            },
        }
        response = {
            "records": [decision, output],
            "total": 2,
            "limit": 50,
            "offset": 0,
            "tokenUsage": {"totalInputTokens": 1, "totalOutputTokens": 2, "estimatedCost": 0.0},
        }
        validated = validate_runtime_record_response(response, context="mixed")
        kinds = {r["recordType"] for r in validated["records"]}
        runtimes = {r["runtimeType"] for r in validated["records"]}
        self.assertEqual(kinds, {RECORD_TYPE_GOVERNANCE_DECISION, RECORD_TYPE_SESSION_OUTPUT})
        self.assertEqual(runtimes, {RUNTIME_CLAUDE_CODE, "codex"})
        self.assertEqual(validated["total"], 2)

    def test_coerce_accepts_bare_record_and_list(self) -> None:
        decision = lift_legacy_audit_entry(_LEGACY_AUDIT_ENTRY)
        single = coerce_runtime_record_payload(decision, context="single")
        self.assertEqual(single["total"], 1)
        listed = coerce_runtime_record_payload([decision, decision], context="list")
        self.assertEqual(listed["total"], 2)

    def test_legacy_governance_audit_entry_still_validates_unchanged(self) -> None:
        # Backward-compat: the original validator is untouched and the fixture
        # audit-log response still validates exactly as before.
        payload = json.loads(Path("data/fixtures/session_audit_entries.json").read_text(encoding="utf-8"))
        response = validate_session_audit_log_response(payload, context="legacy")
        self.assertEqual(response["total"], 2)
        # And every legacy entry lifts into the unified envelope.
        for entry in response["entries"]:
            record = lift_legacy_audit_entry(entry)
            validate_runtime_record(record, context=entry["id"])


class ClaudeCodeAdapterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.entries = load_transcript_lines(Path("data/fixtures/claude_code_transcript.jsonl"))

    def test_claude_code_transcript_produces_decisions_plus_one_output(self) -> None:
        records = adapt_claude_code_transcript(
            self.entries, org_id="gal-run", session_id="cc-session-1"
        )
        decisions = [r for r in records if r["recordType"] == RECORD_TYPE_GOVERNANCE_DECISION]
        outputs = [r for r in records if r["recordType"] == RECORD_TYPE_SESSION_OUTPUT]
        # Real-shaped parsing extracts NON-ZERO governance decisions (one per
        # tool_use block), not zero as the old fictional-shape parser did.
        self.assertGreater(len(decisions), 0)
        self.assertEqual(len(decisions), 3)
        self.assertEqual(len(outputs), 1)
        for r in records:
            self.assertEqual(r["runtimeType"], RUNTIME_CLAUDE_CODE)
            self.assertEqual(r["orgId"], "gal-run")
        # git push -> external state change -> audited; rm -rf -> destructive -> audited.
        actions = {d["decision"]["toolName"]: d["decision"]["policyAction"] for d in decisions}
        self.assertEqual(actions["Read"], "allowed")
        self.assertEqual(actions["Bash"], "audited")
        # session_output transcript carries one tool turn per call PLUS the real
        # assistant/user text turns, so "full session output" is genuine.
        output = outputs[0]["output"]
        roles = [t["role"] for t in output["turns"]]
        self.assertEqual(roles.count("tool"), 3)
        self.assertGreater(roles.count("assistant"), 0)
        self.assertGreater(roles.count("user"), 0)
        # Turns stay in conversational order by turnNumber.
        turn_numbers = [t["turnNumber"] for t in output["turns"]]
        self.assertEqual(turn_numbers, sorted(turn_numbers))
        self.assertEqual(output["outcome"], "complete")
        self.assertEqual(output["evalLabel"]["decision"], "hold")  # risky tools present
        # Token usage is read from message.usage (NOT a top-level usage field) and
        # is therefore present and non-None for a real transcript.
        token_usage = output.get("tokenUsage")
        self.assertIsNotNone(token_usage)
        self.assertGreater(token_usage["totalInputTokens"], 0)
        self.assertGreater(token_usage["totalOutputTokens"], 0)

    def test_claude_code_decisions_have_measured_latency(self) -> None:
        # The fixture pairs tool_use/tool_result lines via their RFC3339
        # timestamps, so latency IS measured for every decision and the
        # session_output turn carries a latencyMs.
        records = adapt_claude_code_transcript(
            self.entries, org_id="gal-run", session_id="cc-session-1"
        )
        events = normalized_events_from_runtime_records(
            records, split="train", application="unit-runtime"
        )
        decision_events = [e for e in events if "runtime-decision" in e["event_id"]]
        output_events = [e for e in events if "runtime-output" in e["event_id"]]
        self.assertTrue(decision_events)
        self.assertTrue(all(e["features"]["latency_measured"] for e in decision_events))
        self.assertTrue(all(e["features"]["latency_measured"] for e in output_events))

    def test_claude_code_default_drops_raw_tool_input(self) -> None:
        records = adapt_claude_code_transcript(
            self.entries, org_id="gal-run", session_id="cc-session-1"
        )
        blob = json.dumps(records)
        self.assertNotIn("git push origin main", blob)
        self.assertNotIn("rm -rf build", blob)

    def test_claude_code_records_normalize_to_eight_feature_events(self) -> None:
        records = adapt_claude_code_transcript(
            self.entries, org_id="gal-run", session_id="cc-session-1"
        )
        events = normalized_events_from_runtime_records(
            records, split="train", application="unit-runtime"
        )
        self.assertEqual(len(events), 4)  # 3 decisions + 1 output
        for event in events:
            self.assertEqual(set(event["features"]), {
                "people_present", "vehicles_present", "obstacles_present",
                "evidence_complete", "operator_review_required", "latency_measured",
                "approval_refs_complete", "detection_count",
            })
            self.assertIn(event["outcome"]["decision"], LABELS)
        # And those events feed the unchanged dataset builder.
        with tempfile.TemporaryDirectory() as tmp:
            events_path = Path(tmp) / "events.jsonl"
            events_path.write_text(
                "".join(json.dumps(e, sort_keys=True) + "\n" for e in events), encoding="utf-8"
            )
            loaded = load_audit_events(events_path)
            self.assertEqual(len(loaded), 4)

    def test_codex_transcript_adapter(self) -> None:
        entries = load_transcript_lines(Path("data/fixtures/codex_transcript.jsonl"))
        records = adapt_codex_transcript(entries, org_id="gal-run", session_id="codex-session-1")
        decisions = [r for r in records if r["recordType"] == RECORD_TYPE_GOVERNANCE_DECISION]
        self.assertEqual(len(decisions), 3)
        self.assertEqual(records[0]["runtimeType"], "codex")
        # curl -> external network -> audited; the patch failure text matches an
        # invalid-invocation risk substring -> audited (risk outranks plain error).
        action_list = [d["decision"]["policyAction"] for d in decisions]
        self.assertEqual(action_list, ["allowed", "audited", "audited"])
        names = [d["decision"]["toolName"] for d in decisions]
        self.assertEqual(names, ["shell", "shell", "apply_patch"])

    def test_codex_message_lines_become_assistant_and_user_turns(self) -> None:
        # The codex "message" branch turns role/content lines into assistant/user
        # turns; previously these lines were silently dropped.
        entries = load_transcript_lines(Path("data/fixtures/codex_transcript.jsonl"))
        records = adapt_codex_transcript(entries, org_id="gal-run", session_id="codex-session-1")
        outputs = [r for r in records if r["recordType"] == RECORD_TYPE_SESSION_OUTPUT]
        self.assertEqual(len(outputs), 1)
        turns = outputs[0]["output"]["turns"]
        roles = [t["role"] for t in turns]
        self.assertIn("user", roles)
        self.assertIn("assistant", roles)
        self.assertEqual(roles.count("tool"), 3)
        # Turns are ordered by turnNumber so messages and tool calls interleave.
        turn_numbers = [t["turnNumber"] for t in turns]
        self.assertEqual(turn_numbers, sorted(turn_numbers))

    def test_codex_latency_unmeasured_when_no_timing_data(self) -> None:
        # Codex transcripts carry no per-call timing, so latency is NOT measured:
        # latency_measured must be False on both decision and output events.
        entries = load_transcript_lines(Path("data/fixtures/codex_transcript.jsonl"))
        records = adapt_codex_transcript(entries, org_id="gal-run", session_id="codex-session-1")
        events = normalized_events_from_runtime_records(
            records, split="train", application="unit-runtime"
        )
        self.assertTrue(events)
        self.assertFalse(any(e["features"]["latency_measured"] for e in events))
        # And the decision bodies do NOT falsely claim a measured latency via a
        # non-None (0.0) durationMs.
        decisions = [r for r in records if r["recordType"] == RECORD_TYPE_GOVERNANCE_DECISION]
        for d in decisions:
            self.assertFalse(d["runtimeMeta"]["latencyMeasured"])

    def test_cursor_adapter_is_stubbed(self) -> None:
        with self.assertRaises(NotImplementedError):
            adapt_cursor_transcript([], org_id="o", session_id="s")


def _fake_sidecar() -> dict:
    """A sidecar context with the same shape as load_governance_sidecar(),
    backed by a deterministic fake model so no checkpoint is needed."""

    def score(features: dict, title: str = "") -> dict:
        hold = bool(features.get("operator_review_required"))
        return {
            "decision": "hold_for_operator_review" if hold else "clear_for_operator_review",
            "confidence": 0.99,
            "latency_ms": 0.01,
            "satisfied": True,
            "needs_feedback": False,
            "model_ref": "gal-model://governance-decision/v0",
            "advisory_only": True,
            "physical_action_allowed": False,
            "hardware_commands_issued": False,
        }

    def govern(features: dict, title: str = "") -> dict:
        result = score(features, title)
        result["action"] = "proceed" if result["decision"] == "clear_for_operator_review" else "hold"
        return result

    return {
        "score": score,
        "govern": govern,
        "metadata": {
            "model_ref": "gal-model://governance-decision/v0",
            "architecture": "mlp",
            "input_dim": 8,
            "satisfaction_threshold": 0.85,
            "has_embedder": False,
        },
    }


class GovernanceSidecarServiceTest(unittest.TestCase):
    def setUp(self) -> None:
        self.sidecar = _fake_sidecar()

    def test_health_reports_model_metadata(self) -> None:
        status, payload = dispatch(self.sidecar, method="GET", path="/health", body=None)
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["input_dim"], 8)
        self.assertFalse(payload["physical_action_allowed"])

    def test_score_endpoint_calls_real_sidecar_callable(self) -> None:
        body = {"features": {"operator_review_required": True}, "title": "rm -rf"}
        status, payload = dispatch(self.sidecar, method="POST", path="/score", body=body)
        self.assertEqual(status, 200)
        self.assertEqual(payload["decision"], "hold_for_operator_review")
        self.assertTrue(payload["advisory_only"])

    def test_govern_endpoint_adds_action(self) -> None:
        body = {"features": {"operator_review_required": False}}
        status, payload = dispatch(self.sidecar, method="POST", path="/govern", body=body)
        self.assertEqual(status, 200)
        self.assertEqual(payload["action"], "proceed")

    def test_bad_request_and_unknown_route(self) -> None:
        status, _ = dispatch(self.sidecar, method="POST", path="/score", body={"features": "nope"})
        self.assertEqual(status, 400)
        status, _ = dispatch(self.sidecar, method="GET", path="/nope", body=None)
        self.assertEqual(status, 404)
        status, _ = dispatch(self.sidecar, method="DELETE", path="/score", body=None)
        self.assertEqual(status, 405)

    def test_health_ok_when_model_cannot_load_and_score_returns_503(self) -> None:
        # k8s probe safety: /health must answer 200 with model_loaded=false even
        # when the checkpoint is missing/unloadable, and /score|/govern must then
        # return a clear 503 (not crash the server or never bind).
        def _failing_loader() -> dict:
            raise FileNotFoundError("No GAL model checkpoint found.")

        lazy = LazySidecar(_failing_loader)

        status, payload = dispatch(lazy, method="GET", path="/health", body=None)
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "ok")
        self.assertFalse(payload["model_loaded"])

        body = {"features": {"operator_review_required": True}}
        status, payload = dispatch(lazy, method="POST", path="/score", body=body)
        self.assertEqual(status, 503)
        self.assertIn("unavailable", payload["error"])
        status, payload = dispatch(lazy, method="POST", path="/govern", body=body)
        self.assertEqual(status, 503)

    def test_lazy_sidecar_loads_on_first_score_and_caches(self) -> None:
        # Health does not force a load; the first /score does, and the result is
        # cached (loader invoked exactly once).
        calls = {"n": 0}

        def _loader() -> dict:
            calls["n"] += 1
            return _fake_sidecar()

        lazy = LazySidecar(_loader)
        dispatch(lazy, method="GET", path="/health", body=None)
        self.assertEqual(calls["n"], 0)  # health never loads
        self.assertFalse(lazy.is_loaded)

        body = {"features": {"operator_review_required": False}}
        status, _ = dispatch(lazy, method="POST", path="/score", body=body)
        self.assertEqual(status, 200)
        dispatch(lazy, method="POST", path="/govern", body=body)
        self.assertEqual(calls["n"], 1)  # loaded once, then cached
        self.assertTrue(lazy.is_loaded)
        # Now health reports the loaded model.
        _, health = dispatch(lazy, method="GET", path="/health", body=None)
        self.assertTrue(health["model_loaded"])

    def test_build_server_binds_with_no_checkpoint_and_health_is_200(self) -> None:
        # End-to-end: build the real server with a non-existent checkpoint. The
        # port binds, /health returns 200 with model_loaded=false, and /score 503.
        import os
        import threading
        import urllib.error
        import urllib.request

        old = os.environ.get("GAL_MODEL_PATH")
        os.environ["GAL_MODEL_PATH"] = "/nonexistent/path/to/checkpoint.pt"
        try:
            server = build_server(
                host="127.0.0.1",
                port=0,
                model_path="/nonexistent/path/to/checkpoint.pt",
            )
        finally:
            if old is None:
                os.environ.pop("GAL_MODEL_PATH", None)
            else:
                os.environ["GAL_MODEL_PATH"] = old

        host, port = server.server_address[0], server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urllib.request.urlopen(f"http://{host}:{port}/health", timeout=5) as resp:
                self.assertEqual(resp.status, 200)
                health = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(health["status"], "ok")
            self.assertFalse(health["model_loaded"])

            req = urllib.request.Request(
                f"http://{host}:{port}/score",
                data=json.dumps({"features": {"operator_review_required": True}}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(req, timeout=5)
            self.assertEqual(ctx.exception.code, 503)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)

    def test_build_server_uses_injected_sidecar_end_to_end(self) -> None:
        import threading
        import urllib.request

        server = build_server(host="127.0.0.1", port=0, sidecar=self.sidecar)
        host, port = server.server_address[0], server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with urllib.request.urlopen(f"http://{host}:{port}/health", timeout=5) as resp:
                self.assertEqual(resp.status, 200)
                health = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(health["status"], "ok")

            req = urllib.request.Request(
                f"http://{host}:{port}/govern",
                data=json.dumps({"features": {"operator_review_required": True}}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                self.assertEqual(resp.status, 200)
                result = json.loads(resp.read().decode("utf-8"))
            self.assertEqual(result["action"], "hold")
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


class GovernanceEvalEngineTest(unittest.TestCase):
    """The eval engine turns a stored session_output payload into scored
    governance records, reusing the existing adapters + sidecar (a fake here,
    so no checkpoint is needed)."""

    def setUp(self) -> None:
        self.sidecar = _fake_sidecar()
        self.transcript = load_transcript_lines(
            Path("data/fixtures/claude_code_transcript.jsonl")
        )
        self.record = {
            "runtimeType": "claude-code",
            "sessionId": "cc-session-1",
            "orgId": "gal-run",
            "transcript": self.transcript,
        }

    def test_evaluate_produces_nonzero_scored_decisions(self) -> None:
        result = evaluate_session_output(self.record, self.sidecar)
        self.assertIsNone(result["error"])
        self.assertEqual(result["sessionId"], "cc-session-1")
        self.assertEqual(result["runtimeType"], "claude-code")
        self.assertEqual(result["orgId"], "gal-run")
        scored = result["scoredDecisions"]
        # The real fixture yields 3 tool calls (Read + two Bash).
        self.assertGreater(len(scored), 0)
        self.assertEqual(len(scored), 3)
        for d in scored:
            self.assertEqual(d["recordType"], RECORD_TYPE_GOVERNANCE_DECISION)
            self.assertIn(d["predicted"], LABELS)
            self.assertIn(d["decisionShort"], ("clear", "hold"))
            self.assertIsInstance(d["confidence"], float)
            self.assertTrue(d["advisoryOnly"])

    def test_session_eval_aggregates_correctly(self) -> None:
        result = evaluate_session_output(self.record, self.sidecar)
        # Read -> clear; git push (external-state) & rm -rf (destructive) -> hold.
        # The fake sidecar holds iff operator_review_required, which matches the
        # weak-labeled audited decisions, so the session rolls up to hold.
        session_eval = result["sessionEval"]
        self.assertEqual(session_eval["decision"], "hold")
        self.assertTrue(session_eval["escalate"])
        counts = session_eval["counts"]
        self.assertEqual(counts["decisions"], 3)
        self.assertEqual(counts["hold"], 2)
        self.assertEqual(counts["clear"], 1)
        # session_output event itself holds (risky tools -> evalLabel hold).
        self.assertTrue(counts["outputHold"])
        # Aggregate confidence is the weakest-link min over decisions.
        self.assertEqual(session_eval["confidence"], 0.99)

    def test_predicted_matches_ground_truth_with_fake_model(self) -> None:
        # The fake model mirrors operator_review_required, which is exactly how
        # the event ground-truth label is derived, so every decision matches.
        result = evaluate_session_output(self.record, self.sidecar)
        self.assertTrue(all(d["match"] for d in result["scoredDecisions"]))
        names = {d["toolName"] for d in result["scoredDecisions"]}
        self.assertEqual(names, {"Read", "Bash"})

    def test_token_usage_is_carried_through(self) -> None:
        result = evaluate_session_output(self.record, self.sidecar)
        token_usage = result["tokenUsage"]
        self.assertIsNotNone(token_usage)
        self.assertGreater(token_usage["totalInputTokens"], 0)
        self.assertGreater(token_usage["totalOutputTokens"], 0)

    def test_no_raw_content_leaks_into_result(self) -> None:
        # The stored transcript carries real prompts/commands/output text; NONE of
        # it may survive into the scored result (include_raw_content stays False
        # end to end and the result is pure bools/ints/labels).
        result = evaluate_session_output(self.record, self.sidecar)
        blob = json.dumps(result)
        for leak in (
            "git push origin main",
            "rm -rf build",
            "# project readme",
            "Please read the README",
            "Everything up-to-date",
            "All done",
        ):
            self.assertNotIn(leak, blob)
        # And the disallowed-key family never appears anywhere in the result.
        for banned in ("content", "prompt", "message", "toolInput", "toolResult"):
            self.assertNotIn(f'"{banned}"', blob)

    def test_does_not_mutate_caller_record(self) -> None:
        # Pure function of the input: the caller's stored record is untouched.
        snapshot = json.dumps(self.record, sort_keys=True)
        evaluate_session_output(self.record, self.sidecar)
        self.assertEqual(json.dumps(self.record, sort_keys=True), snapshot)

    def test_secret_shaped_tool_name_and_id_are_masked(self) -> None:
        # An adversarial tool_use could try to smuggle a secret through the
        # toolName / recordId metadata channels (which carry transcript-controlled
        # strings). Secret-shaped substrings must be masked before they enter a
        # scored record. Craft a transcript whose tool name + id carry secrets.
        crafted = [
            {"type": "assistant", "message": {"content": [
                {"type": "tool_use", "id": "toolu_AKIAIOSFODNN7EXAMPLE",
                 "name": "Bash_sk-ABCDEFGHIJKLMNOPQRSTUVWX", "input": {"command": "ls"}}
            ]}, "timestamp": "2026-06-03T10:00:00Z"},
            {"type": "user", "message": {"content": [
                {"type": "tool_result", "tool_use_id": "toolu_AKIAIOSFODNN7EXAMPLE",
                 "content": "ok", "is_error": False}
            ]}, "timestamp": "2026-06-03T10:00:01Z"},
        ]
        rec = {"runtimeType": "claude-code", "sessionId": "s", "orgId": "o", "transcript": crafted}
        result = evaluate_session_output(rec, self.sidecar)
        blob = json.dumps(result)
        # The AWS-key-shaped id substring and the OpenAI-key-shaped name substring
        # must be redacted, not present verbatim.
        self.assertNotIn("AKIAIOSFODNN7EXAMPLE", blob)
        self.assertNotIn("sk-ABCDEFGHIJKLMNOPQRSTUVWX", blob)
        self.assertIn("[REDACTED]", blob)

    def test_tool_call_number_is_a_real_ordinal(self) -> None:
        # toolCallNumber must be the 1-based tool-call ordinal (1,2,3...), not the
        # adapter's conversational turn-sequence index. turnSeq preserves the latter.
        result = evaluate_session_output(self.record, self.sidecar)
        ordinals = [d["toolCallNumber"] for d in result["scoredDecisions"]]
        self.assertEqual(ordinals, [1, 2, 3])

    def test_long_string_leaf_trips_the_no_raw_guard(self) -> None:
        # The guard's value-side sweep must reject a free-form long string leaf
        # (transcript text hiding under an allowed key).
        from gal_model.governance_eval import _assert_no_raw_leak
        with self.assertRaises(AssertionError):
            _assert_no_raw_leak({"note": "x" * 5000})

    def test_malformed_record_is_handled_without_raising(self) -> None:
        # A grab-bag of malformed inputs: each returns the result shape with an
        # ``error`` set and empty scoredDecisions, never an exception.
        malformed = [
            {"runtimeType": "claude-code", "sessionId": "s"},  # no transcript
            {"runtimeType": "claude-code", "transcript": []},  # empty transcript
            {"runtimeType": "claude-code", "transcript": ["not-a-dict"]},  # bad entry
            {"sessionId": "s", "transcript": [{"a": 1}]},  # no runtimeType
            "not-a-dict",  # not even an object
            {"runtimeType": "foobar", "transcript": [{"a": 1}]},  # unknown runtime
            {"runtimeType": "unknown", "transcript": [{"a": 1}]},  # unknown sentinel
        ]
        for bad in malformed:
            result = evaluate_session_output(bad, self.sidecar)
            self.assertIsNotNone(result["error"])
            self.assertEqual(result["scoredDecisions"], [])
            # A failed record fails safe (hold/escalate), never silently clears.
            self.assertEqual(result["sessionEval"]["decision"], "hold")
            self.assertTrue(result["sessionEval"]["escalate"])

    def test_unimplemented_runtime_is_a_clean_skip_not_a_crash(self) -> None:
        # cursor/copilot/gemini adapters raise NotImplementedError; the engine
        # must dispatch to them and convert that into a clean per-record error.
        for runtime in ("cursor", "copilot", "gemini"):
            record = {
                "runtimeType": runtime,
                "sessionId": "s",
                "orgId": "o",
                "transcript": [{"some": "line"}],
            }
            result = evaluate_session_output(record, self.sidecar)
            self.assertIsNotNone(result["error"])
            self.assertIn("not implemented", result["error"])
            self.assertEqual(result["scoredDecisions"], [])

    def test_codex_runtime_dispatch_scores_decisions(self) -> None:
        # The other implemented runtime (codex) dispatches and scores too,
        # proving runtimeType dispatch is not hardcoded to claude-code.
        codex_lines = load_transcript_lines(
            Path("data/fixtures/codex_transcript.jsonl")
        )
        record = {
            "runtimeType": "codex",
            "sessionId": "codex-session-1",
            "orgId": "gal-run",
            "transcript": codex_lines,
        }
        result = evaluate_session_output(record, self.sidecar)
        self.assertIsNone(result["error"])
        self.assertEqual(result["runtimeType"], "codex")
        self.assertEqual(len(result["scoredDecisions"]), 3)

    def test_transcript_lines_alias_accepted(self) -> None:
        # The stored payload may name the transcript ``transcriptLines``.
        record = {
            "runtimeType": "claude-code",
            "sessionId": "cc-session-1",
            "orgId": "gal-run",
            "transcriptLines": self.transcript,
        }
        result = evaluate_session_output(record, self.sidecar)
        self.assertIsNone(result["error"])
        self.assertEqual(len(result["scoredDecisions"]), 3)

    def test_batch_evaluation_reuses_one_sidecar(self) -> None:
        # evaluate_session_outputs scores a batch; a malformed record in the
        # batch does not abort the others.
        batch = [
            self.record,
            {"runtimeType": "claude-code"},  # malformed -> error
            self.record,
        ]
        results = evaluate_session_outputs(batch, self.sidecar)
        self.assertEqual(len(results), 3)
        self.assertIsNone(results[0]["error"])
        self.assertIsNotNone(results[1]["error"])
        self.assertIsNone(results[2]["error"])
        self.assertEqual(len(results[0]["scoredDecisions"]), 3)
        self.assertEqual(results[1]["scoredDecisions"], [])

    def test_degrades_when_no_checkpoint_available(self) -> None:
        # With no injected sidecar and a non-existent checkpoint, the engine
        # degrades to a per-record error rather than crashing.
        record = dict(self.record)
        result = evaluate_session_output(
            record, sidecar=None, model_path="/nonexistent/checkpoint.pt"
        )
        self.assertIsNotNone(result["error"])
        self.assertEqual(result["scoredDecisions"], [])


class _FakeTelemetry:
    """A fake telemetry-svc backing the worker's get_fn/post_fn seams.

    Models the contract: GET /session-outputs?processed=false returns pages of
    docs; once a doc's verdict is POSTed (and its sourceId marked processed) it
    falls OUT of the processed=false set, so subsequent GETs (offset=0 every
    time) surface only the remaining backlog. This proves the worker never
    re-scores an already-processed doc.
    """

    def __init__(self, docs: list[dict], *, fail_post_for: set[str] | None = None):
        # id -> doc, plus a processed flag mirroring the Firestore field.
        self.docs = {d["id"]: dict(d) for d in docs}
        self.processed: set[str] = set()
        self.fail_post_for = fail_post_for or set()
        self.get_calls = 0
        self.posted_bodies: list[dict] = []
        self.marked: list[str] = []  # order in which sources were marked processed

    def _limit_from_url(self, url: str) -> int:
        import urllib.parse as _up

        qs = _up.parse_qs(_up.urlparse(url).query)
        return int(qs.get("limit", ["50"])[0])

    def get_fn(self, url: str, token: str, timeout: float) -> dict:
        assert token, "worker must send a non-empty bearer token"
        self.get_calls += 1
        limit = self._limit_from_url(url)
        # Backlog = docs whose id is not yet processed (treat missing flag as
        # unprocessed, exactly like the Go handler's processed != true rule).
        backlog = [d for did, d in self.docs.items() if did not in self.processed]
        page = backlog[:limit]
        return {
            "entries": page,
            "total": len(backlog),
            "limit": limit,
            "offset": 0,
        }

    def post_fn(self, url: str, token: str, body: dict, timeout: float) -> dict:
        assert token, "worker must send a non-empty bearer token"
        source_id = body.get("sourceId")
        if source_id in self.fail_post_for:
            import urllib.error

            raise urllib.error.URLError("simulated POST failure")
        self.posted_bodies.append(body)
        # Atomic verdict-store + mark-processed (the Go handler's job; modeled
        # here so the doc leaves the processed=false set).
        if source_id is not None:
            self.processed.add(source_id)
            self.marked.append(source_id)
        return {"stored": True, "id": f"verdict-{len(self.posted_bodies)}",
                "sessionId": body.get("sessionId"), "sourceProcessed": True}


class GovernanceEvalWorkerTest(unittest.TestCase):
    """run_once against a FAKE telemetry + a FAKE sidecar (no torch, no network)."""

    def setUp(self) -> None:
        self.sidecar = _fake_sidecar()
        transcript = load_transcript_lines(
            Path("data/fixtures/claude_code_transcript.jsonl")
        )
        # A real, evaluable claude-code doc (has id=sourceId, transcript, runtimeType).
        self.good_doc = {
            "id": "src-good-1",
            "runtimeType": "claude-code",
            "sessionId": "cc-session-1",
            "orgId": "gal-run",
            "orgName": "gal-run",
            "transcript": transcript,
            "transcriptLines": len(transcript),  # telemetry's INT count must NOT shadow the list
        }
        # A bad doc: unsupported runtime -> evaluate returns error!=None but still
        # a valid hold/escalate verdict that must STILL be posted + marked.
        self.bad_doc = {
            "id": "src-bad-1",
            "runtimeType": "cursor",  # adapter raises NotImplementedError
            "sessionId": "cursor-session-1",
            "orgId": "gal-run",
            "transcript": [{"some": "line"}],
        }

    def test_scores_and_posts_compact_verdicts(self) -> None:
        fake = _FakeTelemetry([self.good_doc])
        summary = run_once(
            "http://telemetry-svc:8080",
            "test-jwt",
            sidecar=self.sidecar,
            batch_size=50,
            get_fn=fake.get_fn,
            post_fn=fake.post_fn,
        )
        self.assertEqual(summary["fetched"], 1)
        self.assertEqual(summary["scored"], 1)
        self.assertEqual(summary["posted"], 1)
        self.assertEqual(summary["errors"], 0)

        self.assertEqual(len(fake.posted_bodies), 1)
        body = fake.posted_bodies[0]
        # ── wire-shape matches the VERDICT STORAGE CONTRACT ──
        self.assertEqual(body["sessionId"], "cc-session-1")
        self.assertEqual(body["sourceId"], "src-good-1")
        self.assertEqual(body["runtimeType"], "claude-code")
        self.assertEqual(body["sessionEval"]["decision"], "hold")
        self.assertTrue(body["sessionEval"]["escalate"])
        self.assertEqual(body["sessionEval"]["counts"]["decisions"], 3)
        self.assertIsNone(body["error"])
        self.assertIn("evaluatedAt", body)
        # orgId is NEVER sent (server forces it from the JWT claim).
        self.assertNotIn("orgId", body)
        # ── scoredDecisions are COMPACT: exactly {toolName, decisionShort, confidence} ──
        self.assertEqual(len(body["scoredDecisions"]), 3)
        for sd in body["scoredDecisions"]:
            self.assertEqual(set(sd.keys()), {"toolName", "decisionShort", "confidence"})
            self.assertIn(sd["decisionShort"], ("clear", "hold"))
        # ── all long-form fields are DROPPED from the wire body ──
        dropped = (
            "features", "predicted", "groundTruth", "match", "recordId",
            "turnSeq", "policyAction", "isError", "latencyMs", "satisfied",
            "needsFeedback",
        )
        blob = json.dumps(body)
        for banned in dropped:
            self.assertNotIn(f'"{banned}"', blob)

    def test_marks_nothing_twice_across_pages(self) -> None:
        # Two good docs, batch_size=1 forces multiple GET pages. Because each
        # scored doc is marked processed (falls out of processed=false), the
        # worker must score each EXACTLY ONCE — never re-score a marked doc.
        doc2 = dict(self.good_doc, id="src-good-2", sessionId="cc-session-2")
        fake = _FakeTelemetry([self.good_doc, doc2])
        summary = run_once(
            "http://telemetry-svc:8080",
            "test-jwt",
            sidecar=self.sidecar,
            batch_size=1,
            max_batches=20,
            get_fn=fake.get_fn,
            post_fn=fake.post_fn,
        )
        self.assertEqual(summary["scored"], 2)
        self.assertEqual(summary["posted"], 2)
        # Each source marked exactly once (no duplicate scoring).
        self.assertEqual(sorted(fake.marked), ["src-good-1", "src-good-2"])
        self.assertEqual(len(fake.marked), len(set(fake.marked)))
        # Posted sourceIds are unique.
        posted_ids = [b["sourceId"] for b in fake.posted_bodies]
        self.assertEqual(sorted(posted_ids), ["src-good-1", "src-good-2"])

    def test_one_bad_record_does_not_abort_the_batch(self) -> None:
        # bad_doc (cursor) -> eval error!=None but STILL a hold/escalate verdict
        # that is posted + marks the source processed, so it never wedges the
        # backlog. The good doc in the same page is still scored + posted.
        fake = _FakeTelemetry([self.bad_doc, self.good_doc])
        summary = run_once(
            "http://telemetry-svc:8080",
            "test-jwt",
            sidecar=self.sidecar,
            batch_size=50,
            get_fn=fake.get_fn,
            post_fn=fake.post_fn,
        )
        self.assertEqual(summary["fetched"], 2)
        self.assertEqual(summary["scored"], 2)
        self.assertEqual(summary["posted"], 2)  # BOTH posted (bad one too)
        self.assertEqual(summary["errors"], 1)  # the cursor doc carried an error

        by_source = {b["sourceId"]: b for b in fake.posted_bodies}
        bad_verdict = by_source["src-bad-1"]
        # The bad record carries a valid fail-safe verdict: hold + escalate.
        self.assertEqual(bad_verdict["sessionEval"]["decision"], "hold")
        self.assertTrue(bad_verdict["sessionEval"]["escalate"])
        self.assertIsNotNone(bad_verdict["error"])
        self.assertEqual(bad_verdict["scoredDecisions"], [])
        # Both sources got marked processed -> neither wedges the backlog.
        self.assertEqual(set(fake.marked), {"src-bad-1", "src-good-1"})

    def test_post_failure_leaves_doc_unprocessed_for_retry(self) -> None:
        # If the verdict POST fails, the doc must stay processed=false (retried
        # next run, at-least-once). We model that by failing the POST and
        # asserting the source was NOT marked processed.
        fake = _FakeTelemetry([self.good_doc], fail_post_for={"src-good-1"})
        summary = run_once(
            "http://telemetry-svc:8080",
            "test-jwt",
            sidecar=self.sidecar,
            batch_size=50,
            max_batches=1,  # cap so the un-marked doc doesn't loop forever
            get_fn=fake.get_fn,
            post_fn=fake.post_fn,
        )
        self.assertEqual(summary["scored"], 1)
        self.assertEqual(summary["posted"], 0)
        self.assertEqual(summary["errors"], 1)
        self.assertEqual(fake.marked, [])  # nothing marked -> stays in backlog

    def test_empty_backlog_posts_nothing(self) -> None:
        fake = _FakeTelemetry([])
        summary = run_once(
            "http://telemetry-svc:8080",
            "test-jwt",
            sidecar=self.sidecar,
            get_fn=fake.get_fn,
            post_fn=fake.post_fn,
        )
        self.assertEqual(summary["fetched"], 0)
        self.assertEqual(summary["scored"], 0)
        self.assertEqual(summary["posted"], 0)
        self.assertEqual(fake.posted_bodies, [])

    def test_compact_projection_drops_long_form_fields(self) -> None:
        # Unit-test the projection helper directly against a full scored decision.
        full = [{
            "recordId": "r1", "recordType": "governance_decision", "toolName": "Bash",
            "toolCallNumber": 1, "turnSeq": 4, "policyAction": "allow", "isError": False,
            "features": {"a": 1}, "predicted": "hold_for_operator_review",
            "decisionShort": "hold", "confidence": 0.99, "satisfied": True,
            "needsFeedback": False, "latencyMs": 0.01, "groundTruth": "hold_for_operator_review",
            "match": True, "advisoryOnly": True,
        }]
        compact = compact_scored_decisions(full)
        self.assertEqual(compact, [{"toolName": "Bash", "decisionShort": "hold", "confidence": 0.99}])

    def test_build_verdict_body_omits_orgid_and_uses_doc_id_as_source(self) -> None:
        result = evaluate_session_output(self.good_doc, self.sidecar)
        body = build_verdict_body(result, self.good_doc)
        self.assertEqual(body["sourceId"], "src-good-1")
        self.assertNotIn("orgId", body)
        self.assertIn("evaluatedAt", body)

    def test_fatal_when_initial_get_fails_with_nothing_scored(self) -> None:
        import urllib.error

        def _boom_get(url: str, token: str, timeout: float) -> dict:
            raise urllib.error.URLError("connection refused")

        def _post(url: str, token: str, body: dict, timeout: float) -> dict:
            return {}

        with self.assertRaises(urllib.error.URLError):
            run_once(
                "http://telemetry-svc:8080",
                "test-jwt",
                sidecar=self.sidecar,
                get_fn=_boom_get,
                post_fn=_post,
            )

    def test_default_urllib_transport_via_monkeypatched_urlopen(self) -> None:
        # Exercise the REAL stdlib-urllib get_fn/post_fn (no injected transports)
        # by monkeypatching urllib.request.urlopen — proving the worker uses
        # urllib and builds Bearer-authed requests with the right URLs/bodies.
        import io
        import urllib.request as _ur
        import gal_model.governance_eval_worker as worker_mod

        seen: dict = {"get_url": None, "post_url": None, "post_body": None,
                      "auth_headers": []}
        page_served = {"done": False}

        class _Resp(io.BytesIO):
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *a):
                self.close()
                return False

        def _fake_urlopen(request, timeout=None):
            url = request.full_url
            # Header keys are capitalized by urllib (Authorization).
            seen["auth_headers"].append(request.get_header("Authorization"))
            if request.get_method() == "GET":
                seen["get_url"] = url
                if page_served["done"]:
                    body = {"entries": [], "total": 0}
                else:
                    page_served["done"] = True
                    body = {"entries": [self.good_doc], "total": 1}
                return _Resp(json.dumps(body).encode("utf-8"))
            # POST
            seen["post_url"] = url
            seen["post_body"] = json.loads(request.data.decode("utf-8"))
            return _Resp(json.dumps({"stored": True, "id": "v1"}).encode("utf-8"))

        original = _ur.urlopen
        _ur.urlopen = _fake_urlopen
        try:
            summary = worker_mod.run_once(
                "http://telemetry-svc:8080",
                "test-jwt",
                sidecar=self.sidecar,
                batch_size=50,
            )
        finally:
            _ur.urlopen = original

        self.assertEqual(summary["posted"], 1)
        self.assertIn("/session-outputs?", seen["get_url"])
        self.assertIn("processed=false", seen["get_url"])
        self.assertIn("includeTranscript=true", seen["get_url"])
        self.assertTrue(seen["post_url"].endswith("/governance-verdicts"))
        self.assertEqual(seen["post_body"]["sourceId"], "src-good-1")
        self.assertNotIn("orgId", seen["post_body"])
        # Every request carried the Bearer JWT.
        self.assertTrue(all(h == "Bearer test-jwt" for h in seen["auth_headers"]))


if __name__ == "__main__":
    unittest.main()
