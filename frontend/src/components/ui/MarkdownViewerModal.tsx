'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import MarkdownViewer from './MarkdownViewer';

interface MarkdownViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  markdown: string;
  title?: string;
}

export default function MarkdownViewerModal({
  isOpen,
  onClose,
  markdown,
  title
}: MarkdownViewerModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-safari -z-10"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-5xl max-h-[90vh] bg-white dark:bg-neutral-900 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <MarkdownViewer markdown={markdown} title={title} onClose={onClose} />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
