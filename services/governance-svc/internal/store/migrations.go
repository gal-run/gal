package store

import _ "embed"

// InitSchema is the embedded Postgres schema applied on boot when the Postgres
// backend is selected (GOV_STORE=postgres). Kept in-binary so the OSS self-host
// build needs no external migration step.
//
//go:embed migrations/0001_init.sql
var InitSchema string
