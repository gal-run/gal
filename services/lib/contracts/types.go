// Package contracts defines shared domain types used across all Go microservices.
// These are the canonical Go representations of the DTOs currently in @gal/types.
package contracts

import "time"

// User represents an authenticated GAL user.
type User struct {
	ID        string    `json:"id" firestore:"id"`
	Email     string    `json:"email" firestore:"email"`
	Name      string    `json:"name" firestore:"name"`
	AvatarURL string    `json:"avatarUrl" firestore:"avatarUrl"`
	OrgID     string    `json:"orgId" firestore:"orgId"`
	Role      string    `json:"role" firestore:"role"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// Organization represents a GAL customer organization.
type Organization struct {
	ID        string    `json:"id" firestore:"id"`
	Name      string    `json:"name" firestore:"name"`
	Slug      string    `json:"slug" firestore:"slug"`
	Plan      string    `json:"plan" firestore:"plan"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`
}

// Session represents a background agent session.
type Session struct {
	ID             string    `json:"id" firestore:"id"`
	OrgID          string    `json:"orgId" firestore:"orgId"`
	UserID         string    `json:"userId" firestore:"userId"`
	Agent          string    `json:"agent" firestore:"agent"`
	Prompt         string    `json:"prompt" firestore:"prompt"`
	ProjectContext string    `json:"projectContext" firestore:"projectContext"`
	Status         string    `json:"status" firestore:"status"` // pending, running, completed, failed
	Branch         string    `json:"branch" firestore:"branch"`
	WorkflowRunID  string    `json:"workflowRunId" firestore:"workflowRunId"`
	CreatedAt      time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// WorkItem represents a queue work item for agent dispatch.
type WorkItem struct {
	ID          string    `json:"id" firestore:"id"`
	OrgID       string    `json:"orgId" firestore:"orgId"`
	IssueNumber int       `json:"issueNumber" firestore:"issueNumber"`
	IssueTitle  string    `json:"issueTitle" firestore:"issueTitle"`
	Repo        string    `json:"repo" firestore:"repo"`
	Agent       string    `json:"agent" firestore:"agent"`
	Priority    float64   `json:"priority" firestore:"priority"`
	Status      string    `json:"status" firestore:"status"`
	SessionID   string    `json:"sessionId,omitempty" firestore:"sessionId,omitempty"`
	ClaimedBy   string    `json:"claimedBy,omitempty" firestore:"claimedBy,omitempty"`
	ClaimedAt   time.Time `json:"claimedAt,omitempty" firestore:"claimedAt,omitempty"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
}

// ConfigProposal represents a proposed approved configuration change.
type ConfigProposal struct {
	ID          string    `json:"id" firestore:"id"`
	OrgID       string    `json:"orgId" firestore:"orgId"`
	Repo        string    `json:"repo" firestore:"repo"`
	ConfigType  string    `json:"configType" firestore:"configType"`
	Content     string    `json:"content" firestore:"content"`
	ProposedBy  string    `json:"proposedBy" firestore:"proposedBy"`
	Status      string    `json:"status" firestore:"status"` // pending, approved, rejected
	ApprovedBy  string    `json:"approvedBy,omitempty" firestore:"approvedBy,omitempty"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// Policy represents a governance policy.
type Policy struct {
	ID         string    `json:"id" firestore:"id"`
	OrgID      string    `json:"orgId" firestore:"orgId"`
	Name       string    `json:"name" firestore:"name"`
	Rules      string    `json:"rules" firestore:"rules"` // JSON-encoded rule set
	IsActive   bool      `json:"isActive" firestore:"isActive"`
	CreatedAt  time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// BillingSubscription represents a Stripe subscription linked to an org.
type BillingSubscription struct {
	ID             string    `json:"id" firestore:"id"`
	OrgID          string    `json:"orgId" firestore:"orgId"`
	StripeSubID    string    `json:"stripeSubId" firestore:"stripeSubId"`
	StripeCustID   string    `json:"stripeCustId" firestore:"stripeCustId"`
	Plan           string    `json:"plan" firestore:"plan"`
	Seats          int       `json:"seats" firestore:"seats"`
	Status         string    `json:"status" firestore:"status"`
	CurrentPeriodEnd time.Time `json:"currentPeriodEnd" firestore:"currentPeriodEnd"`
	CreatedAt      time.Time `json:"createdAt" firestore:"createdAt"`
}

// APIError is the standard error response from all services.
type APIError struct {
	Error   string `json:"error"`
	Code    string `json:"code,omitempty"`
	Details any    `json:"details,omitempty"`
}
