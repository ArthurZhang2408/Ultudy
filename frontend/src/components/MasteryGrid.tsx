'use client';

import { useState } from 'react';

export type MasteryLevel = 'not_started' | 'introduced' | 'understood' | 'proficient' | 'mastered';

export type SkillSquare = {
  id: string;
  name: string;
  masteryLevel: MasteryLevel;
  sectionNumber?: number;
  description?: string;
  onClick?: () => void;
};

type MasteryGridProps = {
  title: string;
  skills: SkillSquare[];
  columns?: number;
};

function getMasteryColor(level: MasteryLevel): string {
  switch (level) {
    case 'mastered':
      return 'bg-green-500 hover:bg-green-600';
    case 'proficient':
      return 'bg-blue-600 hover:bg-blue-700';
    case 'understood':
      return 'bg-blue-400 hover:bg-blue-500';
    case 'introduced':
      return 'bg-amber-400 hover:bg-amber-500';
    case 'not_started':
    default:
      return 'bg-slate-200 hover:bg-slate-300';
  }
}

function getMasteryLabel(level: MasteryLevel): string {
  switch (level) {
    case 'mastered':
      return 'Mastered';
    case 'proficient':
      return 'Proficient';
    case 'understood':
      return 'Understood';
    case 'introduced':
      return 'Introduced';
    case 'not_started':
    default:
      return 'Not Started';
  }
}

export function MasteryGrid({ title, skills, columns = 8 }: MasteryGridProps) {
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);

  // Count skills by mastery level
  const counts = skills.reduce((acc, skill) => {
    acc[skill.masteryLevel] = (acc[skill.masteryLevel] || 0) + 1;
    return acc;
  }, {} as Record<MasteryLevel, number>);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-600">
          {skills.length} {skills.length === 1 ? 'section' : 'sections'}
        </span>
      </div>

      {/* Grid of skill squares */}
      <div
        className="grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${Math.min(columns, skills.length)}, minmax(0, 1fr))`,
          maxWidth: `${Math.min(columns, skills.length) * 56}px`
        }}
      >
        {skills.map((skill) => (
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
              {skill.sectionNumber || ''}
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

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-600 pt-2">
        {(['mastered', 'proficient', 'understood', 'introduced', 'not_started'] as MasteryLevel[]).map((level) => {
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
