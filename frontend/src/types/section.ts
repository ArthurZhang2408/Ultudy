/**
 * Section and concept metadata types
 */

export type ConceptMeta = {
  id: string;
  name: string;
  concept_number: number | null;
  lesson_position: number;
  mastery_level: string;
  accuracy: number;
};

export type Section = {
  id: string;
  section_number: number;
  name: string;
  description: string | null;
  page_start: number | null;
  page_end: number | null;
  concepts_generated: boolean;
  created_at: string;
  generating?: boolean;
  generation_progress?: number;
  job_id?: string;
  concepts?: ConceptMeta[];
};
