'use client';

import { FormEvent, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button, Input } from '@/components/ui';
import { useModal } from '@/contexts/ModalContext';

interface EditCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: any;
  onSuccess: () => void;
}

export default function EditCourseModal({ isOpen, onClose, course, onSuccess }: EditCourseModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [term, setTerm] = useState('');
  const [examDate, setExamDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  useModal(isOpen, 'edit-course-modal');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen && course) {
      setName(course.name || '');
      setCode(course.code || '');
      setTerm(course.term || '');
      // Handle both "YYYY-MM-DD" and ISO timestamp formats
      setExamDate(course.exam_date ? course.exam_date.split('T')[0] : '');
    } else if (!isOpen) {
      // Reset form when modal closes
      setName('');
      setCode('');
      setTerm('');
      setExamDate('');
    }
  }, [isOpen, course]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim()) {
      alert('Course name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim() || null,
          term: term.trim() || null,
          exam_date: examDate || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update course');
      }

      // Dispatch custom event for cross-component updates
      window.dispatchEvent(new CustomEvent('coursesUpdated'));

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to update course:', error);
      alert('Failed to update course. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white dark:bg-neutral-900 rounded-xl shadow-2xl p-6">
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-6">
          Edit Course
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Course Name */}
          <div>
            <label htmlFor="courseName" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Course Name <span className="text-danger-600">*</span>
            </label>
            <Input
              id="courseName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Signals and Systems"
              required
            />
          </div>

          {/* Course Code */}
          <div>
            <label htmlFor="courseCode" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Course Code
            </label>
            <Input
              id="courseCode"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g., ECE 358"
            />
          </div>

          {/* Term */}
          <div>
            <label htmlFor="courseTerm" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Term/Semester
            </label>
            <Input
              id="courseTerm"
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="e.g., Fall 2025"
            />
          </div>

          {/* Exam Date */}
          <div>
            <label htmlFor="examDate" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Final Exam Date
            </label>
            <Input
              id="examDate"
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Course will auto-archive after this date
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || !name.trim()}
              className="flex-1"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
