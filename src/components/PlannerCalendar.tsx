import React, { useState, useMemo, useEffect } from 'react';
import { CalendarEvent, EventCategory, Task, Project, TutoringDetails, TutoringType, TutoringPlace, TutoringGoal } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  createCalendarEvent, 
  updateCalendarEvent, 
  deleteCalendarEvent,
  rebalanceTutoringSeries,
  markTutoringAsContinuousForStudent
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
  subDays,
  getDay
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
  MapPin,
  AlertCircle,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';

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

const DAYS_OF_WEEK = [
  { id: 1, label: 'Pondělí', short: 'Po' },
  { id: 2, label: 'Úterý', short: 'Út' },
  { id: 3, label: 'Středa', short: 'St' },
  { id: 4, label: 'Čtvrtek', short: 'Čt' },
  { id: 5, label: 'Pátek', short: 'Pá' },
  { id: 6, label: 'Sobota', short: 'So' },
  { id: 0, label: 'Neděle', short: 'Ne' }
];

// Barva studenta na barvu štítku
const mapColorNameToKey = (c: string): string => {
  const l = c.toLowerCase();
  if (l.includes('červen') || l.includes('cerven') || l.includes('růž') || l.includes('rose')) return 'rose';
  if (l.includes('modr') || l.includes('blue')) return 'blue';
  if (l.includes('zelen') || l.includes('emerald') || l.includes('green')) return 'emerald';
  if (l.includes('fialov') || l.includes('purple')) return 'purple';
  if (l.includes('žlut') || l.includes('zlut') || l.includes('oranž') || l.includes('amber')) return 'amber';
  return 'indigo';
};

