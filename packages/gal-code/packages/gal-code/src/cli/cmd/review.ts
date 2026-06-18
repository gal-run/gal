import type { Argv, CommandModule } from "yargs"
import { Review } from "@/galt/review"
import { UI } from "@/cli/ui"
import chalk from "chalk"
import { EOL } from "os"

const formatPriority = (p: string) => {
  const colors: Record<string, (s: string) => string> = {
    critical: chalk.red.bold,
    high: chalk.red,
    medium: chalk.yellow,
    low: chalk.gray,
  }
  return (colors[p] || chalk.white)(p.toUpperCase().padEnd(8))
}

const formatStatus = (s: string) => {
  const colors: Record<string, (s: string) => string> = {
    pending: chalk.gray,
    in_review: chalk.blue,
    approved: chalk.green,
    rejected: chalk.red,
    escalated: chalk.magenta,
  }
  return (colors[s] || chalk.white)(s)
}

const formatSLA = (s: string) => {
  const colors: Record<string, (s: string) => string> = {
    on_track: chalk.green,
    at_risk: chalk.yellow,
    breached: chalk.red,
  }
  return (colors[s] || chalk.white)(s)
}

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffMs < 0) return chalk.red("OVERDUE")
  if (diffMins < 60) return chalk.yellow(`${diffMins}m`)
  if (diffHours < 24) return chalk.white(`${diffHours}h`)
  return chalk.gray(`${Math.floor(diffHours / 24)}d`)
}

const ReviewQueueCommand: CommandModule = {
  command: "queue",
  describe: "List pending reviews",
  builder: (yargs: Argv) =>
    yargs
      .option("status", {
        type: "string",
        choices: ["pending", "in_review", "approved", "rejected", "escalated"],
        default: "pending",
        describe: "Filter by status",
      })
      .option("classification", {
        type: "string",
        describe: "Filter by classification level",
      })
      .option("limit", {
        type: "number",
        default: 20,
        describe: "Maximum number of items",
      }),
  handler: async (args) => {
    try {
      const queue = await Review.getQueue({
        status: args.status as Review.ReviewStatus,
        classification: args.classification as string,
        limit: args.limit as number,
      })

      if (queue.items.length === 0) {
        UI.println(UI.Style.TEXT_DIM + "No items in review queue" + UI.Style.TEXT_NORMAL)
        return
      }

      console.log(chalk.bold(`\nReview Queue (${queue.total} items)\n`))

      const header = `${"ID".padEnd(36)} ${"PRIORITY"} ${"STATUS"}      ${"SLA"}      ${"CLASSIFICATION"}  REASONS`
      console.log(chalk.gray(header))
      console.log(chalk.gray("─".repeat(100)))

      for (const item of queue.items) {
        const id = item.review_id.slice(0, 8)
        const priority = formatPriority(item.priority)
        const status = formatStatus(item.status).padEnd(12)
        const sla = formatSLA(item.sla_status).padEnd(8) + " " + formatTime(item.sla_due_at)
        const classification = item.classification.padEnd(15)
        const reasons = item.flag_reasons.slice(0, 2).join(", ") + (item.flag_reasons.length > 2 ? "..." : "")

        console.log(`${chalk.cyan(id)}  ${priority} ${status} ${sla}  ${classification} ${chalk.gray(reasons)}`)
      }

      console.log()
    } catch (e) {
      UI.error(`Failed to get review queue: ${e}`)
      process.exit(1)
    }
  },
}

const ReviewShowCommand: CommandModule = {
  command: "show <id>",
  describe: "Show review details",
  builder: (yargs: Argv) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Review ID",
    }),
  handler: async (args) => {
    try {
      const item = await Review.getItem(args.id as string)

      console.log(chalk.bold(`\n=== Review ${item.review_id.slice(0, 8)} ===\n`))
      console.log(`${chalk.gray("Request ID:")} ${item.request_id}`)
      console.log(`${chalk.gray("Classification:")} ${item.classification}`)
      console.log(`${chalk.gray("Priority:")} ${formatPriority(item.priority)}`)
      console.log(`${chalk.gray("Status:")} ${formatStatus(item.status)}`)
      console.log(`${chalk.gray("Requester:")} ${item.requester}`)
      console.log(`${chalk.gray("Flagged:")} ${new Date(item.flagged_at).toLocaleString()}`)

      if (item.claimed_by) {
        console.log(`${chalk.gray("Claimed by:")} ${item.claimed_by}`)
      }

      if (item.sla) {
        console.log(`${chalk.gray("SLA Status:")} ${formatSLA(item.sla.status)}`)
        console.log(`${chalk.gray("SLA Due:")} ${new Date(item.sla.due_at).toLocaleString()}`)
      }

      console.log(chalk.bold("\nFlag Reasons:"))
      for (const reason of item.flag_reasons) {
        console.log(`  ${chalk.yellow("•")} ${reason}`)
      }

      if (item.sanitization_report) {
        console.log(chalk.bold("\nSanitization Report:"))
        console.log(`  ${chalk.gray("Original Classification:")} ${item.sanitization_report.original_classification}`)
        console.log(`  ${chalk.gray("Final Classification:")} ${item.sanitization_report.final_classification}`)
        console.log(`  ${chalk.gray("Redactions:")} ${item.sanitization_report.redactions.length}`)
        console.log(`  ${chalk.gray("Scan Duration:")} ${item.sanitization_report.scan_duration_ms}ms`)

        if (item.sanitization_report.findings.length > 0) {
          console.log(chalk.bold("\nFindings:"))
          for (const f of item.sanitization_report.findings) {
            const severity = f.severity === "critical" ? chalk.red.bold(f.severity) : chalk.yellow(f.severity)
            console.log(`  ${chalk.gray("•")} [${severity}] ${f.type}: ${f.description}`)
          }
        }
      }

      console.log(chalk.bold("\nResponse Content:"))
      console.log(chalk.gray("─".repeat(80)))
      console.log(item.response_content.slice(0, 500) + (item.response_content.length > 500 ? "..." : ""))
      console.log(chalk.gray("─".repeat(80)))

      if (item.approved_by) {
        console.log(chalk.green(`\nApproved by ${item.approved_by} at ${new Date(item.approved_at!).toLocaleString()}`))
      }

      if (item.rejected_by) {
        console.log(chalk.red(`\nRejected by ${item.rejected_by} at ${new Date(item.rejected_at!).toLocaleString()}`))
        console.log(chalk.red(`Reason: ${item.rejection_reason}`))
      }

      console.log()
    } catch (e) {
      UI.error(`Failed to get review: ${e}`)
      process.exit(1)
    }
  },
}

