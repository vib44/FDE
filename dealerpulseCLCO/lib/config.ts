/** The only place for business constants: stage order/colors and thresholds.
 *  Entities (branches, reps, sources, models, reasons, months) are derived from data. */
export const STAGES = ["new", "contacted", "test_drive", "negotiation", "order_placed", "delivered"] as const;
export type Stage = (typeof STAGES)[number];
export const LOST = "lost" as const;
/** Open pre-order stages (leads here can "go cold"). */
export const PRE_ORDER_STAGES: readonly Stage[] = ["new", "contacted", "test_drive", "negotiation"];
export const ORDER_STAGE: Stage = "order_placed";
export const DELIVERED_STAGE: Stage = "delivered";
export const FIRST_RESPONSE_STAGE: Stage = "contacted";

/** Filters controlled by the app-wide filter bar and carried between pages. */
export const GLOBAL_FILTER_KEYS = ["from", "to", "range", "branch", "source", "model", "basis"] as const;

/** Query parameters owned by each page; all other parameters are ignored there. */
export const PAGE_LOCAL_KEYS = {
  overview: [],
  targets: [],
  funnel: [],
  delivery: [],
  deals: [],
  leads: ["rep", "stage", "status", "leadIds", "leadSources", "sort", "order"],
} as const satisfies Record<string, readonly string[]>;

export const THRESHOLDS = {
  coldLeadDays: 14,           // pre-order lead idle longer than this is "cold"
  staleOrderDays: 30,         // order with no activity this long is "stale"
  minDeliveriesForBranchRank: 5,
  minLeadsForStageRate: 10,
  anomalyZ: 2.0,              // robust z-score cut-off
  lowAttainmentPct: 0.5,      // branch below this share of target is flagged
  recalibrationPct: 0.35,     // best branch below this => "targets may need recalibration"
  slowResponseHours: 24,      // first-response benchmark line
  minLeadsForOutlier: 10,
  minClosedLeadsForSourceWinProbability: 20,
  minLeadsForHighVolumeSource: 20,
} as const;

export const CONTROLLABLE_LOSS_REASONS = [
  "financing",
  "better offer",
  "competitor",
  "dissatisfied with test drive",
] as const;

/** Effort is an assumption, not a measurement: quick = days, medium = weeks, long = months. */
export type EffortLevel = "quick" | "medium" | "long";
export const EFFORT_LEVELS: Record<EffortLevel, { label: string; horizon: string; order: number }> = {
  quick: { label: "Quick", horizon: "days", order: 0 },
  medium: { label: "Medium", horizon: "weeks", order: 1 },
  long: { label: "Long", horizon: "months", order: 2 },
};

/** Default effort for each kind of recommended action. */
export const EFFORT_BY_ACTION = {
  contactNewLeads: "quick",
  bookTestDrives: "quick",
  chaseStalledNegotiations: "quick",
  chaseIdleOrders: "quick",
  chaseOverdueLeads: "quick",
  reassignLeads: "medium",
  financePartner: "medium",
  fixControllableDelay: "medium",
  liftStepRate: "medium",
  fixTestDriveExperience: "medium",
  fixOverallConversion: "long",
} as const satisfies Record<string, EffortLevel>;
export type ActionKey = keyof typeof EFFORT_BY_ACTION;

/** Funnel steps compared across branches to find rate gaps. */
export const RATE_GAP_STEPS = {
  booking: { from: "contacted", to: "test_drive", action: "liftStepRate" },
  closing: { from: "negotiation", to: "order_placed", action: "liftStepRate" },
  testDriveToOrder: { from: "test_drive", to: "order_placed", action: "fixOverallConversion" },
} as const satisfies Record<string, { from: Stage; to: Stage; action: ActionKey }>;

export const FUNNEL_BUCKET_TABLE = {
  maxTags: 2,
  minWidths: { branch: 160, manager: 150, value: 140, stage: 200, sources: 200, overdue: 100 },
  tooltips: {
    unordered: "Customers who haven't ordered yet. The rep still has to win the sale.",
    ordered: "Customers who have ordered. The car hasn't been delivered yet.",
    inactive: "Unordered leads with no activity for over {cold} days and orders with no activity for over {stale} days.",
  },
  noUnorderedTag: "No unordered deals left",
} as const;

