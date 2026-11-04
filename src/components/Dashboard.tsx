import React, { useState } from 'react';
import { Project } from '../types';
import { useAuth } from '../context/AuthContext';
import { createProject, deleteProject } from '../services/firestoreService';
import { FolderKanban, Plus, Calendar, CheckSquare, Trash2, ArrowRight, Sparkles } from 'lucide-react';

interface DashboardProps {
  projects: Project[];
  onSelectProject: (p: Project) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ projects, onSelectProject }) => {
  const { userProfile } = useAuth();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createProject({
        name: name.trim(),
        description: description.trim(),
        ownerId: userProfile?.uid || 'guest',
        members: userProfile ? [userProfile.uid] : []
      });
      setName('');
      setDescription('');
      setShowCreateModal(false);
    } catch (err) {
      console.error(err);
      alert('Chyba při zakládání projektu.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (!window.confirm('Opravdu chcete smazat tento projekt?')) return;
    try {
      await deleteProject(projectId);
    } catch (err) {
      console.error(err);
      alert('Chyba při mazání projektu.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full p-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-700 p-8 text-white shadow-xl mb-10">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-md mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            Týmový manažer projektů & úkolů
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Vítejte, {userProfile?.displayName || 'Uživateli'}!
          </h1>
          <p className="mt-2 text-blue-100 text-sm sm:text-base leading-relaxed">
            Spravujte své projekty přehledně. Organizujte úkoly přes Kanban board a sledujte důležité termíny na časové ose.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-blue-700 font-bold text-sm shadow-md hover:bg-blue-50 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Založit nový projekt
            </button>
          </div>
        </div>
      </div>

      {/* Projects Grid Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Vaše projekty</h2>
          <p className="text-xs text-slate-500">Seznam všech dostupných týmových projektů</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow transition cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Nový projekt
        </button>
      </div>

      {/* Grid */}
      {projects.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-slate-200/80 p-8">
          <FolderKanban className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-700">Zatím žádné projekty</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Začněte vytvořením prvního projektu pro organizaci úkolů vašeho týmu.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Vytvořit projekt
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((proj) => (
            <div
              key={proj.id}
              onClick={() => onSelectProject(proj)}
              className="group bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow-xl hover:border-blue-400 transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <FolderKanban className="w-6 h-6" />
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, proj.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                    title="Smazat projekt"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <h3 className="font-bold text-slate-800 text-lg group-hover:text-blue-600 transition">
                  {proj.name}
                </h3>
                {proj.description && (
                  <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">
                    {proj.description}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-6 text-xs text-slate-400 font-medium">
                <span>Vytvořeno: {new Date(proj.createdAt).toLocaleDateString('cs-CZ')}</span>
                <span className="flex items-center gap-1 text-blue-600 group-hover:translate-x-1 transition">
                  Otevřít <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Nový projekt</h3>
            <p className="text-xs text-slate-500 mb-4">Zadejte název a stručný popis projektu.</p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Název projektu *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="např. Organizace školní akce"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">
                  Popis
                </label>
                <textarea
                  rows={3}
                  placeholder="O čem je tento projekt..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim()}
                  className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Vytvářím...' : 'Vytvořit projekt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
