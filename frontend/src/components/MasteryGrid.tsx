'use client';

import { useState } from 'react';

export type MasteryLevel = 'not_started' | 'in_progress' | 'completed' | 'incorrect';

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
    case 'not_started':
    default:
      return 'bg-neutral-200 hover:bg-neutral-300 shadow-neutral-500/10';
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-medium text-neutral-600">
            {skills.length} {skills.length === 1 ? 'concept' : 'concepts'}
          </span>
        </div>
      </div>

      {/* Grids grouped by section */}
      <div className="space-y-6">
        {Object.entries(groupedSkills)
          .sort(([a], [b]) => Number(a) - Number(b))
          .filter(([sectionNum]) => Number(sectionNum) > 0) // Skip section 0 (concepts without section)
          .map(([sectionNum, sectionSkills]) => {
            const sectionName = sectionSkills[0]?.sectionName || `Section ${sectionNum}`;

            return (
              <div key={sectionNum}>
                {showSectionDividers && (
                  <div className="mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-primary-100 rounded-lg flex items-center justify-center">
                          <span className="text-xs font-bold text-primary-700">{sectionNum}</span>
                        </div>
                        <div className="text-sm font-semibold text-neutral-900">
                          {sectionName}
                        </div>
                      </div>
                      <div className="flex-1 h-px bg-neutral-200"></div>
                      <div className="text-xs text-neutral-500 font-medium">
                        {sectionSkills.length} {sectionSkills.length === 1 ? 'concept' : 'concepts'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Grid of skill squares */}
                <div
                  className={`grid gap-2 ${showSectionDividers ? 'p-4 rounded-xl bg-gradient-to-br from-neutral-50 to-white border border-neutral-200' : ''}`}
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    maxWidth: `${columns * 60}px`
                  }}
                >
                  {sectionSkills.map((skill, index) => {
                    const displayNumber =
                      typeof skill.conceptNumber === 'number' && skill.conceptNumber > 0
                        ? skill.conceptNumber
                        : typeof skill.lessonPosition === 'number'
                        ? skill.lessonPosition + 1
                        : index + 1;

                    return (
                      <div key={skill.id} className="relative group">
                        <button
                          className={`
                            w-12 h-12 rounded-lg transition-all duration-200
                            ${getMasteryColor(skill.masteryLevel)}
                            ${skill.onClick ? 'cursor-pointer hover:scale-110 hover:shadow-md active:scale-95' : 'cursor-default'}
                            flex items-center justify-center
                            text-white font-bold text-sm
                            shadow-sm
                            ${hoveredSkill === skill.id ? `ring-2 ${getMasteryRing(skill.masteryLevel)} ring-offset-1` : ''}
                          `}
                          onClick={skill.onClick}
                          onMouseEnter={() => setHoveredSkill(skill.id)}
                          onMouseLeave={() => setHoveredSkill(null)}
                          title={`${skill.name} - ${getMasteryLabel(skill.masteryLevel)}`}
                        >
                          {displayNumber}
                        </button>

                        {/* Hover tooltip */}
                        {hoveredSkill === skill.id && (
                          <div className="absolute z-10 bottom-full left-1/2 transform -translate-x-1/2 mb-3 w-64 pointer-events-none animate-fade-in">
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
      <div className="flex flex-wrap gap-4 text-sm pt-3 border-t border-neutral-200">
        {(['completed', 'in_progress', 'incorrect', 'not_started'] as MasteryLevel[]).map((level) => {
          const count = counts[level] || 0;
          if (count === 0) return null;

          return (
            <div key={level} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${getMasteryColor(level).split(' ')[0]} shadow-sm`} />
              <span className="text-sm font-medium text-neutral-700">
                {getMasteryLabel(level)}
              </span>
              <span className="text-xs text-neutral-500 font-medium bg-neutral-100 px-2 py-0.5 rounded-full">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