export const PlannerCalendar: React.FC<PlannerProps> = ({ events, projectTasks, projects }) => {
  const { currentUser } = useAuth();
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showProjectTasks, setShowProjectTasks] = useState(true);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('16:30');
  const [endTime, setEndTime] = useState('17:30');
  const [color, setColor] = useState('rose');
  const [category, setCategory] = useState<EventCategory>('tutoring');
  const [saving, setSaving] = useState(false);
  const [collisionWarning, setCollisionWarning] = useState<string | null>(null);

  // Tutoring Attributes
  const [studentColor, setStudentColor] = useState('');
  const [tutoringType, setTutoringType] = useState<TutoringType>('company');
  const [tutoringPlace, setTutoringPlace] = useState<TutoringPlace>('library');
  const [tutoringGoal, setTutoringGoal] = useState<TutoringGoal>('continuous'); // Přijímačkové vs Průběžné
  const [subject, setSubject] = useState('M');
  const [customSubject, setCustomSubject] = useState('');

  // Tutoring Schedule / Recurrence Options
  const [isRecurring, setIsRecurring] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([]); // Výchozí žádný den
  const [alternateSubjects, setAlternateSubjects] = useState(false); // Výchozí nestřídat
  const [alternateOrder, setAlternateOrder] = useState<'M_CJ' | 'CJ_M'>('M_CJ');
  const [untilPreset, setUntilPreset] = useState<'prijimacky' | 'skolni_rok' | 'custom' | 'weeks'>('skolni_rok');
  const [customUntilDate, setCustomUntilDate] = useState('2027-04-12');
  const [customWeeks, setCustomWeeks] = useState(8);

  // Při prvním načtení automaticky označíme existující lekce studenta modrá jako průběžná
  useEffect(() => {
    if (currentUser) {
      markTutoringAsContinuousForStudent(currentUser.uid, 'modrá');
    }
  }, [currentUser]);

  // Přepnutí cíle doučování: Přijímačkové -> do přijímaček, Průběžné -> do konce roku
  const handleGoalChange = (newGoal: TutoringGoal) => {
    setTutoringGoal(newGoal);
    if (newGoal === 'exam') {
      setUntilPreset('prijimacky');
    } else {
      setUntilPreset('skolni_rok');
    }
  };

  // Reset form to defaults
  const handleOpenNewModal = (defaultDate?: string) => {
    setEditingEvent(null);
    setTitle('Doučování M');
    setDescription('');
    setEventDate(defaultDate || format(currentDate, 'yyyy-MM-dd'));
    setStartTime('16:30');
    setEndTime('17:30');
    setColor('indigo');
    setCategory('tutoring');
    setStudentColor(''); // Žádný předem připravený student
    setTutoringType('company');
    setTutoringPlace('library');
    setTutoringGoal('continuous'); // Výchozí průběžné
    setSubject('M'); // Výchozí matematika
    setCustomSubject('');
    setIsRecurring(true); // Výchozí opakování zaškrtnuto
    setSelectedDays([]); // Žádný předem vybraný den
    setAlternateSubjects(false); // Výchozí nestřídat
    setAlternateOrder('M_CJ');
    setUntilPreset('skolni_rok'); // U průběžných výchozí do konce školního roku
    setCustomUntilDate('2027-04-12');
    setCollisionWarning(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (ev: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingEvent(ev);
    setTitle(ev.title);
    setDescription(ev.description || '');
    setEventDate(ev.date);
    setStartTime(ev.startTime || '16:30');
    setEndTime(ev.endTime || '17:30');
    setColor(ev.color || 'rose');
    setCategory(ev.category || 'event');
    setIsRecurring(false); // Edit single
    setCollisionWarning(null);

    if (ev.tutoring) {
      setStudentColor(ev.tutoring.studentColor || 'červená');
      setTutoringType(ev.tutoring.type || 'company');
      setTutoringPlace(ev.tutoring.place || 'library');
      setTutoringGoal(ev.tutoring.goal || 'continuous');
      if (['M', 'ČJ'].includes(ev.tutoring.subject)) {
        setSubject(ev.tutoring.subject);
        setCustomSubject('');
      } else {
        setSubject('JINÉ');
        setCustomSubject(ev.tutoring.subject);
      }
    }
    setIsModalOpen(true);
  };

  // Rule: soukromé doučování nemůže být v kanclu
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

  const toggleDay = (dayId: number) => {
    if (selectedDays.includes(dayId)) {
      setSelectedDays(selectedDays.filter(d => d !== dayId));
    } else {
      setSelectedDays([...selectedDays, dayId].sort((a, b) => a - b));
    }
  };

  // Vypočte cílové mezní datum
  const getComputedUntilDate = (): Date => {
    const curYear = new Date().getFullYear();
    // Přijímačky: duben
    const prijimackyYear = (new Date().getMonth() > 3) ? curYear + 1 : curYear;
    
    if (untilPreset === 'prijimacky') {
      return new Date(prijimackyYear, 3, 12, 23, 59, 59); // 12. dubna
    }
    if (untilPreset === 'skolni_rok') {
      const skolniRokYear = (new Date().getMonth() > 5) ? curYear + 1 : curYear;
      return new Date(skolniRokYear, 5, 30, 23, 59, 59); // 30. června
    }
    if (untilPreset === 'custom') {
      return new Date(customUntilDate + 'T23:59:59');
    }
    // weeks
    return addWeeks(new Date(eventDate), customWeeks);
  };

  // Kontrola kolizí s jinými událostmi
  const checkCollisions = (dates: string[], sTime?: string, eTime?: string): string[] => {
    if (!sTime) return [];
    const conflicts: string[] = [];
    const toMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };
    const newStart = toMinutes(sTime);
    const newEnd = eTime ? toMinutes(eTime) : newStart + 60;

    for (const d of dates) {
      const dayEvents = events.filter(e => e.date === d && !!e.startTime && e.id !== editingEvent?.id);
      for (const ev of dayEvents) {
        const evStart = toMinutes(ev.startTime!);
        const evEnd = ev.endTime ? toMinutes(ev.endTime) : evStart + 60;
        if (Math.max(newStart, evStart) < Math.min(newEnd, evEnd)) {
          conflicts.push(`${d} (${ev.title} v ${ev.startTime})`);
        }
      }
    }
    return conflicts;
  };

  // Save Event(s)
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !title.trim()) return;

    if (category === 'tutoring' && tutoringType === 'private' && tutoringPlace === 'office') {
      alert('Pravidlo: Soukromá doučování nemohou být v kanclu!');
      return;
    }

    setSaving(true);
    try {
      const finalSubject = subject === 'JINÉ' ? (customSubject.trim() || 'Jiné') : subject;
      const finalColor = category === 'tutoring' ? mapColorNameToKey(studentColor) : color;

      // EDITACE JEDNÉ EXISTUJÍCÍ UDÁLOSTI
      if (editingEvent) {
        const tutoringPayload: TutoringDetails | undefined = category === 'tutoring' ? {
          studentColor: studentColor.trim(),
          type: tutoringType,
          place: tutoringPlace,
          goal: tutoringGoal,
          subject: finalSubject,
          sequencePattern: editingEvent.tutoring?.sequencePattern,
          sequenceIndex: editingEvent.tutoring?.sequenceIndex
        } : undefined;

        await updateCalendarEvent(editingEvent.id, {
          title: category === 'tutoring' ? `Doučování ${finalSubject} (${studentColor.trim()})` : title.trim(),
          description: description.trim(),
          date: eventDate,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          color: finalColor,
          category,
          tutoring: tutoringPayload
        });

        // Kaskádové přeorganizování navazujících lekcí, pokud šlo o sérii
        if (editingEvent.recurringSeriesId && editingEvent.tutoring?.sequencePattern) {
          await rebalanceTutoringSeries(editingEvent.recurringSeriesId, currentUser.uid);
        }

        setIsModalOpen(false);
        return;
      }

      // VYTVOŘENÍ NOVÉHO DOUČOVÁNÍ (SÉRIE NEBO JEDNORÁZOVÉ)
      if (category === 'tutoring' && isRecurring) {
        if (selectedDays.length === 0) {
          alert('Při zapnutém opakování vyberte alespoň jeden den v týdnu.');
          setSaving(false);
          return;
        }

        const untilDate = getComputedUntilDate();
        const pattern = alternateSubjects 
          ? (alternateOrder === 'CJ_M' ? ['ČJ', 'M'] : ['M', 'ČJ'])
          : [finalSubject];

        // Seřadíme vybrané dny chronologicky od data první lekce
        const startDate = new Date(eventDate);
        const dayDates = selectedDays.map(dayNum => {
          const res = new Date(startDate);
          res.setHours(0, 0, 0, 0);
          const currentDay = getDay(res);
          const daysToAdd = (dayNum - currentDay + 7) % 7;
          return addDays(res, daysToAdd);
        }).sort((a, b) => a.getTime() - b.getTime());

        const occurrences: { date: string; subject: string }[] = [];
        let patternIdx = 0;
        let weekOffset = 0;
        const maxWeeks = 40;

        while (weekOffset < maxWeeks) {
          for (const baseDay of dayDates) {
            const curDate = addWeeks(baseDay, weekOffset);
            if (curDate > untilDate) break;
            const curDateStr = format(curDate, 'yyyy-MM-dd');
            const subj = pattern[patternIdx % pattern.length];
            occurrences.push({ date: curDateStr, subject: subj });
            patternIdx++;
          }
          if (addWeeks(dayDates[0], weekOffset + 1) > untilDate) break;
          weekOffset++;
        }

        if (occurrences.length === 0) {
          alert('V zadaném období do vybraného data nebyl nalezen žádný termín.');
          setSaving(false);
          return;
        }

        // Kontrola kolizí
        const conflicts = checkCollisions(occurrences.map(o => o.date), startTime, endTime);
        if (conflicts.length > 0) {
          const proceed = window.confirm(
            `Pozor, v některých termínech máte kolizi s jinou událostí:\n${conflicts.slice(0, 3).join('\n')}${conflicts.length > 3 ? '\na další...' : ''}\n\nChcete doučování přesto naplánovat?`
          );
          if (!proceed) {
            setSaving(false);
            return;
          }
        }

        const seriesId = 'series_' + Date.now();
        for (let i = 0; i < occurrences.length; i++) {
          const occ = occurrences[i];
          const cleanTitle = `Doučování ${occ.subject} (${studentColor.trim()})`;
          await createCalendarEvent({
            userId: currentUser.uid,
            title: cleanTitle,
            description: description.trim(),
            date: occ.date,
            startTime: startTime || undefined,
            endTime: endTime || undefined,
            color: finalColor,
            category: 'tutoring',
            tutoring: {
              studentColor: studentColor.trim(),
              type: tutoringType,
              place: tutoringPlace,
              goal: tutoringGoal,
              subject: occ.subject,
              sequencePattern: pattern,
              sequenceIndex: i
            },
            recurringSeriesId: seriesId,
            isDone: false
          });
        }
      } else {
        // Jednorázová událost
        const tutoringPayload: TutoringDetails | undefined = category === 'tutoring' ? {
          studentColor: studentColor.trim(),
          type: tutoringType,
          place: tutoringPlace,
          goal: tutoringGoal,
          subject: finalSubject
        } : undefined;

        await createCalendarEvent({
          userId: currentUser.uid,
          title: category === 'tutoring' ? `Doučování ${finalSubject} (${studentColor.trim()})` : title.trim(),
          description: description.trim(),
          date: eventDate,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
          color: finalColor,
          category,
          tutoring: tutoringPayload,
          isDone: false
        });
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
      const evToDelete = events.find(e => e.id === id);
      await deleteCalendarEvent(id);
      
      // Kaskádové přeorganizování zbylých lekcí v sérii
      if (evToDelete?.recurringSeriesId && currentUser) {
        await rebalanceTutoringSeries(evToDelete.recurringSeriesId, currentUser.uid);
      }

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

  // Navigations
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

  // Calendar intervals
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = useMemo(() => eachDayOfInterval({ start: calendarStart, end: calendarEnd }), [calendarStart, calendarEnd]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

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

  const selectedDayFormatted = format(currentDate, 'yyyy-MM-dd');
  const dayEvents = eventsByDate.get(selectedDayFormatted) || [];
  const dayTasks = tasksByDate.get(selectedDayFormatted) || [];

  return (
    <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold shadow-xs">
              <GraduationCap className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Plánovač doučování & Osobní kalendář
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Plánuj lekce doučování pro studenty (i dvakrát týdně se střídáním ČJ a M), deadliny i osobní aktivity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowProjectTasks(!showProjectTasks)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
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
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Naplánovat doučování / událost</span>
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

                    {dayEvs.slice(0, 3 - Math.min(dayTasksList.length, 2)).map((ev) => {
                      const colorCfg = COLOR_CLASSES[ev.color] || COLOR_CLASSES.rose;
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

                  {dayEvs.map((ev) => {
                    const colorCfg = COLOR_CLASSES[ev.color] || COLOR_CLASSES.rose;
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

            {dayEvents.map((ev) => {
              const colorCfg = COLOR_CLASSES[ev.color] || COLOR_CLASSES.rose;
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
                              {tut.goal === 'exam' ? '🎯 Přijímačkové' : '📚 Průběžné'}
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

      {/* COMPREHENSIVE MODAL FOR TUTORING & EVENTS */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                {category === 'tutoring' ? (
                  <>
                    <GraduationCap className="w-5 h-5 text-indigo-600" />
                    {editingEvent ? 'Upravit doučování' : 'Naplánovat doučování'}
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

            <form onSubmit={handleSaveEvent} className="p-6 space-y-4 overflow-y-auto flex-1 text-slate-800">
              {/* Category Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Typ záznamu
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as EventCategory)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat.key} value={cat.key}>{cat.label}</option>
                  ))}
                </select>
              </div>

              {/* TUTORING PARAMETERS */}
              {category === 'tutoring' && (
                <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between border-b border-indigo-100/80 pb-2">
                    <span className="text-xs font-extrabold text-indigo-950 uppercase tracking-wider flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4 text-indigo-600" />
                      Parametry doučování
                    </span>
                    <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-100/80 px-2 py-0.5 rounded-full">
                      Pravidla aktivní
                    </span>
                  </div>

                  {/* Cíl doučování: Přijímačkové vs Průběžné */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Zaměření doučování *
                    </label>
                    <div className="grid grid-cols-2 gap-2 bg-white p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleGoalChange('exam')}
                        className={`py-2 px-3 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          tutoringGoal === 'exam'
                            ? 'bg-amber-500 text-slate-950 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>🎯 Přijímačkové</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleGoalChange('continuous')}
                        className={`py-2 px-3 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          tutoringGoal === 'continuous'
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>📚 Průběžné</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 pl-1">
                      {tutoringGoal === 'exam'
                        ? 'Automaticky nastaví trvání do přijímaček (12. dubna).'
                        : 'Automaticky nastaví trvání do konce školního roku (lze upravit níže).'}
                    </p>
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
                        placeholder="červená, modrá, zelená..."
                        value={studentColor}
                        onChange={(e) => setStudentColor(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Předmět */}
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Výchozí předmět *
                      </label>
                      <div className="flex gap-1.5">
                        <select
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                          className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500 flex-1"
                        >
                          <option value="ČJ">ČJ (Čeština)</option>
                          <option value="M">M (Matematika)</option>
                          <option value="JINÉ">+ Jiný předmět...</option>
                        </select>
                        {subject === 'JINÉ' && (
                          <input
                            type="text"
                            placeholder="Např. AJ, FYZ..."
                            value={customSubject}
                            onChange={(e) => setCustomSubject(e.target.value)}
                            className="w-24 px-2 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Typ & Místo */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Typ doučování *
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleTypeChange('company')}
                          className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                            tutoringType === 'company' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Firma
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTypeChange('private')}
                          className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                            tutoringType === 'private' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Soukromé
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Místo konání *
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-white p-1 rounded-xl border border-slate-200">
                        <button
                          type="button"
                          onClick={() => handlePlaceChange('library')}
                          className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                            tutoringPlace === 'library' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
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

                  {/* RECURRING & ALTERNATING SETTINGS (Pouze pro nové doučování) */}
                  {!editingEvent && (
                    <div className="pt-2 border-t border-indigo-100 space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isRecurring}
                          onChange={(e) => setIsRecurring(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        />
                        <span className="text-xs font-bold text-slate-800">
                          Pravidelné opakování (např. dvakrát týdně)
                        </span>
                      </label>

                      {isRecurring && (
                        <div className="space-y-3 pl-6 animate-in fade-in duration-150">
                          {/* Výběr dnů v týdnu */}
                          <div>
                            <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                              Vyberte dny v týdnu (např. Úterý a Čtvrtek):
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {DAYS_OF_WEEK.map((d) => {
                                const isSel = selectedDays.includes(d.id);
                                return (
                                  <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => toggleDay(d.id)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition cursor-pointer ${
                                      isSel 
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                    }`}
                                  >
                                    {d.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Střídání ČJ a M */}
                          <div className="p-3 bg-white rounded-xl border border-indigo-100 space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={alternateSubjects}
                                onChange={(e) => setAlternateSubjects(e.target.checked)}
                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                              />
                              <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                                <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                                Automaticky střídat předměty ČJ a M
                              </span>
                            </label>

                            {alternateSubjects && (
                              <div className="flex items-center gap-2 pl-6 text-xs">
                                <span className="text-slate-500">Pořadí střídání:</span>
                                <select
                                  value={alternateOrder}
                                  onChange={(e) => setAlternateOrder(e.target.value as any)}
                                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:outline-hidden"
                                >
                                  <option value="CJ_M">1. hodina ČJ ➡️ 2. hodina M</option>
                                  <option value="M_CJ">1. hodina M ➡️ 2. hodina ČJ</option>
                                </select>
                              </div>
                            )}
                          </div>

                          {/* Trvání do (Předpřipravené volby) */}
                          <div>
                            <span className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                              Trvání doučování (konec série):
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setUntilPreset('prijimacky')}
                                className={`p-2 rounded-xl border text-left text-xs transition cursor-pointer flex flex-col ${
                                  untilPreset === 'prijimacky' 
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <span className="font-bold">🎯 Do přijímaček</span>
                                <span className={`text-[10px] ${untilPreset === 'prijimacky' ? 'text-indigo-100' : 'text-slate-400'}`}>
                                  12. a 13. dubna
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setUntilPreset('skolni_rok')}
                                className={`p-2 rounded-xl border text-left text-xs transition cursor-pointer flex flex-col ${
                                  untilPreset === 'skolni_rok' 
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <span className="font-bold">🏫 Do konce školního roku</span>
                                <span className={`text-[10px] ${untilPreset === 'skolni_rok' ? 'text-indigo-100' : 'text-slate-400'}`}>
                                  30. června
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setUntilPreset('weeks')}
                                className={`p-2 rounded-xl border text-left text-xs transition cursor-pointer flex flex-col ${
                                  untilPreset === 'weeks' 
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <span className="font-bold">📅 Počet týdnů</span>
                                <span className={`text-[10px] ${untilPreset === 'weeks' ? 'text-indigo-100' : 'text-slate-400'}`}>
                                  např. 8 týdnů (2 měsíce)
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setUntilPreset('custom')}
                                className={`p-2 rounded-xl border text-left text-xs transition cursor-pointer flex flex-col ${
                                  untilPreset === 'custom' 
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <span className="font-bold">📆 Vlastní datum</span>
                                <span className={`text-[10px] ${untilPreset === 'custom' ? 'text-indigo-100' : 'text-slate-400'}`}>
                                  Konkrétní den v kalendáři
                                </span>
                              </button>
                            </div>

                            {untilPreset === 'custom' && (
                              <div className="pt-2">
                                <input
                                  type="date"
                                  value={customUntilDate}
                                  onChange={(e) => setCustomUntilDate(e.target.value)}
                                  className="w-full px-3 py-2 bg-white rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                                />
                              </div>
                            )}

                            {untilPreset === 'weeks' && (
                              <div className="pt-2 flex items-center gap-2">
                                <span className="text-xs text-slate-600">Počet týdnů:</span>
                                <select
                                  value={customWeeks}
                                  onChange={(e) => setCustomWeeks(parseInt(e.target.value, 10))}
                                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold"
                                >
                                  <option value={4}>4 týdny (1 měsíc)</option>
                                  <option value={8}>8 týdnů (2 měsíce)</option>
                                  <option value={12}>12 týdnů (3 měsíce)</option>
                                  <option value={16}>16 týdnů (pololetí)</option>
                                  <option value={20}>20 týdnů</option>
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Čas a Datum zahájení */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    {category === 'tutoring' && isRecurring && !editingEvent ? 'Datum zahájení *' : 'Datum *'}
                  </label>
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Čas od *
                  </label>
                  <input
                    type="time"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Čas do *
                  </label>
                  <input
                    type="time"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Název události (pokud není doučování) */}
              {category !== 'tutoring' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Název události *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Např. Lékař, Porada, Zkouška..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              {/* Poznámka */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Poznámka / Látka k procvičení (volitelné)
                </label>
                <textarea
                  rows={2}
                  placeholder="Detaily, pomůcky, domácí úkol..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                {editingEvent ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(editingEvent.id)}
                    className="flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Smazat lekci
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
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Ukládám...' : editingEvent ? 'Uložit změny' : 'Naplánovat doučování'}
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
