import React, { useState } from 'react';
import { Section } from '../types';
import { createSection, deleteSection } from '../services/firestoreService';
import { Layers, Plus, Trash2, X } from 'lucide-react';

interface SectionManagerProps {
  projectId: string;
  sections: Section[];
  onClose: () => void;
}

export const SectionManager: React.FC<SectionManagerProps> = ({
  projectId,
  sections,
  onClose
}) => {
  const [newSectionName, setNewSectionName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionName.trim()) return;
    setLoading(true);
    try {
      await createSection(projectId, newSectionName.trim(), sections.length);
      setNewSectionName('');
    } catch (err) {
      console.error(err);
      alert('Chyba při vytváření sekce.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (sectionId: string) => {
    if (sections.length <= 1) {
      alert('Projekt musí obsahovat alespoň jednu sekci.');
      return;
    }
    if (!window.confirm('Opravdu chcete smazat tuto sekci? Úkoly v této sekci zůstanou zachovány.')) return;
    try {
      await deleteSection(sectionId);
    } catch (err) {
      console.error(err);
      alert('Chyba při mazání sekce.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-sm">Správa sekcí projektu</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-500">
            Sekce slouží k logickému a tematickému rozdělení práce v projektu (např. Marketing, Vývoj, Organizace).
          </p>

          {/* New Section Form */}
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              placeholder="Název nové sekce..."
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              className="flex-1 text-sm px-3.5 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading || !newSectionName.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Přidat
            </button>
          </form>

          {/* Existing Sections List */}
          <div className="space-y-2 mt-4 max-h-60 overflow-y-auto">
            {sections.map((sec) => (
              <div
                key={sec.id}
                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl"
              >
                <span className="font-medium text-slate-700 text-sm">{sec.name}</span>
                <button
                  onClick={() => handleDelete(sec.id)}
                  title="Smazat sekci"
                  className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium rounded-lg text-sm cursor-pointer"
          >
            Hotovo
          </button>
        </div>

      </div>
    </div>
  );
};
