/**
 * Core lesson and concept types
 */

export type MCQOption = {
  letter: string;
  text: string;
  correct: boolean;
  explanation: string;
};

export type MCQ = {
  question: string;
  options: MCQOption[];
  expected_answer: string;
  hint?: string;
};

export type Formula = {
  formula: string;
  variables: string;
};

export type Concept = {
  id?: string;
  name: string;
  explanation: string;
  analogies?: string[];
  examples?: string[];
  formulas?: Formula[];
  important_notes?: string[];
  is_main_concept?: boolean;
  parent_concept?: string;
  check_ins?: MCQ[];
};

export type Lesson = {
  id?: string;
  document_id?: string;
  course_id?: string | null;
  chapter?: string | null;
  section_id?: string | null;
  topic?: string;
  summary?: string;
  explanation?: string;
  concepts?: Concept[];
  created_at?: string;
};
