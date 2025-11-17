'use client';

import { useState } from 'react';

export type MasteryLevel = 'not_started' | 'in_progress' | 'completed' | 'incorrect' | 'loading';

export type SkillSquare = {
  id: string;
  name: string;
  masteryLevel: MasteryLevel;
  sectionNumber?: number;
  sectionName?: string;
  conceptNumber?: number;
  lessonPosition?: number;
  description?: string;
  onClick?: () => void;
  isOverview?: boolean;
};

type MasteryGridProps = {
  title: string;
  skills: SkillSquare[];
  columns?: number;
  showSectionDividers?: boolean;
};

function getMasteryColor(level: MasteryLevel): string {
  switch (level) {
    case 'completed':
      return 'bg-gradient-to-br from-success-500 to-success-600 hover:from-success-600 hover:to-success-700 shadow-success-500/20';
    case 'in_progress':
      return 'bg-gradient-to-br from-warning-400 to-warning-500 hover:from-warning-500 hover:to-warning-600 shadow-warning-500/20';
    case 'incorrect':
      return 'bg-gradient-to-br from-danger-500 to-danger-600 hover:from-danger-600 hover:to-danger-700 shadow-danger-500/20';
    case 'loading':
      return 'bg-gradient-to-br from-primary-400 to-primary-500 shadow-primary-500/20 animate-pulse';
    case 'not_started':
    default:
      return 'bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 shadow-neutral-500/10';
  }
}

function getMasteryRing(level: MasteryLevel): string {
  switch (level) {
    case 'completed':
      return 'ring-success-500';
    case 'in_progress':
      return 'ring-warning-500';
    case 'incorrect':
      return 'ring-danger-500';
    case 'loading':
      return 'ring-primary-500';
    case 'not_started':
    default:
      return 'ring-neutral-400';
  }
}

function getMasteryLabel(level: MasteryLevel): string {
  switch (level) {
    case 'completed':
      return 'Completed';
    case 'in_progress':
      return 'In Progress';
    case 'incorrect':
      return 'Needs Review';
    case 'loading':
      return 'Generating...';
    case 'not_started':
    default:
      return 'Not Started';
  }
}

