/**
 * Generated from the live Supabase PostgREST OpenAPI contract.
 * Run `npm run generate:database-types` after applying migrations.
 * Do not add domain-specific unions here; keep those in database.ts overrides.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type GeneratedDatabase = {
  public: {
    Tables: {
      "_publish_audience_backup_20260801": {
        Row: {
            "captured_at": string | null;
            "id": string | null;
            "is_public": boolean | null;
            "publish_audience": string | null;
            "visibility": string | null;
        };
        Insert: {
            "captured_at"?: string | null;
            "id"?: string | null;
            "is_public"?: boolean | null;
            "publish_audience"?: string | null;
            "visibility"?: string | null;
        };
        Update: {
            "captured_at"?: string | null;
            "id"?: string | null;
            "is_public"?: boolean | null;
            "publish_audience"?: string | null;
            "visibility"?: string | null;
        };
        Relationships: [];
      };
      "app_data": {
        Row: {
            "collection": string;
            "created_at": string;
            "data": Json;
            "id": string;
            "project_id": string;
            "updated_at": string;
        };
        Insert: {
            "collection": string;
            "created_at"?: string;
            "data"?: Json;
            "id"?: string;
            "project_id": string;
            "updated_at"?: string;
        };
        Update: {
            "collection"?: string;
            "created_at"?: string;
            "data"?: Json;
            "id"?: string;
            "project_id"?: string;
            "updated_at"?: string;
        };
        Relationships: [
          {
            foreignKeyName: "app_data_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      "panel_opens": {
        Row: {
            "created_at": string;
            "id": string;
            "panel": string;
            "project_id": string | null;
            "user_id": string;
        };
        Insert: {
            "created_at"?: string;
            "id"?: string;
            "panel": string;
            "project_id"?: string | null;
            "user_id": string;
        };
        Update: never;
        Relationships: [];
      };
      "ai_eval_log": {
        Row: {
            "created_at": string;
            "error": string | null;
            "id": number;
            "latency_ms": number | null;
            "model": string;
            "project_id": string | null;
            "success": boolean;
            "task": string | null;
            "tokens_used": number | null;
            "tool_calls": number;
            "user_id": string | null;
            "via_gateway": boolean;
        };
        Insert: {
            "created_at"?: string;
            "error"?: string | null;
            "id": number;
            "latency_ms"?: number | null;
            "model": string;
            "project_id"?: string | null;
            "success"?: boolean;
            "task"?: string | null;
            "tokens_used"?: number | null;
            "tool_calls"?: number;
            "user_id"?: string | null;
            "via_gateway"?: boolean;
        };
        Update: {
            "created_at"?: string;
            "error"?: string | null;
            "id"?: number;
            "latency_ms"?: number | null;
            "model"?: string;
            "project_id"?: string | null;
            "success"?: boolean;
            "task"?: string | null;
            "tokens_used"?: number | null;
            "tool_calls"?: number;
            "user_id"?: string | null;
            "via_gateway"?: boolean;
        };
        Relationships: [];
      };
      "ai_request_logs": {
        Row: {
            "capability": string;
            "cost": number;
            "created_at": string;
            "duration_ms": number;
            "error": string | null;
            "id": string;
            "model": string | null;
            "project_id": string;
            "request_preview": string | null;
            "status": string;
            "tokens_used": number;
        };
        Insert: {
            "capability": string;
            "cost"?: number;
            "created_at"?: string;
            "duration_ms"?: number;
            "error"?: string | null;
            "id"?: string;
            "model"?: string | null;
            "project_id": string;
            "request_preview"?: string | null;
            "status"?: string;
            "tokens_used"?: number;
        };
        Update: {
            "capability"?: string;
            "cost"?: number;
            "created_at"?: string;
            "duration_ms"?: number;
            "error"?: string | null;
            "id"?: string;
            "model"?: string | null;
            "project_id"?: string;
            "request_preview"?: string | null;
            "status"?: string;
            "tokens_used"?: number;
        };
        Relationships: [
                  {
                            "foreignKeyName": "ai_request_logs_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "analytics_events": {
        Row: {
            "created_at": string | null;
            "event_type": string;
            "id": string;
            "project_id": string | null;
            "properties": Json | null;
            "user_id": string;
        };
        Insert: {
            "created_at"?: string | null;
            "event_type": string;
            "id"?: string;
            "project_id"?: string | null;
            "properties"?: Json | null;
            "user_id": string;
        };
        Update: {
            "created_at"?: string | null;
            "event_type"?: string;
            "id"?: string;
            "project_id"?: string | null;
            "properties"?: Json | null;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "analytics_events_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "api_keys": {
        Row: {
            "created_at": string;
            "expires_at": string | null;
            "id": string;
            "is_active": boolean;
            "key_hash": string;
            "key_prefix": string;
            "last_used_at": string | null;
            "name": string;
            "revoked_at": string | null;
            "revoked_reason": string | null;
            "scopes": Array<string>;
            "user_id": string;
        };
        Insert: {
            "created_at"?: string;
            "expires_at"?: string | null;
            "id"?: string;
            "is_active"?: boolean;
            "key_hash": string;
            "key_prefix": string;
            "last_used_at"?: string | null;
            "name": string;
            "revoked_at"?: string | null;
            "revoked_reason"?: string | null;
            "scopes"?: Array<string>;
            "user_id": string;
        };
        Update: {
            "created_at"?: string;
            "expires_at"?: string | null;
            "id"?: string;
            "is_active"?: boolean;
            "key_hash"?: string;
            "key_prefix"?: string;
            "last_used_at"?: string | null;
            "name"?: string;
            "revoked_at"?: string | null;
            "revoked_reason"?: string | null;
            "scopes"?: Array<string>;
            "user_id"?: string;
        };
        Relationships: [];
      };
      "app_auth_providers": {
        Row: {
            "config": Json;
            "created_at": string;
            "enabled": boolean;
            "id": string;
            "mode": string;
            "project_id": string;
            "provider": string;
            "updated_at": string;
            "user_id": string;
        };
        Insert: {
            "config": Json;
            "created_at"?: string;
            "enabled"?: boolean;
            "id"?: string;
            "mode"?: string;
            "project_id": string;
            "provider": string;
            "updated_at"?: string;
            "user_id": string;
        };
        Update: {
            "config"?: Json;
            "created_at"?: string;
            "enabled"?: boolean;
            "id"?: string;
            "mode"?: string;
            "project_id"?: string;
            "provider"?: string;
            "updated_at"?: string;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "app_auth_providers_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "app_error_events": {
        Row: {
            "browser": string | null;
            "fingerprint": string;
            "first_seen": string;
            "id": string;
            "last_seen": string;
            "message": string;
            "occurrences": number;
            "path": string | null;
            "project_id": string;
            "resolved_at": string | null;
            "stack": string | null;
        };
        Insert: {
            "browser"?: string | null;
            "fingerprint": string;
            "first_seen"?: string;
            "id"?: string;
            "last_seen"?: string;
            "message": string;
            "occurrences"?: number;
            "path"?: string | null;
            "project_id": string;
            "resolved_at"?: string | null;
            "stack"?: string | null;
        };
        Update: {
            "browser"?: string | null;
            "fingerprint"?: string;
            "first_seen"?: string;
            "id"?: string;
            "last_seen"?: string;
            "message"?: string;
            "occurrences"?: number;
            "path"?: string | null;
            "project_id"?: string;
            "resolved_at"?: string | null;
            "stack"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "app_error_events_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "app_feedback": {
        Row: {
            "created_at": string;
            "id": string;
            "message": string | null;
            "page_url": string | null;
            "project_id": string;
            "rating": number | null;
            "user_agent": string | null;
        };
        Insert: {
            "created_at"?: string;
            "id"?: string;
            "message"?: string | null;
            "page_url"?: string | null;
            "project_id": string;
            "rating"?: number | null;
            "user_agent"?: string | null;
        };
        Update: {
            "created_at"?: string;
            "id"?: string;
            "message"?: string | null;
            "page_url"?: string | null;
            "project_id"?: string;
            "rating"?: number | null;
            "user_agent"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "app_feedback_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "app_mcp": {
        Row: {
            "actions": Json;
            "created_at": string;
            "enabled": boolean;
            "project_id": string;
            "token": string;
            "updated_at": string;
        };
        Insert: {
            "actions": Json;
            "created_at"?: string;
            "enabled"?: boolean;
            "project_id": string;
            "token"?: string;
            "updated_at"?: string;
        };
        Update: {
            "actions"?: Json;
            "created_at"?: string;
            "enabled"?: boolean;
            "project_id"?: string;
            "token"?: string;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "app_mcp_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "app_monetization": {
        Row: {
            "created_at": string;
            "currency": string;
            "enabled": boolean;
            "id": string;
            "price_cents": number;
            "project_id": string;
            "stripe_price_id": string | null;
            "stripe_product_id": string | null;
            "trial_days": number;
            "updated_at": string;
        };
        Insert: {
            "created_at"?: string;
            "currency"?: string;
            "enabled"?: boolean;
            "id"?: string;
            "price_cents"?: number;
            "project_id": string;
            "stripe_price_id"?: string | null;
            "stripe_product_id"?: string | null;
            "trial_days"?: number;
            "updated_at"?: string;
        };
        Update: {
            "created_at"?: string;
            "currency"?: string;
            "enabled"?: boolean;
            "id"?: string;
            "price_cents"?: number;
            "project_id"?: string;
            "stripe_price_id"?: string | null;
            "stripe_product_id"?: string | null;
            "trial_days"?: number;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "app_monetization_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "app_subscriptions": {
        Row: {
            "created_at": string;
            "current_period_end": string | null;
            "id": string;
            "project_id": string;
            "status": string;
            "stripe_customer_id": string | null;
            "stripe_sub_id": string | null;
            "subscriber_email": string;
            "trial_end": string | null;
            "updated_at": string;
        };
        Insert: {
            "created_at"?: string;
            "current_period_end"?: string | null;
            "id"?: string;
            "project_id": string;
            "status"?: string;
            "stripe_customer_id"?: string | null;
            "stripe_sub_id"?: string | null;
            "subscriber_email": string;
            "trial_end"?: string | null;
            "updated_at"?: string;
        };
        Update: {
            "created_at"?: string;
            "current_period_end"?: string | null;
            "id"?: string;
            "project_id"?: string;
            "status"?: string;
            "stripe_customer_id"?: string | null;
            "stripe_sub_id"?: string | null;
            "subscriber_email"?: string;
            "trial_end"?: string | null;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "app_subscriptions_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "app_user_connections": {
        Row: {
            "access_token": string;
            "app_user_id": string;
            "created_at": string;
            "expires_at": string | null;
            "id": string;
            "metadata": Json;
            "project_id": string;
            "provider": string;
            "refresh_token": string | null;
            "scopes": Array<string> | null;
            "updated_at": string;
        };
        Insert: {
            "access_token": string;
            "app_user_id": string;
            "created_at"?: string;
            "expires_at"?: string | null;
            "id"?: string;
            "metadata": Json;
            "project_id": string;
            "provider": string;
            "refresh_token"?: string | null;
            "scopes"?: Array<string> | null;
            "updated_at"?: string;
        };
        Update: {
            "access_token"?: string;
            "app_user_id"?: string;
            "created_at"?: string;
            "expires_at"?: string | null;
            "id"?: string;
            "metadata"?: Json;
            "project_id"?: string;
            "provider"?: string;
            "refresh_token"?: string | null;
            "scopes"?: Array<string> | null;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "app_user_connections_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "app_user_oauth_state": {
        Row: {
            "app_user_id": string;
            "created_at": string;
            "project_id": string;
            "provider": string;
            "redirect_to": string | null;
            "state": string;
        };
        Insert: {
            "app_user_id": string;
            "created_at"?: string;
            "project_id": string;
            "provider": string;
            "redirect_to"?: string | null;
            "state": string;
        };
        Update: {
            "app_user_id"?: string;
            "created_at"?: string;
            "project_id"?: string;
            "provider"?: string;
            "redirect_to"?: string | null;
            "state"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "app_user_oauth_state_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "app_visitors": {
        Row: {
            "created_at": string;
            "id": string;
            "last_seen": string;
            "path": string | null;
            "project_id": string;
            "referrer": string | null;
            "user_agent": string | null;
            "visitor_key": string;
        };
        Insert: {
            "created_at"?: string;
            "id"?: string;
            "last_seen"?: string;
            "path"?: string | null;
            "project_id": string;
            "referrer"?: string | null;
            "user_agent"?: string | null;
            "visitor_key": string;
        };
        Update: {
            "created_at"?: string;
            "id"?: string;
            "last_seen"?: string;
            "path"?: string | null;
            "project_id"?: string;
            "referrer"?: string | null;
            "user_agent"?: string | null;
            "visitor_key"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "app_visitors_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "audit_logs": {
        Row: {
            "action": string;
            "created_at": string;
            "id": string;
            "ip_address": string | null;
            "metadata": Json | null;
            "resource_id": string | null;
            "resource_type": string | null;
            "team_id": string | null;
            "user_agent": string | null;
            "user_id": string | null;
        };
        Insert: {
            "action": string;
            "created_at"?: string;
            "id"?: string;
            "ip_address"?: string | null;
            "metadata"?: Json | null;
            "resource_id"?: string | null;
            "resource_type"?: string | null;
            "team_id"?: string | null;
            "user_agent"?: string | null;
            "user_id"?: string | null;
        };
        Update: {
            "action"?: string;
            "created_at"?: string;
            "id"?: string;
            "ip_address"?: string | null;
            "metadata"?: Json | null;
            "resource_id"?: string | null;
            "resource_type"?: string | null;
            "team_id"?: string | null;
            "user_agent"?: string | null;
            "user_id"?: string | null;
        };
        Relationships: [];
      };
      "build_run_events": {
        Row: {
            "created_at": string;
            "id": number;
            "payload": Json;
            "run_id": string;
        };
        Insert: {
            "created_at"?: string;
            "id": number;
            "payload": Json;
            "run_id": string;
        };
        Update: {
            "created_at"?: string;
            "id"?: number;
            "payload"?: Json;
            "run_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "build_run_events_run_id_fkey",
                            "columns": [
                                      "run_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "build_runs",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "build_run_steps": {
        Row: {
            "completed_at": string;
            "error": string | null;
            "id": number;
            "result": Json | null;
            "run_id": string;
            "started_at": string;
            "status": string;
            "step_key": string;
        };
        Insert: {
            "completed_at"?: string;
            "error"?: string | null;
            "id": number;
            "result"?: Json | null;
            "run_id": string;
            "started_at"?: string;
            "status"?: string;
            "step_key": string;
        };
        Update: {
            "completed_at"?: string;
            "error"?: string | null;
            "id"?: number;
            "result"?: Json | null;
            "run_id"?: string;
            "started_at"?: string;
            "status"?: string;
            "step_key"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "build_run_steps_run_id_fkey",
                            "columns": [
                                      "run_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "build_runs",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "build_runs": {
        Row: {
            "ai_gateway_provider": string | null;
            "candidate_version": number | null;
            "completed_at": string | null;
            "credit_finalization_key": string | null;
            "credit_reservation_key": string | null;
            "credits_finalized": number | null;
            "credits_reserved": number | null;
            "failure_code": string | null;
            "id": string;
            "mode": string;
            "model": string | null;
            "project_id": string;
            "sandbox_provider": string | null;
            "started_at": string;
            "status": string;
            "user_id": string;
            "verification_passed": boolean | null;
            "workflow_provider": string;
            "workflow_run_id": string | null;
        };
        Insert: {
            "ai_gateway_provider"?: string | null;
            "candidate_version"?: number | null;
            "completed_at"?: string | null;
            "credit_finalization_key"?: string | null;
            "credit_reservation_key"?: string | null;
            "credits_finalized"?: number | null;
            "credits_reserved"?: number | null;
            "failure_code"?: string | null;
            "id": string;
            "mode": string;
            "model"?: string | null;
            "project_id": string;
            "sandbox_provider"?: string | null;
            "started_at"?: string;
            "status"?: string;
            "user_id": string;
            "verification_passed"?: boolean | null;
            "workflow_provider"?: string;
            "workflow_run_id"?: string | null;
        };
        Update: {
            "ai_gateway_provider"?: string | null;
            "candidate_version"?: number | null;
            "completed_at"?: string | null;
            "credit_finalization_key"?: string | null;
            "credit_reservation_key"?: string | null;
            "credits_finalized"?: number | null;
            "credits_reserved"?: number | null;
            "failure_code"?: string | null;
            "id"?: string;
            "mode"?: string;
            "model"?: string | null;
            "project_id"?: string;
            "sandbox_provider"?: string | null;
            "started_at"?: string;
            "status"?: string;
            "user_id"?: string;
            "verification_passed"?: boolean | null;
            "workflow_provider"?: string;
            "workflow_run_id"?: string | null;
        };
        Relationships: [];
      };
      "builtin_skills": {
        Row: {
            "description": string | null;
            "icon": string | null;
            "id": string;
            "name": string;
            "prompt": string;
            "sort_order": number | null;
            "tags": Array<string> | null;
        };
        Insert: {
            "description"?: string | null;
            "icon"?: string | null;
            "id"?: string;
            "name": string;
            "prompt": string;
            "sort_order"?: number | null;
            "tags"?: Array<string> | null;
        };
        Update: {
            "description"?: string | null;
            "icon"?: string | null;
            "id"?: string;
            "name"?: string;
            "prompt"?: string;
            "sort_order"?: number | null;
            "tags"?: Array<string> | null;
        };
        Relationships: [];
      };
      "client_telemetry": {
        Row: {
            "created_at": string;
            "id": number;
            "kind": string;
            "name": string;
            "project_hash": string | null;
            "props": Json;
            "session_sample": number;
            "surface": string;
            "user_hash": string | null;
            "value": number | null;
        };
        Insert: {
            "created_at"?: string;
            "id": number;
            "kind": string;
            "name": string;
            "project_hash"?: string | null;
            "props"?: Json;
            "session_sample"?: number;
            "surface": string;
            "user_hash"?: string | null;
            "value"?: number | null;
        };
        Update: {
            "created_at"?: string;
            "id"?: number;
            "kind"?: string;
            "name"?: string;
            "project_hash"?: string | null;
            "props"?: Json;
            "session_sample"?: number;
            "surface"?: string;
            "user_hash"?: string | null;
            "value"?: number | null;
        };
        Relationships: [];
      };
      "collaborators": {
        Row: {
            "accepted_at": string | null;
            "id": string;
            "invited_at": string;
            "invited_by": string;
            "project_id": string;
            "role": string;
            "user_id": string;
        };
        Insert: {
            "accepted_at"?: string | null;
            "id"?: string;
            "invited_at"?: string;
            "invited_by": string;
            "project_id": string;
            "role"?: string;
            "user_id": string;
        };
        Update: {
            "accepted_at"?: string | null;
            "id"?: string;
            "invited_at"?: string;
            "invited_by"?: string;
            "project_id"?: string;
            "role"?: string;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "collaborators_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "collaborators_user_id_fkey",
                            "columns": [
                                      "user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "collaborators_invited_by_fkey",
                            "columns": [
                                      "invited_by"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "community_stars": {
        Row: {
            "created_at": string;
            "id": string;
            "project_id": string;
            "user_id": string;
        };
        Insert: {
            "created_at"?: string;
            "id"?: string;
            "project_id": string;
            "user_id": string;
        };
        Update: {
            "created_at"?: string;
            "id"?: string;
            "project_id"?: string;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "community_stars_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "controlled_template_versions": {
        Row: {
            "active": boolean;
            "cache_key": string;
            "created_at": string;
            "framework": string;
            "modules": Json;
            "template_key": string;
            "version": string;
        };
        Insert: {
            "active"?: boolean;
            "cache_key": string;
            "created_at"?: string;
            "framework": string;
            "modules"?: Json;
            "template_key": string;
            "version": string;
        };
        Update: {
            "active"?: boolean;
            "cache_key"?: string;
            "created_at"?: string;
            "framework"?: string;
            "modules"?: Json;
            "template_key"?: string;
            "version"?: string;
        };
        Relationships: [];
      };
      "credit_logs": {
        Row: {
            "action": string;
            "amount": number;
            "created_at": string;
            "description": string | null;
            "id": string;
            "project_id": string | null;
            "user_id": string;
        };
        Insert: {
            "action": string;
            "amount": number;
            "created_at"?: string;
            "description"?: string | null;
            "id"?: string;
            "project_id"?: string | null;
            "user_id": string;
        };
        Update: {
            "action"?: string;
            "amount"?: number;
            "created_at"?: string;
            "description"?: string | null;
            "id"?: string;
            "project_id"?: string | null;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "credit_logs_user_id_fkey",
                            "columns": [
                                      "user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "credit_logs_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "credit_packs": {
        Row: {
            "amount": number;
            "created_at": string | null;
            "id": string;
            "pack_key": string;
            "price_cents": number;
            "status": string;
            "stripe_payment_intent_id": string | null;
            "stripe_session_id": string | null;
            "team_id": string | null;
            "user_id": string | null;
        };
        Insert: {
            "amount": number;
            "created_at"?: string | null;
            "id"?: string;
            "pack_key": string;
            "price_cents": number;
            "status"?: string;
            "stripe_payment_intent_id"?: string | null;
            "stripe_session_id"?: string | null;
            "team_id"?: string | null;
            "user_id"?: string | null;
        };
        Update: {
            "amount"?: number;
            "created_at"?: string | null;
            "id"?: string;
            "pack_key"?: string;
            "price_cents"?: number;
            "status"?: string;
            "stripe_payment_intent_id"?: string | null;
            "stripe_session_id"?: string | null;
            "team_id"?: string | null;
            "user_id"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "credit_packs_user_id_fkey",
                            "columns": [
                                      "user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "credit_packs_team_id_fkey",
                            "columns": [
                                      "team_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "teams",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "credit_reservations": {
        Row: {
            "action": string;
            "balance_after": number | null;
            "completed_at": string | null;
            "created_at": string;
            "expires_at": string;
            "id": string;
            "project_id": string | null;
            "refunded_amount": number;
            "reserved_amount": number;
            "settled_amount": number | null;
            "status": string;
            "user_id": string;
        };
        Insert: {
            "action": string;
            "balance_after"?: number | null;
            "completed_at"?: string | null;
            "created_at"?: string;
            "expires_at": string;
            "id"?: string;
            "project_id"?: string | null;
            "refunded_amount"?: number;
            "reserved_amount": number;
            "settled_amount"?: number | null;
            "status"?: string;
            "user_id": string;
        };
        Update: {
            "action"?: string;
            "balance_after"?: number | null;
            "completed_at"?: string | null;
            "created_at"?: string;
            "expires_at"?: string;
            "id"?: string;
            "project_id"?: string | null;
            "refunded_amount"?: number;
            "reserved_amount"?: number;
            "settled_amount"?: number | null;
            "status"?: string;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "credit_reservations_user_id_fkey",
                            "columns": [
                                      "user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "credit_reservations_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "credit_transfers": {
        Row: {
            "amount": number;
            "created_at": string | null;
            "from_team_id": string | null;
            "from_user_id": string | null;
            "id": string;
            "note": string | null;
            "to_team_id": string | null;
            "to_user_id": string | null;
        };
        Insert: {
            "amount": number;
            "created_at"?: string | null;
            "from_team_id"?: string | null;
            "from_user_id"?: string | null;
            "id"?: string;
            "note"?: string | null;
            "to_team_id"?: string | null;
            "to_user_id"?: string | null;
        };
        Update: {
            "amount"?: number;
            "created_at"?: string | null;
            "from_team_id"?: string | null;
            "from_user_id"?: string | null;
            "id"?: string;
            "note"?: string | null;
            "to_team_id"?: string | null;
            "to_user_id"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "credit_transfers_from_user_id_fkey",
                            "columns": [
                                      "from_user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "credit_transfers_from_team_id_fkey",
                            "columns": [
                                      "from_team_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "teams",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "credit_transfers_to_user_id_fkey",
                            "columns": [
                                      "to_user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "credit_transfers_to_team_id_fkey",
                            "columns": [
                                      "to_team_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "teams",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "db_backups": {
        Row: {
            "created_at": string;
            "id": string;
            "label": string;
            "project_id": string;
            "size_bytes": number | null;
            "status": string;
            "storage_path": string | null;
            "user_id": string;
        };
        Insert: {
            "created_at"?: string;
            "id"?: string;
            "label": string;
            "project_id": string;
            "size_bytes"?: number | null;
            "status"?: string;
            "storage_path"?: string | null;
            "user_id": string;
        };
        Update: {
            "created_at"?: string;
            "id"?: string;
            "label"?: string;
            "project_id"?: string;
            "size_bytes"?: number | null;
            "status"?: string;
            "storage_path"?: string | null;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "db_backups_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "dependency_cve_suppressions": {
        Row: {
            "advisory_id": string;
            "created_at": string;
            "id": string;
            "package_name": string;
            "project_id": string;
            "reason": string;
            "suppressed_by": string;
        };
        Insert: {
            "advisory_id": string;
            "created_at"?: string;
            "id"?: string;
            "package_name": string;
            "project_id": string;
            "reason": string;
            "suppressed_by": string;
        };
        Update: {
            "advisory_id"?: string;
            "created_at"?: string;
            "id"?: string;
            "package_name"?: string;
            "project_id"?: string;
            "reason"?: string;
            "suppressed_by"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "dependency_cve_suppressions_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "deployment_logs": {
        Row: {
            "created_at": string | null;
            "deployment_id": string;
            "id": string;
            "level": string | null;
            "message": string;
        };
        Insert: {
            "created_at"?: string | null;
            "deployment_id": string;
            "id"?: string;
            "level"?: string | null;
            "message": string;
        };
        Update: {
            "created_at"?: string | null;
            "deployment_id"?: string;
            "id"?: string;
            "level"?: string | null;
            "message"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "deployment_logs_deployment_id_fkey",
                            "columns": [
                                      "deployment_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "deployments",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "deployments": {
        Row: {
            "build_log": string | null;
            "commit_sha": string | null;
            "created_at": string;
            "deployed_at": string | null;
            "file_count": number | null;
            "id": string;
            "project_id": string;
            "provider": string;
            "provider_deployment_id": string | null;
            "snapshot_id": string | null;
            "status": string;
            "url": string | null;
            "user_id": string;
        };
        Insert: {
            "build_log"?: string | null;
            "commit_sha"?: string | null;
            "created_at"?: string;
            "deployed_at"?: string | null;
            "file_count"?: number | null;
            "id"?: string;
            "project_id": string;
            "provider"?: string;
            "provider_deployment_id"?: string | null;
            "snapshot_id"?: string | null;
            "status"?: string;
            "url"?: string | null;
            "user_id": string;
        };
        Update: {
            "build_log"?: string | null;
            "commit_sha"?: string | null;
            "created_at"?: string;
            "deployed_at"?: string | null;
            "file_count"?: number | null;
            "id"?: string;
            "project_id"?: string;
            "provider"?: string;
            "provider_deployment_id"?: string | null;
            "snapshot_id"?: string | null;
            "status"?: string;
            "url"?: string | null;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "deployments_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "deployments_user_id_fkey",
                            "columns": [
                                      "user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "deployments_snapshot_id_fkey",
                            "columns": [
                                      "snapshot_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "project_snapshots",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "domain_registrations": {
        Row: {
            "auto_renew": boolean;
            "created_at": string;
            "domain": string;
            "expires_at": string | null;
            "id": string;
            "metadata": Json;
            "price_cents": number;
            "project_id": string;
            "registrar": string;
            "registration_ref": string | null;
            "status": string;
            "stripe_ref": string | null;
            "updated_at": string;
            "user_id": string;
            "verify_token": string | null;
            "years": number;
        };
        Insert: {
            "auto_renew"?: boolean;
            "created_at"?: string;
            "domain": string;
            "expires_at"?: string | null;
            "id"?: string;
            "metadata": Json;
            "price_cents"?: number;
            "project_id": string;
            "registrar"?: string;
            "registration_ref"?: string | null;
            "status"?: string;
            "stripe_ref"?: string | null;
            "updated_at"?: string;
            "user_id": string;
            "verify_token"?: string | null;
            "years"?: number;
        };
        Update: {
            "auto_renew"?: boolean;
            "created_at"?: string;
            "domain"?: string;
            "expires_at"?: string | null;
            "id"?: string;
            "metadata"?: Json;
            "price_cents"?: number;
            "project_id"?: string;
            "registrar"?: string;
            "registration_ref"?: string | null;
            "status"?: string;
            "stripe_ref"?: string | null;
            "updated_at"?: string;
            "user_id"?: string;
            "verify_token"?: string | null;
            "years"?: number;
        };
        Relationships: [
                  {
                            "foreignKeyName": "domain_registrations_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "feature_flags": {
        Row: {
            "allowed_plans": Json | null;
            "allowed_users": Json | null;
            "created_at": string;
            "description": string | null;
            "id": string;
            "is_enabled": boolean;
            "key": string;
            "metadata": Json | null;
            "name": string;
            "rollout_pct": number;
            "updated_at": string;
        };
        Insert: {
            "allowed_plans"?: Json | null;
            "allowed_users"?: Json | null;
            "created_at"?: string;
            "description"?: string | null;
            "id"?: string;
            "is_enabled"?: boolean;
            "key": string;
            "metadata"?: Json | null;
            "name": string;
            "rollout_pct"?: number;
            "updated_at"?: string;
        };
        Update: {
            "allowed_plans"?: Json | null;
            "allowed_users"?: Json | null;
            "created_at"?: string;
            "description"?: string | null;
            "id"?: string;
            "is_enabled"?: boolean;
            "key"?: string;
            "metadata"?: Json | null;
            "name"?: string;
            "rollout_pct"?: number;
            "updated_at"?: string;
        };
        Relationships: [];
      };
      "generation_files": {
        Row: {
            "content": string;
            "created_at": string;
            "id": string;
            "language": string | null;
            "path": string;
            "run_id": string;
        };
        Insert: {
            "content": string;
            "created_at"?: string;
            "id"?: string;
            "language"?: string | null;
            "path": string;
            "run_id": string;
        };
        Update: {
            "content"?: string;
            "created_at"?: string;
            "id"?: string;
            "language"?: string | null;
            "path"?: string;
            "run_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "generation_files_run_id_fkey",
                            "columns": [
                                      "run_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "generation_runs",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "generation_runs": {
        Row: {
            "base_revision": number;
            "committed_at": string | null;
            "committed_revision": number | null;
            "created_at": string;
            "error": string | null;
            "failure_stage": string | null;
            "id": string;
            "project_id": string;
            "repair_rounds": number;
            "source": string;
            "status": string;
            "template_key": string | null;
            "template_version": string | null;
            "user_id": string;
            "verification_ms": number | null;
        };
        Insert: {
            "base_revision": number;
            "committed_at"?: string | null;
            "committed_revision"?: number | null;
            "created_at"?: string;
            "error"?: string | null;
            "failure_stage"?: string | null;
            "id"?: string;
            "project_id": string;
            "repair_rounds"?: number;
            "source"?: string;
            "status"?: string;
            "template_key"?: string | null;
            "template_version"?: string | null;
            "user_id": string;
            "verification_ms"?: number | null;
        };
        Update: {
            "base_revision"?: number;
            "committed_at"?: string | null;
            "committed_revision"?: number | null;
            "created_at"?: string;
            "error"?: string | null;
            "failure_stage"?: string | null;
            "id"?: string;
            "project_id"?: string;
            "repair_rounds"?: number;
            "source"?: string;
            "status"?: string;
            "template_key"?: string | null;
            "template_version"?: string | null;
            "user_id"?: string;
            "verification_ms"?: number | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "generation_runs_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "health_findings": {
        Row: {
            "category": string;
            "created_at": string;
            "detail": string | null;
            "file_path": string | null;
            "id": string;
            "project_id": string;
            "proposed_fix": Json | null;
            "severity": string;
            "status": string;
            "title": string;
            "updated_at": string;
            "user_id": string;
        };
        Insert: {
            "category": string;
            "created_at"?: string;
            "detail"?: string | null;
            "file_path"?: string | null;
            "id"?: string;
            "project_id": string;
            "proposed_fix"?: Json | null;
            "severity": string;
            "status"?: string;
            "title": string;
            "updated_at"?: string;
            "user_id": string;
        };
        Update: {
            "category"?: string;
            "created_at"?: string;
            "detail"?: string | null;
            "file_path"?: string | null;
            "id"?: string;
            "project_id"?: string;
            "proposed_fix"?: Json | null;
            "severity"?: string;
            "status"?: string;
            "title"?: string;
            "updated_at"?: string;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "health_findings_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "health_findings_user_id_fkey",
                            "columns": [
                                      "user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "job_executions": {
        Row: {
            "attempts": number;
            "claimed_at": string;
            "completed_at": string | null;
            "consumer": string;
            "error": string | null;
            "idempotency_key": string;
            "queue_backend": string | null;
            "status": string;
        };
        Insert: {
            "attempts"?: number;
            "claimed_at"?: string;
            "completed_at"?: string | null;
            "consumer": string;
            "error"?: string | null;
            "idempotency_key": string;
            "queue_backend"?: string | null;
            "status"?: string;
        };
        Update: {
            "attempts"?: number;
            "claimed_at"?: string;
            "completed_at"?: string | null;
            "consumer"?: string;
            "error"?: string | null;
            "idempotency_key"?: string;
            "queue_backend"?: string | null;
            "status"?: string;
        };
        Relationships: [];
      };
      "job_queue": {
        Row: {
            "attempts": number;
            "completed_at": string | null;
            "created_at": string;
            "error": string | null;
            "id": string;
            "max_attempts": number;
            "payload": Json;
            "priority": number;
            "project_id": string | null;
            "result": Json | null;
            "scheduled_at": string;
            "started_at": string | null;
            "status": string;
            "type": string;
            "user_id": string | null;
        };
        Insert: {
            "attempts"?: number;
            "completed_at"?: string | null;
            "created_at"?: string;
            "error"?: string | null;
            "id"?: string;
            "max_attempts"?: number;
            "payload": Json;
            "priority"?: number;
            "project_id"?: string | null;
            "result"?: Json | null;
            "scheduled_at"?: string;
            "started_at"?: string | null;
            "status"?: string;
            "type": string;
            "user_id"?: string | null;
        };
        Update: {
            "attempts"?: number;
            "completed_at"?: string | null;
            "created_at"?: string;
            "error"?: string | null;
            "id"?: string;
            "max_attempts"?: number;
            "payload"?: Json;
            "priority"?: number;
            "project_id"?: string | null;
            "result"?: Json | null;
            "scheduled_at"?: string;
            "started_at"?: string | null;
            "status"?: string;
            "type"?: string;
            "user_id"?: string | null;
        };
        Relationships: [];
      };
      "lifemark_cloud_auto_backups": {
        Row: {
            "created_at": string;
            "id": string;
            "notes": string | null;
            "project_id": string;
            "run_date": string;
            "snapshot_id": string | null;
            "status": string;
        };
        Insert: {
            "created_at"?: string;
            "id"?: string;
            "notes"?: string | null;
            "project_id": string;
            "run_date"?: string;
            "snapshot_id"?: string | null;
            "status"?: string;
        };
        Update: {
            "created_at"?: string;
            "id"?: string;
            "notes"?: string | null;
            "project_id"?: string;
            "run_date"?: string;
            "snapshot_id"?: string | null;
            "status"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "lifemark_cloud_auto_backups_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "lifemark_cloud_auto_backups_snapshot_id_fkey",
                            "columns": [
                                      "snapshot_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "project_snapshots",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "lifemark_cloud_instances": {
        Row: {
            "cpu_units": number;
            "description": string;
            "display_name": string;
            "monthly_cents": number;
            "ram_mb": number;
            "tier": string;
        };
        Insert: {
            "cpu_units": number;
            "description": string;
            "display_name": string;
            "monthly_cents": number;
            "ram_mb": number;
            "tier": string;
        };
        Update: {
            "cpu_units"?: number;
            "description"?: string;
            "display_name"?: string;
            "monthly_cents"?: number;
            "ram_mb"?: number;
            "tier"?: string;
        };
        Relationships: [];
      };
      "lifemark_cloud_usage": {
        Row: {
            "ai_cents": number;
            "compute_cents": number;
            "db_server_cents": number;
            "db_storage_cents": number;
            "id": string;
            "live_updates_cents": number;
            "network_cents": number;
            "project_id": string;
            "recorded_at": string;
            "storage_cents": number;
            "user_id": string;
        };
        Insert: {
            "ai_cents"?: number;
            "compute_cents"?: number;
            "db_server_cents"?: number;
            "db_storage_cents"?: number;
            "id"?: string;
            "live_updates_cents"?: number;
            "network_cents"?: number;
            "project_id": string;
            "recorded_at"?: string;
            "storage_cents"?: number;
            "user_id": string;
        };
        Update: {
            "ai_cents"?: number;
            "compute_cents"?: number;
            "db_server_cents"?: number;
            "db_storage_cents"?: number;
            "id"?: string;
            "live_updates_cents"?: number;
            "network_cents"?: number;
            "project_id"?: string;
            "recorded_at"?: string;
            "storage_cents"?: number;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "lifemark_cloud_usage_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "member_group_members": {
        Row: {
            "added_at": string;
            "group_id": string;
            "id": string;
            "member_id": string;
        };
        Insert: {
            "added_at"?: string;
            "group_id": string;
            "id"?: string;
            "member_id": string;
        };
        Update: {
            "added_at"?: string;
            "group_id"?: string;
            "id"?: string;
            "member_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "member_group_members_group_id_fkey",
                            "columns": [
                                      "group_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "member_groups",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "member_groups": {
        Row: {
            "color": string | null;
            "created_at": string;
            "description": string | null;
            "id": string;
            "name": string;
            "user_id": string;
        };
        Insert: {
            "color"?: string | null;
            "created_at"?: string;
            "description"?: string | null;
            "id"?: string;
            "name": string;
            "user_id": string;
        };
        Update: {
            "color"?: string | null;
            "created_at"?: string;
            "description"?: string | null;
            "id"?: string;
            "name"?: string;
            "user_id"?: string;
        };
        Relationships: [];
      };
      "message_embeddings": {
        Row: {
            "content_hash": string;
            "created_at": string;
            "embedding": Json;
            "message_id": string;
            "model": string;
            "project_id": string;
            "updated_at": string;
        };
        Insert: {
            "content_hash": string;
            "created_at"?: string;
            "embedding": Json;
            "message_id": string;
            "model"?: string;
            "project_id": string;
            "updated_at"?: string;
        };
        Update: {
            "content_hash"?: string;
            "created_at"?: string;
            "embedding"?: Json;
            "message_id"?: string;
            "model"?: string;
            "project_id"?: string;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "message_embeddings_message_id_fkey",
                            "columns": [
                                      "message_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "messages",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "message_embeddings_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "messages": {
        Row: {
            "content": string;
            "created_at": string;
            "id": string;
            "metadata": Json | null;
            "mode": string | null;
            "model": string | null;
            "project_id": string;
            "rating": number | null;
            "role": string;
            "tokens_used": number | null;
        };
        Insert: {
            "content": string;
            "created_at"?: string;
            "id"?: string;
            "metadata"?: Json | null;
            "mode"?: string | null;
            "model"?: string | null;
            "project_id": string;
            "rating"?: number | null;
            "role": string;
            "tokens_used"?: number | null;
        };
        Update: {
            "content"?: string;
            "created_at"?: string;
            "id"?: string;
            "metadata"?: Json | null;
            "mode"?: string | null;
            "model"?: string | null;
            "project_id"?: string;
            "rating"?: number | null;
            "role"?: string;
            "tokens_used"?: number | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "messages_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "notifications": {
        Row: {
            "body": string | null;
            "created_at": string;
            "id": string;
            "is_read": boolean;
            "link": string | null;
            "metadata": Json | null;
            "title": string;
            "type": string;
            "user_id": string;
        };
        Insert: {
            "body"?: string | null;
            "created_at"?: string;
            "id"?: string;
            "is_read"?: boolean;
            "link"?: string | null;
            "metadata"?: Json | null;
            "title": string;
            "type": string;
            "user_id": string;
        };
        Update: {
            "body"?: string | null;
            "created_at"?: string;
            "id"?: string;
            "is_read"?: boolean;
            "link"?: string | null;
            "metadata"?: Json | null;
            "title"?: string;
            "type"?: string;
            "user_id"?: string;
        };
        Relationships: [];
      };
      "oauth_tokens": {
        Row: {
            "access_token": string;
            "connector": string;
            "created_at": string;
            "expires_at": string | null;
            "id": string;
            "raw": Json | null;
            "refresh_token": string | null;
            "scope": string | null;
            "updated_at": string;
            "user_id": string;
        };
        Insert: {
            "access_token": string;
            "connector": string;
            "created_at"?: string;
            "expires_at"?: string | null;
            "id"?: string;
            "raw"?: Json | null;
            "refresh_token"?: string | null;
            "scope"?: string | null;
            "updated_at"?: string;
            "user_id": string;
        };
        Update: {
            "access_token"?: string;
            "connector"?: string;
            "created_at"?: string;
            "expires_at"?: string | null;
            "id"?: string;
            "raw"?: Json | null;
            "refresh_token"?: string | null;
            "scope"?: string | null;
            "updated_at"?: string;
            "user_id"?: string;
        };
        Relationships: [];
      };
      "preview_telemetry": {
        Row: {
            "console_lines": Json;
            "network_lines": Json;
            "project_id": string;
            "updated_at": string;
        };
        Insert: {
            "console_lines": Json;
            "network_lines": Json;
            "project_id": string;
            "updated_at"?: string;
        };
        Update: {
            "console_lines"?: Json;
            "network_lines"?: Json;
            "project_id"?: string;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "preview_telemetry_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "profiles": {
        Row: {
            "ai_style": string | null;
            "allow_code_download": boolean;
            "analytics_opt_out": boolean;
            "auto_topup_amount": number;
            "auto_topup_enabled": boolean;
            "auto_topup_last_triggered_at": string | null;
            "auto_topup_pm_id": string | null;
            "auto_topup_threshold": number;
            "avatar_url": string | null;
            "bio": string | null;
            "branded_activated_at": string | null;
            "branded_source_domain": string | null;
            "branded_status": string;
            "branded_subdomain": string | null;
            "chat_prefs": Json;
            "cloud_ai_balance_cents": number;
            "cloud_balance_cents": number;
            "cloud_default_region": string | null;
            "cloud_free_month": string | null;
            "cloud_free_used_cents": number;
            "cloud_tool_permissions": Json;
            "created_at": string;
            "credits": number;
            "credits_reset_at": string | null;
            "current_team_id": string | null;
            "daily_credits_granted_on": string | null;
            "daily_credits_month": string | null;
            "daily_credits_month_total": number;
            "email": string;
            "full_name": string | null;
            "github_access_token": string | null;
            "github_username": string | null;
            "gitlab_access_token": string | null;
            "gitlab_username": string | null;
            "id": string;
            "is_public": boolean;
            "marketing_emails": boolean;
            "mcp_api_token": string | null;
            "notification_prefs": Json;
            "onboarding_complete": boolean | null;
            "plan": string;
            "preferred_framework": string | null;
            "referral_code": string | null;
            "referral_credits_earned": number;
            "referred_by": string | null;
            "resend_domain_id": string | null;
            "resend_domain_name": string | null;
            "resend_domain_status": string | null;
            "setup_complete": boolean;
            "slug": string | null;
            "stripe_customer_id": string | null;
            "stripe_subscription_id": string | null;
            "student_discount_used": boolean;
            "telegram_chat_id": number | null;
            "telegram_link_token": string | null;
            "telegram_linked_at": string | null;
            "training_opt_out": boolean;
            "updated_at": string;
            "username": string | null;
            "workspace_knowledge": string | null;
            "workspace_name": string | null;
        };
        Insert: {
            "ai_style"?: string | null;
            "allow_code_download"?: boolean;
            "analytics_opt_out"?: boolean;
            "auto_topup_amount"?: number;
            "auto_topup_enabled"?: boolean;
            "auto_topup_last_triggered_at"?: string | null;
            "auto_topup_pm_id"?: string | null;
            "auto_topup_threshold"?: number;
            "avatar_url"?: string | null;
            "bio"?: string | null;
            "branded_activated_at"?: string | null;
            "branded_source_domain"?: string | null;
            "branded_status"?: string;
            "branded_subdomain"?: string | null;
            "chat_prefs": Json;
            "cloud_ai_balance_cents"?: number;
            "cloud_balance_cents"?: number;
            "cloud_default_region"?: string | null;
            "cloud_free_month"?: string | null;
            "cloud_free_used_cents"?: number;
            "cloud_tool_permissions": Json;
            "created_at"?: string;
            "credits"?: number;
            "credits_reset_at"?: string | null;
            "current_team_id"?: string | null;
            "daily_credits_granted_on"?: string | null;
            "daily_credits_month"?: string | null;
            "daily_credits_month_total"?: number;
            "email": string;
            "full_name"?: string | null;
            "github_access_token"?: string | null;
            "github_username"?: string | null;
            "gitlab_access_token"?: string | null;
            "gitlab_username"?: string | null;
            "id": string;
            "is_public"?: boolean;
            "marketing_emails"?: boolean;
            "mcp_api_token"?: string | null;
            "notification_prefs": Json;
            "onboarding_complete"?: boolean | null;
            "plan"?: string;
            "preferred_framework"?: string | null;
            "referral_code"?: string | null;
            "referral_credits_earned"?: number;
            "referred_by"?: string | null;
            "resend_domain_id"?: string | null;
            "resend_domain_name"?: string | null;
            "resend_domain_status"?: string | null;
            "setup_complete"?: boolean;
            "slug"?: string | null;
            "stripe_customer_id"?: string | null;
            "stripe_subscription_id"?: string | null;
            "student_discount_used"?: boolean;
            "telegram_chat_id"?: number | null;
            "telegram_link_token"?: string | null;
            "telegram_linked_at"?: string | null;
            "training_opt_out"?: boolean;
            "updated_at"?: string;
            "username"?: string | null;
            "workspace_knowledge"?: string | null;
            "workspace_name"?: string | null;
        };
        Update: {
            "ai_style"?: string | null;
            "allow_code_download"?: boolean;
            "analytics_opt_out"?: boolean;
            "auto_topup_amount"?: number;
            "auto_topup_enabled"?: boolean;
            "auto_topup_last_triggered_at"?: string | null;
            "auto_topup_pm_id"?: string | null;
            "auto_topup_threshold"?: number;
            "avatar_url"?: string | null;
            "bio"?: string | null;
            "branded_activated_at"?: string | null;
            "branded_source_domain"?: string | null;
            "branded_status"?: string;
            "branded_subdomain"?: string | null;
            "chat_prefs"?: Json;
            "cloud_ai_balance_cents"?: number;
            "cloud_balance_cents"?: number;
            "cloud_default_region"?: string | null;
            "cloud_free_month"?: string | null;
            "cloud_free_used_cents"?: number;
            "cloud_tool_permissions"?: Json;
            "created_at"?: string;
            "credits"?: number;
            "credits_reset_at"?: string | null;
            "current_team_id"?: string | null;
            "daily_credits_granted_on"?: string | null;
            "daily_credits_month"?: string | null;
            "daily_credits_month_total"?: number;
            "email"?: string;
            "full_name"?: string | null;
            "github_access_token"?: string | null;
            "github_username"?: string | null;
            "gitlab_access_token"?: string | null;
            "gitlab_username"?: string | null;
            "id"?: string;
            "is_public"?: boolean;
            "marketing_emails"?: boolean;
            "mcp_api_token"?: string | null;
            "notification_prefs"?: Json;
            "onboarding_complete"?: boolean | null;
            "plan"?: string;
            "preferred_framework"?: string | null;
            "referral_code"?: string | null;
            "referral_credits_earned"?: number;
            "referred_by"?: string | null;
            "resend_domain_id"?: string | null;
            "resend_domain_name"?: string | null;
            "resend_domain_status"?: string | null;
            "setup_complete"?: boolean;
            "slug"?: string | null;
            "stripe_customer_id"?: string | null;
            "stripe_subscription_id"?: string | null;
            "student_discount_used"?: boolean;
            "telegram_chat_id"?: number | null;
            "telegram_link_token"?: string | null;
            "telegram_linked_at"?: string | null;
            "training_opt_out"?: boolean;
            "updated_at"?: string;
            "username"?: string | null;
            "workspace_knowledge"?: string | null;
            "workspace_name"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "profiles_current_team_id_fkey",
                            "columns": [
                                      "current_team_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "teams",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_ai_agent_decisions": {
        Row: {
            "created_at": string;
            "decided_by": string | null;
            "id": string;
            "metadata": Json;
            "project_id": string;
            "status": string;
            "summary": string;
            "title": string;
        };
        Insert: {
            "created_at"?: string;
            "decided_by"?: string | null;
            "id"?: string;
            "metadata": Json;
            "project_id": string;
            "status"?: string;
            "summary": string;
            "title": string;
        };
        Update: {
            "created_at"?: string;
            "decided_by"?: string | null;
            "id"?: string;
            "metadata"?: Json;
            "project_id"?: string;
            "status"?: string;
            "summary"?: string;
            "title"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_ai_agent_decisions_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "project_ai_agent_decisions_decided_by_fkey",
                            "columns": [
                                      "decided_by"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "project_ai_agents",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_ai_agent_messages": {
        Row: {
            "agent_id": string | null;
            "content": string;
            "created_at": string;
            "id": string;
            "metadata": Json;
            "phase": string;
            "project_id": string;
        };
        Insert: {
            "agent_id"?: string | null;
            "content": string;
            "created_at"?: string;
            "id"?: string;
            "metadata": Json;
            "phase"?: string;
            "project_id": string;
        };
        Update: {
            "agent_id"?: string | null;
            "content"?: string;
            "created_at"?: string;
            "id"?: string;
            "metadata"?: Json;
            "phase"?: string;
            "project_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_ai_agent_messages_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "project_ai_agent_messages_agent_id_fkey",
                            "columns": [
                                      "agent_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "project_ai_agents",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_ai_agents": {
        Row: {
            "created_at": string;
            "id": string;
            "last_active_at": string | null;
            "memory": Json;
            "name": string;
            "project_id": string;
            "responsibilities": Array<string>;
            "role": string;
            "status": string;
            "title": string;
            "updated_at": string;
        };
        Insert: {
            "created_at"?: string;
            "id"?: string;
            "last_active_at"?: string | null;
            "memory": Json;
            "name": string;
            "project_id": string;
            "responsibilities": Array<string>;
            "role": string;
            "status"?: string;
            "title": string;
            "updated_at"?: string;
        };
        Update: {
            "created_at"?: string;
            "id"?: string;
            "last_active_at"?: string | null;
            "memory"?: Json;
            "name"?: string;
            "project_id"?: string;
            "responsibilities"?: Array<string>;
            "role"?: string;
            "status"?: string;
            "title"?: string;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_ai_agents_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_ai_initiative_events": {
        Row: {
            "created_at": string;
            "id": string;
            "initiative_id": string;
            "payload": Json;
            "project_id": string;
            "type": string;
        };
        Insert: {
            "created_at"?: string;
            "id"?: string;
            "initiative_id": string;
            "payload": Json;
            "project_id": string;
            "type": string;
        };
        Update: {
            "created_at"?: string;
            "id"?: string;
            "initiative_id"?: string;
            "payload"?: Json;
            "project_id"?: string;
            "type"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_ai_initiative_events_initiative_id_fkey",
                            "columns": [
                                      "initiative_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "project_ai_initiatives",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "project_ai_initiative_events_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_ai_initiatives": {
        Row: {
            "budget_credits": number | null;
            "checkpoint": Json;
            "created_at": string;
            "credits_used": number;
            "error": string | null;
            "goal": string;
            "id": string;
            "last_event_at": string | null;
            "project_id": string;
            "result": Json | null;
            "status": string;
            "updated_at": string;
            "user_id": string | null;
        };
        Insert: {
            "budget_credits"?: number | null;
            "checkpoint": Json;
            "created_at"?: string;
            "credits_used"?: number;
            "error"?: string | null;
            "goal": string;
            "id"?: string;
            "last_event_at"?: string | null;
            "project_id": string;
            "result"?: Json | null;
            "status"?: string;
            "updated_at"?: string;
            "user_id"?: string | null;
        };
        Update: {
            "budget_credits"?: number | null;
            "checkpoint"?: Json;
            "created_at"?: string;
            "credits_used"?: number;
            "error"?: string | null;
            "goal"?: string;
            "id"?: string;
            "last_event_at"?: string | null;
            "project_id"?: string;
            "result"?: Json | null;
            "status"?: string;
            "updated_at"?: string;
            "user_id"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_ai_initiatives_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_builds": {
        Row: {
            "build_id": string;
            "byte_size": number;
            "content": string;
            "content_type": string;
            "created_at": string;
            "encoding": string;
            "id": string;
            "path": string;
            "project_id": string;
        };
        Insert: {
            "build_id": string;
            "byte_size"?: number;
            "content": string;
            "content_type"?: string;
            "created_at"?: string;
            "encoding"?: string;
            "id"?: string;
            "path": string;
            "project_id": string;
        };
        Update: {
            "build_id"?: string;
            "byte_size"?: number;
            "content"?: string;
            "content_type"?: string;
            "created_at"?: string;
            "encoding"?: string;
            "id"?: string;
            "path"?: string;
            "project_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_builds_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_chat_state": {
        Row: {
            "bookmarked_ids": Array<string>;
            "created_at": string;
            "pinned_message_id": string | null;
            "preview_annotations": Json;
            "project_id": string;
            "prompt_queue": Json;
            "updated_at": string;
        };
        Insert: {
            "bookmarked_ids": Array<string>;
            "created_at"?: string;
            "pinned_message_id"?: string | null;
            "preview_annotations": Json;
            "project_id": string;
            "prompt_queue": Json;
            "updated_at"?: string;
        };
        Update: {
            "bookmarked_ids"?: Array<string>;
            "created_at"?: string;
            "pinned_message_id"?: string | null;
            "preview_annotations"?: Json;
            "project_id"?: string;
            "prompt_queue"?: Json;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_chat_state_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "project_chat_state_pinned_message_id_fkey",
                            "columns": [
                                      "pinned_message_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "messages",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_cloud_credentials": {
        Row: {
            "created_at": string;
            "db_password": string | null;
            "project_id": string;
            "service_key": string | null;
            "updated_at": string;
        };
        Insert: {
            "created_at"?: string;
            "db_password"?: string | null;
            "project_id": string;
            "service_key"?: string | null;
            "updated_at"?: string;
        };
        Update: {
            "created_at"?: string;
            "db_password"?: string | null;
            "project_id"?: string;
            "service_key"?: string | null;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_cloud_credentials_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_comments": {
        Row: {
            "content": string;
            "created_at": string;
            "element_preview": string | null;
            "element_tag": string | null;
            "element_xpath": string | null;
            "guest_name": string | null;
            "id": string;
            "is_guest": boolean;
            "page_path": string | null;
            "parent_id": string | null;
            "project_id": string;
            "resolved": boolean;
            "resolved_at": string | null;
            "resolved_by": string | null;
            "updated_at": string;
            "user_id": string | null;
        };
        Insert: {
            "content": string;
            "created_at"?: string;
            "element_preview"?: string | null;
            "element_tag"?: string | null;
            "element_xpath"?: string | null;
            "guest_name"?: string | null;
            "id"?: string;
            "is_guest"?: boolean;
            "page_path"?: string | null;
            "parent_id"?: string | null;
            "project_id": string;
            "resolved"?: boolean;
            "resolved_at"?: string | null;
            "resolved_by"?: string | null;
            "updated_at"?: string;
            "user_id"?: string | null;
        };
        Update: {
            "content"?: string;
            "created_at"?: string;
            "element_preview"?: string | null;
            "element_tag"?: string | null;
            "element_xpath"?: string | null;
            "guest_name"?: string | null;
            "id"?: string;
            "is_guest"?: boolean;
            "page_path"?: string | null;
            "parent_id"?: string | null;
            "project_id"?: string;
            "resolved"?: boolean;
            "resolved_at"?: string | null;
            "resolved_by"?: string | null;
            "updated_at"?: string;
            "user_id"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_comments_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "project_comments_parent_id_fkey",
                            "columns": [
                                      "parent_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "project_comments",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_data_writes": {
        Row: {
            "affected_rows": number | null;
            "approved_at": string | null;
            "approved_by": string | null;
            "error": string | null;
            "executed_at": string | null;
            "id": string;
            "kind": string;
            "previewed_rows": number | null;
            "project_id": string;
            "proposed_at": string;
            "statement": string;
            "status": string;
            "target_table": string;
        };
        Insert: {
            "affected_rows"?: number | null;
            "approved_at"?: string | null;
            "approved_by"?: string | null;
            "error"?: string | null;
            "executed_at"?: string | null;
            "id"?: string;
            "kind": string;
            "previewed_rows"?: number | null;
            "project_id": string;
            "proposed_at"?: string;
            "statement": string;
            "status"?: string;
            "target_table": string;
        };
        Update: {
            "affected_rows"?: number | null;
            "approved_at"?: string | null;
            "approved_by"?: string | null;
            "error"?: string | null;
            "executed_at"?: string | null;
            "id"?: string;
            "kind"?: string;
            "previewed_rows"?: number | null;
            "project_id"?: string;
            "proposed_at"?: string;
            "statement"?: string;
            "status"?: string;
            "target_table"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_data_writes_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_design_systems": {
        Row: {
            "connected_at": string;
            "consumer_project_id": string;
            "enabled": boolean;
            "id": string;
            "priority": number;
            "source_project_id": string;
            "user_id": string;
        };
        Insert: {
            "connected_at"?: string;
            "consumer_project_id": string;
            "enabled"?: boolean;
            "id"?: string;
            "priority"?: number;
            "source_project_id": string;
            "user_id": string;
        };
        Update: {
            "connected_at"?: string;
            "consumer_project_id"?: string;
            "enabled"?: boolean;
            "id"?: string;
            "priority"?: number;
            "source_project_id"?: string;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_design_systems_consumer_project_id_fkey",
                            "columns": [
                                      "consumer_project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "project_design_systems_source_project_id_fkey",
                            "columns": [
                                      "source_project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_feature_flags": {
        Row: {
            "created_at": string;
            "created_by": string;
            "description": string | null;
            "id": string;
            "is_enabled": boolean;
            "key": string;
            "project_id": string;
            "rollout_pct": number;
            "updated_at": string;
        };
        Insert: {
            "created_at"?: string;
            "created_by": string;
            "description"?: string | null;
            "id"?: string;
            "is_enabled"?: boolean;
            "key": string;
            "project_id": string;
            "rollout_pct"?: number;
            "updated_at"?: string;
        };
        Update: {
            "created_at"?: string;
            "created_by"?: string;
            "description"?: string | null;
            "id"?: string;
            "is_enabled"?: boolean;
            "key"?: string;
            "project_id"?: string;
            "rollout_pct"?: number;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_feature_flags_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_files": {
        Row: {
            "content": string;
            "created_at": string;
            "id": string;
            "language": string;
            "path": string;
            "project_id": string;
            "updated_at": string;
        };
        Insert: {
            "content"?: string;
            "created_at"?: string;
            "id"?: string;
            "language"?: string;
            "path": string;
            "project_id": string;
            "updated_at"?: string;
        };
        Update: {
            "content"?: string;
            "created_at"?: string;
            "id"?: string;
            "language"?: string;
            "path"?: string;
            "project_id"?: string;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_files_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_group_access": {
        Row: {
            "added_at": string;
            "group_id": string;
            "id": string;
            "project_id": string;
            "role": string;
        };
        Insert: {
            "added_at"?: string;
            "group_id": string;
            "id"?: string;
            "project_id": string;
            "role"?: string;
        };
        Update: {
            "added_at"?: string;
            "group_id"?: string;
            "id"?: string;
            "project_id"?: string;
            "role"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_group_access_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "project_group_access_group_id_fkey",
                            "columns": [
                                      "group_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "member_groups",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_groups": {
        Row: {
            "color": string;
            "created_at": string;
            "id": string;
            "name": string;
            "parent_id": string | null;
            "position": number;
            "updated_at": string;
            "user_id": string;
        };
        Insert: {
            "color"?: string;
            "created_at"?: string;
            "id"?: string;
            "name": string;
            "parent_id"?: string | null;
            "position"?: number;
            "updated_at"?: string;
            "user_id": string;
        };
        Update: {
            "color"?: string;
            "created_at"?: string;
            "id"?: string;
            "name"?: string;
            "parent_id"?: string | null;
            "position"?: number;
            "updated_at"?: string;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_groups_parent_id_fkey",
                            "columns": [
                                      "parent_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "project_groups",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_invite_tokens": {
        Row: {
            "created_at": string;
            "created_by": string;
            "expires_at": string;
            "id": string;
            "max_uses": number | null;
            "project_id": string;
            "role": string;
            "token": string;
            "used_count": number;
        };
        Insert: {
            "created_at"?: string;
            "created_by": string;
            "expires_at"?: string;
            "id"?: string;
            "max_uses"?: number | null;
            "project_id": string;
            "role"?: string;
            "token"?: string;
            "used_count"?: number;
        };
        Update: {
            "created_at"?: string;
            "created_by"?: string;
            "expires_at"?: string;
            "id"?: string;
            "max_uses"?: number | null;
            "project_id"?: string;
            "role"?: string;
            "token"?: string;
            "used_count"?: number;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_invite_tokens_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_private_context": {
        Row: {
            "context_summary": string | null;
            "context_summary_at": string | null;
            "context_summary_covers": number | null;
            "created_at": string;
            "project_id": string;
            "updated_at": string;
        };
        Insert: {
            "context_summary"?: string | null;
            "context_summary_at"?: string | null;
            "context_summary_covers"?: number | null;
            "created_at"?: string;
            "project_id": string;
            "updated_at"?: string;
        };
        Update: {
            "context_summary"?: string | null;
            "context_summary_at"?: string | null;
            "context_summary_covers"?: number | null;
            "created_at"?: string;
            "project_id"?: string;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_private_context_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_publish_grants": {
        Row: {
            "created_at": string;
            "created_by": string;
            "email": string | null;
            "group_id": string | null;
            "id": string;
            "is_external": boolean;
            "project_id": string;
            "user_id": string | null;
        };
        Insert: {
            "created_at"?: string;
            "created_by": string;
            "email"?: string | null;
            "group_id"?: string | null;
            "id"?: string;
            "is_external"?: boolean;
            "project_id": string;
            "user_id"?: string | null;
        };
        Update: {
            "created_at"?: string;
            "created_by"?: string;
            "email"?: string | null;
            "group_id"?: string | null;
            "id"?: string;
            "is_external"?: boolean;
            "project_id"?: string;
            "user_id"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_publish_grants_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "project_publish_grants_group_id_fkey",
                            "columns": [
                                      "group_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "member_groups",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_revisions": {
        Row: {
            "created_at": string;
            "created_by": string | null;
            "files": Json;
            "id": string;
            "project_id": string;
            "revision": number;
            "run_id": string | null;
        };
        Insert: {
            "created_at"?: string;
            "created_by"?: string | null;
            "files": Json;
            "id"?: string;
            "project_id": string;
            "revision": number;
            "run_id"?: string | null;
        };
        Update: {
            "created_at"?: string;
            "created_by"?: string | null;
            "files"?: Json;
            "id"?: string;
            "project_id"?: string;
            "revision"?: number;
            "run_id"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_revisions_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "project_revisions_run_id_fkey",
                            "columns": [
                                      "run_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "generation_runs",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_secrets": {
        Row: {
            "created_at": string;
            "description": string | null;
            "id": string;
            "key": string;
            "last_used_at": string | null;
            "project_id": string;
            "rotate_after_days": number | null;
            "updated_at": string;
            "value_enc": string;
        };
        Insert: {
            "created_at"?: string;
            "description"?: string | null;
            "id"?: string;
            "key": string;
            "last_used_at"?: string | null;
            "project_id": string;
            "rotate_after_days"?: number | null;
            "updated_at"?: string;
            "value_enc": string;
        };
        Update: {
            "created_at"?: string;
            "description"?: string | null;
            "id"?: string;
            "key"?: string;
            "last_used_at"?: string | null;
            "project_id"?: string;
            "rotate_after_days"?: number | null;
            "updated_at"?: string;
            "value_enc"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_secrets_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_snapshots": {
        Row: {
            "created_at": string | null;
            "files": Json;
            "id": string;
            "is_baseline": boolean;
            "is_pinned": boolean;
            "label": string | null;
            "parent_id": string | null;
            "patches": Json | null;
            "pinned_at": string | null;
            "project_id": string;
            "screenshot_url": string | null;
            "user_id": string;
        };
        Insert: {
            "created_at"?: string | null;
            "files": Json;
            "id"?: string;
            "is_baseline"?: boolean;
            "is_pinned"?: boolean;
            "label"?: string | null;
            "parent_id"?: string | null;
            "patches"?: Json | null;
            "pinned_at"?: string | null;
            "project_id": string;
            "screenshot_url"?: string | null;
            "user_id": string;
        };
        Update: {
            "created_at"?: string | null;
            "files"?: Json;
            "id"?: string;
            "is_baseline"?: boolean;
            "is_pinned"?: boolean;
            "label"?: string | null;
            "parent_id"?: string | null;
            "patches"?: Json | null;
            "pinned_at"?: string | null;
            "project_id"?: string;
            "screenshot_url"?: string | null;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_snapshots_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "project_snapshots_parent_id_fkey",
                            "columns": [
                                      "parent_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "project_snapshots",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "project_views": {
        Row: {
            "country_code": string | null;
            "created_at": string;
            "id": string;
            "ip_hash": string | null;
            "path": string | null;
            "project_id": string;
            "referrer": string | null;
            "user_agent": string | null;
            "viewer_id": string | null;
        };
        Insert: {
            "country_code"?: string | null;
            "created_at"?: string;
            "id"?: string;
            "ip_hash"?: string | null;
            "path"?: string | null;
            "project_id": string;
            "referrer"?: string | null;
            "user_agent"?: string | null;
            "viewer_id"?: string | null;
        };
        Update: {
            "country_code"?: string | null;
            "created_at"?: string;
            "id"?: string;
            "ip_hash"?: string | null;
            "path"?: string | null;
            "project_id"?: string;
            "referrer"?: string | null;
            "user_agent"?: string | null;
            "viewer_id"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "project_views_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "projects": {
        Row: {
            "ai_credit_limit": number;
            "ai_credits_used": number;
            "ai_integration_enabled": boolean;
            "ai_integration_model": string;
            "app_slug": string | null;
            "badge_hidden": boolean;
            "cloud_anon_key": string | null;
            "cloud_enabled": boolean;
            "cloud_instance": string;
            "cloud_project_ref": string | null;
            "cloud_provisioned_at": string | null;
            "cloud_region": string | null;
            "cloud_status": string;
            "cloud_supabase_url": string | null;
            "created_at": string;
            "custom_domain": string | null;
            "custom_domain_token": string | null;
            "custom_domain_verified": boolean;
            "deployed_url": string | null;
            "description": string | null;
            "design_system_meta": Json | null;
            "disabled_skill_ids": Json;
            "draft_label": string | null;
            "draft_of": string | null;
            "draft_root_id": string | null;
            "environment": string;
            "favicon_url": string | null;
            "framework": string;
            "runtime": string;
            "git_provider": string;
            "github_branch": string | null;
            "github_repo": string | null;
            "group_id": string | null;
            "id": string;
            "is_design_system": boolean;
            "is_public": boolean;
            "is_starred": boolean;
            "knowledge": string | null;
            "live_build_at": string | null;
            "live_build_id": string | null;
            "live_locked_at": string | null;
            "metadata": Json | null;
            "name": string;
            "og_image_url": string | null;
            "preview_url": string | null;
            "publish_audience": string;
            "remix_count": number;
            "remix_enabled": boolean;
            "remix_of": string | null;
            "seo_description": string | null;
            "seo_title": string | null;
            "slug": string | null;
            "star_count": number;
            "status": string;
            "supabase_project_url": string | null;
            "team_id": string | null;
            "template_id": string | null;
            "total_views": number;
            "updated_at": string;
            "user_id": string;
            "visibility": string;
        };
        Insert: {
            "ai_credit_limit"?: number;
            "ai_credits_used"?: number;
            "ai_integration_enabled"?: boolean;
            "ai_integration_model"?: string;
            "app_slug"?: string | null;
            "badge_hidden"?: boolean;
            "cloud_anon_key"?: string | null;
            "cloud_enabled"?: boolean;
            "cloud_instance"?: string;
            "cloud_project_ref"?: string | null;
            "cloud_provisioned_at"?: string | null;
            "cloud_region"?: string | null;
            "cloud_status"?: string;
            "cloud_supabase_url"?: string | null;
            "created_at"?: string;
            "custom_domain"?: string | null;
            "custom_domain_token"?: string | null;
            "custom_domain_verified"?: boolean;
            "deployed_url"?: string | null;
            "description"?: string | null;
            "design_system_meta"?: Json | null;
            "disabled_skill_ids"?: Json;
            "draft_label"?: string | null;
            "draft_of"?: string | null;
            "draft_root_id"?: string | null;
            "environment"?: string;
            "favicon_url"?: string | null;
            "framework"?: string;
            "runtime"?: string;
            "git_provider"?: string;
            "github_branch"?: string | null;
            "github_repo"?: string | null;
            "group_id"?: string | null;
            "id"?: string;
            "is_design_system"?: boolean;
            "is_public"?: boolean;
            "is_starred"?: boolean;
            "knowledge"?: string | null;
            "live_build_at"?: string | null;
            "live_build_id"?: string | null;
            "live_locked_at"?: string | null;
            "metadata"?: Json | null;
            "name": string;
            "og_image_url"?: string | null;
            "preview_url"?: string | null;
            "publish_audience"?: string;
            "remix_count"?: number;
            "remix_enabled"?: boolean;
            "remix_of"?: string | null;
            "seo_description"?: string | null;
            "seo_title"?: string | null;
            "slug"?: string | null;
            "star_count"?: number;
            "status"?: string;
            "supabase_project_url"?: string | null;
            "team_id"?: string | null;
            "template_id"?: string | null;
            "total_views"?: number;
            "updated_at"?: string;
            "user_id": string;
            "visibility"?: string;
        };
        Update: {
            "ai_credit_limit"?: number;
            "ai_credits_used"?: number;
            "ai_integration_enabled"?: boolean;
            "ai_integration_model"?: string;
            "app_slug"?: string | null;
            "badge_hidden"?: boolean;
            "cloud_anon_key"?: string | null;
            "cloud_enabled"?: boolean;
            "cloud_instance"?: string;
            "cloud_project_ref"?: string | null;
            "cloud_provisioned_at"?: string | null;
            "cloud_region"?: string | null;
            "cloud_status"?: string;
            "cloud_supabase_url"?: string | null;
            "created_at"?: string;
            "custom_domain"?: string | null;
            "custom_domain_token"?: string | null;
            "custom_domain_verified"?: boolean;
            "deployed_url"?: string | null;
            "description"?: string | null;
            "design_system_meta"?: Json | null;
            "disabled_skill_ids"?: Json;
            "draft_label"?: string | null;
            "draft_of"?: string | null;
            "draft_root_id"?: string | null;
            "environment"?: string;
            "favicon_url"?: string | null;
            "framework"?: string;
            "runtime"?: string;
            "git_provider"?: string;
            "github_branch"?: string | null;
            "github_repo"?: string | null;
            "group_id"?: string | null;
            "id"?: string;
            "is_design_system"?: boolean;
            "is_public"?: boolean;
            "is_starred"?: boolean;
            "knowledge"?: string | null;
            "live_build_at"?: string | null;
            "live_build_id"?: string | null;
            "live_locked_at"?: string | null;
            "metadata"?: Json | null;
            "name"?: string;
            "og_image_url"?: string | null;
            "preview_url"?: string | null;
            "publish_audience"?: string;
            "remix_count"?: number;
            "remix_enabled"?: boolean;
            "remix_of"?: string | null;
            "seo_description"?: string | null;
            "seo_title"?: string | null;
            "slug"?: string | null;
            "star_count"?: number;
            "status"?: string;
            "supabase_project_url"?: string | null;
            "team_id"?: string | null;
            "template_id"?: string | null;
            "total_views"?: number;
            "updated_at"?: string;
            "user_id"?: string;
            "visibility"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "projects_user_id_fkey",
                            "columns": [
                                      "user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "projects_team_id_fkey",
                            "columns": [
                                      "team_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "teams",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "projects_remix_of_fkey",
                            "columns": [
                                      "remix_of"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "projects_draft_of_fkey",
                            "columns": [
                                      "draft_of"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "projects_draft_root_id_fkey",
                            "columns": [
                                      "draft_root_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "projects_group_id_fkey",
                            "columns": [
                                      "group_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "project_groups",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "prompt_snippets": {
        Row: {
            "content": string;
            "created_at": string;
            "id": string;
            "is_public": boolean;
            "tags": Array<string>;
            "title": string;
            "updated_at": string;
            "use_count": number;
            "user_id": string;
        };
        Insert: {
            "content": string;
            "created_at"?: string;
            "id"?: string;
            "is_public"?: boolean;
            "tags": Array<string>;
            "title": string;
            "updated_at"?: string;
            "use_count"?: number;
            "user_id": string;
        };
        Update: {
            "content"?: string;
            "created_at"?: string;
            "id"?: string;
            "is_public"?: boolean;
            "tags"?: Array<string>;
            "title"?: string;
            "updated_at"?: string;
            "use_count"?: number;
            "user_id"?: string;
        };
        Relationships: [];
      };
      "public_profiles": {
        Row: {
            "avatar_url": string | null;
            "created_at": string | null;
            "full_name": string | null;
            "id": string | null;
            "username": string | null;
        };
        Insert: {
            "avatar_url"?: string | null;
            "created_at"?: string | null;
            "full_name"?: string | null;
            "id"?: string | null;
            "username"?: string | null;
        };
        Update: {
            "avatar_url"?: string | null;
            "created_at"?: string | null;
            "full_name"?: string | null;
            "id"?: string | null;
            "username"?: string | null;
        };
        Relationships: [];
      };
      "referrals": {
        Row: {
            "created_at": string;
            "credited_at": string | null;
            "credits_given": number;
            "id": string;
            "referee_id": string;
            "referrer_id": string;
            "status": string;
        };
        Insert: {
            "created_at"?: string;
            "credited_at"?: string | null;
            "credits_given"?: number;
            "id"?: string;
            "referee_id": string;
            "referrer_id": string;
            "status"?: string;
        };
        Update: {
            "created_at"?: string;
            "credited_at"?: string | null;
            "credits_given"?: number;
            "id"?: string;
            "referee_id"?: string;
            "referrer_id"?: string;
            "status"?: string;
        };
        Relationships: [];
      };
      "repair_outcomes": {
        Row: {
            "before_fingerprints": Array<string>;
            "created_at": string;
            "duration_ms": number | null;
            "files_rejected": Array<string>;
            "files_written": Array<string>;
            "fully_resolved": boolean;
            "id": string;
            "introduced": Array<string>;
            "made_worse": boolean;
            "model": string | null;
            "project_id": string | null;
            "remaining": Array<string>;
            "resolved": Array<string>;
            "round": number;
            "sample_label": string | null;
            "signal": string;
            "stage": string;
            "user_id": string | null;
        };
        Insert: {
            "before_fingerprints"?: Array<string>;
            "created_at"?: string;
            "duration_ms"?: number | null;
            "files_rejected"?: Array<string>;
            "files_written"?: Array<string>;
            "fully_resolved"?: boolean;
            "id"?: string;
            "introduced"?: Array<string>;
            "made_worse"?: boolean;
            "model"?: string | null;
            "project_id"?: string | null;
            "remaining"?: Array<string>;
            "resolved"?: Array<string>;
            "round"?: number;
            "sample_label"?: string | null;
            "signal": string;
            "stage": string;
            "user_id"?: string | null;
        };
        Update: {
            "before_fingerprints"?: Array<string>;
            "created_at"?: string;
            "duration_ms"?: number | null;
            "files_rejected"?: Array<string>;
            "files_written"?: Array<string>;
            "fully_resolved"?: boolean;
            "id"?: string;
            "introduced"?: Array<string>;
            "made_worse"?: boolean;
            "model"?: string | null;
            "project_id"?: string | null;
            "remaining"?: Array<string>;
            "resolved"?: Array<string>;
            "round"?: number;
            "sample_label"?: string | null;
            "signal"?: string;
            "stage"?: string;
            "user_id"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "repair_outcomes_project_id_fkey",
                            "columns": [
                                      "project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "secret_access_logs": {
        Row: {
            "accessed_at": string;
            "action": string;
            "id": string;
            "project_id": string;
            "secret_id": string;
            "user_id": string;
        };
        Insert: {
            "accessed_at"?: string;
            "action": string;
            "id"?: string;
            "project_id": string;
            "secret_id": string;
            "user_id": string;
        };
        Update: {
            "accessed_at"?: string;
            "action"?: string;
            "id"?: string;
            "project_id"?: string;
            "secret_id"?: string;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "secret_access_logs_secret_id_fkey",
                            "columns": [
                                      "secret_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "project_secrets",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "stripe_events": {
        Row: {
            "claimed_at": string;
            "completed_at": string | null;
            "id": string;
            "last_error": string | null;
            "processed_at": string;
            "status": string;
            "type": string;
        };
        Insert: {
            "claimed_at"?: string;
            "completed_at"?: string | null;
            "id": string;
            "last_error"?: string | null;
            "processed_at"?: string;
            "status"?: string;
            "type": string;
        };
        Update: {
            "claimed_at"?: string;
            "completed_at"?: string | null;
            "id"?: string;
            "last_error"?: string | null;
            "processed_at"?: string;
            "status"?: string;
            "type"?: string;
        };
        Relationships: [];
      };
      "team_members": {
        Row: {
            "accepted_at": string | null;
            "created_at": string | null;
            "credit_allowance": number | null;
            "credits_used": number;
            "id": string;
            "invited_by": string | null;
            "invited_email": string | null;
            "role": string;
            "team_id": string;
            "user_id": string | null;
        };
        Insert: {
            "accepted_at"?: string | null;
            "created_at"?: string | null;
            "credit_allowance"?: number | null;
            "credits_used"?: number;
            "id"?: string;
            "invited_by"?: string | null;
            "invited_email"?: string | null;
            "role"?: string;
            "team_id": string;
            "user_id"?: string | null;
        };
        Update: {
            "accepted_at"?: string | null;
            "created_at"?: string | null;
            "credit_allowance"?: number | null;
            "credits_used"?: number;
            "id"?: string;
            "invited_by"?: string | null;
            "invited_email"?: string | null;
            "role"?: string;
            "team_id"?: string;
            "user_id"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "team_members_team_id_fkey",
                            "columns": [
                                      "team_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "teams",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "team_members_user_id_fkey",
                            "columns": [
                                      "user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "team_members_invited_by_fkey",
                            "columns": [
                                      "invited_by"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "teams": {
        Row: {
            "avatar_url": string | null;
            "created_at": string | null;
            "credits": number;
            "id": string;
            "max_members": number;
            "name": string;
            "owner_id": string;
            "plan": string;
            "slug": string;
            "stripe_customer_id": string | null;
            "stripe_subscription_id": string | null;
            "updated_at": string | null;
        };
        Insert: {
            "avatar_url"?: string | null;
            "created_at"?: string | null;
            "credits"?: number;
            "id"?: string;
            "max_members"?: number;
            "name": string;
            "owner_id": string;
            "plan"?: string;
            "slug": string;
            "stripe_customer_id"?: string | null;
            "stripe_subscription_id"?: string | null;
            "updated_at"?: string | null;
        };
        Update: {
            "avatar_url"?: string | null;
            "created_at"?: string | null;
            "credits"?: number;
            "id"?: string;
            "max_members"?: number;
            "name"?: string;
            "owner_id"?: string;
            "plan"?: string;
            "slug"?: string;
            "stripe_customer_id"?: string | null;
            "stripe_subscription_id"?: string | null;
            "updated_at"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "teams_owner_id_fkey",
                            "columns": [
                                      "owner_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "templates": {
        Row: {
            "category": string;
            "created_at": string;
            "created_by": string | null;
            "description": string;
            "files": Json;
            "fork_count": number;
            "id": string;
            "is_featured": boolean;
            "is_public": boolean;
            "name": string;
            "preview_url": string | null;
            "source_project_id": string | null;
        };
        Insert: {
            "category": string;
            "created_at"?: string;
            "created_by"?: string | null;
            "description": string;
            "files": Json;
            "fork_count"?: number;
            "id"?: string;
            "is_featured"?: boolean;
            "is_public"?: boolean;
            "name": string;
            "preview_url"?: string | null;
            "source_project_id"?: string | null;
        };
        Update: {
            "category"?: string;
            "created_at"?: string;
            "created_by"?: string | null;
            "description"?: string;
            "files"?: Json;
            "fork_count"?: number;
            "id"?: string;
            "is_featured"?: boolean;
            "is_public"?: boolean;
            "name"?: string;
            "preview_url"?: string | null;
            "source_project_id"?: string | null;
        };
        Relationships: [
                  {
                            "foreignKeyName": "templates_created_by_fkey",
                            "columns": [
                                      "created_by"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  },
                  {
                            "foreignKeyName": "templates_source_project_id_fkey",
                            "columns": [
                                      "source_project_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "projects",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "user_devices": {
        Row: {
            "device_hash": string;
            "first_seen_at": string;
            "id": string;
            "last_seen_at": string;
            "user_agent": string | null;
            "user_id": string;
        };
        Insert: {
            "device_hash": string;
            "first_seen_at"?: string;
            "id"?: string;
            "last_seen_at"?: string;
            "user_agent"?: string | null;
            "user_id": string;
        };
        Update: {
            "device_hash"?: string;
            "first_seen_at"?: string;
            "id"?: string;
            "last_seen_at"?: string;
            "user_agent"?: string | null;
            "user_id"?: string;
        };
        Relationships: [];
      };
      "user_mcp_servers": {
        Row: {
            "auth_header": string | null;
            "created_at": string;
            "enabled": boolean;
            "id": string;
            "last_status": string | null;
            "last_tools": Json | null;
            "name": string;
            "updated_at": string;
            "url": string;
            "user_id": string;
        };
        Insert: {
            "auth_header"?: string | null;
            "created_at"?: string;
            "enabled"?: boolean;
            "id"?: string;
            "last_status"?: string | null;
            "last_tools"?: Json | null;
            "name": string;
            "updated_at"?: string;
            "url": string;
            "user_id": string;
        };
        Update: {
            "auth_header"?: string | null;
            "created_at"?: string;
            "enabled"?: boolean;
            "id"?: string;
            "last_status"?: string | null;
            "last_tools"?: Json | null;
            "name"?: string;
            "updated_at"?: string;
            "url"?: string;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "user_mcp_servers_user_id_fkey",
                            "columns": [
                                      "user_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "workspace_branding": {
        Row: {
            "company_name": string | null;
            "custom_domain": string | null;
            "hide_powered_by": boolean;
            "id": string;
            "logo_url": string | null;
            "primary_color": string | null;
            "support_email": string | null;
            "team_id": string;
            "updated_at": string;
        };
        Insert: {
            "company_name"?: string | null;
            "custom_domain"?: string | null;
            "hide_powered_by"?: boolean;
            "id"?: string;
            "logo_url"?: string | null;
            "primary_color"?: string | null;
            "support_email"?: string | null;
            "team_id": string;
            "updated_at"?: string;
        };
        Update: {
            "company_name"?: string | null;
            "custom_domain"?: string | null;
            "hide_powered_by"?: boolean;
            "id"?: string;
            "logo_url"?: string | null;
            "primary_color"?: string | null;
            "support_email"?: string | null;
            "team_id"?: string;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "workspace_branding_team_id_fkey",
                            "columns": [
                                      "team_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "teams",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "workspace_credit_pools": {
        Row: {
            "created_at": string;
            "id": string;
            "last_reset_at": string;
            "reset_day": number;
            "team_id": string;
            "total_credits": number;
            "updated_at": string;
            "used_credits": number;
        };
        Insert: {
            "created_at"?: string;
            "id"?: string;
            "last_reset_at"?: string;
            "reset_day"?: number;
            "team_id": string;
            "total_credits"?: number;
            "updated_at"?: string;
            "used_credits"?: number;
        };
        Update: {
            "created_at"?: string;
            "id"?: string;
            "last_reset_at"?: string;
            "reset_day"?: number;
            "team_id"?: string;
            "total_credits"?: number;
            "updated_at"?: string;
            "used_credits"?: number;
        };
        Relationships: [
                  {
                            "foreignKeyName": "workspace_credit_pools_team_id_fkey",
                            "columns": [
                                      "team_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "teams",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "workspace_domains": {
        Row: {
            "created_at": string;
            "domain": string;
            "id": string;
            "user_id": string;
            "verification_token": string;
            "verified_at": string | null;
        };
        Insert: {
            "created_at"?: string;
            "domain": string;
            "id"?: string;
            "user_id": string;
            "verification_token": string;
            "verified_at"?: string | null;
        };
        Update: {
            "created_at"?: string;
            "domain"?: string;
            "id"?: string;
            "user_id"?: string;
            "verification_token"?: string;
            "verified_at"?: string | null;
        };
        Relationships: [];
      };
      "workspace_identity_settings": {
        Row: {
            "enforce_sso": boolean;
            "jit_default_role": string;
            "jit_enabled": boolean;
            "owner_id": string;
            "scim_api_key_hash": string | null;
            "scim_api_key_prefix": string | null;
            "scim_config": Json;
            "sso_config": Json | null;
            "sso_session_duration": string;
            "updated_at": string;
            "verified_domains": Array<string>;
        };
        Insert: {
            "enforce_sso"?: boolean;
            "jit_default_role"?: string;
            "jit_enabled"?: boolean;
            "owner_id": string;
            "scim_api_key_hash"?: string | null;
            "scim_api_key_prefix"?: string | null;
            "scim_config": Json;
            "sso_config"?: Json | null;
            "sso_session_duration"?: string;
            "updated_at"?: string;
            "verified_domains": Array<string>;
        };
        Update: {
            "enforce_sso"?: boolean;
            "jit_default_role"?: string;
            "jit_enabled"?: boolean;
            "owner_id"?: string;
            "scim_api_key_hash"?: string | null;
            "scim_api_key_prefix"?: string | null;
            "scim_config"?: Json;
            "sso_config"?: Json | null;
            "sso_session_duration"?: string;
            "updated_at"?: string;
            "verified_domains"?: Array<string>;
        };
        Relationships: [
                  {
                            "foreignKeyName": "workspace_identity_settings_owner_id_fkey",
                            "columns": [
                                      "owner_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "workspace_member_caps": {
        Row: {
            "created_at": string;
            "id": string;
            "monthly_cap": number;
            "team_id": string;
            "updated_at": string;
            "used_this_month": number;
            "user_id": string;
        };
        Insert: {
            "created_at"?: string;
            "id"?: string;
            "monthly_cap"?: number;
            "team_id": string;
            "updated_at"?: string;
            "used_this_month"?: number;
            "user_id": string;
        };
        Update: {
            "created_at"?: string;
            "id"?: string;
            "monthly_cap"?: number;
            "team_id"?: string;
            "updated_at"?: string;
            "used_this_month"?: number;
            "user_id"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "workspace_member_caps_team_id_fkey",
                            "columns": [
                                      "team_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "teams",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "workspace_scim_users": {
        Row: {
            "active": boolean;
            "created_at": string;
            "display_name": string | null;
            "email": string;
            "external_id": string;
            "groups": Array<string>;
            "id": string;
            "owner_id": string;
            "role": string;
            "updated_at": string;
        };
        Insert: {
            "active"?: boolean;
            "created_at"?: string;
            "display_name"?: string | null;
            "email": string;
            "external_id": string;
            "groups": Array<string>;
            "id"?: string;
            "owner_id": string;
            "role"?: string;
            "updated_at"?: string;
        };
        Update: {
            "active"?: boolean;
            "created_at"?: string;
            "display_name"?: string | null;
            "email"?: string;
            "external_id"?: string;
            "groups"?: Array<string>;
            "id"?: string;
            "owner_id"?: string;
            "role"?: string;
            "updated_at"?: string;
        };
        Relationships: [
                  {
                            "foreignKeyName": "workspace_scim_users_owner_id_fkey",
                            "columns": [
                                      "owner_id"
                            ],
                            "isOneToOne": false,
                            "referencedRelation": "profiles",
                            "referencedColumns": [
                                      "id"
                            ]
                  }
        ];
      };
      "workspace_skills": {
        Row: {
            "created_at": string;
            "description": string | null;
            "icon": string | null;
            "id": string;
            "name": string;
            "prompt": string;
            "tags": Array<string> | null;
            "updated_at": string;
            "use_count": number;
            "user_id": string;
        };
        Insert: {
            "created_at"?: string;
            "description"?: string | null;
            "icon"?: string | null;
            "id"?: string;
            "name": string;
            "prompt": string;
            "tags"?: Array<string> | null;
            "updated_at"?: string;
            "use_count"?: number;
            "user_id": string;
        };
        Update: {
            "created_at"?: string;
            "description"?: string | null;
            "icon"?: string | null;
            "id"?: string;
            "name"?: string;
            "prompt"?: string;
            "tags"?: Array<string> | null;
            "updated_at"?: string;
            "use_count"?: number;
            "user_id"?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      "accept_project_invite_token": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "accept_team_invite": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "add_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "add_team_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "add_workspace_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "apply_plan_renewal": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "bill_cloud_usage": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "can_access_project_private_context": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "cancel_credit_reservation": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "claim_free_credit_action": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "claim_next_job": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "cleanup_stale_visitors": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "consume_project_ai_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "count_delta_chain": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "create_team": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "debit_ai_balance": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "deduct_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "deduct_team_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "deduct_workspace_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "exec_sql": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "fund_workspace_credit_pool": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "generate_app_slug": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "generate_project_slug": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "get_project_view_stats": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "get_snapshot_chain": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "get_unread_notification_count": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "get_user_stats": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "grant_daily_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "increment_fork_count": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "increment_remix_count": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "increment_skill_use": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "increment_snippet_use_count": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "is_feature_enabled": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "is_project_owner": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "log_audit_event": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "log_free_credit_action": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "mark_notifications_read": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "purge_old_audit_logs": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "record_app_error": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "reserve_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "reset_free_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "reset_monthly_credit_usage": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "rls_auto_enable": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "settle_credit_reservation": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
      "transfer_credits": {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
  };
};
