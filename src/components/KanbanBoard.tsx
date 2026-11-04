import React, { useState } from 'react';
import { Task, Section, TaskStatus } from '../types';
import { TaskCard } from './TaskCard';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { Plus, Filter } from 'lucide-react';
import { createTask, updateTask } from '../services/firestoreService';

interface KanbanBoardProps {
  projectId: string;
  tasks: Task[];
  sections: Section[];
  onOpenTask: (task: Task) => void;
}

const COLUMNS: { id: TaskStatus; title: string; color: string; dotColor: string }[] = [
  { id: 'todo', title: 'To Do', color: 'bg-slate-100/80 text-slate-700', dotColor: 'bg-slate-400' },
  { id: 'in_progress', title: 'In Progress', color: 'bg-blue-50/80 text-blue-700', dotColor: 'bg-blue-500' },
  { id: 'done', title: 'Done', color: 'bg-emerald-50/80 text-emerald-700', dotColor: 'bg-emerald-500' }
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  projectId,
  tasks,
  sections,
  onOpenTask
}) => {
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const [creatingInStatus, setCreatingInStatus] = useState<TaskStatus | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  // Filter tasks
  const filteredTasks = selectedSectionFilter === 'all'
    ? tasks
    : tasks.filter(t => t.sectionId === selectedSectionFilter);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newStatus = destination.droppableId as TaskStatus;
    
    // Save state change in firestore
    await updateTask(draggableId, {
      status: newStatus,
      order: destination.index
    });
  };

  const handleQuickAddTask = async (status: TaskStatus) => {
    if (!newTaskTitle.trim()) return;
    const targetSectionId = (selectedSectionFilter !== 'all' && selectedSectionFilter) 
      ? selectedSectionFilter 
      : (sections[0]?.id || 'general');

    await createTask({
      projectId,
      sectionId: targetSectionId,
      title: newTaskTitle.trim(),
      description: '',
      status: status,
      priority: 'medium',
      order: tasks.filter(t => t.status === status).length,
      subtasks: []
    });

    setNewTaskTitle('');
    setCreatingInStatus(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filters bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sekce:</span>
          <select
            value={selectedSectionFilter}
            onChange={(e) => setSelectedSectionFilter(e.target.value)}
            className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Všechny sekce ({tasks.length})</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({tasks.filter(t => t.sectionId === s.id).length})
              </option>
            ))}
          </select>
        </div>

        <div className="text-xs text-slate-400">
          Tip: Úkoly můžete libovolně přesouvat myší mezi sloupci.
        </div>
      </div>

      {/* Board Columns */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 items-start">
          {COLUMNS.map((col) => {
            const columnTasks = filteredTasks.filter((t) => t.status === col.id);

            return (
              <div 
                key={col.id} 
                className="bg-slate-100/70 border border-slate-200/80 rounded-2xl flex flex-col max-h-[calc(100vh-220px)] shadow-sm"
              >
                {/* Column header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.dotColor}`} />
                    <h3 className="font-semibold text-slate-800 text-sm tracking-wide">
                      {col.title}
                    </h3>
                    <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-600 font-bold">
                      {columnTasks.length}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setCreatingInStatus(col.id);
                      setNewTaskTitle('');
                    }}
                    className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                    title={`Přidat úkol do ${col.title}`}
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Quick Add Form in Column */}
                {creatingInStatus === col.id && (
                  <div className="p-3 bg-white border-b border-slate-200">
                    <input
                      type="text"
                      autoFocus
                      placeholder="Co je potřeba udělat?"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleQuickAddTask(col.id);
                        if (e.key === 'Escape') setCreatingInStatus(null);
                      }}
                      className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setCreatingInStatus(null)}
                        className="px-2.5 py-1 text-xs text-slate-600 hover:text-slate-800 cursor-pointer"
                      >
                        Zrušit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickAddTask(col.id)}
                        className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md shadow cursor-pointer"
                      >
                        Přidat úkol
                      </button>
                    </div>
                  </div>
                )}

                {/* Droppable cards area */}
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`p-3 space-y-3 overflow-y-auto flex-1 min-h-[160px] transition-colors rounded-b-2xl ${
                        snapshot.isDraggingOver ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      {columnTasks.map((task, index) => {
                        const sec = sections.find((s) => s.id === task.sectionId);
                        return (
                          <TaskCard
                            key={task.id}
                            task={task}
                            index={index}
                            sectionName={sec?.name}
                            onClick={() => onOpenTask(task)}
                          />
                        );
                      })}
                      {provided.placeholder}

                      {columnTasks.length === 0 && !creatingInStatus && (
                        <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                          Žádné úkoly v tomto sloupci
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
};
