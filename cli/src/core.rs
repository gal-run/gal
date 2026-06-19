//! @gal/core port — core business logic for the GAL system.
//!
//! Ported from TypeScript:
//!   - gal-shared/packages/core/src/audience-tier.ts
//!   - gal-shared/packages/core/src/index.ts

use crate::types::AudienceTier;

/// Numeric rank for each audience tier.
/// Higher rank means more privileged access.
pub fn tier_rank(tier: &AudienceTier) -> i32 {
    match tier {
        AudienceTier::Public => 0,
        AudienceTier::Partners => 1,
        AudienceTier::Internal => 2,
    }
}

/// Check whether a user's audience tier meets or exceeds the required tier.
///
/// This enables hierarchical evaluation: an 'internal' user can access
/// features gated to 'partners' or 'public'; a 'partners' user can access
/// 'public' features but not 'internal' ones.
///
/// # Examples
///
/// ```
/// use gal_cli::core::meets_audience;
/// use gal_cli::types::AudienceTier;
///
/// assert!(meets_audience(&AudienceTier::Internal, &AudienceTier::Partners));
/// assert!(!meets_audience(&AudienceTier::Partners, &AudienceTier::Internal));
/// assert!(meets_audience(&AudienceTier::Public, &AudienceTier::Public));
/// ```
pub fn meets_audience(user_tier: &AudienceTier, required: &AudienceTier) -> bool {
    tier_rank(user_tier) >= tier_rank(required)
}

/// Normalise a single org name: trim + lowercase.
pub fn normalize_org_name(org: &str) -> String {
    org.trim().to_lowercase()
}

/// Normalise a slice of org names, dropping empty strings.
pub fn normalize_org_list(orgs: &[String]) -> Vec<String> {
    orgs.iter()
        .map(|o| normalize_org_name(o))
        .filter(|o| !o.is_empty())
        .collect()
}

/// Determine the audience tier for an organization based on its properties.
///
/// # Examples
///
/// ```
/// use gal_cli::core::get_user_audience_tier;
/// use gal_cli::types::AudienceTier;
///
/// assert_eq!(get_user_audience_tier("free", None), AudienceTier::Public);
/// assert_eq!(get_user_audience_tier("enforcement", None), AudienceTier::Partners);
/// assert_eq!(get_user_audience_tier("free", Some("internal")), AudienceTier::Internal);
/// assert_eq!(get_user_audience_tier("free", Some("partners")), AudienceTier::Partners);
/// ```
pub fn get_user_audience_tier(plan: &str, audience_tier: Option<&str>) -> AudienceTier {
    match audience_tier {
        Some("internal") => return AudienceTier::Internal,
        Some("partners") => return AudienceTier::Partners,
        _ => {}
    }
    if plan != "free" {
        return AudienceTier::Partners;
    }
    AudienceTier::Public
}

/// Resolve an org's audience tier from the `audienceTier` field and subscription plan.
///
/// # Examples
///
/// ```
/// use gal_cli::core::resolve_org_tier;
/// use gal_cli::types::AudienceTier;
///
/// assert_eq!(resolve_org_tier(Some("internal"), "free"), AudienceTier::Internal);
/// assert_eq!(resolve_org_tier(Some("partners"), "free"), AudienceTier::Partners);
/// assert_eq!(resolve_org_tier(None, "enforcement"), AudienceTier::Partners);
/// assert_eq!(resolve_org_tier(None, "free"), AudienceTier::Public);
/// ```
pub fn resolve_org_tier(org_audience_tier: Option<&str>, plan: &str) -> AudienceTier {
    match org_audience_tier {
        Some("internal") => return AudienceTier::Internal,
        Some("partners") => return AudienceTier::Partners,
        _ => {}
    }
    if !plan.is_empty() && plan != "free" {
        return AudienceTier::Partners;
    }
    AudienceTier::Public
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::AudienceTier;

    #[test]
    fn test_tier_rank_ordering() {
        assert!(tier_rank(&AudienceTier::Internal) > tier_rank(&AudienceTier::Partners));
        assert!(tier_rank(&AudienceTier::Partners) > tier_rank(&AudienceTier::Public));
    }

    #[test]
    fn test_meets_audience_internal_can_do_partners() {
        assert!(meets_audience(&AudienceTier::Internal, &AudienceTier::Partners));
    }

    #[test]
    fn test_meets_audience_partners_cannot_do_internal() {
        assert!(!meets_audience(&AudienceTier::Partners, &AudienceTier::Internal));
    }

    #[test]
    fn test_meets_audience_public_is_public() {
        assert!(meets_audience(&AudienceTier::Public, &AudienceTier::Public));
    }

    #[test]
    fn test_normalize_org_name() {
        assert_eq!(normalize_org_name("  MyOrg  "), "myorg");
        assert_eq!(normalize_org_name("OrgName"), "orgname");
    }

    #[test]
    fn test_get_user_audience_tier() {
        assert_eq!(get_user_audience_tier("free", None), AudienceTier::Public);
        assert_eq!(
            get_user_audience_tier("enforcement", None),
            AudienceTier::Partners
        );
        assert_eq!(
            get_user_audience_tier("free", Some("internal")),
            AudienceTier::Internal
        );
        assert_eq!(
            get_user_audience_tier("free", Some("partners")),
            AudienceTier::Partners
        );
    }

    #[test]
    fn test_resolve_org_tier() {
        assert_eq!(
            resolve_org_tier(Some("internal"), "free"),
            AudienceTier::Internal
        );
        assert_eq!(
            resolve_org_tier(Some("partners"), "free"),
            AudienceTier::Partners
        );
        assert_eq!(resolve_org_tier(None, "enforcement"), AudienceTier::Partners);
        assert_eq!(resolve_org_tier(None, "free"), AudienceTier::Public);
    }
}
