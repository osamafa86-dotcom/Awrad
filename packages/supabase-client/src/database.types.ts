export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      attendance: {
        Row: {
          id: string;
          recorded_at: string;
          recorded_by: string | null;
          session_id: string;
          status: Database['public']['Enums']['attendance_status'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          recorded_at?: string;
          recorded_by?: string | null;
          session_id: string;
          status: Database['public']['Enums']['attendance_status'];
          user_id: string;
        };
        Update: {
          id?: string;
          recorded_at?: string;
          recorded_by?: string | null;
          session_id?: string;
          status?: Database['public']['Enums']['attendance_status'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attendance_recorded_by_fkey';
            columns: ['recorded_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'attendance_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          diff: Json | null;
          id: number;
          target: Json | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          diff?: Json | null;
          id?: number;
          target?: Json | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          diff?: Json | null;
          id?: number;
          target?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      deletion_requests: {
        Row: {
          handled_at: string | null;
          handled_by: string | null;
          id: string;
          requested_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          requested_at?: string;
          user_id: string;
        };
        Update: {
          handled_at?: string | null;
          handled_by?: string | null;
          id?: string;
          requested_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'deletion_requests_handled_by_fkey';
            columns: ['handled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'deletion_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      group_supervisors: {
        Row: {
          group_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          group_id: string;
          user_id: string;
        };
        Update: {
          group_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_supervisors_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_supervisors_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      groups: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          timezone: string;
          week_starts_on: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          timezone?: string;
          week_starts_on?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          timezone?: string;
          week_starts_on?: number;
        };
        Relationships: [];
      };
      habit_items: {
        Row: {
          active_from: string;
          active_to: string | null;
          habit_id: string;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          active_from?: string;
          active_to?: string | null;
          habit_id: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          active_from?: string;
          active_to?: string | null;
          habit_id?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'habit_items_habit_id_fkey';
            columns: ['habit_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id'];
          },
        ];
      };
      habits: {
        Row: {
          active_from: string;
          active_to: string | null;
          created_at: string;
          description: string | null;
          frequency: Database['public']['Enums']['habit_frequency'];
          id: string;
          kind: Database['public']['Enums']['habit_kind'];
          name: string;
          slug: string;
          sort_order: number;
          target_text: string | null;
        };
        ComputedFields: never;
        Insert: {
          active_from?: string;
          active_to?: string | null;
          created_at?: string;
          description?: string | null;
          frequency: Database['public']['Enums']['habit_frequency'];
          id?: string;
          kind?: Database['public']['Enums']['habit_kind'];
          name: string;
          slug: string;
          sort_order?: number;
          target_text?: string | null;
        };
        Update: {
          active_from?: string;
          active_to?: string | null;
          created_at?: string;
          description?: string | null;
          frequency?: Database['public']['Enums']['habit_frequency'];
          id?: string;
          kind?: Database['public']['Enums']['habit_kind'];
          name?: string;
          slug?: string;
          sort_order?: number;
          target_text?: string | null;
        };
        Relationships: [];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          email: string;
          full_name: string;
          group_id: string | null;
          id: string;
          invited_by: string | null;
          is_tracked: boolean;
          joined_at: string;
          role: Database['public']['Enums']['user_role'];
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          email: string;
          full_name: string;
          group_id?: string | null;
          id?: string;
          invited_by?: string | null;
          is_tracked?: boolean;
          joined_at?: string;
          role?: Database['public']['Enums']['user_role'];
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string;
          group_id?: string | null;
          id?: string;
          invited_by?: string | null;
          is_tracked?: boolean;
          joined_at?: string;
          role?: Database['public']['Enums']['user_role'];
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitations_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      log_entries: {
        Row: {
          habit_id: string;
          id: string;
          log_id: string;
          status: Database['public']['Enums']['entry_status'];
        };
        ComputedFields: never;
        Insert: {
          habit_id: string;
          id?: string;
          log_id: string;
          status: Database['public']['Enums']['entry_status'];
        };
        Update: {
          habit_id?: string;
          id?: string;
          log_id?: string;
          status?: Database['public']['Enums']['entry_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'log_entries_habit_id_fkey';
            columns: ['habit_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'log_entries_log_id_fkey';
            columns: ['log_id'];
            isOneToOne: false;
            referencedRelation: 'logs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'log_entries_log_id_fkey';
            columns: ['log_id'];
            isOneToOne: false;
            referencedRelation: 'v_entry_weights';
            referencedColumns: ['log_id'];
          },
        ];
      };
      log_entry_items: {
        Row: {
          entry_id: string;
          habit_item_id: string;
        };
        ComputedFields: never;
        Insert: {
          entry_id: string;
          habit_item_id: string;
        };
        Update: {
          entry_id?: string;
          habit_item_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'log_entry_items_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'log_entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'log_entry_items_habit_item_id_fkey';
            columns: ['habit_item_id'];
            isOneToOne: false;
            referencedRelation: 'habit_items';
            referencedColumns: ['id'];
          },
        ];
      };
      logs: {
        Row: {
          created_at: string;
          handled_at: string | null;
          handled_by: string | null;
          handled_note: string | null;
          id: string;
          note: string | null;
          period: Database['public']['Enums']['habit_frequency'];
          period_start: string;
          review_text: string | null;
          support_request_text: string | null;
          support_status: Database['public']['Enums']['support_status'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          handled_note?: string | null;
          id?: string;
          note?: string | null;
          period: Database['public']['Enums']['habit_frequency'];
          period_start: string;
          review_text?: string | null;
          support_request_text?: string | null;
          support_status?: Database['public']['Enums']['support_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          handled_at?: string | null;
          handled_by?: string | null;
          handled_note?: string | null;
          id?: string;
          note?: string | null;
          period?: Database['public']['Enums']['habit_frequency'];
          period_start?: string;
          review_text?: string | null;
          support_request_text?: string | null;
          support_status?: Database['public']['Enums']['support_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'logs_handled_by_fkey';
            columns: ['handled_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          full_name: string;
          group_id: string | null;
          id: string;
          is_active: boolean;
          is_tracked: boolean;
          joined_at: string;
          reminder_time: string | null;
          role: Database['public']['Enums']['user_role'];
          timezone: string | null;
          weekly_reminder: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          full_name: string;
          group_id?: string | null;
          id: string;
          is_active?: boolean;
          is_tracked?: boolean;
          joined_at?: string;
          reminder_time?: string | null;
          role?: Database['public']['Enums']['user_role'];
          timezone?: string | null;
          weekly_reminder?: boolean;
        };
        Update: {
          created_at?: string;
          full_name?: string;
          group_id?: string | null;
          id?: string;
          is_active?: boolean;
          is_tracked?: boolean;
          joined_at?: string;
          reminder_time?: string | null;
          role?: Database['public']['Enums']['user_role'];
          timezone?: string | null;
          weekly_reminder?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      push_tokens: {
        Row: {
          id: string;
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          platform: string;
          token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      reminder_log: {
        Row: {
          id: string;
          kind: string;
          sent_at: string;
          sent_for: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          kind: string;
          sent_at?: string;
          sent_for: string;
          user_id: string;
        };
        Update: {
          id?: string;
          kind?: string;
          sent_at?: string;
          sent_for?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reminder_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      sessions: {
        Row: {
          created_at: string;
          created_by: string | null;
          group_id: string | null;
          id: string;
          session_date: string;
          title: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          group_id?: string | null;
          id?: string;
          session_date: string;
          title?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          group_id?: string | null;
          id?: string;
          session_date?: string;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      v_day_status: {
        Row: {
          completion_pct: number | null;
          log_date: string;
          state: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      v_entry_weights: {
        Row: {
          achieved: number | null;
          habit_id: string;
          log_id: string;
          period: Database['public']['Enums']['habit_frequency'];
          period_start: string;
          required: number | null;
          user_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: 'log_entries_habit_id_fkey';
            columns: ['habit_id'];
            isOneToOne: false;
            referencedRelation: 'habits';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      active_habits_on: {
        Args: { p_date: string; p_frequency: Database['public']['Enums']['habit_frequency'] };
        Returns: {
          active_from: string;
          active_to: string | null;
          created_at: string;
          description: string | null;
          frequency: Database['public']['Enums']['habit_frequency'];
          id: string;
          kind: Database['public']['Enums']['habit_kind'];
          name: string;
          slug: string;
          sort_order: number;
          target_text: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'habits';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      active_items_on: {
        Args: { p_date: string; p_habit: string };
        Returns: {
          active_from: string;
          active_to: string | null;
          habit_id: string;
          id: string;
          name: string;
          sort_order: number;
        }[];
        SetofOptions: {
          from: '*';
          to: 'habit_items';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined };
      archive_and_replace_habit: {
        Args: { p_new: Json; p_old_habit_id: string; p_switch_date: string };
        Returns: string;
      };
      can_view_user: { Args: { p_user: string }; Returns: boolean };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['user_role'];
      };
      due_reminders: {
        Args: { p_now: string };
        Returns: {
          kind: string;
          sent_for: string;
          tokens: string[];
          user_id: string;
        }[];
      };
      ensure_reminder_schedule: { Args: Record<PropertyKey, never>; Returns: boolean };
      get_calendar: {
        Args: { p_from: string; p_to: string; p_user_id: string };
        Returns: {
          completion_pct: number;
          log_date: string;
          state: string;
        }[];
      };
      get_group_overview: {
        Args: { p_from: string; p_group_id: string; p_to: string };
        Returns: {
          full_name: string;
          log_date: string;
          state: string;
          user_id: string;
        }[];
      };
      get_student_summary: {
        Args: { p_from?: string; p_to?: string; p_user_id?: string };
        Returns: Json;
      };
      handle_support_request: { Args: { p_log_id: string; p_note: string }; Returns: undefined };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_supervisor_of: { Args: { p_group: string }; Returns: boolean };
      is_tracked_member: { Args: { p_user: string }; Returns: boolean };
      local_today: { Args: { p_now?: string; p_user: string }; Returns: string };
      request_account_deletion: { Args: Record<PropertyKey, never>; Returns: string };
      save_log: {
        Args: {
          p_entries: Json;
          p_note?: string;
          p_period: Database['public']['Enums']['habit_frequency'];
          p_period_start: string;
          p_review_text?: string;
          p_support_request_text?: string;
          p_user_id?: string;
        };
        Returns: string;
      };
      set_attendance: { Args: { p_rows: Json; p_session_id: string }; Returns: number };
      setting_bool: { Args: { p_key: string }; Returns: boolean };
      setting_int: { Args: { p_key: string }; Returns: number };
      setting_text: { Args: { p_key: string }; Returns: string };
      setting_value_is_valid: { Args: { p_key: string; p_value: Json }; Returns: boolean };
      update_app_settings: { Args: { p_values: Json }; Returns: undefined };
      upsert_group: {
        Args: {
          p_id: string;
          p_name: string;
          p_supervisor_ids: string[];
          p_timezone: string;
          p_week_starts_on: number;
        };
        Returns: string;
      };
      user_timezone: { Args: { p_user: string }; Returns: string };
      user_week_starts_on: { Args: { p_user: string }; Returns: number };
      week_start: { Args: { p_date: string; p_week_starts_on: number }; Returns: string };
    };
    Enums: {
      attendance_status: 'present' | 'absent' | 'excused';
      entry_status: 'done' | 'not_done' | 'not_required';
      habit_frequency: 'daily' | 'weekly';
      habit_kind: 'tristate' | 'checklist';
      support_status: 'none' | 'open' | 'handled';
      user_role: 'student' | 'supervisor' | 'admin';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      attendance_status: ['present', 'absent', 'excused'],
      entry_status: ['done', 'not_done', 'not_required'],
      habit_frequency: ['daily', 'weekly'],
      habit_kind: ['tristate', 'checklist'],
      support_status: ['none', 'open', 'handled'],
      user_role: ['student', 'supervisor', 'admin'],
    },
  },
} as const;
