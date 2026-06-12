export type { StealthxPlan, StealthxServer } from "@/services/stealthx-api";

export interface StealthxUserProfile {
  user_id: number;
  email: string | null;
  display_name: string | null;
  subscription_status: string | null;
  active_keys: number;
}
