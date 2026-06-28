"""Unit tests for the demo orchestrator's pure plan-building + message construction.

No I/O, no TCC, no recording — these verify the orchestration logic and that the JSON
emitted for each endpoint matches the GALComputerUse socket protocol and the demo-studio
MCP tool schemas. Run: python3 -m unittest test_demo_orchestrator -v
"""
import unittest

from demo_orchestrator import build_plan, render_dry_run, _cu_payload


def _spec(steps, **extra):
    return {"name": "t", "screen": {"width": 1000, "height": 500}, "steps": steps, **extra}


class TestCuPayload(unittest.TestCase):
    def test_click_payload_matches_protocol(self):
        p = _cu_payload("click", {"x": 10, "y": 20})
        self.assertEqual(p, {"action": "click", "x": 10.0, "y": 20.0,
                             "button": "left", "click_count": 1})

    def test_click_honors_button_and_count(self):
        p = _cu_payload("click", {"x": 1, "y": 2, "button": "right", "click_count": 2})
        self.assertEqual(p["button"], "right")
        self.assertEqual(p["click_count"], 2)

    def test_type_payload(self):
        self.assertEqual(_cu_payload("type", {"text": "hi"}), {"action": "type", "text": "hi"})

    def test_key_with_modifiers(self):
        p = _cu_payload("key", {"key": "k", "modifiers": ["command"]})
        self.assertEqual(p, {"action": "key", "key": "k", "modifiers": ["command"]})

    def test_move_requires_coords(self):
        with self.assertRaises(ValueError):
            _cu_payload("move", {"x": 1})

    def test_scroll_payload(self):
        p = _cu_payload("scroll", {"scroll_y": -3, "x": 5, "y": 6})
        self.assertEqual(p["action"], "scroll")
        self.assertEqual(p["scroll_y"], -3.0)
        self.assertEqual(p["at_x"], 5)


class TestBuildPlan(unittest.TestCase):
    def test_timeline_advances_by_duration(self):
        plan = build_plan(_spec([
            {"action": "move", "x": 1, "y": 1, "duration": 0.5},
            {"action": "click", "x": 1, "y": 1, "duration": 1.0},
            {"action": "wait", "duration": 0.5},
        ]))
        self.assertEqual([o.t for o in plan.cu_ops], [0.0, 0.5])
        self.assertEqual(plan.total, 2.0)

    def test_wait_is_not_actuated(self):
        plan = build_plan(_spec([{"action": "wait", "duration": 1.0}]))
        self.assertEqual(plan.cu_ops, [])

    def test_caption_becomes_text_overlay_at_step_time(self):
        plan = build_plan(_spec([
            {"action": "wait", "duration": 1.0},
            {"action": "click", "x": 1, "y": 1, "duration": 1.0, "caption": "go"},
        ]))
        ds = plan.ds_ops
        self.assertEqual(len(ds), 1)
        self.assertEqual(ds[0].payload["tool"], "add_text_overlay")
        self.assertEqual(ds[0].payload["args"]["text"], "go")
        self.assertEqual(ds[0].payload["args"]["startTime"], 1.0)

    def test_zoom_normalizes_pixels_to_0_1(self):
        # x=500 of width 1000 -> 0.5 ; y=250 of height 500 -> 0.5
        plan = build_plan(_spec([
            {"action": "click", "x": 500, "y": 250, "duration": 1.0,
             "zoom": {"scale": 3}},
        ]))
        zoom = [o for o in plan.ds_ops if o.payload["tool"] == "add_zoom_region"][0]
        self.assertEqual(zoom.payload["args"]["x"], 0.5)
        self.assertEqual(zoom.payload["args"]["y"], 0.5)
        self.assertEqual(zoom.payload["args"]["scale"], 3.0)

    def test_effects_ordered_before_action_at_same_instant(self):
        plan = build_plan(_spec([
            {"action": "click", "x": 1, "y": 1, "duration": 1.0,
             "caption": "c", "zoom": {"scale": 2}},
        ]))
        # at t=0: two ds effects then the cu action
        self.assertEqual([o.target for o in plan.ops], ["ds", "ds", "cu"])

    def test_unknown_action_rejected(self):
        with self.assertRaises(ValueError):
            build_plan(_spec([{"action": "teleport"}]))

    def test_missing_action_rejected(self):
        with self.assertRaises(ValueError):
            build_plan(_spec([{"x": 1}]))

    def test_dry_run_renders_all_ops(self):
        plan = build_plan(_spec([
            {"action": "click", "x": 1, "y": 1, "duration": 1.0, "caption": "c"},
        ]))
        out = render_dry_run(plan)
        self.assertIn("CU", out)
        self.assertIn("add_text_overlay", out)


if __name__ == "__main__":
    unittest.main()
