import React, { useState, useMemo } from 'react';
import { CalendarEvent, EventCategory, Task, Project, TutoringDetails, TutoringType, TutoringPlace } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  createCalendarEvent, 
  updateCalendarEvent, 
  deleteCalendarEvent 
} from '../services/firestoreService';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths, 
  addWeeks, 
  subWeeks, 
  addDays, 
  subDays
} from 'date-fns';
import { cs } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Circle, 
  Trash2, 
  Edit3, 
  X,
  CheckSquare,
  GraduationCap,
  Building,
  BookOpen,
  MapPin,
  AlertCircle
} from 'lucide-react';
import { AiAssistantBar } from './AiAssistantBar';

interface PlannerProps {
  events: CalendarEvent[];
  projectTasks: Task[];
  projects: Project[];
  onOpenTask?: (task: Task, project: Project) => void;
}

type ViewMode = 'month' | 'week' | 'day';

const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string; dot: string; lightBg: string }> = {
  blue: { bg: 'bg-blue-600', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500', lightBg: 'bg-blue-50' },
  indigo: { bg: 'bg-indigo-600', text: 'text-indigo-700', border: 'border-indigo-200', dot: 'bg-indigo-500', lightBg: 'bg-indigo-50' },
  purple: { bg: 'bg-purple-600', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500', lightBg: 'bg-purple-50' },
  emerald: { bg: 'bg-emerald-600', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500', lightBg: 'bg-emerald-50' },
  amber: { bg: 'bg-amber-600', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500', lightBg: 'bg-amber-50' },
  rose: { bg: 'bg-rose-600', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500', lightBg: 'bg-rose-50' }
};

const CATEGORIES: { key: EventCategory; label: string }[] = [
  { key: 'tutoring', label: '🎓 Doučování' },
  { key: 'event', label: 'Událost' },
  { key: 'task', label: 'Osobní úkol' },
  { key: 'meeting', label: 'Schůzka' },
  { key: 'reminder', label: 'Připomínka' },
  { key: 'personal', label: 'Osobní' }
];

export const PlannerCalendar: React.FC<PlannerProps> = ({ events, projectTasks, projects }) => {
  const { currentUser } = useAuth();
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showProjectTasks, setShowProjectTasks] = useState(true);

  // Modal for new/edit event
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [color, setColor] = useState('indigo');
  const [category, setCategory] = useState<EventCategory>('tutoring');
  const [saving, setSaving] = useState(false);

  // Tutoring Specific State
  const [studentColor, setStudentColor] = useState('modrá');
  const [tutoringType, setTutoringType] = useState<TutoringType>('private');
  const [tutoringPlace, setTutoringPlace] = useState<TutoringPlace>('library');
  const [subject, setSubject] = useState('M');
  const [customSubject, setCustomSubject] = useState('');

  // Recurrence in manual modal
  const [isRecurringModal, setIsRecurringModal] = useState(false);
  const [recurrenceWeeks, setRecurrenceWeeks] = useState(8);

  // Handle tutoring place validation: soukromé doučování nemůže být v kanclu
  const handleTypeChange = (newType: TutoringType) => {
    setTutoringType(newType);
    if (newType === 'private' && tutoringPlace === 'office') {
      setTutoringPlace('library');
    }
  };

  const handlePlaceChange = (newPlace: TutoringPlace) => {
    if (tutoringType === 'private' && newPlace === 'office') {
      alert('Pravidlo: Soukromá doučování nemohou probíhat v kanclu. Zvolte knihovnu nebo změňte typ na firma.');
      return;
    }
    setTutoringPlace(newPlace);
  };

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const handleNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Open modal for a specific date
  const handleOpenNewModal = (defaultDate?: string) => {
    setEditingEvent(null);
    setTitle('Doučování M (modrá)');
    setDescription('');
    setEventDate(defaultDate || format(currentDate, 'yyyy-MM-dd'));
    setStartTime('');
    setEndTime('');
    setColor('blue');
    setCategory('tutoring');
    setStudentColor('modrá');
    setTutoringType('private');
    setTutoringPlace('library');
    setSubject('M');
    setCustomSubject('');
    setIsRecurringModal(false);
    setRecurrenceWeeks(8);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (ev: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingEvent(ev);
    setTitle(ev.title);
    setDescription(ev.description || '');
    setEventDate(ev.date);
    setStartTime(ev.startTime || '');
    setEndTime(ev.endTime || '');
    setColor(ev.color || 'indigo');
    setCategory(ev.category || 'event');

    if (ev.tutoring) {
      setStudentColor(ev.tutoring.studentColor || 'modrá');
      setTutoringType(ev.tutoring.type || 'private');
      setTutoringPlace(ev.tutoring.place || 'library');
      if (['M', 'ČJ'].includes(ev.tutoring.subject)) {
        setSubject(ev.tutoring.subject);
        setCustomSubject('');
      } else {
        setSubject('JINÉ');
        setCustomSubject(ev.tutoring.subject);
      }
    } else {
      setStudentColor('modrá');
      setTutoringType('private');
      setTutoringPlace('library');
      setSubject('M');
      setCustomSubject('');
    }
    setIsModalOpen(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !title.trim() || !eventDate) return;

    // Kontrola pravidla: soukromé nesmí být v kanclu
    if (category === 'tutoring' && tutoringType === 'private' && tutoringPlace === 'office') {
      alert('Pravidlo: Soukromá doučování nemohou být v kanclu!');
      return;
    }

    setSaving(true);
    try {
      const finalSubject = subject === 'JINÉ' ? (customSubject.trim() || 'Jiné') : subject;
      const tutoringPayload: TutoringDetails | undefined = category === 'tutoring' ? {
        studentColor: studentColor.trim(),
        type: tutoringType,
        place: tutoringPlace,
        subject: finalSubject
      } : undefined;

      if (editingEvent) {
        await updateCalendarEvent(editingEvent.id, {
          title: title.trim(),
          description: description.trim(),
          date: eventDate,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          color,
          category,
          tutoring: tutoringPayload
        });
      } else {
        if (isRecurringModal && recurrenceWeeks > 1) {
          const seriesId = 'series_' + Date.now();
          const baseD = new Date(eventDate);
          for (let i = 0; i < recurrenceWeeks; i++) {
            const nextD = format(addWeeks(baseD, i), 'yyyy-MM-dd');
            await createCalendarEvent({
              userId: currentUser.uid,
              title: title.trim(),
              description: description.trim(),
              date: nextD,
              startTime: startTime || undefined,
              endTime: endTime || undefined,
              color,
              category,
              tutoring: tutoringPayload,
              recurringSeriesId: seriesId,
              isDone: false
            });
          }
        } else {
          await createCalendarEvent({
            userId: currentUser.uid,
            title: title.trim(),
            description: description.trim(),
            date: eventDate,
            startTime: startTime || undefined,
            endTime: endTime || undefined,
            color,
            category,
            tutoring: tutoringPayload,
            isDone: false
          });
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      alert('Chyba při ukládání záznamu.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm('Opravdu chcete smazat tuto událost?')) return;
    try {
      await deleteCalendarEvent(id);
      if (isModalOpen && editingEvent?.id === id) {
        setIsModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert('Chyba při mazání.');
    }
  };

  const handleToggleDone = async (ev: CalendarEvent, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await updateCalendarEvent(ev.id, { isDone: !ev.isDone });
    } catch (err) {
      console.error(err);
    }
  };

  // Month days interval
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = useMemo(() => eachDayOfInterval({ start: calendarStart, end: calendarEnd }), [calendarStart, calendarEnd]);

  // Week days interval
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  // Map events and project tasks by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((ev) => {
      const arr = map.get(ev.date) || [];
      arr.push(ev);
      map.set(ev.date, arr);
    });
    map.forEach((list) => {
      list.sort((a, b) => {
        if (!a.startTime && !b.startTime) return 0;
        if (!a.startTime) return 1;
        if (!b.startTime) return -1;
        return a.startTime.localeCompare(b.startTime);
      });
    });
    return map;
  }, [events]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, { task: Task; project?: Project }[]>();
    if (!showProjectTasks) return map;

    projectTasks.forEach((task) => {
      if (task.deadline) {
        const arr = map.get(task.deadline) || [];
        const project = projects.find((p) => p.id === task.projectId);
        arr.push({ task, project });
        map.set(task.deadline, arr);
      }
    });
    return map;
  }, [projectTasks, projects, showProjectTasks]);

  // Selected Day for Day View
  const selectedDayFormatted = format(currentDate, 'yyyy-MM-dd');
  const dayEvents = eventsByDate.get(selectedDayFormatted) || [];
  const dayTasks = tasksByDate.get(selectedDayFormatted) || [];

  return (
    <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6">
      {/* AI Assistant Banner */}
      <AiAssistantBar
        onEventCreated={(targetDateStr) => {
          try {
            setCurrentDate(new Date(targetDateStr));
          } catch {}
        }}
      />

      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <CalendarIcon className="w-4 h-4" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Osobní kalendář & Plánovač doučování
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Plánuj si lekce doučování studentů, schůzky i osobní čas jednoduše a na jednom místě.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Toggle project tasks */}
          <button
            onClick={() => setShowProjectTasks(!showProjectTasks)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              showProjectTasks 
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
            }`}
            title="Zobrazit či skrýt deadliny z týmových projektů"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>Deadliny projektů {showProjectTasks ? 'zapnuty' : 'vypnuty'}</span>
          </button>

          <button
            onClick={() => handleOpenNewModal()}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Přidat doučování / plán</span>
          </button>
        </div>
      </div>

      {/* Calendar Controls (Month/Week/Day + Prev/Next/Today) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white px-5 py-3 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
              title="Předchozí"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition cursor-pointer"
              title="Následující"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={handleToday}
            className="px-3 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition cursor-pointer"
          >
            Dnes
          </button>

          <h2 className="text-base sm:text-lg font-bold text-slate-800 capitalize ml-1">
            {viewMode === 'month' && format(currentDate, 'LLLL yyyy', { locale: cs })}
            {viewMode === 'week' && `Týden ${format(weekStart, 'd. M.', { locale: cs })} – ${format(weekEnd, 'd. M. yyyy', { locale: cs })}`}
            {viewMode === 'day' && format(currentDate, 'EEEE, d. MMMM yyyy', { locale: cs })}
          </h2>
        </div>

        {/* View Switcher */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
              viewMode === 'month' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Měsíc
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
              viewMode === 'week' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Týden
          </button>
          <button
            onClick={() => setViewMode('day')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
              viewMode === 'day' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Den
          </button>
        </div>
      </div>

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider py-2.5 text-center">
            <span>Po</span>
            <span>Út</span>
            <span>St</span>
            <span>Čt</span>
            <span>Pá</span>
            <span className="text-rose-600">So</span>
            <span className="text-rose-600">Ne</span>
          </div>

          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100">
            {monthDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isTodayDate = isSameDay(day, new Date());
              const dayEvs = eventsByDate.get(dateStr) || [];
              const dayTasksList = tasksByDate.get(dateStr) || [];

              return (
                <div
                  key={dateStr}
                  onClick={() => {
                    setCurrentDate(day);
                    handleOpenNewModal(dateStr);
                  }}
                  className={`min-h-[110px] sm:min-h-[130px] p-1.5 sm:p-2 flex flex-col transition hover:bg-slate-50/80 cursor-pointer ${
                    !isCurrentMonth ? 'bg-slate-50/50 text-slate-400' : 'bg-white text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                        isTodayDate
                          ? 'bg-indigo-600 text-white'
                          : isCurrentMonth
                          ? 'text-slate-700'
                          : 'text-slate-400'
                      }`}
                    >
                      {format(day, 'd')}
                    </span>
                    {(dayEvs.length > 0 || dayTasksList.length > 0) && (
                      <span className="text-[10px] font-semibold text-slate-400">
                        {dayEvs.length + dayTasksList.length}
                      </span>
                    )}
                  </div>

                  {/* Events list */}
                  <div className="flex-1 space-y-1 overflow-hidden">
                    {/* Project deadlines */}
                    {dayTasksList.slice(0, 2).map(({ task, project }) => (
                      <div
                        key={`ptask_${task.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate text-[10px] sm:text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1"
                        title={`Projektový úkol: ${task.title} (${project?.name || 'Projekt'})`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                        <span className="truncate">{task.title}</span>
                      </div>
                    ))}

                    {/* Calendar & Tutoring events */}
                    {dayEvs.slice(0, 3 - Math.min(dayTasksList.length, 2)).map((ev) => {
                      const colorCfg = COLOR_CLASSES[ev.color] || COLOR_CLASSES.indigo;
                      const isTutoring = ev.category === 'tutoring' || !!ev.tutoring;

                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => handleOpenEditModal(ev, e)}
                          className={`truncate text-[10px] sm:text-xs font-medium px-1.5 py-0.5 rounded border transition flex items-center gap-1 group/item ${
                            ev.isDone 
                              ? 'bg-slate-100 border-slate-200 text-slate-400 line-through' 
                              : `${colorCfg.lightBg} ${colorCfg.border} ${colorCfg.text}`
                          }`}
                          title={`${ev.startTime ? ev.startTime + ' - ' : ''}${ev.title}${ev.tutoring ? ` [${ev.tutoring.subject}, ${ev.tutoring.place === 'library' ? 'Knihovna' : 'Kancl'}]` : ''}`}
                        >
                          <span
                            onClick={(e) => handleToggleDone(ev, e)}
                            className="cursor-pointer hover:opacity-75"
                          >
                            {ev.isDone ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                            ) : isTutoring ? (
                              <GraduationCap className="w-3 h-3 shrink-0" />
                            ) : (
                              <span className={`w-1.5 h-1.5 rounded-full ${colorCfg.dot} shrink-0 inline-block`} />
                            )}
                          </span>
                          {ev.startTime && (
                            <span className="text-[9px] font-bold opacity-80 shrink-0">
                              {ev.startTime}
                            </span>
                          )}
                          <span className="truncate">
                            {ev.tutoring ? `${ev.tutoring.subject} • ${ev.tutoring.studentColor}` : ev.title}
                          </span>
                        </div>
                      );
                    })}

                    {dayEvs.length + dayTasksList.length > 3 && (
                      <div className="text-[9px] font-bold text-slate-400 px-1">
                        + {dayEvs.length + dayTasksList.length - 3} další
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold uppercase tracking-wider py-2.5 text-center">
            {weekDays.map((d) => {
              const isTodayDate = isSameDay(d, new Date());
              return (
                <div key={d.toISOString()} className="flex flex-col items-center">
                  <span className={format(d, 'i') >= '6' ? 'text-rose-600' : ''}>
                    {format(d, 'EEE', { locale: cs })}
                  </span>
                  <span
                    className={`text-xs mt-0.5 w-6 h-6 flex items-center justify-center rounded-full ${
                      isTodayDate ? 'bg-indigo-600 text-white' : 'text-slate-800'
                    }`}
                  >
                    {format(d, 'd')}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-7 divide-x divide-slate-100 min-h-[420px]">
            {weekDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayEvs = eventsByDate.get(dateStr) || [];
              const dayTasksList = tasksByDate.get(dateStr) || [];

              return (
                <div
                  key={dateStr}
                  onClick={() => handleOpenNewModal(dateStr)}
                  className="p-2 space-y-2 hover:bg-slate-50/50 transition cursor-pointer flex flex-col"
                >
                  {/* Task Deadlines */}
                  {dayTasksList.map(({ task, project }) => (
                    <div
                      key={`w_task_${task.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-xs space-y-0.5"
                    >
                      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-tight">
                        {project?.name || 'Projekt'}
                      </div>
                      <div className="font-semibold truncate">{task.title}</div>
                    </div>
                  ))}

                  {/* Calendar & Tutoring Events */}
                  {dayEvs.map((ev) => {
                    const colorCfg = COLOR_CLASSES[ev.color] || COLOR_CLASSES.indigo;
                    const tut = ev.tutoring;

                    return (
                      <div
                        key={ev.id}
                        onClick={(e) => handleOpenEditModal(ev, e)}
                        className={`p-2 rounded-xl border text-xs space-y-1 transition ${
                          ev.isDone 
                            ? 'bg-slate-100 border-slate-200 text-slate-400 line-through' 
                            : `${colorCfg.lightBg} ${colorCfg.border} ${colorCfg.text}`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          {ev.startTime ? (
                            <span className="text-[10px] font-bold flex items-center gap-1 opacity-80">
                              <Clock className="w-3 h-3" />
                              {ev.startTime} {ev.endTime ? `– ${ev.endTime}` : ''}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                              Celý den
                            </span>
                          )}

                          <button
                            onClick={(e) => handleToggleDone(ev, e)}
                            className="p-0.5 hover:opacity-80"
                          >
                            {ev.isDone ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Circle className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {tut ? (
                          <div className="space-y-0.5">
                            <div className="font-extrabold flex items-center gap-1">
                              <GraduationCap className="w-3.5 h-3.5" />
                              <span>{tut.subject} • {tut.studentColor}</span>
                            </div>
                            <div className="flex flex-wrap gap-1 text-[10px] opacity-80 pt-0.5">
                              <span className="px-1 py-0.2 rounded bg-white/70 border border-slate-200">
                                {tut.type === 'private' ? 'Soukromé' : 'Firma'}
                              </span>
                              <span className="px-1 py-0.2 rounded bg-white/70 border border-slate-200">
                                {tut.place === 'library' ? 'Knihovna' : 'Kancl'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="font-bold">{ev.title}</div>
                        )}

                        {ev.description && (
                          <p className="text-[11px] line-clamp-2 opacity-80">
                            {ev.description}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DAY VIEW */}
      {viewMode === 'day' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Plán na {format(currentDate, 'd. MMMM yyyy', { locale: cs })}
              </h3>
              <p className="text-xs text-slate-500">
                Přehled doučování a plánovaných aktivit pro tento den
              </p>
            </div>

            <button
              onClick={() => handleOpenNewModal(selectedDayFormatted)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Přidat pro tento den
            </button>
          </div>

          <div className="space-y-3">
            {/* Project tasks */}
            {dayTasks.map(({ task, project }) => (
              <div
                key={`day_task_${task.id}`}
                className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/70"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                    P
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase">
                      Projekt: {project?.name || 'Neznámý'}
                    </span>
                    <h4 className="text-sm font-semibold text-slate-800">{task.title}</h4>
                  </div>
                </div>

                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-200/80 text-slate-700">
                  Termín projektu
                </span>
              </div>
            ))}

            {/* Calendar Events & Tutoring */}
            {dayEvents.map((ev) => {
              const colorCfg = COLOR_CLASSES[ev.color] || COLOR_CLASSES.indigo;
              const tut = ev.tutoring;

              return (
                <div
                  key={ev.id}
                  className={`flex items-start justify-between p-4 rounded-xl border transition ${
                    ev.isDone 
                      ? 'bg-slate-50 border-slate-200 text-slate-400' 
                      : `${colorCfg.lightBg} ${colorCfg.border} text-slate-800`
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <button
                      onClick={(e) => handleToggleDone(ev, e)}
                      className="mt-0.5 hover:opacity-80 transition cursor-pointer"
                    >
                      {ev.isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5 text-slate-400" />
                      )}
                    </button>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className={`text-base font-bold ${ev.isDone ? 'line-through' : 'text-slate-900'}`}>
                          {ev.title}
                        </h4>
                        
                        {tut ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-600 text-white flex items-center gap-1">
                              <GraduationCap className="w-3 h-3" />
                              Předmět: {tut.subject}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                              Student: {tut.studentColor}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700">
                              {tut.type === 'private' ? 'Soukromé' : 'Firma'}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-700 flex items-center gap-0.5">
                              <MapPin className="w-3 h-3 text-slate-400" />
                              {tut.place === 'library' ? 'Knihovna' : 'Kancl'}
                            </span>
                          </div>
                        ) : (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${colorCfg.bg} text-white`}>
                            {CATEGORIES.find(c => c.key === ev.category)?.label || 'Událost'}
                          </span>
                        )}
                      </div>

                      {ev.description && (
                        <p className="text-xs text-slate-600 max-w-xl leading-relaxed">
                          {ev.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                        {ev.startTime ? (
                          <span className="flex items-center gap-1 font-medium">
                            <Clock className="w-3.5 h-3.5" />
                            {ev.startTime} {ev.endTime ? `– ${ev.endTime}` : ''}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 font-medium">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            Celodenní
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleOpenEditModal(ev, e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 transition cursor-pointer"
                      title="Upravit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteEvent(ev.id, e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title="Smazat"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {dayEvents.length === 0 && dayTasks.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <CalendarIcon className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">Na tento den nemáte naplánované žádné aktivity ani doučování.</p>
                <button
                  onClick={() => handleOpenNewModal(selectedDayFormatted)}
                  className="mt-3 text-xs text-indigo-600 font-bold hover:underline"
                >
                  + Naplánovat doučování
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CREATE / EDIT EVENT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {category === 'tutoring' ? (
                  <>
                    <GraduationCap className="w-5 h-5 text-indigo-600" />
                    {editingEvent ? 'Upravit doučování' : 'Nové doučování'}
                  </>
                ) : (
                  <>
                    <CalendarIcon className="w-5 h-5 text-indigo-600" />
                    {editingEvent ? 'Upravit událost' : 'Nová událost'}
                  </>
                )}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Category Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Typ záznamu
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    const newCat = e.target.value as EventCategory;
                    setCategory(newCat);
                    if (newCat === 'tutoring' && !title.includes('Doučování')) {
                      setTitle(`Doučování ${subject} (${studentColor})`);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm font-semibold text-slate-800"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.key} value={cat.key}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* TUTORING SPECIFIC ATTRIBUTES */}
              {category === 'tutoring' && (
                <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-3.5">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-900 uppercase tracking-wider">
                    <GraduationCap className="w-4 h-4 text-indigo-600" />
                    Povinné parametry doučování
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Student (Barva slovy) */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Student (barva slovy) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="např. modrá, červená, zelená"
                        value={studentColor}
                        onChange={(e) => {
                          const val = e.target.value;
                          setStudentColor(val);
                          setTitle(`Doučování ${subject === 'JINÉ' ? customSubject : subject} (${val})`);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Předmět (M / ČJ / Jiný) */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Předmět *
                      </label>
                      <div className="flex gap-1.5">
                        <select
                          value={subject}
                          onChange={(e) => {
                            const s = e.target.value;
                            setSubject(s);
                            setTitle(`Doučování ${s === 'JINÉ' ? customSubject : s} (${studentColor})`);
                          }}
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 flex-1"
                        >
                          <option value="M">M (Matematika)</option>
                          <option value="ČJ">ČJ (Čeština)</option>
                          <option value="JINÉ">+ Jiný předmět...</option>
                        </select>

                        {subject === 'JINÉ' && (
                          <input
                            type="text"
                            placeholder="Např. AJ, FYZ..."
                            value={customSubject}
                            onChange={(e) => {
                              setCustomSubject(e.target.value);
                              setTitle(`Doučování ${e.target.value || 'Předmět'} (${studentColor})`);
                            }}
                            className="w-24 px-2 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Typ: Soukromé / Firma */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Typ doučování *
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleTypeChange('private')}
                          className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                            tutoringType === 'private'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Soukromé
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTypeChange('company')}
                          className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                            tutoringType === 'company'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Firma
                        </button>
                      </div>
                    </div>

                    {/* Místo: Knihovna / Kancl */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Místo *
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => handlePlaceChange('library')}
                          className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                            tutoringPlace === 'library'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Knihovna
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePlaceChange('office')}
                          disabled={tutoringType === 'private'}
                          className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                            tutoringPlace === 'office'
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : tutoringType === 'private'
                              ? 'text-slate-300 cursor-not-allowed line-through'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                          title={tutoringType === 'private' ? 'Soukromá doučování nemohou být v kanclu' : ''}
                        >
                          Kancl
                        </button>
                      </div>
                    </div>
                  </div>

                  {tutoringType === 'private' && (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200/80">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>Soukromá doučování nemohou probíhat v kanclu (je povolena pouze knihovna).</span>
                    </div>
                  )}
                </div>
              )}

              {/* Title Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Název události / štítek *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Např. Doučování M (červená)..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm font-semibold"
                />
              </div>

              {/* Date & Recurrence */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Datum {isRecurringModal ? 'první lekce' : ''} *
                </label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                />
              </div>

              {!editingEvent && (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRecurringModal}
                      onChange={(e) => setIsRecurringModal(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Opakovat pravidelně každý týden
                    </span>
                  </label>

                  {isRecurringModal && (
                    <div className="flex items-center gap-2 pt-1 pl-6">
                      <span className="text-xs text-slate-600 font-medium">Počet týdnů:</span>
                      <select
                        value={recurrenceWeeks}
                        onChange={(e) => setRecurrenceWeeks(parseInt(e.target.value, 10))}
                        className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value={4}>4 týdny (1 měsíc)</option>
                        <option value={8}>8 týdnů (2 měsíce)</option>
                        <option value={12}>12 týdnů (3 měsíce / čtvrtletí)</option>
                        <option value={16}>16 týdnů (pololetí)</option>
                        <option value={20}>20 týdnů</option>
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Začátek
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Konec
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm font-medium"
                  />
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Barevný štítek
                </label>
                <div className="flex items-center gap-2 pt-1">
                  {Object.keys(COLOR_CLASSES).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition cursor-pointer ${COLOR_CLASSES[c].bg} ${
                        color === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'opacity-70 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Poznámka / Látka k procvičení
                </label>
                <textarea
                  rows={2}
                  placeholder="Probírané téma, domácí úkol, materiály..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-between pt-2">
                {editingEvent ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(editingEvent.id)}
                    className="flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Smazat
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Zrušit
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow transition cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Ukládám...' : editingEvent ? 'Uložit změny' : 'Uložit doučování'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
