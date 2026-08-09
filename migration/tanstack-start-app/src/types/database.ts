import type { GeneratedDatabase } from "./database.generated";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type DatabaseOverrides = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          plan: "free" | "pro" | "business" | "enterprise";
          credits: number;
          credits_reset_at: string | null;
          github_username: string | null;
          github_access_token: string | null;
          gitlab_username: string | null;
          gitlab_access_token: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          username: string | null;
          bio: string | null;
          is_public: boolean;
          cloud_default_region: string | null;
          onboarding_complete: boolean;
          workspace_knowledge: string | null;
          current_team_id: string | null;
          auto_topup_enabled: boolean;
          auto_topup_threshold: number;
          auto_topup_amount: number;
          auto_topup_pm_id: string | null;
          auto_topup_last_triggered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["profiles"]["Row"], "created_at" | "updated_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["profiles"]["Insert"]>;
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          /**
           * Mirrors projects_framework_check as widened by migration 155.
           * The original 001 list (react/next/vue/svelte) was never updated
           * here, so "react-native" — written by the composer every time
           * mobile mode is toggled — was a type error against a value the
           * database has accepted since 155.
           */
          framework:
            | "static"
            | "react"
            | "next"
            | "nextjs"
            | "vue"
            | "svelte"
            | "react-native"
            | "tanstack-start"
            | "tanstack";
          runtime: "static" | "framework";
          status: "active" | "archived" | "building";
          is_public: boolean;
          preview_url: string | null;
          deployed_url: string | null;
          github_repo: string | null;
          github_branch: string | null;
          supabase_project_url: string | null;
          template_id: string | null;
          metadata: Json | null;
          slug: string | null;
          knowledge: string | null;
          seo_title: string | null;
          seo_description: string | null;
          og_image_url: string | null;
          favicon_url: string | null;
          remix_enabled: boolean;
          remix_count: number;
          remix_of: string | null;
          badge_hidden: boolean;
          is_starred: boolean;
          total_views: number;
          git_provider: "github" | "gitlab" | "none";
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["projects"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["projects"]["Insert"]>;
      };
      project_private_context: {
        Row: {
          project_id: string;
          context_summary: string | null;
          context_summary_at: string | null;
          context_summary_covers: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["project_private_context"]["Row"], "created_at" | "updated_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["project_private_context"]["Insert"]>;
      };
      project_files: {
        Row: {
          id: string;
          project_id: string;
          path: string;
          content: string;
          language: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["project_files"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["project_files"]["Insert"]>;
      };
      messages: {
        Row: {
          id: string;
          project_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          tokens_used: number | null;
          model: string | null;
          mode: "chat" | "agent" | "plan" | "build" | "patch";
          metadata: Json | null;
          rating: 1 | -1 | null;
          created_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["messages"]["Row"], "id" | "created_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["messages"]["Insert"]>;
      };
      deployments: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          url: string | null;
          status: "building" | "live" | "failed" | "cancelled";
          provider: "lifemarkai" | "vercel" | "netlify" | "railway";
          provider_deployment_id: string | null;
          build_log: string | null;
          deployed_at: string | null;
          created_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["deployments"]["Row"], "id" | "created_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["deployments"]["Insert"]>;
      };
      collaborators: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          role: "owner" | "editor" | "viewer";
          invited_by: string;
          invited_at: string;
          accepted_at: string | null;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["collaborators"]["Row"], "id" | "invited_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["collaborators"]["Insert"]>;
      };
      templates: {
        Row: {
          id: string;
          name: string;
          description: string;
          category: string;
          preview_url: string | null;
          files: Json;
          is_featured: boolean;
          is_public: boolean;
          created_by: string | null;
          fork_count: number;
          created_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["templates"]["Row"], "id" | "created_at" | "fork_count">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["templates"]["Insert"]>;
      };
      credit_logs: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          action: string;
          project_id: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["credit_logs"]["Row"], "id" | "created_at">;
        Update: never;
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: "deploy_success" | "deploy_failed" | "credit_low" | "invite" | "system" | "ai_done";
          title: string;
          body: string | null;
          link: string | null;
          is_read: boolean;
          metadata: Json | null;
          created_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["notifications"]["Row"], "id" | "created_at" | "is_read"> & { is_read?: boolean };
        Update: Partial<DatabaseOverrides["public"]["Tables"]["notifications"]["Insert"]>;
      };
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          expires_at: string | null;
          is_active: boolean;
          scopes: string[];
          created_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["api_keys"]["Row"], "id" | "created_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["api_keys"]["Insert"]>;
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          team_id: string | null;
          action: string;
          resource_type: string | null;
          resource_id: string | null;
          metadata: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["audit_logs"]["Row"], "id" | "created_at">;
        Update: never;
      };
      job_queue: {
        Row: {
          id: string;
          type: "deploy" | "build" | "export" | "ai_batch";
          status: "pending" | "running" | "done" | "failed" | "cancelled";
          priority: number;
          payload: Json;
          result: Json | null;
          error: string | null;
          attempts: number;
          max_attempts: number;
          scheduled_at: string;
          started_at: string | null;
          completed_at: string | null;
          user_id: string | null;
          project_id: string | null;
          created_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["job_queue"]["Row"], "id" | "created_at" | "attempts">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["job_queue"]["Insert"]>;
      };
      feature_flags: {
        Row: {
          id: string;
          key: string;
          name: string;
          description: string | null;
          is_enabled: boolean;
          rollout_pct: number;
          allowed_users: Json;
          allowed_plans: Json;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["feature_flags"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["feature_flags"]["Insert"]>;
      };
      project_feature_flags: {
        Row: {
          id: string;
          project_id: string;
          key: string;
          description: string | null;
          is_enabled: boolean;
          rollout_pct: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          DatabaseOverrides["public"]["Tables"]["project_feature_flags"]["Row"],
          "id" | "created_at" | "updated_at"
        > & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Omit<
            DatabaseOverrides["public"]["Tables"]["project_feature_flags"]["Row"],
            "id" | "created_at"
          >
        >;
        Relationships: [
          {
            foreignKeyName: "project_feature_flags_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_invite_tokens: {
        Row: {
          id: string;
          project_id: string;
          created_by: string;
          role: "viewer" | "editor";
          token: string;
          expires_at: string;
          used_count: number;
          max_uses: number | null;
          created_at: string;
        };
        Insert: {
          project_id: string;
          created_by: string;
          role?: "viewer" | "editor";
          token?: string;
          expires_at?: string;
          max_uses?: number | null;
        };
        Update: Partial<DatabaseOverrides["public"]["Tables"]["project_invite_tokens"]["Insert"]>;
      };
            project_snapshots: {
        Row: {
          id: string;
          project_id: string;
          label: string;
          is_baseline: boolean;
          files: Json;
          patches: Json | null;
          parent_id: string | null;
          created_at: string;
          screenshot_url: string | null;
        };
        Insert: {
          project_id: string;
          label: string;
          is_baseline: boolean;
          files: Json;
          patches: Json | null;
          parent_id: string | null;
          screenshot_url?: string | null;
        };
        Update: Partial<DatabaseOverrides["public"]["Tables"]["project_snapshots"]["Insert"]>;
      };
      // Editor Intelligence lens/run tables (migration 068)
      project_ai_agents: {
        Row: {
          id: string;
          project_id: string;
          role: string;
          name: string;
          title: string;
          responsibilities: string[];
          memory: Json;
          status: "idle" | "thinking" | "blocked" | "reviewing" | "done";
          last_active_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          role: string;
          name: string;
          title: string;
          responsibilities?: string[];
          memory?: Json;
          status?: "idle" | "thinking" | "blocked" | "reviewing" | "done";
          last_active_at?: string | null;
        };
        Update: Partial<DatabaseOverrides["public"]["Tables"]["project_ai_agents"]["Insert"]>;
      };
      project_ai_agent_messages: {
        Row: {
          id: string;
          project_id: string;
          agent_id: string | null;
          phase: string;
          content: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          project_id: string;
          agent_id?: string | null;
          phase?: string;
          content: string;
          metadata?: Json;
        };
        Update: Partial<DatabaseOverrides["public"]["Tables"]["project_ai_agent_messages"]["Insert"]>;
      };
      project_ai_agent_decisions: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          summary: string;
          decided_by: string | null;
          status: "proposed" | "accepted" | "rejected" | "superseded";
          metadata: Json;
          created_at: string;
        };
        Insert: {
          project_id: string;
          title: string;
          summary: string;
          decided_by?: string | null;
          status?: "proposed" | "accepted" | "rejected" | "superseded";
          metadata?: Json;
        };
        Update: Partial<DatabaseOverrides["public"]["Tables"]["project_ai_agent_decisions"]["Insert"]>;
      };
      project_ai_initiatives: {
        Row: {
          id: string;
          project_id: string;
          user_id: string | null;
          goal: string;
          status: "queued" | "planning" | "debating" | "executing" | "verifying" | "paused" | "done" | "failed";
          budget_credits: number | null;
          credits_used: number;
          checkpoint: Json;
          result: Json | null;
          error: string | null;
          last_event_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          project_id: string;
          user_id?: string | null;
          goal: string;
          status?: "queued" | "planning" | "debating" | "executing" | "verifying" | "paused" | "done" | "failed";
          budget_credits?: number | null;
          credits_used?: number;
          checkpoint?: Json;
          result?: Json | null;
          error?: string | null;
          last_event_at?: string | null;
        };
        Update: Partial<DatabaseOverrides["public"]["Tables"]["project_ai_initiatives"]["Insert"]>;
      };
      project_ai_initiative_events: {
        Row: {
          id: string;
          initiative_id: string;
          project_id: string;
          type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          initiative_id: string;
          project_id: string;
          type: string;
          payload?: Json;
        };
        Update: Partial<DatabaseOverrides["public"]["Tables"]["project_ai_initiative_events"]["Insert"]>;
      };
      credit_reservations: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          action: string;
          reserved_amount: number;
          settled_amount: number | null;
          refunded_amount: number;
          status: "active" | "settled" | "cancelled" | "expired";
          expires_at: string;
          completed_at: string | null;
          balance_after: number | null;
          created_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["credit_reservations"]["Row"], "id" | "created_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["credit_reservations"]["Insert"]>;
      };
      stripe_events: {
        Row: {
          id: string;
          type: string;
          processed_at: string;
          status: "processing" | "completed" | "failed";
          claimed_at: string;
          completed_at: string | null;
          last_error: string | null;
        };
        Insert: {
          id: string;
          type: string;
          processed_at?: string;
          status?: "processing" | "completed" | "failed";
          claimed_at?: string;
          completed_at?: string | null;
          last_error?: string | null;
        };
        Update: Partial<DatabaseOverrides["public"]["Tables"]["stripe_events"]["Insert"]>;
      };
      project_cloud_credentials: {
        Row: {
          project_id: string;
          service_key: string | null;
          db_password: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<DatabaseOverrides["public"]["Tables"]["project_cloud_credentials"]["Row"], "created_at" | "updated_at">;
        Update: Partial<DatabaseOverrides["public"]["Tables"]["project_cloud_credentials"]["Insert"]>;
      };
    },
    Views: Record<string, never>;
    Functions: {
      deduct_credits: {
        Args: { user_id: string; amount: number; action: string; project_id?: string };
        Returns: boolean;
      };
      add_credits: {
        Args: { p_user_id: string; p_amount: number; p_action?: string; p_description?: string };
        Returns: void;
      };
      add_team_credits: {
        Args: { p_team_id: string; p_amount: number; p_description?: string };
        Returns: void;
      };
      grant_daily_credits: {
        Args: { p_user_id: string };
        Returns: number;
      };
      reserve_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_action: string;
          p_project_id?: string | null;
          p_ttl_seconds?: number;
        };
        Returns: string | null;
      };
      settle_credit_reservation: {
        Args: { p_reservation_id: string; p_actual_amount: number };
        Returns: number | null;
      };
      cancel_credit_reservation: {
        Args: { p_reservation_id: string };
        Returns: number | null;
      };
      log_free_credit_action: {
        Args: { p_user_id: string; p_action: "auto_fix" | "inline_edit"; p_project_id?: string | null };
        Returns: void;
      };
      claim_free_credit_action: {
        Args: {
          p_user_id: string;
          p_action: "auto_fix" | "inline_edit";
          p_daily_limit: number;
          p_project_id?: string | null;
        };
        Returns: number;
      };
      consume_project_ai_credits: {
        Args: { p_project_id: string; p_amount?: number };
        Returns: number | null;
      };
      fund_workspace_credit_pool: {
        Args: { p_team_id: string; p_user_id: string; p_amount: number };
        Returns: { ok: boolean; error?: string; remaining?: number };
      };
      create_team: {
        Args: { p_name: string; p_slug: string; p_owner_id: string };
        Returns: string;
      };
      can_access_project_private_context: {
        Args: { p_project_id: string; p_write?: boolean };
        Returns: boolean;
      };
      is_project_owner: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
      accept_project_invite_token: {
        Args: { p_token: string };
        Returns: Json;
      };
      accept_team_invite: {
        Args: { p_team_id: string; p_member_id: string };
        Returns: Json;
      };
      generate_project_slug: {
        Args: { p_name: string; p_user_id: string };
        Returns: string;
      };
      generate_app_slug: {
        Args: { p_name: string };
        Returns: string;
      };
      increment_remix_count: {
        Args: { project_id: string };
        Returns: void;
      };
      mark_notifications_read: {
        Args: { p_user_id: string };
        Returns: void;
      };
      get_unread_notification_count: {
        Args: { p_user_id: string };
        Returns: number;
      };
      log_audit_event: {
        Args: {
          p_user_id: string;
          p_action: string;
          p_resource_type?: string;
          p_resource_id?: string;
          p_metadata?: Json;
          p_team_id?: string;
        };
        Returns: void;
      };
      claim_next_job: {
        Args: { p_type?: string };
        Returns: DatabaseOverrides["public"]["Tables"]["job_queue"]["Row"][];
      };
      is_feature_enabled: {
        Args: { p_flag_key: string; p_user_id: string; p_plan: string };
        Returns: boolean;
      };
      get_snapshot_chain: {
        Args: { p_snapshot_id: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
  };
};

type GeneratedPublicSchema = GeneratedDatabase["public"];
type FunctionOverrides = DatabaseOverrides["public"]["Functions"];

/**
 * Keep the generated table/view metadata intact so supabase-js can parse joins,
 * while retaining the hand-written RPC contracts that the PostgREST OpenAPI
 * document cannot describe precisely.
 */
export type Database = Omit<GeneratedDatabase, "public"> & {
  public: Omit<GeneratedPublicSchema, "Functions"> & {
    Functions: Omit<GeneratedPublicSchema["Functions"], keyof FunctionOverrides> & FunctionOverrides;
  };
};

type DomainRow<TableName extends keyof GeneratedDatabase["public"]["Tables"]> =
  GeneratedDatabase["public"]["Tables"][TableName]["Row"] &
  (TableName extends keyof DatabaseOverrides["public"]["Tables"]
    ? DatabaseOverrides["public"]["Tables"][TableName]["Row"]
    : unknown);

// Convenience types
export type Profile = DomainRow<"profiles">;
export type Project = DomainRow<"projects">;
export type ProjectFile = DomainRow<"project_files">;
export type Message = DomainRow<"messages">;
export type Deployment = DomainRow<"deployments">;
export type Collaborator = DomainRow<"collaborators">;
export type Template = DomainRow<"templates">;
export type CreditLog = DomainRow<"credit_logs">;
export type Notification = DomainRow<"notifications">;
export type ProjectAiAgent = DomainRow<"project_ai_agents">;
export type ProjectAiAgentMessage = DomainRow<"project_ai_agent_messages">;
export type ProjectAiAgentDecision = DomainRow<"project_ai_agent_decisions">;
export type ProjectAiInitiative = DomainRow<"project_ai_initiatives">;
export type ProjectAiInitiativeEvent = DomainRow<"project_ai_initiative_events">;
