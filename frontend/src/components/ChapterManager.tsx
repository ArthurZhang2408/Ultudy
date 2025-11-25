'use client';

import { useState } from 'react';
import { getBackendUrl } from '@/lib/api';

interface Chapter {
  chapter_number: number;
  chapter_title: string;
  page_start: number;
  page_end: number;
}

interface ChapterManagerProps {
  documentId: string;
  onChaptersExtracted?: () => void;
}

export default function ChapterManager({ documentId, onChaptersExtracted }: ChapterManagerProps) {
  const [detecting, setDetecting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [detectedChapters, setDetectedChapters] = useState<Chapter[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<number[]>([]);
  const [detectionType, setDetectionType] = useState<'single' | 'multi' | null>(null);

  async function detectChapters() {
    setDetecting(true);
    try {
      const res = await fetch(`${getBackendUrl()}/chapters/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token'
        },
        body: JSON.stringify({ document_id: documentId })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to detect chapters');
      }

      setDetectionType(data.type);

      if (data.type === 'multi') {
        setDetectedChapters(data.chapters);
        // Auto-select all chapters
        setSelectedChapters(data.chapters.map((c: Chapter) => c.chapter_number));
      } else {
        alert('This PDF contains a single chapter. No chapter extraction needed.');
      }
    } catch (error: any) {
      console.error('Chapter detection error:', error);
      alert(`Failed to detect chapters: ${error.message}`);
    } finally {
      setDetecting(false);
    }
  }

  async function extractSelectedChapters() {
    if (selectedChapters.length === 0) {
      alert('Please select at least one chapter to extract');
      return;
    }

    setExtracting(true);
    try {
      const res = await fetch(`${getBackendUrl()}/chapters/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer dev-token'
        },
        body: JSON.stringify({
          document_id: documentId,
          chapter_numbers: selectedChapters
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract chapters');
      }

      alert(`Successfully extracted ${data.chapters.length} chapter(s)!`);

      if (onChaptersExtracted) {
        onChaptersExtracted();
      }

      // Reset state
      setDetectedChapters([]);
      setSelectedChapters([]);
      setDetectionType(null);
    } catch (error: any) {
      console.error('Chapter extraction error:', error);
      alert(`Failed to extract chapters: ${error.message}`);
    } finally {
      setExtracting(false);
    }
  }

  function toggleChapter(chapterNumber: number) {
    setSelectedChapters((prev) => {
      if (prev.includes(chapterNumber)) {
        return prev.filter((n) => n !== chapterNumber);
      } else {
        return [...prev, chapterNumber];
      }
    });
  }

  function selectAll() {
    setSelectedChapters(detectedChapters.map((c) => c.chapter_number));
  }

  function deselectAll() {
    setSelectedChapters([]);
  }

  if (detectionType === null) {
    return (
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <svg
              className="w-6 h-6 text-purple-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-lg font-semibold text-purple-900 mb-2">
              Pro Feature: Multi-Chapter Detection
            </h3>
            <p className="text-sm text-purple-700 mb-4">
              Detect and extract individual chapters from multi-chapter PDFs like textbooks. Each
              chapter can be studied separately or merged with other sources.
            </p>
            <button
              onClick={detectChapters}
              disabled={detecting}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {detecting ? (
                <>
                  <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Detecting Chapters...
                </>
              ) : (
                'Detect Chapters'
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (detectionType === 'multi' && detectedChapters.length > 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Select Chapters to Extract ({selectedChapters.length} selected)
          </h3>
          <div className="space-x-2">
            <button
              onClick={selectAll}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Select All
            </button>
            <span className="text-gray-400">|</span>
            <button
              onClick={deselectAll}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Deselect All
            </button>
          </div>
        </div>

        <div className="space-y-2 mb-6 max-h-96 overflow-y-auto">
          {detectedChapters.map((chapter) => (
            <label
              key={chapter.chapter_number}
              className="flex items-start p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedChapters.includes(chapter.chapter_number)}
                onChange={() => toggleChapter(chapter.chapter_number)}
                className="mt-1 mr-3 h-4 w-4 text-purple-600 rounded focus:ring-purple-500"
              />
              <div className="flex-1">
                <div className="font-medium text-gray-900">
                  Chapter {chapter.chapter_number}: {chapter.chapter_title}
                </div>
                <div className="text-sm text-gray-500">
                  Pages {chapter.page_start}-{chapter.page_end}
                </div>
              </div>
            </label>
          ))}
        </div>

        <button
          onClick={extractSelectedChapters}
          disabled={extracting || selectedChapters.length === 0}
          className="w-full bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-semibold"
        >
          {extracting ? (
            <>
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Extracting Chapters...
            </>
          ) : (
            `Extract ${selectedChapters.length} Chapter${selectedChapters.length !== 1 ? 's' : ''}`
          )}
        </button>
      </div>
    );
  }

  return null;
}
