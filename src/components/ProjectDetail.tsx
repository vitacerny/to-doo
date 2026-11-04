import React, { useState } from 'react';
import { Project, Section, Task } from '../types';
import { KanbanBoard } from './KanbanBoard';
import { Timeline } from './Timeline';
import { SectionManager } from './SectionManager';
import { TaskModal } from './TaskModal';
import { 
  ArrowLeft, 
  LayoutDashboard, 
  Calendar, 
  Layers, 
  Plus, 
  CheckCircle, 
  Clock, 
  Users
} from 'lucide-react';
import { createTask } from '../services/firestoreService';

interface ProjectDetailProps {
  project: Project;
  tasks: Task[];
  sections: Section[];
  onBack: () => void;
}

export const ProjectDetail: React.FC<ProjectDetailProps> = ({
  project,
  tasks,
  sections,
  onBack
}) => {
  const [activeTab, setActiveTab] = useState<'kanban' | 'timeline'>('kanban');
  const [showSectionManager, setShowSectionManager] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);

  // Stats
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const handleCreateNewTask = async () => {
    const defaultSectionId = sections[0]?.id || 'general';
    const docRef = await createTask({
      projectId: project.id,
      sectionId: defaultSectionId,
      title: 'Nový úkol',
      description: '',
      status: 'todo',
      priority: 'medium',
      order: tasks.length,
      subtasks: []
    });

    // Open created task directly in modal
    setSelectedTask({
      id: docRef.id,
      projectId: project.id,
      sectionId: defaultSectionId,
      title: 'Nový úkol',
      description: '',
      status: 'todo',
      priority: 'medium',
      order: tasks.length,
      subtasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-64px)] p-6 max-w-7xl mx-auto w-full">
      {/* Top Navigation & Info */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition py-1 px-2.5 rounded-lg hover:bg-slate-200/60 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Zpět na přehled projektů
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {project.name}
            </h1>
            {project.description && (
              <p className="text-sm text-slate-500 mt-0.5">
                {project.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSectionManager(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-sm transition cursor-pointer"
            >
              <Layers className="w-4 h-4 text-blue-600" />
              Sekce ({sections.length})
            </button>

            <button
              onClick={handleCreateNewTask}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm hover:shadow transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nový úkol
            </button>
          </div>
        </div>

        {/* Progress & Tabs bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-b border-slate-200 pb-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('kanban')}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                activeTab === 'kanban'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              Kanban Board
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                activeTab === 'timeline'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Časová osa (Timeline)
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>Dokončeno: <strong className="text-slate-800">{doneTasks}/{totalTasks}</strong></span>
            </div>
            <div className="w-32 bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="font-semibold text-slate-700">{progressPercent}%</span>
          </div>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1">
        {activeTab === 'kanban' ? (
          <KanbanBoard
            projectId={project.id}
            tasks={tasks}
            sections={sections}
            onOpenTask={(task) => setSelectedTask(task)}
          />
        ) : (
          <Timeline
            tasks={tasks}
            sections={sections}
            onOpenTask={(task) => setSelectedTask(task)}
          />
        )}
      </div>

      {/* Modals */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          sections={sections}
          onClose={() => setSelectedTask(null)}
        />
      )}

      {showSectionManager && (
        <SectionManager
          projectId={project.id}
          sections={sections}
          onClose={() => setShowSectionManager(false)}
        />
      )}
    </div>
  );
};
