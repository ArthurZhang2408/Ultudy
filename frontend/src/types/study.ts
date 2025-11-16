/**
 * Study session and progress tracking types
 */

export type AnswerRecord = {
  selected: string;
  correct: boolean;
};

export type StoredProgress = {
  conceptIndex: number;
  mcqIndex: number;
  conceptProgress: Array<[number, 'completed' | 'skipped' | 'wrong']>;
  answerHistory: Record<string, AnswerRecord>;
};

export type MasteryUpdate = {
  concept_id: string;
  concept: string;
  old_state: string;
  new_state: string;
  total_attempts: number;
  correct_attempts: number;
  accuracy_percent: number;
};
