export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
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
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          framework: "react" | "next" | "vue" | "svelte";
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
        Insert: Omit<Database["public"]["Tables"]["projects"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["projects"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["project_files"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["project_files"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["messages"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["deployments"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["deployments"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["collaborators"]["Row"], "id" | "invited_at">;
        Update: Partial<Database["public"]["Tables"]["collaborators"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["templates"]["Row"], "id" | "created_at" | "fork_count">;
        Update: Partial<Database["public"]["Tables"]["templates"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["credit_logs"]["Row"], "id" | "created_at">;
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
        Insert: Omit<Database["public"]["Tables"]["notifications"]["Row"], "id" | "created_at" | "is_read"> & { is_read?: boolean };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
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
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["api_keys"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["api_keys"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["audit_logs"]["Row"], "id" | "created_at">;
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
        Insert: Omit<Database["public"]["Tables"]["job_queue"]["Row"], "id" | "created_at" | "attempts">;
        Update: Partial<Database["public"]["Tables"]["job_queue"]["Insert"]>;
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
        Insert: Omit<Database["public"]["Tables"]["feature_flags"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["feature_flags"]["Insert"]>;
      };
      project_invite_tokens: {
        Row: {
          id: string;
          project_id: string;
          created_by: string;
          role: string;
          token: string;
          expires_at: string;
          used_count: number;
          max_uses: number | null;
          created_at: string;
        };
        Insert: {
          project_id: string;
          created_by: string;
          role?: string;
          token?: string;
          expires_at?: string;
          max_uses?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["project_invite_tokens"]["Insert"]>;
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
        Update: Partial<Database["public"]["Tables"]["project_snapshots"]["Insert"]>;
      };
    },
    Views: Record<string, never>;
    Functions: {
      deduct_credits: {
        Args: { user_id: string; amount: number; action: string; project_id?: string };
        Returns: boolean;
      };
      add_credits: {
        Args: { p_user_id: string; p_amount: number };
        Returns: void;
      };
      add_team_credits: {
        Args: { p_team_id: string; p_amount: number };
        Returns: void;
      };
      generate_project_slug: {
        Args: { project_id: string };
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
        Returns: Database["public"]["Tables"]["job_queue"]["Row"][];
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

// Convenience types
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectFile = Database["public"]["Tables"]["project_files"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type Deployment = Database["public"]["Tables"]["deployments"]["Row"];
export type Collaborator = Database["public"]["Tables"]["collaborators"]["Row"];
export type Template = Database["public"]["Tables"]["templates"]["Row"];
export type CreditLog = Database["public"]["Tables"]["credit_logs"]["Row"];