export const INSIGHT_CONFIG = {
  impactRoundingStep: 1_000_000, // ₹10 L; used for ranking comparison only
  goodNewsMax: 3,
  minGoodNewsSample: 5,
  maxAlertsPerType: 2,
  minPeerBranches: 3,
  minRateGap: 0.05,           // absolute gap to the peer median before a rate gap is raised
  minOverdueLeadsPerRep: 2,
  maxOverdueReps: 3,
  reassignOverdueAt: 5,       // a rep with this many overdue leads needs reassignment, not a nudge
  idleOrderDays: THRESHOLDS.staleOrderDays,
  fallbackNegotiationDays: THRESHOLDS.coldLeadDays,
  topLossReasonRank: 3,
  financingKeywords: ["financ"],
  dissatisfactionKeywords: ["dissatisfied"],
  dissatisfactionPeerMultiple: 1.5,
  minDissatisfiedLosses: 3,
  minDissatisfactionGap: 0.03,
  controllableDelayKeywords: ["accessory", "pdi", "finance", "allocation", "logistics"],
  minDelayedOrdersForCause: 2,
} as const;

/** All briefing wording. `{name}` placeholders are filled from computed values only. */
export const INSIGHT_TEXT = {
  firstContact: {
    headline: "{n} new {leads} waiting for a first call",
    summary: "{owner} has not yet contacted {n} new {leads} worth {value}; the longest wait is {days} days.",
    action: "Call each new lead today and log the outcome.",
  },
  overdue: {
    headline: "{n} open {leads} past the expected close date",
    summary: "{owner} has {n} open {leads} worth {value} that should have closed already.",
    chaseAction: "Call each customer, then reset the expected close date or close the lead.",
    reassignAction: "Reassign these leads to reps with capacity, then agree a new close date with each customer.",
  },
  testDriveWait: {
    headline: "{n} {clients} waiting over {typical} days for a test drive",
    summary: "{owner} has {n} contacted {clients} worth {value} waiting longer than the usual {typical} days to book a test drive.",
    action: "Offer each customer a test-drive slot this week.",
  },
  stalledNegotiation: {
    headline: "{n} {deals} stuck in negotiation over {typical} days",
    summary: "{owner} has {n} {deals} worth {value} in negotiation longer than the usual {typical} days.",
    action: "Call each customer with a final offer and a decision date.",
  },
  idleOrders: {
    headline: "{n} {orders} with no activity for over {days} days",
    summary: "{owner} has {n} placed {orders} worth {value} with no update for over {days} days.",
    action: "Confirm vehicle allocation and delivery dates, then update each customer.",
    attainment: "Delivering these lifts {branch} from {from} to {to} of target.",
  },
  rateGap: {
    booking: {
      headline: "{owner} books test drives for {rate} of contacted leads",
      summary: "The peer median is {peer}. Matching it means about {extra} more test drives.",
      action: "Review {owner}'s follow-up after first contact and coach the team on booking a test drive.",
    },
    closing: {
      headline: "{owner} closes {rate} of negotiations into orders",
      summary: "The peer median is {peer}. Matching it means about {extra} more orders.",
      action: "Review {owner}'s negotiations, pricing authority and offers with the branch manager.",
    },
    testDriveToOrder: {
      headline: "{owner} turns {rate} of test drives into orders",
      summary: "The peer median is {peer}. Matching it means about {extra} more orders.",
      action: "Review {owner}'s whole test-drive-to-order process, from follow-up to offers.",
    },
    why: "{extra} extra conversions at the peer median × {gain} win-rate gain per step × {average} average delivered deal · effort {effort}",
  },
  financing: {
    headline: "Financing rejections lost {n} {deals} in negotiation",
    summary: "Financing is a top-{rank} reason for negotiation losses; {owner} has the most.",
    action: "Agree a second finance partner for customers who are turned down.",
    why: "{value} lost × {p} chance at negotiation · effort {effort}",
  },
  dissatisfaction: {
    headline: "{owner} loses {rate} of test drives to dissatisfaction",
    summary: "The peer median is {peer}. Matching it means about {extra} fewer lost test drives.",
    action: "Review {owner}'s test-drive routes, vehicle readiness and customer feedback.",
  },
  delayCause: {
    headline: "{reason} is the costliest delay at {owner}",
    summary: "It held up {count} of {total} deliveries, adding about {days} days in total.",
    action: "Fix the {reason} cause with the branch manager before the next orders land.",
    why: "{value} ordered and not delivered × {p} chance of delivery × {share} of deliveries delayed by this cause · effort {effort}",
  },
  clientWhy: "{value} × {p} chance (stage: {stages}, source: {sources}) · effort {effort}",
  strategic: {
    leadVolume: {
      headline: "Lead volume caps us at {x} of the revenue target",
      standfirst: "Even if every lead had bought, we would reach only {x} of the revenue target. The gap is lead volume, not just conversion.",
      line: "Every lead bought would reach only {x} of the revenue target",
      label: "of the revenue target reachable if every lead bought",
      link: "See where leads come from →",
    },
    targetGap: {
      headline: "Delivered revenue is {x} of target",
      line: "{gap} gap to the revenue target ({x} reached)",
      label: "gap to the revenue target",
    },
    noUnordered: {
      headline: "{n} {branches} with no unordered deals left",
      line: "No unordered deals left at {names}",
      label: "{branches} with no unordered deals",
    },
    lostBeforeContact: {
      headline: "{n} leads lost before anyone contacted them",
      line: "{n} leads were lost before first contact, worth {value}",
      label: "leads lost before first contact",
    },
  },
  goodNews: {
    fastestDelivery: "{owner} puts customers in their cars fastest, in {days} days at the median against {peer} across branches.",
    bestSource: "{owner} leads are the surest sales, closing {rate} of the time against {peer} for the median source.",
    bestClosing: "{owner} turns {rate} of negotiations into orders, ahead of the {peer} branch median.",
  },
  /** Section heading for the positives; deliberately not "Good news". */
  goodNewsHeading: "What's working",
  /** An equal-priority group names its owners and the issue: "A & B: issue". */
  groupHeadline: "{owners}: {issues}",
  groupOwnersMore: "{first} & {second} +{n}",
  groupEach: "each",
  groupSummary: "Same impact and effort: {owners}.",
  /** Short issue label per alert kind, used when several alerts share one rank. */
  issueByKind: {
    first_contact: "new leads waiting for a first call",
    overdue_leads: "open leads past the expected close date",
    test_drive_wait: "clients waiting for a test drive",
    stalled_negotiation: "negotiations stalled",
    idle_orders: "ordered deals idle {days}+ days",
    booking_rate: "test-drive booking rate below peers",
    closing_rate: "negotiation closing rate below peers",
    test_drive_to_order: "test drives not turning into orders",
    financing: "financing rejections",
    dissatisfaction: "test-drive dissatisfaction above peers",
    delay_cause: "costliest delivery delay",
  },
  ui: {
    recoverable: "Recoverable",
    whyRank: "Why this rank",
    action: "Recommended action",
    viewLeads: "View leads",
  },
  expandAll: "Show all {n}",
  collapse: "Show fewer",
} as const;

