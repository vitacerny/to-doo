import React, { useState } from 'react';
import { Sparkles, Send, Check, AlertCircle, Key, Loader2, Trash2 } from 'lucide-react';
import { getGeminiApiKey, setGeminiApiKey, parseEventWithGemini, ParsedEventResult } from '../services/aiPlannerService';
import { createCalendarEvent, deleteCalendarEvent } from '../services/firestoreService';
import { CalendarEvent } from '../types';
import { useAuth } from '../context/AuthContext';

interface AiAssistantBarProps {
  events: CalendarEvent[];
  onEventCreated?: (eventDate: string) => void;
}

export const AiAssistantBar: React.FC<AiAssistantBarProps> = ({ events, onEventCreated }) => {
  const { currentUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(getGeminiApiKey());
  const [apiKeySaved, setApiKeySaved] = useState(false);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    setGeminiApiKey(apiKeyInput.trim());
    setApiKeySaved(true);
    setTimeout(() => {
      setApiKeySaved(false);
      setShowSettings(false);
    }, 1200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !prompt.trim() || loading) return;

    setLoading(true);
    setSuccessMessage(null);

    try {
      const apiKey = getGeminiApiKey();
      const parsed: ParsedEventResult = await parseEventWithGemini(prompt.trim(), apiKey);

      // === 1. OBSLUHA MAZÁNÍ (DELETE) ===
      if (parsed.action === 'delete') {
        const crit = parsed.deleteCriteria;
        let eventsToDelete: CalendarEvent[] = [];

        if (crit?.scope === 'all') {
          // Zruš úplně všechno
          eventsToDelete = [...events];
        } else if (crit?.scope === 'date' && crit.date) {
          // Zruš všechno na konkrétní den
          eventsToDelete = events.filter(ev => ev.date === crit.date);
        } else if (crit?.studentColor) {
          // Zruš doučování se studentem dané barvy
          eventsToDelete = events.filter(ev => {
            const matchStudent = ev.tutoring?.studentColor?.toLowerCase().includes(crit.studentColor!.toLowerCase()) ||
              ev.title.toLowerCase().includes(crit.studentColor!.toLowerCase());
            const matchDate = crit.date ? ev.date === crit.date : true;
            return matchStudent && matchDate;
          });
        } else if (crit?.date) {
          eventsToDelete = events.filter(ev => ev.date === crit.date);
        } else if (crit?.keyword) {
          const kw = crit.keyword.toLowerCase();
          eventsToDelete = events.filter(ev => 
            ev.title.toLowerCase().includes(kw) ||
            ev.description?.toLowerCase().includes(kw)
          );
        }

        if (eventsToDelete.length === 0) {
          setSuccessMessage('Nebyly nalezeny žádné odpovídající události k odstranění.');
        } else {
          for (const ev of eventsToDelete) {
            await deleteCalendarEvent(ev.id);
          }
          setSuccessMessage(
            `Smazáno celkem ${eventsToDelete.length} ${eventsToDelete.length === 1 ? 'událost' : eventsToDelete.length < 5 ? 'události' : 'událostí'}.`
          );
        }

        setPrompt('');
        setTimeout(() => setSuccessMessage(null), 5000);
        return;
      }

      // === 2. OBSLUHA VYTVÁŘENÍ (CREATE) ===
      const targetDates = parsed.dates && parsed.dates.length > 0 ? parsed.dates : [parsed.date];
      const seriesId = targetDates.length > 1 ? 'series_' + Date.now() : undefined;

      for (const d of targetDates) {
        await createCalendarEvent({
          userId: currentUser.uid,
          title: parsed.title,
          description: parsed.description,
          date: d,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          category: parsed.category,
          color: parsed.color,
          tutoring: parsed.tutoring,
          recurringSeriesId: seriesId,
          isDone: false
        });
      }

      setSuccessMessage(
        parsed.aiReply || `Naplánováno: ${parsed.title} (${targetDates.length > 1 ? `${targetDates.length} týdnů` : parsed.date}${parsed.startTime ? ` v ${parsed.startTime}` : ''})`
      );
      setPrompt('');

      if (onEventCreated) {
        onEventCreated(targetDates[0]);
      }

      setTimeout(() => {
        setSuccessMessage(null);
      }, 5000);
    } catch (err) {
      console.error("AI Planner error:", err);
      alert("Nepodařilo se požadavek zpracovat. Zkuste to prosím znovu.");
    } finally {
      setLoading(false);
    }
  };

  const hasApiKey = !!getGeminiApiKey();

  return (
    <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-900 rounded-2xl p-4 sm:p-5 text-white shadow-lg relative overflow-hidden">
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-44 h-44 bg-indigo-500/20 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/3 -mb-8 w-40 h-40 bg-purple-500/20 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white/10 backdrop-blur-md flex items-center justify-center text-amber-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-200 flex items-center gap-1.5">
                AI Asistent Plánování
                {hasApiKey ? (
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-1.5 py-0.2 rounded-full font-semibold">
                    Gemini Flash aktivní
                  </span>
                ) : (
                  <span className="text-[10px] bg-amber-500/30 text-amber-200 border border-amber-400/40 px-1.5 py-0.2 rounded-full font-semibold">
                    Základní mód (bez API klíče)
                  </span>
                )}
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 text-[11px] font-medium text-indigo-200 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg transition cursor-pointer backdrop-blur-xs"
            title="Nastavení Gemini API klíče (zdarma)"
          >
            <Key className="w-3.5 h-3.5" />
            <span>{hasApiKey ? 'Klíč nastaven' : 'Vložit API klíč zdarma'}</span>
          </button>
        </div>

        {showSettings && (
          <form
            onSubmit={handleSaveApiKey}
            className="p-3 bg-black/30 backdrop-blur-md rounded-xl border border-white/15 space-y-2.5 animate-in fade-in duration-150"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-300" />
                  Google Gemini API klíč (100% zdarma)
                </h4>
                <p className="text-[11px] text-indigo-200 mt-0.5">
                  Získáte jej za 30 sekund na{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-amber-300 hover:text-amber-200 font-semibold"
                  >
                    aistudio.google.com
                  </a>{' '}
                  (klikněte na "Get API key" se svým Google účtem).
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="password"
                placeholder="Vložte AI Studio API klíč (AIzaSy...)"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-white/40 text-xs focus:outline-hidden focus:ring-1 focus:ring-amber-300"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-900 text-xs font-bold rounded-lg transition flex items-center gap-1 cursor-pointer"
              >
                {apiKeySaved ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Uloženo!
                  </>
                ) : (
                  'Uložit'
                )}
              </button>
            </div>
          </form>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              placeholder="Např.: „Každé pondělí v 15:00 doučování M (zelená)“, „Zruš všechno na zítra“, „Smaž úplně všechno“..."
              className="w-full bg-white/15 border border-white/20 hover:border-white/30 focus:border-amber-300 focus:bg-white/20 text-white placeholder-white/60 text-xs sm:text-sm rounded-xl px-4 py-3 pr-10 focus:outline-hidden transition shadow-inner"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="px-4 sm:px-5 py-3 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs sm:text-sm rounded-xl shadow-md transition flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="hidden sm:inline">Zpracovávám...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Odeslat</span>
              </>
            )}
          </button>
        </form>

        {successMessage && (
          <div className="flex items-center gap-2 p-2.5 bg-emerald-500/25 border border-emerald-400/40 rounded-xl text-emerald-200 text-xs animate-in fade-in slide-in-from-top-1">
            <Check className="w-4 h-4 text-emerald-300 shrink-0" />
            <span className="font-semibold">{successMessage}</span>
          </div>
        )}
      </div>
    </div>
  );
};
