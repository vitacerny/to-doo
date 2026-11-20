import React, { useState, useMemo, useEffect } from 'react';
import { CalendarEvent, EventCategory, Task, Project, TutoringDetails, TutoringType, TutoringPlace, TutoringGoal, TutoringStatus, PendingCompensation } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  createCalendarEvent, 
  updateCalendarEvent, 
  deleteCalendarEvent,
  rebalanceTutoringSeries,
  markTutoringAsContinuousForStudent,
  ensureWednesdayLessonForRedStudent,
  getLocalPendingCompensations,
  addPendingCompensation,
  removePendingCompensation
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
  RotateCcw,
  BookOpen
} from 'lucide-react';
import { SchoolTimetable, getSchoolDayEndDetails } from './SchoolTimetable';

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

// Pomocné texty a barvy pro stavy doučování
export const TUTORING_STATUS_CONFIG: Record<TutoringStatus, { label: string; badgeClass: string }> = {
  unprepared: {
    label: 'Nepřipraveno',
    badgeClass: 'bg-rose-100 text-rose-700 border-rose-200'
  },
  prepared: {
    label: 'Připraveno',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  },
  unrecorded: {
    label: 'Nezapsáno',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200'
  },
  recorded: {
    label: 'Zapsáno',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200'
  },
  late_excused_unrecorded: {
    label: 'Omluveno pozdě – nezapsáno',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  late_excused_recorded: {
    label: 'Omluveno pozdě – zapsáno',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-200'
  },
  unpaid: {
    label: 'Nezaplaceno',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200'
  },
  paid: {
    label: 'Zaplaceno',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  }
};

/**
 * Striktní povolené přechody stavů: lze přejít pouze o jeden krok dopředu.
 */
export const getNextAllowedTutoringStatuses = (currentStatus: TutoringStatus, type: TutoringType): TutoringStatus[] => {
  switch (currentStatus) {
    case 'unprepared':
      // Z "nepřipraveno" lze přejít pouze na "připraveno"
      return ['prepared'];
    case 'prepared':
      // Po skončení hodiny přechází na nezapsáno / nezaplaceno
      return type === 'company' ? ['unrecorded'] : ['unpaid'];
    case 'unrecorded':
      // Z "nezapsáno" (firma) lze přejít na "zapsáno" nebo na "omluveno pozdě - nezapsáno"
      return ['recorded', 'late_excused_unrecorded'];
    case 'late_excused_unrecorded':
      // Z "omluveno pozdě - nezapsáno" lze přejít na "omluveno pozdě - zapsáno"
      return ['late_excused_recorded'];
    case 'unpaid':
      // Z "nezaplaceno" (soukromé) lze přejít na "zaplaceno"
      return ['paid'];
    case 'recorded':
    case 'late_excused_recorded':
    case 'paid':
      // Finální stavy - nelze jít dále dopředu
      return [];
    default:
      return [];
  }
};

export const PlannerCalendar: React.FC<PlannerProps> = ({ events, projectTasks, projects }) => {
  const { currentUser } = useAuth();
  // Podzáložky v sekci Kalendář: 'school' (1. škola) a 'planner' (2. osobní plánovač & doučování)
  const [plannerSubTab, setPlannerSubTab] = useState<'school' | 'planner'>('school');

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [showProjectTasks, setShowProjectTasks] = useState(true);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);

  // Zrušení / Náhrada hodiny
  const [cancelModalEvent, setCancelModalEvent] = useState<CalendarEvent | null>(null);
  const [showReschedulePicker, setShowReschedulePicker] = useState(false);
  const [pendingCompensations, setPendingCompensations] = useState<PendingCompensation[]>([]);
  // Zvolený časový blok při upřesňování náhrady
  const [selectedCompensationBlock, setSelectedCompensationBlock] = useState<{
    date: string;
    startTime: string;
    endTime: string;
    startMin: number;
    endMin: number;
    label: string;
    dayLabel: string;
    allowedPlaces: ('library' | 'office')[];
  } | null>(null);
  const [compensationChosenStart, setCompensationChosenStart] = useState<string>('');
  const [compensationDuration, setCompensationDuration] = useState<number>(60);
  const [compensationChosenPlace, setCompensationChosenPlace] = useState<'library' | 'office'>('library');

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
  const [tutoringStatus, setTutoringStatus] = useState<TutoringStatus>('unprepared');
  const [preparedNote, setPreparedNote] = useState('');
  const [targetPreparationNote, setTargetPreparationNote] = useState('');

  // Tutoring Schedule / Recurrence Options
  const [isRecurring, setIsRecurring] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([]); // Výchozí žádný den
  const [dayTimes, setDayTimes] = useState<Record<number, { startTime: string; endTime: string }>>({});
  const [alternateSubjects, setAlternateSubjects] = useState(false); // Výchozí nestřídat
  const [alternateOrder, setAlternateOrder] = useState<'M_CJ' | 'CJ_M'>('M_CJ');
  const [untilPreset, setUntilPreset] = useState<'prijimacky' | 'skolni_rok' | 'custom' | 'weeks'>('skolni_rok');
  const [customUntilDate, setCustomUntilDate] = useState('2027-04-12');
  const [customWeeks, setCustomWeeks] = useState(8);

  // Při prvním načtení automaticky označíme existující lekce studenta modrá jako průběžná a zajistíme středeční hodinu M pro červenou
  useEffect(() => {
    if (currentUser) {
      markTutoringAsContinuousForStudent(currentUser.uid, 'modrá');
      ensureWednesdayLessonForRedStudent(currentUser.uid);
      setPendingCompensations(getLocalPendingCompensations(currentUser.uid));

      const handleCompChange = () => {
        setPendingCompensations(getLocalPendingCompensations(currentUser.uid));
      };
      window.addEventListener(`pending_compensations_changed_${currentUser.uid}`, handleCompChange);
      return () => {
        window.removeEventListener(`pending_compensations_changed_${currentUser.uid}`, handleCompChange);
      };
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
    setTutoringStatus('unprepared');
    setPreparedNote('');
    setTargetPreparationNote('');
    setIsRecurring(true); // Výchozí opakování zaškrtnuto
    setSelectedDays([]); // Žádný předem vybraný den
    setDayTimes({});
    setAlternateSubjects(false); // Výchozí nestřídat
    setAlternateOrder('M_CJ');
    setUntilPreset('skolni_rok'); // U průběžných výchozí do konce školního roku
    setCustomUntilDate('2027-04-12');
    setCollisionWarning(null);
    setIsModalOpen(true);
  };

  // Otevře zobrazení detailu (pouze info + akční tlačítka)
  const handleOpenDetailModal = (ev: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setViewingEvent(ev);
  };

  const handleOpenEditModal = (ev: CalendarEvent, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setViewingEvent(null);
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
      setTutoringStatus(ev.tutoring.status || 'unprepared');
      setPreparedNote(ev.tutoring.preparedNote || '');
      setTargetPreparationNote(ev.tutoring.targetPreparationNote || '');
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
      // Pokud den ještě nemá individuální čas, inicializujeme ho výchozím časem
      if (!dayTimes[dayId]) {
        setDayTimes(prev => ({
          ...prev,
          [dayId]: { startTime: startTime || '16:30', endTime: endTime || '17:30' }
        }));
      }
    }
  };

  const updateDayTime = (dayId: number, field: 'startTime' | 'endTime', value: string) => {
    setDayTimes(prev => ({
      ...prev,
      [dayId]: {
        startTime: field === 'startTime' ? value : (prev[dayId]?.startTime || startTime || '16:30'),
        endTime: field === 'endTime' ? value : (prev[dayId]?.endTime || endTime || '17:30')
      }
    }));
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
        // Kontrola povoleného přechodu stavu dopředu
        if (category === 'tutoring' && editingEvent.tutoring) {
          const originalStatus = editingEvent.tutoring.status || 'unprepared';
          if (tutoringStatus !== originalStatus) {
            const allowedNext = getNextAllowedTutoringStatuses(originalStatus, tutoringType);
            if (!allowedNext.includes(tutoringStatus)) {
              alert(`Nelze změnit stav z "${TUTORING_STATUS_CONFIG[originalStatus]?.label}" na "${TUTORING_STATUS_CONFIG[tutoringStatus]?.label}". Lze přejít pouze o jeden krok dopředu.`);
              setSaving(false);
              return;
            }
          }
        }

        // Validace stavu: před přepnutím na 'prepared' musí být zadáno co je připraveno (min. 3 znaky)
        if (category === 'tutoring' && tutoringStatus === 'prepared') {
          if (!preparedNote.trim() || preparedNote.trim().length < 3) {
            alert('Před přepnutím do stavu "Připraveno" musíte vyplnit, co máte na hodinu připraveno (minimálně 3 znaky).');
            setSaving(false);
            return;
          }
        }

        const tutoringPayload: TutoringDetails | undefined = category === 'tutoring' ? {
          studentColor: studentColor.trim(),
          type: tutoringType,
          place: tutoringPlace,
          goal: tutoringGoal,
          subject: finalSubject,
          sequencePattern: editingEvent.tutoring?.sequencePattern,
          sequenceIndex: editingEvent.tutoring?.sequenceIndex,
          status: tutoringStatus,
          preparedNote: tutoringStatus === 'prepared' ? preparedNote.trim() : (preparedNote.trim() || undefined),
          targetPreparationNote: targetPreparationNote.trim() || undefined
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

        // Kaskádové přeorganizování navazujících lekcí, pokud šlo o doučování nebo sérii
        if (currentUser) {
          if (editingEvent.recurringSeriesId || category === 'tutoring') {
            await rebalanceTutoringSeries({
              seriesId: editingEvent.recurringSeriesId,
              studentColor: studentColor.trim() || editingEvent.tutoring?.studentColor
            }, currentUser.uid);
          }
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

        const occurrences: { date: string; subject: string; sTime?: string; eTime?: string }[] = [];
        let patternIdx = 0;
        let weekOffset = 0;
        const maxWeeks = 40;

        while (weekOffset < maxWeeks) {
          for (const baseDay of dayDates) {
            const curDate = addWeeks(baseDay, weekOffset);
            if (curDate > untilDate) break;
            const curDateStr = format(curDate, 'yyyy-MM-dd');
            const subj = pattern[patternIdx % pattern.length];
            const dayNum = getDay(curDate);
            const customT = dayTimes[dayNum] || { startTime, endTime };
            occurrences.push({ 
              date: curDateStr, 
              subject: subj,
              sTime: customT.startTime || startTime,
              eTime: customT.endTime || endTime
            });
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

        // Kontrola kolizí pro jednotlivé dny
        const conflicts: string[] = [];
        for (const occ of occurrences) {
          const c = checkCollisions([occ.date], occ.sTime, occ.eTime);
          if (c.length > 0) conflicts.push(...c);
        }

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
            startTime: occ.sTime || undefined,
            endTime: occ.eTime || undefined,
            color: finalColor,
            category: 'tutoring',
            tutoring: {
              studentColor: studentColor.trim(),
              type: tutoringType,
              place: tutoringPlace,
              goal: tutoringGoal,
              subject: occ.subject,
              sequencePattern: pattern,
              sequenceIndex: i,
              status: 'unprepared',
              targetPreparationNote: targetPreparationNote.trim() || undefined
            },
            recurringSeriesId: seriesId,
            isDone: false
          });
        }
      } else {
        // Jednorázová událost
        let matchedSeriesId: string | undefined = undefined;
        let matchedPattern: string[] | undefined = undefined;

        // Pokud jde o doučování, zkusíme najít existující sérii/vzor pro tohoto studenta
        if (category === 'tutoring' && studentColor.trim()) {
          const normColor = studentColor.trim().toLowerCase();
          const existingSeriesEvent = events.find(e => 
            e.category === 'tutoring' &&
            e.tutoring?.studentColor?.trim().toLowerCase() === normColor &&
            e.recurringSeriesId
          );
          if (existingSeriesEvent) {
            matchedSeriesId = existingSeriesEvent.recurringSeriesId;
            matchedPattern = existingSeriesEvent.tutoring?.sequencePattern;
          }
        }

        const tutoringPayload: TutoringDetails | undefined = category === 'tutoring' ? {
          studentColor: studentColor.trim(),
          type: tutoringType,
          place: tutoringPlace,
          goal: tutoringGoal,
          subject: finalSubject,
          sequencePattern: matchedPattern,
          status: 'unprepared',
          targetPreparationNote: targetPreparationNote.trim() || undefined
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
          recurringSeriesId: matchedSeriesId,
          isDone: false
        });

        // Pokud jsme přidali jednorázové doučování pro studenta se střídáním, přeorganizujeme celou sérii
        if (category === 'tutoring' && studentColor.trim()) {
          await rebalanceTutoringSeries({
            seriesId: matchedSeriesId,
            studentColor: studentColor.trim()
          }, currentUser.uid);
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

  // Nalezení volných časových bloků v aktuálním a příštím týdnu pro nahrazení hodiny
  // Pravidla:
  // 1. Zobrazení celých souvislých volných bloků (délka >= 60 minut).
  // 2. Začátek nejdříve podle konce vyučování daný den:
  //    - Konec v 16:10 -> nejdřív 16:30
  //    - Konec v 15:20 -> nejdřív 15:30
  //    - Konec v 14:30 -> nejdřív 14:45
  //    - Jinak (dřívější konec / víkend) -> nejdřív 14:00
  // 3. Horní limit konce bloku:
  //    - Soukromé doučování: knihovna zavírá v 18:00, soukromé nesmí do kanclu -> konec nejpozději 18:00.
  //    - Firemní doučování: může končit nejpozději v 19:00 (pokud končí po 18:00, musí být v kanclu).
  // 4. Student v daný den nesmí mít jinou lekci.
  // 5. Blok nesmí být v minulosti.
  const findAvailableBlocksForCompensation = (
    studentColorName: string, 
    tutType: TutoringType = 'company'
  ): {
    date: string;
    startTime: string;
    endTime: string;
    startMin: number;
    endMin: number;
    label: string;
    dayLabel: string;
    allowedPlaces: ('library' | 'office')[];
  }[] => {
    const blocks: {
      date: string;
      startTime: string;
      endTime: string;
      startMin: number;
      endMin: number;
      label: string;
      dayLabel: string;
      allowedPlaces: ('library' | 'office')[];
    }[] = [];

    const now = new Date();
    const currentWeekMon = startOfWeek(now, { weekStartsOn: 1 });
    const nextWeekSun = endOfWeek(addWeeks(currentWeekMon, 1), { weekStartsOn: 1 });
    const allDays = eachDayOfInterval({ start: currentWeekMon, end: nextWeekSun });

    const normStudent = studentColorName.trim().toLowerCase();

    const toMinutes = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const toTimeStr = (totalMinutes: number) => {
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    // Maximální možný konec podle typu doučování:
    // soukromé: 18:00 (knihovna zavírá), firemní: 19:00
    const defaultHardEndMinute = tutType === 'private' ? 18 * 60 : 19 * 60;

    for (const d of allDays) {
      const dStr = format(d, 'yyyy-MM-dd');
      const dayOfWeek = getDay(d); // 0 = Ne, 1 = Po, ..., 6 = So

      // Pravidlo: V neděli se nedoučuje
      if (dayOfWeek === 0) continue;

      // Podmínka: Daný student ten den ještě ŽÁDNOU hodinu nemá
      const studentHasLessonThisDay = events.some(e => 
        e.date === dStr &&
        e.category === 'tutoring' &&
        e.tutoring?.studentColor?.trim().toLowerCase() === normStudent
      );
      if (studentHasLessonThisDay) continue;

      let dayEarliestStartMin: number;
      let hardEndMinute: number;

      // Pravidlo: V sobotu je jediný možný blok 8:00 - 10:00
      if (dayOfWeek === 6) {
        dayEarliestStartMin = 8 * 60; // 08:00
        hardEndMinute = 10 * 60;      // 10:00
      } else {
        // Všední dny: začátek podle konce vyučování
        const schoolEnd = getSchoolDayEndDetails(d);
        dayEarliestStartMin = 14 * 60; // výchozí 14:00
        hardEndMinute = defaultHardEndMinute;

        if (schoolEnd) {
          if (schoolEnd.endTime >= '16:10') {
            dayEarliestStartMin = 16 * 60 + 30; // 16:30
          } else if (schoolEnd.endTime >= '15:20') {
            dayEarliestStartMin = 15 * 60 + 30; // 15:30
          } else if (schoolEnd.endTime >= '14:30') {
            dayEarliestStartMin = 14 * 60 + 45; // 14:45
          } else {
            dayEarliestStartMin = 14 * 60; // 14:00
          }
        }
      }

      // Pokud je den dnešní, kontrolujeme aktuální čas (začátek nemůže být v minulosti)
      if (isSameDay(d, now)) {
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (nowMinutes > dayEarliestStartMin) {
          // Zaokrouhlíme nahoru na nejbližších 15 minut
          dayEarliestStartMin = Math.ceil(nowMinutes / 15) * 15;
        }
      }

      // Pokud nejčasnější možný začátek + 60 min přesahuje hardEnd, v tento den už nelze nic stihnout
      if (dayEarliestStartMin + 60 > hardEndMinute) continue;

      // Najdeme všechny existující události pro daný den s časem a seřadíme je
      const dayBusyIntervals: { start: number; end: number }[] = events
        .filter(e => e.date === dStr && !!e.startTime && e.id !== cancelModalEvent?.id)
        .map(e => {
          const s = toMinutes(e.startTime!);
          const eMin = e.endTime ? toMinutes(e.endTime) : s + 60;
          return { start: s, end: eMin };
        })
        .filter(int => int.end > dayEarliestStartMin && int.start < hardEndMinute)
        .sort((a, b) => a.start - b.start);

      // Sloučíme případné překrývající se busy intervaly
      const mergedBusy: { start: number; end: number }[] = [];
      for (const cur of dayBusyIntervals) {
        if (mergedBusy.length === 0) {
          mergedBusy.push({ ...cur });
        } else {
          const last = mergedBusy[mergedBusy.length - 1];
          if (cur.start <= last.end) {
            last.end = Math.max(last.end, cur.end);
          } else {
            mergedBusy.push({ ...cur });
          }
        }
      }

      // Hledáme volné intervaly mezi dayEarliestStartMin a hardEndMinute
      let pointer = dayEarliestStartMin;
      for (const busy of mergedBusy) {
        if (busy.start > pointer) {
          const freeStart = pointer;
          const freeEnd = Math.min(busy.start, hardEndMinute);
          if (freeEnd - freeStart >= 60) {
            // Určíme povolená místa pro tento blok
            const places: ('library' | 'office')[] = [];
            if (tutType === 'company') {
              places.push('office');
              if (freeStart < 18 * 60) {
                places.push('library');
              }
            } else {
              // Soukromé může být jen v knihovně
              places.push('library');
            }

            const dayName = format(d, 'EEEE d. M.', { locale: cs });
            blocks.push({
              date: dStr,
              startTime: toTimeStr(freeStart),
              endTime: toTimeStr(freeEnd),
              startMin: freeStart,
              endMin: freeEnd,
              dayLabel: dayName,
              label: `${dayName}: ${toTimeStr(freeStart)} – ${toTimeStr(freeEnd)} (${Math.round((freeEnd - freeStart) / 60 * 10) / 10} h volno)`,
              allowedPlaces: places
            });
          }
        }
        pointer = Math.max(pointer, busy.end);
      }

      // Zbývající volný čas do hardEndMinute
      if (pointer < hardEndMinute) {
        const freeStart = pointer;
        const freeEnd = hardEndMinute;
        if (freeEnd - freeStart >= 60) {
          const places: ('library' | 'office')[] = [];
          if (tutType === 'company') {
            places.push('office');
            if (freeStart < 18 * 60) {
              places.push('library');
            }
          } else {
            places.push('library');
          }

          const dayName = format(d, 'EEEE d. M.', { locale: cs });
          blocks.push({
            date: dStr,
            startTime: toTimeStr(freeStart),
            endTime: toTimeStr(freeEnd),
            startMin: freeStart,
            endMin: freeEnd,
            dayLabel: dayName,
            label: `${dayName}: ${toTimeStr(freeStart)} – ${toTimeStr(freeEnd)} (${Math.round((freeEnd - freeStart) / 60 * 10) / 10} h volno)`,
            allowedPlaces: places
          });
        }
      }
    }

    return blocks;
  };

  // Akce 1: Zrušit hodinu bez náhrady (nenahrazovat)
  const handleCancelWithoutCompensation = async (ev: CalendarEvent) => {
    if (!currentUser) return;
    try {
      await deleteCalendarEvent(ev.id);
      if (ev.recurringSeriesId || ev.category === 'tutoring') {
        await rebalanceTutoringSeries({
          seriesId: ev.recurringSeriesId,
          studentColor: ev.tutoring?.studentColor
        }, currentUser.uid);
      }
      setCancelModalEvent(null);
      setViewingEvent(null);
      setShowReschedulePicker(false);
    } catch (err) {
      console.error(err);
      alert('Chyba při rušení hodiny.');
    }
  };

  // Akce 2: Zrušit hodinu a nahradit ji později (uložit do pending_compensations)
  const handleCancelAndPostponeCompensation = async (ev: CalendarEvent) => {
    if (!currentUser || !ev.tutoring) return;
    try {
      // Uložíme informaci o chybějící hodině
      addPendingCompensation({
        userId: currentUser.uid,
        studentColor: ev.tutoring.studentColor,
        originalDate: ev.date,
        originalSubject: ev.tutoring.subject,
        type: ev.tutoring.type,
        place: ev.tutoring.place,
        goal: ev.tutoring.goal,
        sequencePattern: ev.tutoring.sequencePattern,
        recurringSeriesId: ev.recurringSeriesId
      });

      // Smažeme zrušenou lekci z kalendáře a přebalancujeme
      await deleteCalendarEvent(ev.id);
      if (ev.recurringSeriesId || ev.category === 'tutoring') {
        await rebalanceTutoringSeries({
          seriesId: ev.recurringSeriesId,
          studentColor: ev.tutoring?.studentColor
        }, currentUser.uid);
      }

      setCancelModalEvent(null);
      setViewingEvent(null);
      setShowReschedulePicker(false);
      alert(`Hodina pro studenta ${ev.tutoring.studentColor} byla zrušena a uložena jako "Chybějící hodina k nahrazení". Můžete ji kdykoliv nahradit.`);
    } catch (err) {
      console.error(err);
      alert('Chyba při rušení hodiny.');
    }
  };

  // Akce 3: Zrušit hodinu a rovnou vybrat náhradní termín
  const handleScheduleCompensation = async (
    ev: CalendarEvent, 
    targetDate: string, 
    sTime: string, 
    eTime: string, 
    chosenPlace?: TutoringPlace, 
    compIdToRemove?: string
  ) => {
    if (!currentUser || !ev.tutoring) return;

    const tut = ev.tutoring;
    const finalPlace = chosenPlace || tut.place || 'library';

    // Kontrola: cokoliv končí později než 18:00, musí být v kanclu
    if (eTime > '18:00' && finalPlace !== 'office') {
      alert('Knihovna zavírá v 18:00. Lekce končící po 18:00 musí probíhat v kanclu!');
      return;
    }

    // Upozornění před uložením jakékoliv náhradní hodiny v kanclu
    if (finalPlace === 'office') {
      const confirmOffice = window.confirm(
        '⚠️ UPOZORNĚNÍ NA KANCL:\nTato náhradní hodina bude probíhat v kanclu. Nejdříve se prosím podívejte, jestli je tam volno!\n\nChcete pokračovat a hodinu uložit?'
      );
      if (!confirmOffice) {
        return;
      }
    }

    try {
      const finalColor = mapColorNameToKey(tut.studentColor);

      // Pokud byla lekce v kalendáři a teprve ji rušíme, smažeme původní
      if (events.some(e => e.id === ev.id)) {
        await deleteCalendarEvent(ev.id);
      }

      // Pokud to byla již uložená chybějící hodina, smažeme ji ze seznamu k nahrazení
      if (compIdToRemove) {
        removePendingCompensation(currentUser.uid, compIdToRemove);
      }

      // Vytvoříme novou jednorázovou náhradní hodinu
      await createCalendarEvent({
        userId: currentUser.uid,
        title: `Doučování ${tut.subject} (${tut.studentColor})`,
        description: `Náhradní hodina za ${format(new Date(ev.date + 'T12:00:00'), 'd. M. yyyy')}`,
        date: targetDate,
        startTime: sTime,
        endTime: eTime,
        color: finalColor,
        category: 'tutoring',
        tutoring: {
          studentColor: tut.studentColor,
          type: tut.type,
          place: finalPlace,
          goal: tut.goal,
          subject: tut.subject,
          sequencePattern: tut.sequencePattern,
          status: 'unprepared'
        },
        recurringSeriesId: ev.recurringSeriesId,
        isDone: false
      });

      // Přebalancujeme celou sérii studenta, aby předměty perfektně seděly
      await rebalanceTutoringSeries({
        seriesId: ev.recurringSeriesId,
        studentColor: tut.studentColor
      }, currentUser.uid);

      setCancelModalEvent(null);
      setViewingEvent(null);
      setShowReschedulePicker(false);
      setSelectedCompensationBlock(null);
      alert(`Náhradní hodina pro studenta ${tut.studentColor} byla úspěšně naplánována na ${format(new Date(targetDate + 'T12:00:00'), 'd. M. yyyy')} v ${sTime} (${finalPlace === 'office' ? 'Kancl' : 'Knihovna'})!`);
    } catch (err) {
      console.error(err);
      alert('Chyba při plánování náhrady.');
    }
  };

  const handleDeleteEvent = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm('Opravdu chcete smazat tuto událost?')) return;
    try {
      const evToDelete = events.find(e => e.id === id);
      await deleteCalendarEvent(id);
      
      // Kaskádové přeorganizování zbylých lekcí v sérii / studenta
      if (currentUser && evToDelete) {
        if (evToDelete.recurringSeriesId || evToDelete.category === 'tutoring') {
          await rebalanceTutoringSeries({
            seriesId: evToDelete.recurringSeriesId,
            studentColor: evToDelete.tutoring?.studentColor
          }, currentUser.uid);
        }
      }

      if (isModalOpen && editingEvent?.id === id) {
        setIsModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert('Chyba při mazání.');
    }
  };

  // Rychlá změna stavu doučování přímo z kalendáře nebo detailu
  const handleQuickStatusChange = async (ev: CalendarEvent, targetStatus: TutoringStatus, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!ev.tutoring) return;

    const currentSt = ev.tutoring.status || 'unprepared';
    const allowedNext = getNextAllowedTutoringStatuses(currentSt, ev.tutoring.type);
    if (!allowedNext.includes(targetStatus)) {
      alert(`Nelze přejít ze stavu "${TUTORING_STATUS_CONFIG[currentSt]?.label}" do stavu "${TUTORING_STATUS_CONFIG[targetStatus]?.label}". Lze přejít pouze o jeden krok dopředu.`);
      return;
    }

    // Pokud se přepíná na 'prepared', je potřeba zadat, co je připraveno (min. 3 znaky)
    if (targetStatus === 'prepared') {
      const currentNote = ev.tutoring.preparedNote || '';
      const promptText = window.prompt(
        'Co máte na hodinu připraveno? (povinné, min. 3 znaky):',
        currentNote || ev.tutoring.targetPreparationNote || ''
      );
      if (promptText === null) return; // Uživatel zrušil prompt
      if (promptText.trim().length < 3) {
        alert('Stav nelze změnit na "Připraveno" bez vyplnění přípravy (minimálně 3 znaky).');
        return;
      }
      await updateCalendarEvent(ev.id, {
        tutoring: {
          ...ev.tutoring,
          status: 'prepared',
          preparedNote: promptText.trim()
        }
      });
      return;
    }

    await updateCalendarEvent(ev.id, {
      tutoring: {
        ...ev.tutoring,
        status: targetStatus
      }
    });
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
    <div className="w-full flex-1 flex flex-col">
      {/* Podzáložky v záložce Kalendář & Plánovač: 1. Škola, 2. Plánovač & Doučování */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setPlannerSubTab('school')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                plannerSubTab === 'school'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
              <span>1. Škola (Rozvrh)</span>
            </button>

            <button
              type="button"
              onClick={() => setPlannerSubTab('planner')}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer ${
                plannerSubTab === 'planner'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>2. Plánovač & Doučování</span>
            </button>
          </div>

          <div className="hidden sm:block text-xs font-semibold text-slate-400">
            {plannerSubTab === 'school' ? 'Třída 8.A • Bakaláři' : 'Kalendář aktivit a doučování'}
          </div>
        </div>
      </div>

      {plannerSubTab === 'school' ? (
        <SchoolTimetable />
      ) : (
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

      {/* LIŠTA CHYBĚJÍCÍCH HODIN K NAHRAZENÍ (pokud uživatel zvolil Nahradit později) */}
      {pendingCompensations.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm space-y-2.5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <Clock className="w-4 h-4 text-amber-600" />
              <span>Chybějící hodiny k nahrazení ({pendingCompensations.length}):</span>
            </div>
            <span className="text-xs text-amber-700 font-semibold">
              Hodiny zrušené s volbou „Nahradit později“
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {pendingCompensations.map((comp) => {
              const fakeEvent: CalendarEvent = {
                id: comp.id,
                userId: comp.userId,
                title: `Doučování ${comp.originalSubject} (${comp.studentColor})`,
                date: comp.originalDate,
                startTime: '16:30',
                endTime: '17:30',
                color: mapColorNameToKey(comp.studentColor),
                category: 'tutoring',
                tutoring: {
                  studentColor: comp.studentColor,
                  type: comp.type,
                  place: comp.place,
                  goal: comp.goal,
                  subject: comp.originalSubject,
                  sequencePattern: comp.sequencePattern,
                  status: 'unprepared'
                },
                recurringSeriesId: comp.recurringSeriesId,
                createdAt: comp.cancelledAt
              };

              return (
                <div
                  key={comp.id}
                  className="bg-white p-3 rounded-xl border border-amber-200/80 shadow-xs flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-800 flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{comp.originalSubject} • {comp.studentColor}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Zrušeno z termínu {format(new Date(comp.originalDate + 'T12:00:00'), 'd. M. yyyy')}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setCancelModalEvent(fakeEvent);
                      setShowReschedulePicker(true);
                    }}
                    className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-xs shrink-0 flex items-center gap-1"
                  >
                    <span>Nahradit</span>
                    <span>➔</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                      const tutStatus = ev.tutoring?.status || (isTutoring ? 'unprepared' : undefined);
                      const statusCfg = tutStatus ? TUTORING_STATUS_CONFIG[tutStatus] : null;

                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => handleOpenDetailModal(ev, e)}
                          className={`truncate text-[10px] sm:text-xs font-medium px-1.5 py-0.5 rounded border transition flex items-center justify-between gap-1 group/item ${
                            ev.isDone 
                              ? 'bg-slate-100 border-slate-200 text-slate-400 line-through' 
                              : `${colorCfg.lightBg} ${colorCfg.border} ${colorCfg.text}`
                          }`}
                          title={`${ev.startTime ? ev.startTime + ' - ' : ''}${ev.title}${ev.tutoring ? ` [${ev.tutoring.subject}, ${ev.tutoring.place === 'library' ? 'Knihovna' : 'Kancl'}, Stav: ${statusCfg?.label || 'Nepřipraveno'}]` : ''}`}
                        >
                          <div className="flex items-center gap-1 truncate">
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

                          {statusCfg && (
                            <span 
                              className={`text-[8px] font-bold px-1 py-0.2 rounded border shrink-0 ${statusCfg.badgeClass}`}
                              title={statusCfg.label}
                            >
                              {statusCfg.label.split(' ')[0]}
                            </span>
                          )}
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
                        onClick={(e) => handleOpenDetailModal(ev, e)}
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
                          <div className="space-y-1">
                            <div className="font-extrabold flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1 truncate">
                                <GraduationCap className="w-3.5 h-3.5 shrink-0" />
                                <span>{tut.subject} • {tut.studentColor}</span>
                              </div>
                              {tut.status && (
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${TUTORING_STATUS_CONFIG[tut.status]?.badgeClass || ''}`}>
                                  {TUTORING_STATUS_CONFIG[tut.status]?.label}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 text-[10px] opacity-80 pt-0.5">
                              <span className="px-1 py-0.2 rounded bg-white/70 border border-slate-200">
                                {tut.type === 'private' ? 'Soukromé' : 'Firma'}
                              </span>
                              <span className="px-1 py-0.2 rounded bg-white/70 border border-slate-200">
                                {tut.place === 'library' ? 'Knihovna' : 'Kancl'}
                              </span>
                            </div>
                            {tut.preparedNote && (
                              <div className="text-[10px] text-emerald-800 bg-emerald-50/80 p-1 rounded border border-emerald-200/60 flex items-start gap-1">
                                <span className="font-bold shrink-0">Příprava:</span>
                                <span className="truncate">{tut.preparedNote}</span>
                              </div>
                            )}
                            {tut.status === 'unprepared' && tut.targetPreparationNote && (
                              <div className="text-[10px] text-slate-600 bg-slate-50/80 p-1 rounded border border-slate-200/60 flex items-start gap-1">
                                <span className="font-bold shrink-0">K přípravě:</span>
                                <span className="truncate">{tut.targetPreparationNote}</span>
                              </div>
                            )}
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
                  onClick={(e) => handleOpenDetailModal(ev, e)}
                  className={`flex items-start justify-between p-4 rounded-xl border transition cursor-pointer ${
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

                            {/* Badge stavu s dropdownem / akcemi */}
                            {tut.status && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${TUTORING_STATUS_CONFIG[tut.status]?.badgeClass || ''}`}>
                                Stav: {TUTORING_STATUS_CONFIG[tut.status]?.label}
                              </span>
                            )}
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

                      {/* Zobrazení přípravy na hodinu */}
                      {tut && (
                        <div className="pt-2 border-t border-slate-100 flex flex-col gap-1.5 text-xs">
                          {tut.preparedNote ? (
                            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200/80 text-emerald-900 flex items-start gap-2">
                              <span className="font-bold shrink-0 text-emerald-800">✅ Co mám připraveno:</span>
                              <span className="whitespace-pre-wrap">{tut.preparedNote}</span>
                            </div>
                          ) : (tut.status === 'unprepared' && tut.targetPreparationNote) ? (
                            <div className="p-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 flex items-start gap-2">
                              <span className="font-bold shrink-0 text-slate-600">📝 Co si chci připravit:</span>
                              <span className="whitespace-pre-wrap">{tut.targetPreparationNote}</span>
                            </div>
                          ) : null}

                          {/* Tlačítka pro rychlou změnu stavu */}
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight mr-1">Rychlá akce stavu:</span>
                            {tut.status === 'unprepared' && (
                              <button
                                onClick={(e) => handleQuickStatusChange(ev, 'prepared', e)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-xs flex items-center gap-1"
                              >
                                <span>Označit jako "Připraveno"</span>
                              </button>
                            )}

                            {tut.status === 'prepared' && (
                              <button
                                onClick={(e) => handleQuickStatusChange(ev, 'unprepared', e)}
                                className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-xs transition cursor-pointer"
                              >
                                <span>Vrátit na "Nepřipraveno"</span>
                              </button>
                            )}

                            {/* Firemní stavy po skončení */}
                            {tut.type === 'company' && tut.status === 'unrecorded' && (
                              <>
                                <button
                                  onClick={(e) => handleQuickStatusChange(ev, 'recorded', e)}
                                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-xs"
                                >
                                  Označit "Zapsáno"
                                </button>
                                <button
                                  onClick={(e) => handleQuickStatusChange(ev, 'late_excused_unrecorded', e)}
                                  className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-xs"
                                >
                                  Označit "Omluveno pozdě – nezapsáno"
                                </button>
                              </>
                            )}

                            {tut.type === 'company' && tut.status === 'late_excused_unrecorded' && (
                              <button
                                onClick={(e) => handleQuickStatusChange(ev, 'late_excused_recorded', e)}
                                className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-xs"
                              >
                                Označit "Omluveno pozdě – zapsáno"
                              </button>
                            )}

                            {/* Soukromé stavy po skončení */}
                            {tut.type === 'private' && tut.status === 'unpaid' && (
                              <button
                                onClick={(e) => handleQuickStatusChange(ev, 'paid', e)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition cursor-pointer shadow-xs"
                              >
                                Označit "Zaplaceno"
                              </button>
                            )}
                          </div>
                        </div>
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

      {/* DETAIL MODAL (Pouze zobrazení informací o hodině + tlačítka pro změnu stavu a úpravu) */}
      {viewingEvent && (() => {
        const ev = viewingEvent;
        const tut = ev.tutoring;
        const colorCfg = COLOR_CLASSES[ev.color] || COLOR_CLASSES.rose;
        const currentSt = tut?.status || 'unprepared';
        const allowedNext = tut ? getNextAllowedTutoringStatuses(currentSt, tut.type) : [];

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-center gap-2.5">
                  <div className={`p-2 rounded-xl ${colorCfg.lightBg} ${colorCfg.text}`}>
                    {tut ? <GraduationCap className="w-5 h-5" /> : <CalendarIcon className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {ev.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {format(new Date(ev.date + 'T12:00:00'), 'EEEE, d. MMMM yyyy', { locale: cs })}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setViewingEvent(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Čas a termín */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-700">
                  <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="font-semibold">
                    {ev.startTime ? `${ev.startTime} – ${ev.endTime || 'neuveden'}` : 'Celodenní událost'}
                  </span>
                </div>

                {/* Detaily doučování */}
                {tut && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Student</span>
                        <div className="font-bold text-slate-800">{tut.studentColor}</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Předmět</span>
                        <div className="font-bold text-slate-800">{tut.subject}</div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Typ a místo</span>
                        <div className="font-semibold text-slate-800">
                          {tut.type === 'private' ? 'Soukromé' : 'Firma'} • {tut.place === 'library' ? 'Knihovna' : 'Kancl'}
                        </div>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Zaměření</span>
                        <div className="font-semibold text-slate-800">
                          {tut.goal === 'exam' ? '🎯 Přijímačkové' : '📚 Průběžné'}
                        </div>
                      </div>
                    </div>

                    {/* Stav hodiny a změna stavu tlačítkem */}
                    <div className="p-3.5 rounded-2xl border border-indigo-100 bg-indigo-50/30 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                          Stav hodiny
                        </span>
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${TUTORING_STATUS_CONFIG[currentSt]?.badgeClass || ''}`}>
                          {TUTORING_STATUS_CONFIG[currentSt]?.label}
                        </span>
                      </div>

                      {/* Tlačítka pro změnu stavu o 1 krok */}
                      {allowedNext.length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-2">
                          {allowedNext.map(st => (
                            <button
                              key={st}
                              type="button"
                              onClick={async (e) => {
                                await handleQuickStatusChange(ev, st, e);
                                // Aktualizujeme stav v otevřeném okně
                                setViewingEvent(prev => prev ? {
                                  ...prev,
                                  tutoring: prev.tutoring ? {
                                    ...prev.tutoring,
                                    status: st
                                  } : undefined
                                } : null);
                              }}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5"
                            >
                              <span>➡️ Změnit na: {TUTORING_STATUS_CONFIG[st]?.label}</span>
                            </button>
                          ))}
                        </div>
                      )}

                      {allowedNext.length === 0 && (
                        <p className="text-[11px] text-slate-400 italic">
                          Tato hodina je ve finálním stavu, nelze ji dále posunout.
                        </p>
                      )}
                    </div>

                    {/* Příprava na hodinu */}
                    {tut.preparedNote && (
                      <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                        <span className="font-bold text-emerald-800 block">✅ Co mám připraveno:</span>
                        <p className="whitespace-pre-wrap">{tut.preparedNote}</p>
                      </div>
                    )}

                    {tut.status === 'unprepared' && tut.targetPreparationNote && (
                      <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1">
                        <span className="font-bold text-slate-600 block">📝 Co si chci připravit:</span>
                        <p className="whitespace-pre-wrap">{tut.targetPreparationNote}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Poznámka / popis */}
                {ev.description && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Poznámka</span>
                    <p className="text-slate-700 whitespace-pre-wrap">{ev.description}</p>
                  </div>
                )}
              </div>

              {/* Footer s tlačítky Zrušit a Upravit */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                {tut ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCancelModalEvent(ev);
                      setShowReschedulePicker(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    Zrušit hodinu
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const id = ev.id;
                      setViewingEvent(null);
                      handleDeleteEvent(id);
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Smazat
                  </button>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingEvent(null)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Zavřít
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(ev)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
                  >
                    <Edit3 className="w-4 h-4" />
                    Upravit hodinu
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* DIALOG PRO ZRUŠENÍ HODINY A VÝBĚR NÁHRADY */}
      {cancelModalEvent && (() => {
        const ev = cancelModalEvent;
        const tut = ev.tutoring;
        const availableBlocks = tut ? findAvailableBlocksForCompensation(tut.studentColor, tut.type) : [];

        // Pomocné funkce pro minuty a formátování
        const toMin = (t: string) => {
          const [h, m] = t.split(':').map(Number);
          return h * 60 + m;
        };
        const toTimeStr = (total: number) => {
          const h = Math.floor(total / 60);
          const m = total % 60;
          return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };

        // Generování možných začátků v rámci vybraného bloku
        const generatePossibleStarts = (block: typeof selectedCompensationBlock, duration: number) => {
          if (!block) return [];
          const list: string[] = [];
          for (let m = block.startMin; m + duration <= block.endMin; m += 15) {
            list.push(toTimeStr(m));
          }
          return list;
        };

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-rose-50/60">
                <div className="flex items-center gap-2 text-rose-700">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <h3 className="text-base font-bold text-slate-900">
                    Zrušení hodiny doučování
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setCancelModalEvent(null);
                    setShowReschedulePicker(false);
                    setSelectedCompensationBlock(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                <p className="text-sm text-slate-700">
                  Chcete zrušit hodinu <strong>{ev.title}</strong> dne <strong>{format(new Date(ev.date + 'T12:00:00'), 'EEEE d. M. yyyy', { locale: cs })}</strong> v čase {ev.startTime}–{ev.endTime}?
                </p>

                {/* Výběr postupu */}
                {!showReschedulePicker ? (
                  <div className="space-y-3 pt-2">
                    <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Zvolte postup pro zrušení:
                    </span>

                    <button
                      type="button"
                      onClick={() => handleCancelWithoutCompensation(ev)}
                      className="w-full p-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition cursor-pointer text-left flex items-start gap-3 group"
                    >
                      <div className="p-2 rounded-xl bg-slate-100 text-slate-600 group-hover:bg-slate-200 transition">
                        <Trash2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-800">Nenahrazovat</div>
                        <p className="text-[11px] text-slate-500">
                          Hodina se zruší a nebude se hledat žádný náhradní termín. Zbylé hodiny se přeorganizují.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowReschedulePicker(true);
                        setSelectedCompensationBlock(null);
                      }}
                      className="w-full p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 transition cursor-pointer text-left flex items-start gap-3 group"
                    >
                      <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700 group-hover:bg-indigo-200 transition">
                        <CalendarIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-indigo-950">Nahradit hned (vybrat volný časový blok)</div>
                        <p className="text-[11px] text-indigo-800/80">
                          Zobrazí volné časové bloky v tomto a příštím týdnu podle konce vaší školy a otevírací doby knihovny/kanclu.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCancelAndPostponeCompensation(ev)}
                      className="w-full p-3.5 rounded-2xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 transition cursor-pointer text-left flex items-start gap-3 group"
                    >
                      <div className="p-2 rounded-xl bg-amber-100 text-amber-700 group-hover:bg-amber-200 transition">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-amber-950">Nahradit později</div>
                        <p className="text-[11px] text-amber-800/80">
                          Uloží se, že pro tohoto studenta dlužíte 1 hodinu k doplánování, a termín vyberete kdykoliv později.
                        </p>
                      </div>
                    </button>
                  </div>
                ) : !selectedCompensationBlock ? (
                  /* KROK 1: Výběr volného časového bloku */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                        Volné časové bloky v tomto a příštím týdnu:
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowReschedulePicker(false)}
                        className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
                      >
                        Zpět na volby
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Bloky zohledňují konec vaší školy (odpoledne) i limit knihovny (18:00) / kanclu (19:00). Vyberte blok a poté upřesníte čas.
                    </p>

                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {availableBlocks.length > 0 ? (
                        availableBlocks.map((blk, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setSelectedCompensationBlock(blk);
                              setCompensationChosenStart(blk.startTime);
                              setCompensationDuration(60);
                              // Pokud blok končí po 18:00 nebo začíná po 17:00 pro 60m lekci
                              const defEnd = toTimeStr(blk.startMin + 60);
                              const mustOffice = defEnd > '18:00';
                              setCompensationChosenPlace(mustOffice ? 'office' : (tut?.place || 'library'));
                            }}
                            className="w-full p-3 rounded-2xl border border-slate-200 bg-white hover:bg-indigo-50/70 hover:border-indigo-300 transition cursor-pointer text-left flex items-center justify-between text-xs group shadow-2xs"
                          >
                            <div>
                              <div className="font-extrabold text-slate-800 group-hover:text-indigo-900 capitalize text-xs">
                                {blk.dayLabel}
                              </div>
                              <div className="text-[11px] text-indigo-700 font-semibold mt-0.5 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{blk.startTime} – {blk.endTime}</span>
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({Math.round((blk.endMin - blk.startMin) / 60 * 10) / 10} h volno)
                                </span>
                              </div>
                            </div>
                            <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition">
                              Vybrat blok ➔
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-4 rounded-xl bg-slate-50 text-center text-xs text-slate-500">
                          V tomto ani příštím týdnu nebyl nalezen žádný volný blok o délce alespoň 60 minut.
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleCancelAndPostponeCompensation(ev)}
                        className="text-xs text-amber-700 font-bold hover:underline cursor-pointer"
                      >
                        ⏱️ Raději nahradit později
                      </button>
                    </div>
                  </div>
                ) : (
                  /* KROK 2: Upřesnění času v rámci vybraného časového bloku */
                  <div className="space-y-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-extrabold block">
                          Zvolený volný blok
                        </span>
                        <div className="text-sm font-extrabold text-indigo-950 capitalize">
                          {selectedCompensationBlock.dayLabel} ({selectedCompensationBlock.startTime} – {selectedCompensationBlock.endTime})
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedCompensationBlock(null)}
                        className="text-xs text-indigo-600 hover:underline font-bold cursor-pointer"
                      >
                        Změnit blok
                      </button>
                    </div>

                    {/* Nastavení délky lekce a začátku */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Délka lekce
                        </label>
                        <select
                          value={compensationDuration}
                          onChange={(e) => {
                            const newDur = Number(e.target.value);
                            setCompensationDuration(newDur);
                            // Zkontrolujeme, zda stávající start + nová délka nepřekračují konec bloku
                            const curStartMin = toMin(compensationChosenStart);
                            if (curStartMin + newDur > selectedCompensationBlock.endMin) {
                              const adjustedStart = selectedCompensationBlock.endMin - newDur;
                              setCompensationChosenStart(toTimeStr(adjustedStart));
                            }
                          }}
                          className="w-full text-xs font-semibold p-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value={45}>45 minut</option>
                          <option value={60}>60 minut (1 hodina)</option>
                          {selectedCompensationBlock.endMin - selectedCompensationBlock.startMin >= 75 && (
                            <option value={75}>75 minut</option>
                          )}
                          {selectedCompensationBlock.endMin - selectedCompensationBlock.startMin >= 90 && (
                            <option value={90}>90 minut (1,5 hodiny)</option>
                          )}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Začátek hodiny
                        </label>
                        <select
                          value={compensationChosenStart}
                          onChange={(e) => {
                            const newStart = e.target.value;
                            setCompensationChosenStart(newStart);
                            // Pokud konec přesahuje 18:00, automaticky přepneme na kancl
                            const endMin = toMin(newStart) + compensationDuration;
                            if (endMin > 18 * 60) {
                              setCompensationChosenPlace('office');
                            }
                          }}
                          className="w-full text-xs font-semibold p-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-indigo-500"
                        >
                          {generatePossibleStarts(selectedCompensationBlock, compensationDuration).map(t => {
                            const endMin = toMin(t) + compensationDuration;
                            return (
                              <option key={t} value={t}>
                                {t} (do {toTimeStr(endMin)})
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {/* Výběr místa */}
                    {(() => {
                      const curEndMin = toMin(compensationChosenStart || selectedCompensationBlock.startTime) + compensationDuration;
                      const curEndStr = toTimeStr(curEndMin);
                      const endsAfter18 = curEndStr > '18:00';
                      const isCompany = tut?.type === 'company';

                      return (
                        <div className="space-y-2 pt-1">
                          <label className="block text-xs font-bold text-slate-700">
                            Místo konání lekce
                          </label>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={endsAfter18}
                              onClick={() => setCompensationChosenPlace('library')}
                              className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                                compensationChosenPlace === 'library'
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                  : endsAfter18
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <span>Knihovna</span>
                              <span className="text-[10px] font-normal opacity-80">(do 18:00)</span>
                            </button>

                            <button
                              type="button"
                              disabled={!isCompany}
                              onClick={() => setCompensationChosenPlace('office')}
                              className={`p-2.5 rounded-xl border text-xs font-bold transition flex flex-col items-center justify-center gap-1 cursor-pointer ${
                                compensationChosenPlace === 'office'
                                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                  : !isCompany
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed line-through'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <span>Kancl</span>
                              <span className="text-[10px] font-normal opacity-80">(do 19:00)</span>
                            </button>
                          </div>

                          {endsAfter18 && (
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium">
                              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>Hodina končí po 18:00 (kdy knihovna zavírá), proto musí proběhnout v kanclu.</span>
                            </div>
                          )}

                          {compensationChosenPlace === 'office' && (
                            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-[11px] font-medium">
                              <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span>Před uložením vás systém vyzve, abyste zkontrolovali obsazenost kanclu.</span>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Tlačítko pro potvrzení a naplánování */}
                    {(() => {
                      const curStart = compensationChosenStart || selectedCompensationBlock.startTime;
                      const curEnd = toTimeStr(toMin(curStart) + compensationDuration);
                      const isOffice = compensationChosenPlace === 'office';

                      return (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              handleScheduleCompensation(
                                ev,
                                selectedCompensationBlock.date,
                                curStart,
                                curEnd,
                                compensationChosenPlace
                              );
                            }}
                            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-2"
                          >
                            <span>Naplánovat na {curStart} – {curEnd} ({isOffice ? 'Kancl' : 'Knihovna'})</span>
                            <span>➔</span>
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end px-6 py-3 border-t border-slate-100 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => {
                    setCancelModalEvent(null);
                    setShowReschedulePicker(false);
                    setSelectedCompensationBlock(null);
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Zavřít okno
                </button>
              </div>
            </div>
          </div>
        );
      })()}

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

                  {/* STAV HODINY A PŘÍPRAVA (při editaci existující lekce) */}
                  {editingEvent && (() => {
                    const originalStatus = editingEvent.tutoring?.status || 'unprepared';
                    const allowedNext = getNextAllowedTutoringStatuses(originalStatus, tutoringType);

                    return (
                      <div className="p-3.5 bg-white rounded-2xl border border-indigo-200/80 space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                              Aktuální stav hodiny
                            </label>
                            <span className="text-[10px] text-slate-400">
                              (Posun o 1 krok pomocí tlačítka)
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${TUTORING_STATUS_CONFIG[tutoringStatus]?.badgeClass || ''}`}>
                              {TUTORING_STATUS_CONFIG[tutoringStatus]?.label}
                            </span>

                            {/* Tlačítka pro posun do dalšího povoleného stavu */}
                            {allowedNext.map(st => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => {
                                  if (st === 'prepared' && (!preparedNote.trim() || preparedNote.trim().length < 3)) {
                                    alert('Nejprve vyplňte, co máte připraveno na hodinu (min. 3 znaky) v poli níže.');
                                    return;
                                  }
                                  setTutoringStatus(st);
                                }}
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition cursor-pointer shadow-xs border ${
                                  tutoringStatus === st 
                                    ? 'bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-400' 
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                }`}
                              >
                                ➡️ Posunout na: {TUTORING_STATUS_CONFIG[st]?.label}
                              </button>
                            ))}

                            {allowedNext.length === 0 && tutoringStatus === originalStatus && (
                              <span className="text-[11px] font-semibold text-slate-400 italic">
                                (Finální stav – nelze dále posunout)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Pole pro "Připraveno" (povinné, min 3 znaky) */}
                        {(tutoringStatus === 'prepared' || allowedNext.includes('prepared')) && (
                          <div className="space-y-1 animate-in fade-in duration-150">
                            <label className="block text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                              Co mám připraveno na hodinu * (min. 3 znaky)
                            </label>
                            <textarea
                              rows={2}
                              required={tutoringStatus === 'prepared'}
                              placeholder="Např. Pracovní list na lomené výrazy str. 12-14, test z minula..."
                              value={preparedNote}
                              onChange={(e) => setPreparedNote(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50/40 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-emerald-500 resize-none text-slate-900"
                            />
                            {preparedNote.trim().length > 0 && preparedNote.trim().length < 3 && (
                              <span className="text-[10px] text-rose-600 font-semibold">
                                Zadejte alespoň 3 znaky (aktuálně {preparedNote.trim().length}).
                              </span>
                            )}
                          </div>
                        )}

                        {/* Pole pro "Nepřipraveno" (volitelné: co si chci připravit) */}
                        {tutoringStatus === 'unprepared' && (
                          <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                              Co si chci připravit (volitelné)
                            </label>
                            <textarea
                              rows={2}
                              placeholder="Poznámka pro sebe, co nachystat před hodinou..."
                              value={targetPreparationNote}
                              onChange={(e) => setTargetPreparationNote(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none text-slate-800"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* U nového doučování: volitelné Co si chci připravit */}
                  {!editingEvent && (
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                        Co si chci připravit (volitelné, výchozí stav: Nepřipraveno)
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Poznámka pro sebe, jaké materiály či témata připravit..."
                        value={targetPreparationNote}
                        onChange={(e) => setTargetPreparationNote(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500 resize-none text-slate-800"
                      />
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
                            <div className="flex flex-wrap gap-1.5 mb-2.5">
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

                            {/* Individuální časy pro každý vybraný den */}
                            {selectedDays.length > 0 && (
                              <div className="p-3 bg-white rounded-xl border border-indigo-100 space-y-2">
                                <span className="block text-[11px] font-bold text-indigo-950 uppercase tracking-wider">
                                  Čas konání pro jednotlivé dny:
                                </span>
                                <div className="space-y-1.5">
                                  {selectedDays.map(dayId => {
                                    const dayObj = DAYS_OF_WEEK.find(d => d.id === dayId);
                                    const currentT = dayTimes[dayId] || { startTime: startTime || '16:30', endTime: endTime || '17:30' };
                                    return (
                                      <div key={dayId} className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-200/70 text-xs">
                                        <span className="font-bold text-slate-800 w-20 shrink-0">
                                          {dayObj?.label}:
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="time"
                                            value={currentT.startTime}
                                            onChange={(e) => updateDayTime(dayId, 'startTime', e.target.value)}
                                            className="px-2 py-1 bg-white border border-slate-200 rounded-md font-semibold text-slate-800 focus:outline-hidden"
                                          />
                                          <span className="text-slate-400">–</span>
                                          <input
                                            type="time"
                                            value={currentT.endTime}
                                            onChange={(e) => updateDayTime(dayId, 'endTime', e.target.value)}
                                            className="px-2 py-1 bg-white border border-slate-200 rounded-md font-semibold text-slate-800 focus:outline-hidden"
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
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
      )}
    </div>
  );
};
