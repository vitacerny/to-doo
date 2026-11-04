import React from 'react';
import { Task } from '../types';
import { useAuth } from '../context/AuthContext';
import { Calendar, CheckSquare, AlertCircle } from 'lucide-react';
import { Draggable } from '@hello-pangea/dnd';

interface TaskCardProps {
  task: Task;
  index: number;
  onClick: () => void;
  sectionName?: string;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, index, onClick, sectionName }) => {
  const { usersList } = useAuth();
  const assignee = usersList.find((u) => u.uid === task.assigneeId);

  // Determine deadline status
  const isOverdue = task.deadline && task.status !== 'done' && new Date(task.deadline) < new Date(new Date().toDateString());
  const isNear = task.deadline && task.status !== 'done' && !isOverdue && (
    (new Date(task.deadline).getTime() - new Date().getTime()) / (1000 * 3600 * 24) <= 3
  );

  const priorityColors = {
    low: 'bg-slate-100 text-slate-600 border-slate-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-rose-50 text-rose-700 border-rose-200'
  };

  const priorityLabels = {
    low: 'Nízká',
    medium: 'Střední',
    high: 'Vysoká'
  };

  const completedSubtasks = task.subtasks?.filter(s => s.completed).length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={onClick}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer select-none group ${
            snapshot.isDragging
              ? 'shadow-xl ring-2 ring-blue-500 rotate-1 border-blue-400'
              : 'shadow-sm hover:shadow-md border-slate-200/80 hover:border-slate-300'
          }`}
        >
          {/* Section badge & Priority */}
          <div className="flex items-center justify-between gap-2 mb-2">
            {sectionName ? (
              <span className="text-[11px] font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md truncate max-w-[140px]">
                {sectionName}
              </span>
            ) : <span />}

            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${priorityColors[task.priority]}`}>
              {priorityLabels[task.priority]}
            </span>
          </div>

          {/* Title */}
          <h4 className="font-medium text-slate-800 text-sm leading-snug group-hover:text-blue-600 transition mb-2">
            {task.title}
          </h4>

          {/* Subtasks summary */}
          {totalSubtasks > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3 bg-slate-50 px-2 py-1 rounded">
              <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
              <span>{completedSubtasks}/{totalSubtasks} podúkolů</span>
            </div>
          )}

          {/* Footer info: Deadline & Assignee */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2 text-xs">
            {task.deadline ? (
              <div className={`flex items-center gap-1.5 font-medium ${
                isOverdue 
                  ? 'text-rose-600' 
                  : isNear 
                    ? 'text-amber-600' 
                    : 'text-slate-500'
              }`}>
                {isOverdue && <AlertCircle className="w-3.5 h-3.5 animate-pulse" />}
                <Calendar className="w-3.5 h-3.5" />
                <span>{new Date(task.deadline).toLocaleDateString('cs-CZ')}</span>
              </div>
            ) : (
              <div />
            )}

            {/* Assignee Avatar / Name */}
            {assignee ? (
              <div 
                title={`Přiřazeno: ${assignee.displayName || assignee.email}`}
                className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium text-[11px]"
              >
                <div className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] uppercase font-bold">
                  {(assignee.displayName || assignee.email)[0]}
                </div>
                <span className="truncate max-w-[80px]">
                  {assignee.displayName?.split(' ')[0] || assignee.email.split('@')[0]}
                </span>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400 italic">Nepřiřazeno</span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
};
