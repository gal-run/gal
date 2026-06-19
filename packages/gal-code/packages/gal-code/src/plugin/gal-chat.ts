import { infer, type GalFeatures } from "./gal-runtime"
import { GalModel } from "./gal-model.gen"
import { createInterface } from "node:readline"

const rl = createInterface({ input: process.stdin, output: process.stdout })

function ask() {
  rl.question("> ", (input) => {
    const line = input.trim()
    if (line === "quit" || line === "exit") {
      console.log("bye")
      rl.close()
      return
    }
    if (line === "help") {
      console.log("p v o e r l a d  —  people vehicles obstacles evidence review latency approvals detections")
      console.log("0=no 1=yes, detection_count=0-20")
      console.log("quit  — exit")
      return ask()
    }
    const parts = line.split(/\s+/).map(Number)
    if (parts.length !== 8 || parts.some(isNaN)) {
      console.log("need 8 numbers: p v o e r l a d")
      return ask()
    }
    const features: GalFeatures = {
      people_present: Boolean(parts[0]),
      vehicles_present: Boolean(parts[1]),
      obstacles_present: Boolean(parts[2]),
      evidence_complete: Boolean(parts[3]),
      operator_review_required: Boolean(parts[4]),
      latency_measured: Boolean(parts[5]),
      approval_refs_complete: Boolean(parts[6]),
      detection_count: parts[7],
    }
    const res = infer({ request_id: String(Date.now()), application: "gal-chat", model_ref: GalModel.model_ref, evidence_ref: "chat://repl", features })
    const icon = res.decision === "hold_for_operator_review" ? "✗ HOLD" : "✓ CLEAR"
    console.log(`${icon}  conf=${res.confidence.toFixed(4)}  bucket=${res.calibration_bucket}`)
    ask()
  })
}

console.log(`GAL v1.2  ${GalModel.model_ref}  (type quit to exit, help for format)`)
ask()
