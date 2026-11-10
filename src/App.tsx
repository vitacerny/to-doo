import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { AuthModal } from './components/AuthModal';
import { Dashboard } from './components/Dashboard';
import { ProjectDetail } from './components/ProjectDetail';
import { ChristmasGifts } from './components/ChristmasGifts';
import { Project, Section, Task, ChristmasGift } from './types';
import { 
  subscribeProjects, 
  subscribeSections, 
  subscribeTasks,
  subscribeChristmasGifts
} from './services/firestoreService';
import { LogOut, CheckCircle2, FolderKanban, Gift } from 'lucide-react';

export const App: React.FC = () => {
  const { currentUser, userProfile, logout } = useAuth();
  const [currentModule, setCurrentModule] = useState<'projects' | 'christmas'>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [christmasGifts, setChristmasGifts] = useState<ChristmasGift[]>([]);

  // Subscribe to all projects
  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeProjects((data) => {
      setProjects(data);
      if (selectedProject) {
        const found = data.find((p) => p.id === selectedProject.id);
        if (found) setSelectedProject(found);
      }
    });
    return () => unsub();
  }, [currentUser]);

  // Subscribe to Christmas Gifts for current user
  useEffect(() => {
    if (!currentUser) return;
    const unsub = subscribeChristmasGifts(currentUser.uid, (data) => {
      setChristmasGifts(data);
    });
    return () => unsub();
  }, [currentUser]);

  // Subscribe to sections and tasks of selected project
  useEffect(() => {
    if (!selectedProject) {
      setSections([]);
      setTasks([]);
      return;
    }

    const unsubSections = subscribeSections(selectedProject.id, (data) => {
      setSections(data);
    });

    const unsubTasks = subscribeTasks(selectedProject.id, (data) => {
      setTasks(data);
    });

    return () => {
      unsubSections();
      unsubTasks();
    };
  }, [selectedProject?.id]);

  if (!currentUser) {
    return <AuthModal />;
  }

  const navigateToProjects = () => {
    setCurrentModule('projects');
    setSelectedProject(null);
  };

  const navigateToChristmas = () => {
    setCurrentModule('christmas');
    setSelectedProject(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo / Brand & Module Navigation */}
          <div className="flex items-center gap-6 sm:gap-8">
            <div 
              onClick={navigateToProjects}
              className="flex items-center gap-2.5 cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-sm group-hover:shadow transition">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-slate-900 group-hover:text-blue-600 transition">
                  TaskFlow
                </span>
                <span className="text-[10px] font-semibold text-blue-600 ml-1.5 uppercase bg-blue-50 px-1.5 py-0.5 rounded">
                  v2.0
                </span>
              </div>
            </div>

            {/* Module Switcher Tabs */}
            <nav className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl">
              <button
                onClick={navigateToProjects}
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  currentModule === 'projects'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FolderKanban className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Projekty & Úkoly</span>
                <span className="sm:hidden">Projekty</span>
              </button>

              <button
                onClick={navigateToChristmas}
                className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                  currentModule === 'christmas'
                    ? 'bg-white text-rose-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Gift className="w-3.5 h-3.5 text-rose-500" />
                <span>Vánoční dárky</span>
                {christmasGifts.length > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.2 bg-rose-100 text-rose-700 text-[10px] rounded-full font-bold">
                    {christmasGifts.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          {/* User profile & actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2.5 bg-slate-100/70 py-1.5 px-3 rounded-full border border-slate-200/60">
              <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold uppercase">
                {(userProfile?.displayName || userProfile?.email || 'U')[0]}
              </div>
              <span className="text-xs font-semibold text-slate-700 truncate max-w-[90px] sm:max-w-[180px]">
                {userProfile?.displayName || userProfile?.email}
              </span>
            </div>

            <button
              onClick={logout}
              title="Odhlásit se"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {currentModule === 'christmas' ? (
          <ChristmasGifts gifts={christmasGifts} />
        ) : selectedProject ? (
          <ProjectDetail
            project={selectedProject}
            tasks={tasks}
            sections={sections}
            onBack={() => setSelectedProject(null)}
          />
        ) : (
          <Dashboard
            projects={projects}
            onSelectProject={(p) => setSelectedProject(p)}
          />
        )}
      </main>
    </div>
  );
};

export default App;