/** Overview insight blocks (bottom of the page). */
export const OVERVIEW_INSIGHTS = {
  todoVisibleCount: 5,
  ownerTagsMax: 2,
  keyInsight: {
    title: "Key insight",
    label: "is reachable only if every lead bought the car",
    line: "The gap is lead volume, not just conversion.",
    link: "See where leads come from →",
    linkHref: "/funnel#lead-sources",
  },
  todo: {
    title: "What to do first",
    takeaway: "Ranked by recoverable value, then by how quickly each can be done.",
    columns: { rank: "#", owner: "Owner", issue: "What's happening", recoverable: "Recoverable", effort: "Effort" },
    empty: "No ranked actions for the current filters.",
  },
  watch: { title: "Watch", takeaway: "Totals no single action can recover." },
  working: { title: "What's working", takeaway: "Results ahead of the peer median." },
  /** Subject shared by an alert and a strategic insight; the alert wins and the insight is hidden. */
  alertSubject: { first_contact: "first-contact" },
  insightSubject: { lost_before_contact: "first-contact" },
  /** Insights already shown elsewhere on the Overview (Revenue KPI card, Key insight). */
  hiddenInsightKinds: ["target_gap", "lead_volume"],
  /** Fact each positive reports, matched against the KPI and health-tile numbers on the page. */
  workingSubject: {
    "fastest-delivery": "branch-delivery-days",
    "best-source": "source-win-rate",
    "best-closing": "branch-closing-rate",
  },
  shownSubjects: ["win-rate", "median-delivery-days", "leads-contacted", "branches-below-target", "overdue-open-deals", "reps-with-overdue"],
} as const;

export const HEALTH_KEY_NUMBER = {
  targets: "{n} of {total} branches below target",
  funnel: "{x} of leads contacted",
  delivery: "Median {days} days",
  deals: "{n} open deals overdue",
  team: "{n} reps with overdue leads",
  none: "No data in this view",
} as const;

export const KPI_SUBLINES = {
  orders: "{x} of target cars",
  winRate: "of {n} closed deals",
  unordered: "{n} customers",
  ordered: "{n} customers awaiting delivery",
} as const;

export const DELIVERY_AGE_BUCKETS = [
  { label: "0–6 days", upperDays: 7, inclusive: false },
  { label: "7–14 days", upperDays: 15, inclusive: false },
  { label: "15–30 days", upperDays: 30, inclusive: true },
  { label: "Over 30 days", upperDays: null, inclusive: false },
] as const;
