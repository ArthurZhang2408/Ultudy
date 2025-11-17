/**
 * Document and course types
 */

export type DocumentInfo = {
  id: string;
  title: string;
  material_type: string | null;
  chapter: string | null;
  pages: number;
  uploaded_at: string;
  course_id: string | null;
};

export type Course = {
  id: string;
  name: string;
  description?: string | null;
  code?: string | null;
  term?: string | null;
  exam_date?: string | null;
  created_at: string;
};
