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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      agent_log: {
        Row: {
          action: string
          agent: string
          at: string
          detail: Json
          id: number
        }
        Insert: {
          action: string
          agent: string
          at?: string
          detail?: Json
          id?: never
        }
        Update: {
          action?: string
          agent?: string
          at?: string
          detail?: Json
          id?: never
        }
        Relationships: []
      }
      artists: {
        Row: {
          background: string
          birthday: string
          borough: string | null
          created_at: string
          email: string | null
          genres: string[]
          goals: string | null
          id: string
          intake_completed_at: string | null
          name: string
          phone: string | null
          photo_path: string | null
          rate_usd: number | null
          set_length_min: number | null
          start_date: string | null
          user_id: string
          vetting: Database["public"]["Enums"]["vetting_status"]
          vetting_note: string | null
          video_path: string | null
        }
        Insert: {
          background?: string
          birthday: string
          borough?: string | null
          created_at?: string
          email?: string | null
          genres?: string[]
          goals?: string | null
          id?: string
          intake_completed_at?: string | null
          name: string
          phone?: string | null
          photo_path?: string | null
          rate_usd?: number | null
          set_length_min?: number | null
          start_date?: string | null
          user_id: string
          vetting?: Database["public"]["Enums"]["vetting_status"]
          vetting_note?: string | null
          video_path?: string | null
        }
        Update: {
          background?: string
          birthday?: string
          borough?: string | null
          created_at?: string
          email?: string | null
          genres?: string[]
          goals?: string | null
          id?: string
          intake_completed_at?: string | null
          name?: string
          phone?: string | null
          photo_path?: string | null
          rate_usd?: number | null
          set_length_min?: number | null
          start_date?: string | null
          user_id?: string
          vetting?: Database["public"]["Enums"]["vetting_status"]
          vetting_note?: string | null
          video_path?: string | null
        }
        Relationships: []
      }
      availability: {
        Row: {
          created_at: string
          date: string | null
          end_time: string
          id: string
          kind: Database["public"]["Enums"]["availability_kind"]
          note: string | null
          owner_id: string
          owner_type: Database["public"]["Enums"]["party_type"]
          source: Database["public"]["Enums"]["availability_source"]
          start_time: string
          weekday: number | null
        }
        Insert: {
          created_at?: string
          date?: string | null
          end_time?: string
          id?: string
          kind: Database["public"]["Enums"]["availability_kind"]
          note?: string | null
          owner_id: string
          owner_type: Database["public"]["Enums"]["party_type"]
          source?: Database["public"]["Enums"]["availability_source"]
          start_time?: string
          weekday?: number | null
        }
        Update: {
          created_at?: string
          date?: string | null
          end_time?: string
          id?: string
          kind?: Database["public"]["Enums"]["availability_kind"]
          note?: string | null
          owner_id?: string
          owner_type?: Database["public"]["Enums"]["party_type"]
          source?: Database["public"]["Enums"]["availability_source"]
          start_time?: string
          weekday?: number | null
        }
        Relationships: []
      }
      booking_messages: {
        Row: {
          booking_id: string
          content: string
          created_at: string
          id: string
          sender_id: string | null
          sender_role: string
        }
        Insert: {
          booking_id: string
          content: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_role: string
        }
        Update: {
          booking_id?: string
          content?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          artist_confirmed: boolean
          artist_id: string
          created_at: string
          gig_date: string | null
          id: string
          offer_amount: number
          offer_usd: number | null
          set_length_min: number | null
          start_time: string | null
          status: string
          suggestion_id: string | null
          venue_confirmed: boolean
          venue_id: string
        }
        Insert: {
          artist_confirmed?: boolean
          artist_id: string
          created_at?: string
          gig_date?: string | null
          id?: string
          offer_amount?: number
          offer_usd?: number | null
          set_length_min?: number | null
          start_time?: string | null
          status?: string
          suggestion_id?: string | null
          venue_confirmed?: boolean
          venue_id: string
        }
        Update: {
          artist_confirmed?: boolean
          artist_id?: string
          created_at?: string
          gig_date?: string | null
          id?: string
          offer_amount?: number
          offer_usd?: number | null
          set_length_min?: number | null
          start_time?: string | null
          status?: string
          suggestion_id?: string | null
          venue_confirmed?: boolean
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_reviews: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          note: string | null
          review_token: string
          room_fit: string[] | null
          terac_opportunity_id: string | null
          terac_submission_id: string | null
          verdict: string | null
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          note?: string | null
          review_token?: string
          room_fit?: string[] | null
          terac_opportunity_id?: string | null
          terac_submission_id?: string | null
          verdict?: string | null
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          note?: string | null
          review_token?: string
          room_fit?: string[] | null
          terac_opportunity_id?: string | null
          terac_submission_id?: string | null
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expert_reviews_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      mack_notes: {
        Row: {
          created_at: string
          id: string
          note: string
          owner_id: string
          owner_type: Database["public"]["Enums"]["party_type"]
          thread_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          owner_id: string
          owner_type: Database["public"]["Enums"]["party_type"]
          thread_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          owner_id?: string
          owner_type?: Database["public"]["Enums"]["party_type"]
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mack_notes_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          channel: Database["public"]["Enums"]["message_channel"]
          content: string
          created_at: string
          id: string
          sender_id: string | null
          sender_role: Database["public"]["Enums"]["sender_role"]
          thread_id: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["message_channel"]
          content: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_role: Database["public"]["Enums"]["sender_role"]
          thread_id: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["message_channel"]
          content?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_role?: Database["public"]["Enums"]["sender_role"]
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_usd: number
          booking_id: string
          checkout_url: string | null
          created_at: string
          fee_usd: number
          id: string
          payout_usd: number
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          whop_checkout_id: string | null
          whop_payment_id: string | null
        }
        Insert: {
          amount_usd: number
          booking_id: string
          checkout_url?: string | null
          created_at?: string
          fee_usd: number
          id?: string
          payout_usd: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          whop_checkout_id?: string | null
          whop_payment_id?: string | null
        }
        Update: {
          amount_usd?: number
          booking_id?: string
          checkout_url?: string | null
          created_at?: string
          fee_usd?: number
          id?: string
          payout_usd?: number
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          whop_checkout_id?: string | null
          whop_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          reason: string
          score: number
          slot_date: string | null
          slot_start: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          venue_id: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          reason?: string
          score?: number
          slot_date?: string | null
          slot_start?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          venue_id: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          reason?: string
          score?: number
          slot_date?: string | null
          slot_start?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      swipes: {
        Row: {
          artist_id: string
          created_at: string
          id: string
          liked: boolean
          venue_id: string
        }
        Insert: {
          artist_id: string
          created_at?: string
          id?: string
          liked: boolean
          venue_id: string
        }
        Update: {
          artist_id?: string
          created_at?: string
          id?: string
          liked?: boolean
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "swipes_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swipes_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          artist_id: string | null
          booking_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["thread_kind"]
          last_message_at: string
          venue_id: string | null
        }
        Insert: {
          artist_id?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["thread_kind"]
          last_message_at?: string
          venue_id?: string | null
        }
        Update: {
          artist_id?: string | null
          booking_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["thread_kind"]
          last_message_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "threads_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_booking_fk"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "threads_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string
          borough: string
          budget_usd: number | null
          capacity: number | null
          contact_name: string | null
          created_at: string
          email: string
          genres: string[]
          goals: string | null
          id: string
          intake_completed_at: string | null
          name: string
          phone: string
          photo_path: string | null
          set_length_min: number | null
          start_date: string | null
          user_id: string
          venue_type: string
        }
        Insert: {
          address?: string
          borough?: string
          budget_usd?: number | null
          capacity?: number | null
          contact_name?: string | null
          created_at?: string
          email: string
          genres?: string[]
          goals?: string | null
          id?: string
          intake_completed_at?: string | null
          name: string
          phone: string
          photo_path?: string | null
          set_length_min?: number | null
          start_date?: string | null
          user_id: string
          venue_type?: string
        }
        Update: {
          address?: string
          borough?: string
          budget_usd?: number | null
          capacity?: number | null
          contact_name?: string | null
          created_at?: string
          email?: string
          genres?: string[]
          goals?: string | null
          id?: string
          intake_completed_at?: string | null
          name?: string
          phone?: string
          photo_path?: string | null
          set_length_min?: number | null
          start_date?: string | null
          user_id?: string
          venue_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_booking_party: { Args: { _booking_id: string }; Returns: boolean }
      is_thread_party: { Args: { _thread_id: string }; Returns: boolean }
      owns_party: {
        Args: { _id: string; _type: Database["public"]["Enums"]["party_type"] }
        Returns: boolean
      }
      settle_booking_confirmation: {
        Args: { _booking_id: string; _decline?: boolean }
        Returns: string
      }
    }
    Enums: {
      availability_kind: "date" | "weekly"
      availability_source: "chat" | "voice" | "manual"
      booking_status:
        | "negotiating"
        | "confirmed"
        | "paid_held"
        | "performed"
        | "released"
        | "refunded"
        | "cancelled"
      message_channel: "text" | "voice"
      party_type: "artist" | "venue"
      payment_status: "pending" | "held" | "released" | "refunded"
      sender_role: "artist" | "venue" | "agent" | "system"
      suggestion_status: "suggested" | "accepted" | "declined"
      thread_kind: "manager" | "booking"
      vetting_status: "unverified" | "pending" | "verified" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      availability_kind: ["date", "weekly"],
      availability_source: ["chat", "voice", "manual"],
      booking_status: [
        "negotiating",
        "confirmed",
        "paid_held",
        "performed",
        "released",
        "refunded",
        "cancelled",
      ],
      message_channel: ["text", "voice"],
      party_type: ["artist", "venue"],
      payment_status: ["pending", "held", "released", "refunded"],
      sender_role: ["artist", "venue", "agent", "system"],
      suggestion_status: ["suggested", "accepted", "declined"],
      thread_kind: ["manager", "booking"],
      vetting_status: ["unverified", "pending", "verified", "rejected"],
    },
  },
} as const
