'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Concept = {
  id?: string;
  name: string;
  explanation: string;
  is_main_concept?: boolean;
  parent_concept?: string;
};

type Section = {
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
};

type DocumentInfo = {
  id: string;
  title: string;
  chapter: string | null;
};

interface ConceptNavigationSidebarProps {
  documentInfo: DocumentInfo | null;
  sections: Section[];
  currentSectionId: string | null;
  currentConceptName: string | null;
  concepts: Concept[];
  onSectionClick: (section: Section) => void;
  onConceptClick: (conceptName: string) => void;
  onGenerateSection: (section: Section) => void;
}

export default function ConceptNavigationSidebar({
  documentInfo,
  sections,
  currentSectionId,
  currentConceptName,
  concepts,
  onSectionClick,
  onConceptClick,
  onGenerateSection
}: ConceptNavigationSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(currentSectionId ? [currentSectionId] : [])
  );

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const handleShowMainMenu = () => {
    // Add sidebar=main query param to show main sidebar
    const params = new URLSearchParams(searchParams.toString());
    params.set('sidebar', 'main');
    router.push(`/learn?${params.toString()}`);
  };

  return (
    <div
      className={`fixed left-0 top-0 h-full bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col transition-all duration-300 z-40 ${
        isCollapsed ? 'w-0 border-r-0' : 'w-64'
      }`}
    >
      {!isCollapsed && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Navigation
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleShowMainMenu}
                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors"
                aria-label="Show main menu"
                title="Show main menu"
              >
                <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors"
                aria-label="Collapse navigation"
              >
                <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Document Info */}
          {documentInfo && (
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/50">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
                Document
              </div>
              <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {documentInfo.title}
              </div>
              {documentInfo.chapter && (
                <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                  Chapter {documentInfo.chapter}
                </div>
              )}
            </div>
          )}

          {/* Navigation Tree */}
          <div className="flex-1 overflow-y-auto p-3">
            {sections.length === 0 ? (
              <div className="text-center py-8 text-sm text-neutral-500 dark:text-neutral-400">
                No sections available
              </div>
            ) : (
              <div className="space-y-1">
                {sections.map((section) => {
                  const isExpanded = expandedSections.has(section.id);
                  const isActive = currentSectionId === section.id;
                  const isGenerating = section.generating || false;

                  return (
                    <div key={section.id}>
                      {/* Section Header */}
                      <button
                        onClick={() => {
                          if (section.concepts_generated) {
                            toggleSection(section.id);
                            onSectionClick(section);
                          } else {
                            onGenerateSection(section);
                          }
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-900 dark:text-primary-100'
                            : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                        }`}
                      >
                        {/* Expand/Collapse Icon */}
                        {section.concepts_generated ? (
                          <svg
                            className={`w-4 h-4 flex-shrink-0 transition-transform ${
                              isExpanded ? 'rotate-90' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        ) : (
                          <div className="w-4 h-4 flex-shrink-0" />
                        )}

                        {/* Section Info */}
                        <div className="flex-1 min-w-0 text-left">
                          <div className="font-medium truncate">
                            {section.section_number}. {section.name}
                          </div>
                          {section.page_start && section.page_end && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                              pp. {section.page_start}-{section.page_end}
                            </div>
                          )}
                        </div>

                        {/* Status Indicator */}
                        {isGenerating ? (
                          <div className="flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 flex-shrink-0">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600 dark:border-primary-400"></div>
                            {section.generation_progress || 0}%
                          </div>
                        ) : !section.concepts_generated ? (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 flex-shrink-0">
                            Not generated
                          </span>
                        ) : null}
                      </button>

                      {/* Concepts List (shown when expanded) */}
                      {isExpanded && section.concepts_generated && isActive && (
                        <div className="ml-6 mt-1 space-y-0.5">
                          {concepts.map((concept, idx) => {
                            const isCurrentConcept =
                              currentConceptName?.toLowerCase() === concept.name.toLowerCase();

                            return (
                              <button
                                key={idx}
                                onClick={() => onConceptClick(concept.name)}
                                className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                                  isCurrentConcept
                                    ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-900 dark:text-primary-100 font-medium'
                                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-neutral-400 dark:text-neutral-500 flex-shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="truncate">{concept.name}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Collapsed State - Show Expand Button */}
      {isCollapsed && (
        <button
          onClick={() => setIsCollapsed(false)}
          className="absolute left-full top-4 p-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-r-md shadow-md hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          aria-label="Expand navigation"
        >
          <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  );
}