export function MasteryGrid({ title, skills, columns = 10, showSectionDividers = false }: MasteryGridProps) {
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);

  // Count skills by mastery level
  const counts = skills.reduce((acc, skill) => {
    acc[skill.masteryLevel] = (acc[skill.masteryLevel] || 0) + 1;
    return acc;
  }, {} as Record<MasteryLevel, number>);

  // Group skills by section if dividers are shown
  const groupedSkills = showSectionDividers
    ? skills.reduce((acc, skill) => {
        const section = skill.sectionNumber || 0;
        if (!acc[section]) acc[section] = [];
        acc[section].push(skill);
        return acc;
      }, {} as Record<number, SkillSquare[]>)
    : { 0: skills };

  const loadingCount = counts['loading'] || 0;
  const completedConceptsCount = skills.length - loadingCount;

  // Count actual number of sections generating (not estimated from loading squares)
  // A section is generating if it has any loading squares
  const generatingSections = new Set(
    skills
      .filter(skill => skill.masteryLevel === 'loading' && skill.sectionNumber)
      .map(skill => skill.sectionNumber)
  );
  const generatingSectionsCount = generatingSections.size;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
        <div className="flex items-center gap-2">
          {loadingCount > 0 ? (
            <>
              <div className="flex items-center gap-1.5">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600 dark:border-primary-400"></div>
                <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                  {generatingSectionsCount} {generatingSectionsCount === 1 ? 'section' : 'sections'} generating...
                </span>
              </div>
              {completedConceptsCount > 0 && (
                <>
                  <span className="text-neutral-400 dark:text-neutral-500">•</span>
                  <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                    {completedConceptsCount} {completedConceptsCount === 1 ? 'concept' : 'concepts'}
                  </span>
                </>
              )}
            </>
          ) : (
            <>
              <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
                {skills.length} {skills.length === 1 ? 'concept' : 'concepts'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Grids grouped by section */}
      <div className="space-y-6">
        {Object.entries(groupedSkills)
          .sort(([a], [b]) => Number(a) - Number(b))
          .filter(([sectionNum]) => Number(sectionNum) > 0) // Skip section 0 (concepts without section)
          .map(([sectionNum, sectionSkills]) => {
            const sectionName = sectionSkills[0]?.sectionName || `Section ${sectionNum}`;
            const isGenerating = sectionSkills.every(s => s.masteryLevel === 'loading');
            const nonLoadingCount = sectionSkills.filter(s => s.masteryLevel !== 'loading').length;

            return (
              <div key={sectionNum}>
                {showSectionDividers && (
                  <div className="mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-primary-100 dark:bg-primary-900/40 rounded-lg flex items-center justify-center">
                          <span className="text-xs font-bold text-primary-700 dark:text-primary-400">{sectionNum}</span>
                        </div>
                        <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {sectionName}
                        </div>
                      </div>
                      <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-700"></div>
                      <div className="text-xs font-medium">
                        {isGenerating ? (
                          <span className="text-primary-600 dark:text-primary-400 flex items-center gap-1.5">
                            <div className="animate-spin rounded-full h-2.5 w-2.5 border-b-2 border-primary-600 dark:border-primary-400"></div>
                            Generating...
                          </span>
                        ) : (
                          <span className="text-neutral-500 dark:text-neutral-400">
                            {nonLoadingCount} {nonLoadingCount === 1 ? 'concept' : 'concepts'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Grid of skill squares */}
                <div
                  className={`grid gap-2 ${showSectionDividers ? 'p-4 rounded-xl bg-gradient-to-br from-neutral-50 to-white dark:from-neutral-800/50 dark:to-neutral-800/30 border border-neutral-200 dark:border-neutral-700' : ''}`}
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    maxWidth: `${columns * 60}px`
                  }}
                >
                  {sectionSkills.map((skill, index) => {
                    // Calculate display number excluding overview squares
                    // This ensures placeholders show 1-8, not 2-9
                    const nonOverviewSkillsBefore = sectionSkills
                      .slice(0, index)
                      .filter(s => !s.isOverview).length;

                    const displayNumber =
                      typeof skill.conceptNumber === 'number' && skill.conceptNumber > 0
                        ? skill.conceptNumber
                        : typeof skill.lessonPosition === 'number'
                        ? skill.lessonPosition + 1
                        : nonOverviewSkillsBefore + 1;

                    return (
                      <div key={skill.id} className="relative group">
                        <button
                          className={`
                            relative w-12 h-12 rounded-lg transition-all duration-200
                            ${getMasteryColor(skill.masteryLevel)}
                            ${skill.onClick ? 'cursor-pointer hover:scale-110 hover:shadow-md active:scale-95' : 'cursor-not-allowed opacity-60'}
                            flex items-center justify-center
                            text-white font-bold text-sm
                            shadow-sm
                            ${hoveredSkill === skill.id ? `ring-2 ${getMasteryRing(skill.masteryLevel)} ring-offset-1` : ''}
                            ${skill.isOverview && skill.onClick ? 'ring-2 ring-offset-1 ring-primary-400 dark:ring-primary-500' : ''}
                          `}
                          onClick={skill.onClick}
                          disabled={!skill.onClick}
                          onMouseEnter={() => setHoveredSkill(skill.id)}
                          onMouseLeave={() => setHoveredSkill(null)}
                          title={`${skill.name} - ${getMasteryLabel(skill.masteryLevel)}`}
                        >
                          {skill.isOverview ? (
                            <>
                              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                              </svg>
                              {/* Generate indicator for not_started overview squares with onClick */}
                              {skill.masteryLevel === 'not_started' && skill.onClick && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 dark:bg-primary-600 rounded-full flex items-center justify-center">
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                  </svg>
                                </div>
                              )}
                            </>
                          ) : (
                            displayNumber
                          )}
                        </button>

                        {/* Hover tooltip - increased z-index to appear above sidebars */}
                        {hoveredSkill === skill.id && (
                          <div className="absolute z-50 bottom-full left-1/2 transform -translate-x-1/2 mb-3 w-64 pointer-events-none animate-fade-in">
                            <div className="bg-neutral-900 text-white rounded-lg p-3 shadow-large">
                              <div className="font-semibold mb-1.5 text-sm">{skill.name}</div>
                              {skill.description && (
                                <div className="text-neutral-300 text-xs mb-2 line-clamp-2">{skill.description}</div>
                              )}
                              <div className="flex items-center gap-2 pt-2 border-t border-neutral-700">
                                <div className={`w-3 h-3 rounded ${getMasteryColor(skill.masteryLevel).split(' ')[0]}`} />
                                <span className="text-xs font-medium">{getMasteryLabel(skill.masteryLevel)}</span>
                              </div>
                              {/* Arrow */}
                              <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-0.5">
                                <div className="w-2 h-2 bg-neutral-900 rotate-45" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-sm pt-3 border-t border-neutral-200 dark:border-neutral-700">
        {(['loading', 'completed', 'in_progress', 'incorrect', 'not_started'] as MasteryLevel[]).map((level) => {
          const count = counts[level] || 0;
          if (count === 0) return null;

          // For loading, show number of sections instead of number of squares
          const displayCount = level === 'loading' ? generatingSectionsCount : count;
          const displayLabel = level === 'loading'
            ? `${generatingSectionsCount === 1 ? 'Section' : 'Sections'} Generating`
            : getMasteryLabel(level);

          return (
            <div key={level} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${getMasteryColor(level).split(' ')[0]} shadow-sm`} />
              <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {displayLabel}
              </span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 rounded-full">
                {displayCount}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
