// Tipos de la base de datos de ProfeSync (a mano, alineados con sql/001_schema.sql).
// Se usan `type` y no `interface` a propósito: el cliente de Supabase exige
// compatibilidad con Record<string, unknown>, que las interfaces no cumplen.

export type UserRole = "super_admin" | "teacher";

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  auth_email: string;
  role: UserRole;
  phone: string | null;
  photo_url: string | null;
  theme_color: string | null;
  is_active: boolean;
  plan_expires_at: string | null;
  max_institutions: number;
  max_courses: number;
  max_students: number;
  ai_enabled: boolean;
  ai_monthly_quota: number;
  created_at: string;
  updated_at: string;
};

export type Institution = {
  id: string;
  teacher_id: string;
  name: string;
  city: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FinalFormulaItem = { period: number; weight: number };

export type AcademicYear = {
  id: string;
  teacher_id: string;
  institution_id: string;
  year: number;
  status: "abierto" | "cerrado";
  scale_min: number;
  scale_max: number;
  pass_grade: number;
  final_formula: FinalFormulaItem[];
  closed_at: string | null;
  /** Regla con la que se cerró: pierde con N o más materias perdidas. */
  fail_subjects_limit: number | null;
  created_at: string;
  updated_at: string;
};

export type Period = {
  id: string;
  teacher_id: string;
  academic_year_id: string;
  number: number;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  weight: number;
  status: "abierto" | "cerrado";
  created_at: string;
  updated_at: string;
};

export type Course = {
  id: string;
  teacher_id: string;
  academic_year_id: string;
  grade: string;
  grade_order: number;
  section: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CourseSubject = {
  id: string;
  teacher_id: string;
  course_id: string;
  name: string;
  weekly_hours: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Student = {
  id: string;
  teacher_id: string;
  first_name: string;
  last_name: string;
  document_number: string | null;
  birth_date: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Guardian = {
  id: string;
  teacher_id: string;
  student_id: string;
  full_name: string;
  relationship: string | null;
  whatsapp: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
};

export type Enrollment = {
  id: string;
  teacher_id: string;
  student_id: string;
  course_id: string;
  academic_year_id: string;
  status: "activa" | "aprobo" | "perdio" | "retirado";
  withdrawn_on: string | null;
  withdrawn_reason: string | null;
  withdrawn_note: string | null;
  withdrawn_report_path: string | null;
  created_at: string;
  updated_at: string;
};

export type AlertSettings = {
  teacher_id: string;
  absence_step: number;
  /** null = la nota para aprobar de cada año. */
  period_grade_max: number | null;
  final_grade_max: number | null;
  updated_at: string;
};

export type Activity = {
  id: string;
  teacher_id: string;
  course_subject_id: string;
  period_id: string;
  name: string;
  weight: number;
  activity_date: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Grade = {
  id: string;
  teacher_id: string;
  activity_id: string;
  enrollment_id: string;
  value: number;
  created_at: string;
  updated_at: string;
};

export type AttendanceStatus = "presente" | "tarde" | "excusa" | "falta";

export type Attendance = {
  id: string;
  teacher_id: string;
  course_subject_id: string;
  enrollment_id: string;
  attendance_date: string;
  status: AttendanceStatus;
  created_at: string;
  updated_at: string;
};

export type ObservationKind = "convivencia" | "academico" | "compromiso" | "seguimiento" | "otro";

export type Observation = {
  id: string;
  teacher_id: string;
  student_id: string;
  kind: ObservationKind;
  note: string;
  commitment: string | null;
  follow_up_on: string | null;
  resolved: boolean;
  observed_on: string;
  created_at: string;
  updated_at: string;
};

export type BulletinSend = {
  id: string;
  teacher_id: string;
  enrollment_id: string;
  period_number: number | null;
  guardian_id: string | null;
  channel: "whatsapp_compartir" | "whatsapp_enlace" | "descarga";
  note: string | null;
  created_at: string;
};

export type AppNotification = {
  id: string;
  teacher_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  dedupe_key: string;
  read: boolean;
  created_at: string;
};

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      institutions: Table<Institution>;
      academic_years: Table<AcademicYear>;
      periods: Table<Period>;
      courses: Table<Course>;
      course_subjects: Table<CourseSubject>;
      students: Table<Student>;
      guardians: Table<Guardian>;
      enrollments: Table<Enrollment>;
      activities: Table<Activity>;
      grades: Table<Grade>;
      attendance: Table<Attendance>;
      observations: Table<Observation>;
      bulletin_sends: Table<BulletinSend>;
      notifications: Table<AppNotification>;
      alert_settings: Table<AlertSettings>;
    };
    Views: Record<string, never>;
    Functions: {
      close_academic_year: {
        Args: {
          p_year: string;
          p_limit: number;
          p_decisions: { enrollment_id: string; result: "aprobo" | "perdio"; destination_course_id: string | null }[];
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
