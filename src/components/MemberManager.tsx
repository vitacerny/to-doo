import React, { useState } from 'react';
import { Project, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { addProjectMember, removeProjectMember } from '../services/firestoreService';
import { Users, UserPlus, Trash2, X, Check, Shield } from 'lucide-react';

interface MemberManagerProps {
  project: Project;
  onClose: () => void;
}

export const MemberManager: React.FC<MemberManagerProps> = ({ project, onClose }) => {
  const { usersList, currentUser } = useAuth();
  const [selectedUserUid, setSelectedUserUid] = useState('');
  const [loading, setLoading] = useState(false);

  // Users currently in project
  const memberUsers = usersList.filter((u) => project.members?.includes(u.uid));
  // Users available to add
  const availableUsers = usersList.filter((u) => !project.members?.includes(u.uid));

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserUid) return;
    setLoading(true);
    try {
      await addProjectMember(project.id, selectedUserUid);
      setSelectedUserUid('');
    } catch (err) {
      console.error(err);
      alert('Chyba při přidávání člena do projektu.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async (uid: string) => {
    if (uid === project.ownerId) {
      alert('Vlastníka projektu nelze odebrat.');
      return;
    }
    if (!window.confirm('Opravdu chcete odebrat tohoto člena z projektu?')) return;
    try {
      await removeProjectMember(project.id, uid);
    } catch (err) {
      console.error(err);
      alert('Chyba při odebírání člena.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-slate-800 text-sm">Členové projektu</h3>
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
            Přiřaďte k projektu členy týmu, aby jim bylo možné přidělovat konkrétní úkoly.
          </p>

          {/* Add member select/form */}
          <form onSubmit={handleAddMember} className="flex gap-2">
            <select
              value={selectedUserUid}
              onChange={(e) => setSelectedUserUid(e.target.value)}
              className="flex-1 text-sm bg-slate-50 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Vyberte uživatele k přidání --</option>
              {availableUsers.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.displayName || u.email} ({u.email})
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={loading || !selectedUserUid}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              Přidat
            </button>
          </form>

          {/* Member List */}
          <div className="space-y-2 mt-4 max-h-60 overflow-y-auto">
            {memberUsers.map((member) => {
              const isOwner = member.uid === project.ownerId;
              const isMe = member.uid === currentUser?.uid;

              return (
                <div
                  key={member.uid}
                  className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold uppercase">
                      {(member.displayName || member.email)[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-800 text-sm">
                          {member.displayName || member.email}
                        </span>
                        {isMe && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-medium">
                            Vy
                          </span>
                        )}
                        {isOwner && (
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-medium flex items-center gap-0.5">
                            <Shield className="w-3 h-3" /> Vlastník
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">{member.email}</span>
                    </div>
                  </div>

                  {!isOwner && (
                    <button
                      onClick={() => handleRemoveMember(member.uid)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                      title="Odebrat z projektu"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}

            {memberUsers.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-4">
                Projekt zatím nemá přiřazené žádné členy.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition cursor-pointer"
          >
            Hotovo
          </button>
        </div>
      </div>
    </div>
  );
};
