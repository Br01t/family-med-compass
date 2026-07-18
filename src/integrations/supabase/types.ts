export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      caregiver_patients: {
        Row: {
          caregiver_id: string
          created_at: string
          patient_id: string
          relationship: string | null
        }
        Insert: {
          caregiver_id: string
          created_at?: string
          patient_id: string
          relationship?: string | null
        }
        Update: {
          caregiver_id?: string
          created_at?: string
          patient_id?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caregiver_patients_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      caregivers: {
        Row: {
          created_at: string
          id: string
          name: string | null
          notify: Json | null
          photo: string | null
          relation: string | null
        }
        Insert: {
          created_at?: string
          id: string
          name?: string | null
          notify?: Json | null
          photo?: string | null
          relation?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          notify?: Json | null
          photo?: string | null
          relation?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          note: string | null
          patient_id: string
          scheduled_at: string
          snooze_count: number | null
          snoozed_until: string | null
          status: string
          therapy_id: string
          timeline: Json | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id: string
          note?: string | null
          patient_id: string
          scheduled_at: string
          snooze_count?: number | null
          snoozed_until?: string | null
          status?: string
          therapy_id: string
          timeline?: Json | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          patient_id?: string
          scheduled_at?: string
          snooze_count?: number | null
          snoozed_until?: string | null
          status?: string
          therapy_id?: string
          timeline?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_therapy_id_fkey"
            columns: ["therapy_id"]
            isOneToOne: false
            referencedRelation: "therapies"
            referencedColumns: ["id"]
          },
        ]
      }
      family_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          max_uses: number
          patient_id: string
          used_at: string | null
          used_by: string | null
          uses: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          max_uses?: number
          patient_id: string
          used_at?: string | null
          used_by?: string | null
          uses?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          max_uses?: number
          patient_id?: string
          used_at?: string | null
          used_by?: string | null
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "family_invites_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          dose_key: string | null
          event_id: string | null
          id: string
          kind: string
          message: string | null
          patient_id: string | null
          read: boolean
          severity: string
          target_user_id: string
          therapy_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          dose_key?: string | null
          event_id?: string | null
          id?: string
          kind?: string
          message?: string | null
          patient_id?: string | null
          read?: boolean
          severity?: string
          target_user_id: string
          therapy_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          dose_key?: string | null
          event_id?: string | null
          id?: string
          kind?: string
          message?: string | null
          patient_id?: string | null
          read?: boolean
          severity?: string
          target_user_id?: string
          therapy_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_therapy_id_fkey"
            columns: ["therapy_id"]
            isOneToOne: false
            referencedRelation: "therapies"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          birth_year: number | null
          created_at: string
          id: string
          name: string
          owner_user_id: string | null
          photo: string | null
          primary_caregiver_id: string | null
          user_id: string | null
        }
        Insert: {
          birth_year?: number | null
          created_at?: string
          id: string
          name: string
          owner_user_id?: string | null
          photo?: string | null
          primary_caregiver_id?: string | null
          user_id?: string | null
        }
        Update: {
          birth_year?: number | null
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string | null
          photo?: string | null
          primary_caregiver_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          delta: number
          event_id: string | null
          id: string
          reason: string
          therapy_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          event_id?: string | null
          id?: string
          reason: string
          therapy_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          event_id?: string | null
          id?: string
          reason?: string
          therapy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_therapy_id_fkey"
            columns: ["therapy_id"]
            isOneToOne: false
            referencedRelation: "therapies"
            referencedColumns: ["id"]
          },
        ]
      }
      therapies: {
        Row: {
          active: boolean | null
          category: string | null
          color: string | null
          created_at: string
          dosage: string | null
          end_date: string | null
          icon: string | null
          id: string
          low_stock_threshold: number | null
          name: string
          notes: string | null
          packs: number | null
          patient_id: string
          photo_drug: string | null
          photo_package: string | null
          pills_per_pack: number | null
          pills_remaining: number | null
          post_reminder_minutes: number | null
          quantity: number | null
          recurrence: Json
          reminder_intervals: number[] | null
          snooze_minutes: number | null
          start_date: string
          suspended: boolean | null
          timeout_minutes: number | null
          times: string[] | null
        }
        Insert: {
          active?: boolean | null
          category?: string | null
          color?: string | null
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          icon?: string | null
          id: string
          low_stock_threshold?: number | null
          name: string
          notes?: string | null
          packs?: number | null
          patient_id: string
          photo_drug?: string | null
          photo_package?: string | null
          pills_per_pack?: number | null
          pills_remaining?: number | null
          post_reminder_minutes?: number | null
          quantity?: number | null
          recurrence?: Json
          reminder_intervals?: number[] | null
          snooze_minutes?: number | null
          start_date?: string
          suspended?: boolean | null
          timeout_minutes?: number | null
          times?: string[] | null
        }
        Update: {
          active?: boolean | null
          category?: string | null
          color?: string | null
          created_at?: string
          dosage?: string | null
          end_date?: string | null
          icon?: string | null
          id?: string
          low_stock_threshold?: number | null
          name?: string
          notes?: string | null
          packs?: number | null
          patient_id?: string
          photo_drug?: string | null
          photo_package?: string | null
          pills_per_pack?: number | null
          pills_remaining?: number | null
          post_reminder_minutes?: number | null
          quantity?: number | null
          recurrence?: Json
          reminder_intervals?: number[] | null
          snooze_minutes?: number | null
          start_date?: string
          suspended?: boolean | null
          timeout_minutes?: number | null
          times?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "therapies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      caregiver_dashboard_stats: {
        Row: {
          active_alerts: number | null
          adherence_7d: number | null
          caregiver_id: string | null
          low_stock_count: number | null
          low_stock_names: string[] | null
          patients_count: number | null
          refreshed_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_family_invite: {
        Args: { _max_uses?: number; _patient_id: string; _ttl_minutes?: number }
        Returns: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          max_uses: number
          patient_id: string
          used_at: string | null
          used_by: string | null
          uses: number
        }
        SetofOptions: {
          from: "*"
          to: "family_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_caregiver_stats: {
        Args: never
        Returns: {
          active_alerts: number
          adherence_7d: number
          low_stock_count: number
          low_stock_names: string[]
          patients_count: number
          refreshed_at: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_primary_of: { Args: { _patient_id: string }; Returns: boolean }
      redeem_family_invite: { Args: { _code: string }; Returns: string }
      refresh_caregiver_dashboard_stats: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "caregiver" | "paziente"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["caregiver", "paziente"],
    },
  },
} as const
