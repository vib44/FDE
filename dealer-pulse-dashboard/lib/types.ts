export type DateRange = { from: Date; to: Date };
export type Branch = { id: string; name: string; city: string };
export type SalesRep = {
  id: string;
  name: string;
  branch_id: string;
  role: "branch_manager" | "sales_officer";
  joined: string;
};
export type LeadStatus =
  | "new"
  | "contacted"
  | "test_drive"
  | "negotiation"
  | "order_placed"
  | "delivered"
  | "lost";
export type Lead = {
  id: string;
  customer_name: string;
  phone: string;
  source:
    | "website"
    | "walk_in"
    | "referral"
    | "social_media"
    | "phone_enquiry"
    | "auto_expo";
  model_interested: string;
  status: LeadStatus;
  assigned_to: string;
  branch_id: string;
  created_at: string;
  last_activity_at: string;
  status_history: { status: LeadStatus; timestamp: string; note: string }[];
  expected_close_date: string;
  deal_value: number;
  lost_reason: string | null;
};
export type Target = {
  branch_id: string;
  month: string;
  target_units: number;
  target_revenue: number;
};
export type Delivery = {
  lead_id: string;
  order_date: string;
  delivery_date: string;
  days_to_deliver: number;
  delay_reason: string | null;
};
export type Dataset = {
  metadata: { 
   generated_at: string;
    description: string;
    date_range: string;
    notes: string; };
  branches: Branch[];
  sales_reps: SalesRep[];
  leads: Lead[];
  targets: Target[];
  deliveries: Delivery[];
};
export type MetricsInput = DateRange & { branchId?: string };