const ReviewApproveCommand: CommandModule = {
  command: "approve <id>",
  describe: "Approve a review",
  builder: (yargs: Argv) =>
    yargs
      .positional("id", {
        type: "string",
        demandOption: true,
        describe: "Review ID",
      })
      .option("comments", {
        type: "string",
        describe: "Approval comments",
      })
      .option("classification", {
        type: "string",
        choices: ["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"],
        describe: "Override classification",
      }),
  handler: async (args) => {
    try {
      const result = await Review.approve(args.id as string, {
        comments: args.comments as string,
        classificationOverride: args.classification as string,
      })

      console.log(chalk.green(`\n✓ Review ${result.review_id.slice(0, 8)} approved`))
      console.log(chalk.gray(`  Status: ${result.status}`))
      console.log(chalk.gray(`  Reviewed at: ${new Date(result.reviewed_at).toLocaleString()}`))
      console.log()
    } catch (e) {
      UI.error(`Failed to approve review: ${e}`)
      process.exit(1)
    }
  },
}

const ReviewRejectCommand: CommandModule = {
  command: "reject <id>",
  describe: "Reject a review",
  builder: (yargs: Argv) =>
    yargs
      .positional("id", {
        type: "string",
        demandOption: true,
        describe: "Review ID",
      })
      .option("reason", {
        type: "string",
        choices: ["classification_violation", "sensitive_content", "policy_violation", "quality_issue", "other"],
        demandOption: true,
        describe: "Rejection reason",
      })
      .option("details", {
        type: "string",
        describe: "Additional details",
      }),
  handler: async (args) => {
    try {
      const result = await Review.reject(args.id as string, {
        reason: args.reason as Review.RejectOptions["reason"],
        details: args.details as string,
      })

      console.log(chalk.red(`\n✗ Review ${result.review_id.slice(0, 8)} rejected`))
      console.log(chalk.gray(`  Reason: ${args.reason}`))
      console.log(chalk.gray(`  Status: ${result.status}`))
      console.log(chalk.gray(`  Reviewed at: ${new Date(result.reviewed_at).toLocaleString()}`))
      console.log()
    } catch (e) {
      UI.error(`Failed to reject review: ${e}`)
      process.exit(1)
    }
  },
}

const ReviewClaimCommand: CommandModule = {
  command: "claim <id>",
  describe: "Claim a review for processing",
  builder: (yargs: Argv) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Review ID",
    }),
  handler: async (args) => {
    try {
      await Review.claim(args.id as string)
      console.log(chalk.blue(`\n✓ Review ${args.id} claimed`))
      console.log(chalk.gray("You can now review and approve/reject it."))
      console.log()
    } catch (e) {
      UI.error(`Failed to claim review: ${e}`)
      process.exit(1)
    }
  },
}

const ReviewReleaseCommand: CommandModule = {
  command: "release <id>",
  describe: "Release a claimed review",
  builder: (yargs: Argv) =>
    yargs.positional("id", {
      type: "string",
      demandOption: true,
      describe: "Review ID",
    }),
  handler: async (args) => {
    try {
      await Review.release(args.id as string)
      console.log(chalk.yellow(`\n✓ Review ${args.id} released`))
      console.log()
    } catch (e) {
      UI.error(`Failed to release review: ${e}`)
      process.exit(1)
    }
  },
}

export const ReviewCommand: CommandModule = {
  command: "review",
  describe: "Manage GALT review queue",
  builder: (yargs: Argv) =>
    yargs
      .command(ReviewQueueCommand)
      .command(ReviewShowCommand)
      .command(ReviewApproveCommand)
      .command(ReviewRejectCommand)
      .command(ReviewClaimCommand)
      .command(ReviewReleaseCommand)
      .demandCommand(),
  handler: () => {},
}
