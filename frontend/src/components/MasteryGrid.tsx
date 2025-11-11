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
      return 'bg-green-500 hover:bg-green-600';
    case 'in_progress':
      return 'bg-yellow-500 hover:bg-yellow-600';
    case 'incorrect':
      return 'bg-red-500 hover:bg-red-600';
    case 'not_started':
    default:
      return 'bg-slate-300 hover:bg-slate-400';
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-600">
          {skills.length} {skills.length === 1 ? 'concept' : 'concepts'}
        </span>
      </div>

      {/* Grids grouped by section */}
      <div className="space-y-6">
        {Object.entries(groupedSkills).sort(([a], [b]) => Number(a) - Number(b)).map(([sectionNum, sectionSkills], idx) => {
          const sectionName = sectionSkills[0]?.sectionName || `Section ${sectionNum}`;

          return (
            <div key={sectionNum}>
              {showSectionDividers && Number(sectionNum) > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold text-slate-900">
                      Section {sectionNum}: {sectionName}
                    </div>
                    <div className="flex-1 h-px bg-slate-300"></div>
                    <div className="text-xs text-slate-500">
                      {sectionSkills.length} {sectionSkills.length === 1 ? 'concept' : 'concepts'}
                    </div>
                  </div>
                </div>
              )}

            {/* Grid of skill squares */}
            <div
              className={`grid gap-1.5 ${showSectionDividers && Number(sectionNum) > 0 ? 'p-3 rounded-lg bg-slate-50 border border-slate-200' : ''}`}
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                maxWidth: `${columns * 56}px`
              }}
            >
              {sectionSkills.map((skill) => (
                <div key={skill.id} className="relative">
                  <button
                    className={`
                      w-12 h-12 rounded-md transition-all duration-200
                      ${getMasteryColor(skill.masteryLevel)}
                      ${skill.onClick ? 'cursor-pointer' : 'cursor-default'}
                      flex items-center justify-center
                      text-white font-bold text-xs
                      shadow-sm
                    `}
                    onClick={skill.onClick}
                    onMouseEnter={() => setHoveredSkill(skill.id)}
                    onMouseLeave={() => setHoveredSkill(null)}
                    title={`${skill.name} - ${getMasteryLabel(skill.masteryLevel)}`}
                  >
                    {skill.conceptNumber || ''}
                  </button>

            {/* Hover tooltip */}
            {hoveredSkill === skill.id && (
              <div className="absolute z-10 bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-56 pointer-events-none">
                <div className="bg-slate-900 text-white text-xs rounded-md p-2.5 shadow-xl">
                  <div className="font-semibold mb-1 text-sm">{skill.name}</div>
                  {skill.description && (
                    <div className="text-slate-300 text-xs mb-1.5 line-clamp-2">{skill.description}</div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs">
                    <div className={`w-2.5 h-2.5 rounded-sm ${getMasteryColor(skill.masteryLevel).split(' ')[0]}`} />
                    <span>{getMasteryLabel(skill.masteryLevel)}</span>
                  </div>
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-0.5">
                    <div className="w-1.5 h-1.5 bg-slate-900 rotate-45" />
                  </div>
                </div>
              </div>
            )}
                </div>
              ))}
            </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-600 pt-2">
        {(['completed', 'in_progress', 'incorrect', 'not_started'] as MasteryLevel[]).map((level) => {
          const count = counts[level] || 0;
          if (count === 0) return null;

          return (
            <div key={level} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${getMasteryColor(level).split(' ')[0]}`} />
              <span className="text-xs">
                {getMasteryLabel(level)} ({count})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
