import React from 'react';
import { Task, Section } from '../types';
import { useAuth } from '../context/AuthContext';
import { Calendar, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { format, isPast, isToday, differenceInDays } from 'date-fns';
import { cs } from 'date-fns/locale';

interface TimelineProps {
  tasks: Task[];
  sections: Section[];
  onOpenTask: (task: Task) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ tasks, sections, onOpenTask }) => {
  const { usersList } = useAuth();

  // Sort tasks with deadline first, then without deadline
  const tasksWithDates = tasks
    .filter((t) => !!t.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const tasksWithoutDates = tasks.filter((t) => !t.deadline);

  const getStatusBadge = (task: Task) => {
    if (task.status === 'done') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Hotovo
        </span>
      );
    }

    if (!task.deadline) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
          Bez termínu
        </span>
      );
    }

    const dead = new Date(task.deadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isPast(dead) && !isToday(dead)) {
      const daysOver = Math.abs(differenceInDays(today, dead));
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 animate-pulse">
          <AlertCircle className="w-3.5 h-3.5" />
          Po termínu ({daysOver} {daysOver === 1 ? 'den' : daysOver < 5 ? 'dny' : 'dní'})
        </span>
      );
    }

    if (isToday(dead)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
          <Clock className="w-3.5 h-3.5" />
          Dnes!
        </span>
      );
    }

    const daysLeft = differenceInDays(dead, today);
    if (daysLeft <= 3) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
          <Clock className="w-3.5 h-3.5" />
          Za {daysLeft} {daysLeft === 1 ? 'den' : daysLeft < 5 ? 'dny' : 'dní'}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
        <Calendar className="w-3.5 h-3.5" />
        Za {daysLeft} dní
      </span>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-8">
      {/* Overview header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Časová osa úkolů</h3>
          <p className="text-xs text-slate-500">
            Sledování plánovaných termínů, blížících se deadlinů a úkolů po termínu
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span className="text-slate-600">Po termínu</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-600">Blížící se termín (≤ 3 dny)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-slate-600">Dokončeno</span>
          </div>
        </div>
      </div>

      {/* Main Timeline List */}
      <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6">
        {tasksWithDates.map((task) => {
          const assignee = usersList.find((u) => u.uid === task.assigneeId);
          const section = sections.find((s) => s.id === task.sectionId);
          const isOverdue = task.deadline && task.status !== 'done' && isPast(new Date(task.deadline)) && !isToday(new Date(task.deadline));

          return (
            <div
              key={task.id}
              onClick={() => onOpenTask(task)}
              className="relative group cursor-pointer"
            >
              {/* Point on axis */}
              <div
                className={`absolute -left-[31px] top-3 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-transform group-hover:scale-125 ${
                  task.status === 'done'
                    ? 'bg-emerald-500'
                    : isOverdue
                      ? 'bg-rose-500'
                      : 'bg-blue-500'
                }`}
              />

              {/* Task Row Card */}
              <div className={`p-4 rounded-xl border transition-all ${
                isOverdue
                  ? 'border-rose-200 bg-rose-50/30 hover:bg-rose-50/60'
                  : 'border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    {section && (
                      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded">
                        {section.name}
                      </span>
                    )}
                    <h4 className="font-semibold text-slate-800 text-sm group-hover:text-blue-600 transition">
                      {task.title}
                    </h4>
                  </div>
                  <div>{getStatusBadge(task)}</div>
                </div>

                {task.description && (
                  <p className="text-xs text-slate-500 line-clamp-1 mb-2">
                    {task.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100/80">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      Termín: {format(new Date(task.deadline!), 'd. MMMM yyyy', { locale: cs })}
                    </span>
                  </div>

                  {assignee ? (
                    <div className="flex items-center gap-1.5 font-medium text-slate-700">
                      <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] uppercase font-bold">
                        {(assignee.displayName || assignee.email)[0]}
                      </div>
                      <span>{assignee.displayName || assignee.email}</span>
                    </div>
                  ) : (
                    <span className="italic text-slate-400">Nepřiřazeno</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {tasksWithDates.length === 0 && (
          <div className="text-center py-8 text-sm text-slate-400">
            Zatím žádný úkol nemá přiřazený termín dokončení.
          </div>
        )}
      </div>

      {/* Tasks without dates */}
      {tasksWithoutDates.length > 0 && (
        <div className="pt-6 border-t border-slate-100">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Úkoly bez stanoveného termínu ({tasksWithoutDates.length})
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {tasksWithoutDates.map((task) => (
              <div
                key={task.id}
                onClick={() => onOpenTask(task)}
                className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl hover:border-slate-300 hover:bg-slate-100/80 transition cursor-pointer"
              >
                <div className="font-medium text-slate-700 text-xs truncate">
                  {task.title}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Kliknutím nastavíte deadline
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
