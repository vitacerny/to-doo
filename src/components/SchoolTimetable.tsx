import React, { useState, useEffect } from 'react';
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek, isSameDay } from 'date-fns';
import { cs } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  GraduationCap, 
  MapPin, 
  User, 
  Calendar as CalendarIcon,
  Sparkles,
  Info,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Ban
} from 'lucide-react';
import { 
  fetchLiveSuplovani, 
  DailySubstitutionResult, 
  SchoolSubstitutionChange 
} from '../services/suplovaniService';

export interface LessonPeriod {
  period: number;
  startTime: string;
  endTime: string;
}

export const PERIODS: LessonPeriod[] = [
  { period: 0, startTime: '07:15', endTime: '08:00' },
  { period: 1, startTime: '08:10', endTime: '08:55' },
  { period: 2, startTime: '09:05', endTime: '09:50' },
  { period: 3, startTime: '10:10', endTime: '10:55' },
  { period: 4, startTime: '11:05', endTime: '11:50' },
  { period: 5, startTime: '12:00', endTime: '12:45' },
  { period: 6, startTime: '12:55', endTime: '13:40' },
  { period: 7, startTime: '13:45', endTime: '14:30' },
  { period: 8, startTime: '14:35', endTime: '15:20' },
  { period: 9, startTime: '15:25', endTime: '16:10' }
];

export interface TimetableLesson {
  subject: string;
  teacher: string;
  room: string;
  group?: string;
  weekType?: 'even' | 'odd' | 'both'; // 'even' = S (sudý), 'odd' = L (lichý)
  note?: string;
}

export type DayTimetable = Record<number, TimetableLesson[]>; // period -> lessons

// Kompletní rozvrh dle Bakalářů uživatele
export const SCHOOL_TIMETABLE: Record<number, DayTimetable> = {
  // Pondělí (1)
  1: {
    1: [{ subject: 'SMA', teacher: 'Bici', room: 'U8A', group: '8.A SMAG' }],
    2: [{ subject: 'SMA', teacher: 'Bici', room: 'U8A', group: '8.A SMAG' }],
    3: [{ subject: 'CJ', teacher: 'Bouc', room: 'U8A', group: '8.A' }],
    4: [{ subject: 'MA', teacher: 'Bici', room: 'U8A', group: '8.A' }],
    6: [{ subject: 'TV', teacher: 'Kuci', room: 'TĚV', group: '8.A Chl' }],
    7: [{ subject: 'MADT', teacher: 'Rojk', room: 'U4D', group: '8.A MDT2' }],
    8: [{ subject: 'DE', teacher: 'Toma', room: 'U8A', group: '8.A' }],
    9: [{ subject: 'ZSV', teacher: 'Pori', room: 'U8A', group: '8.A' }]
  },
  // Úterý (2)
  2: {
    1: [{ subject: 'MAC', teacher: 'Kade', room: 'U4C', group: '8.A MACE' }],
    2: [{ subject: 'MAC', teacher: 'Kade', room: 'U4C', group: '8.A MACE' }],
    3: [{ subject: 'AJ', teacher: 'Fejt', room: 'J1', group: '8.A HV' }],
    4: [{ subject: 'FJ', teacher: 'Tomm', room: 'U8A', group: '8.A A/F' }],
    5: [{ subject: 'CJ', teacher: 'Bouc', room: 'U8A', group: '8.A' }],
    6: [
      { subject: 'ZSV', teacher: 'Pori', room: 'U8A', group: '8.A', weekType: 'even' }, // S = sudý týden
      { subject: 'DE', teacher: 'Toma', room: 'U8A', group: '8.A', weekType: 'odd' }    // L = lichý týden
    ],
    8: [{ subject: 'MA', teacher: 'Bici', room: 'U8A', group: '8.A' }]
  },
  // Středa (3)
  3: {
    1: [{ subject: 'AJ', teacher: 'Fejt', room: 'U8A', group: '8.A HV' }],
    2: [{ subject: 'FJ', teacher: 'Tomm', room: 'U8A', group: '8.A A/F' }],
    3: [
      { subject: 'FY', teacher: 'Novk', room: 'U8A', group: '8.A', weekType: 'even' }, // S = sudý týden
      { subject: 'CH', teacher: 'Kuce', room: 'PCH', group: '8.A', weekType: 'odd' }   // L = lichý týden
    ],
    4: [{ subject: 'TV', teacher: 'Kuci', room: 'TĚV', group: '8.A Chl' }],
    5: [{ subject: 'SIN', teacher: 'Fere', room: 'UVT1', group: '8.A SINI' }],
    6: [{ subject: 'SIN', teacher: 'Fere', room: 'UVT1', group: '8.A SINI' }]
  },
  // Čtvrtek (4)
  4: {
    3: [{ subject: 'CJ', teacher: 'Bouc', room: 'U8A', group: '8.A SCM1' }],
    4: [{ subject: 'AJ', teacher: 'Fejt', room: 'U8A', group: '8.A HV' }],
    5: [{ subject: 'CH', teacher: 'Kuce', room: 'PCH', group: '8.A' }],
    6: [{ subject: 'MA', teacher: 'Bici', room: 'U8A', group: '8.A SCM1' }],
    8: [{ subject: 'FY', teacher: 'Novk', room: 'U8A', group: '8.A' }],
    9: [{ subject: 'BI', teacher: 'Pazn', room: 'U8A', group: '8.A' }]
  },
  // Pátek (5)
  5: {
    1: [{ subject: 'SBI', teacher: 'Kuce', room: 'PBI', group: '8.A SBIH' }],
    2: [{ subject: 'SBI', teacher: 'Kuce', room: 'PBI', group: '8.A SBIH' }],
    3: [{ subject: 'FJ', teacher: 'Tomm', room: 'U8A', group: '8.A A/F' }],
    4: [{ subject: 'CJ', teacher: 'Bouc', room: 'U8A', group: '8.A' }],
    5: [{ subject: 'MA', teacher: 'Bici', room: 'U8A', group: '8.A' }],
    6: [{ subject: 'AJ', teacher: 'Fejt', room: 'U8A', group: '8.A HV' }]
  }
};

const SUBJECT_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  MA: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  SMA: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  MAC: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  MADT: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  CJ: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  AJ: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  FJ: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  SIN: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  FY: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  CH: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  BI: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  SBI: { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200' },
  DE: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  ZSV: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', border: 'border-fuchsia-200' },
  TV: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300' }
};

// Výpočet ISO čísla týdne (48 = sudý, 49 = lichý atd.)
export const getISOWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export const SchoolTimetable: React.FC = () => {
  // Výchozí týden: Příští týden od 23. 11. 2026 (dle požadavku uživatele)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    // Posun na příští pondělí
    const day = today.getDay();
    const daysUntilNextMon = (day === 0 ? 1 : 8 - day);
    const nextMon = new Date(today);
    nextMon.setDate(today.getDate() + daysUntilNextMon);
    return nextMon;
  });

  const [activeLessonModal, setActiveLessonModal] = useState<{
    lesson: TimetableLesson;
    period: LessonPeriod;
    dayName: string;
    dateStr: string;
    substitution?: SchoolSubstitutionChange;
  } | null>(null);

  // Stav pro online suplování z ghb.bakalari.cz
  const [substitutionData, setSubstitutionData] = useState<DailySubstitutionResult | null>(null);
  const [isLoadingSuplovani, setIsLoadingSuplovani] = useState<boolean>(false);
  const [showAllClassChanges, setShowAllClassChanges] = useState<boolean>(false);

  const loadSuplovani = async () => {
    setIsLoadingSuplovani(true);
    try {
      const data = await fetchLiveSuplovani();
      setSubstitutionData(data);
    } catch (e) {
      console.error('Chyba při načítání suplování:', e);
    } finally {
      setIsLoadingSuplovani(false);
    }
  };

  useEffect(() => {
    loadSuplovani();
  }, []);

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 1 });
  const isoWeek = getISOWeekNumber(weekStart);
  const isEvenWeek = isoWeek % 2 === 0; // Sudý (S) vs Lichý (L)

  const handlePrevWeek = () => {
    setSelectedDate(prev => subWeeks(prev, 1));
  };

  const handleNextWeek = () => {
    setSelectedDate(prev => addWeeks(prev, 1));
  };

  const handleCurrentWeek = () => {
    const today = new Date();
    const day = today.getDay();
    const daysUntilNextMon = (day === 0 ? 1 : 8 - day);
    const nextMon = new Date(today);
    nextMon.setDate(today.getDate() + daysUntilNextMon);
    setSelectedDate(nextMon);
  };

  const DAYS = [
    { id: 1, name: 'Pondělí', short: 'Po', date: weekStart },
    { id: 2, name: 'Úterý', short: 'Út', date: new Date(weekStart.getTime() + 1 * 86400000) },
    { id: 3, name: 'Středa', short: 'St', date: new Date(weekStart.getTime() + 2 * 86400000) },
    { id: 4, name: 'Čtvrtek', short: 'Čt', date: new Date(weekStart.getTime() + 3 * 86400000) },
    { id: 5, name: 'Pátek', short: 'Pá', date: new Date(weekStart.getTime() + 4 * 86400000) }
  ];

  return (
    <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 space-y-6">
      {/* Header & Week Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Školní rozvrh</span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700">
                  8.A (Oktáva)
                </span>
              </h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Oficiální rozvrh hodin s automatickým střídáním sudých a lichých týdnů (S / L).
          </p>
        </div>

        {/* Týdenní navigace & Informace o sudém / lichém týdnu */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition cursor-pointer"
              title="Předchozí týden"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleCurrentWeek}
              className="px-3 py-1 text-xs font-bold text-slate-700 hover:bg-white rounded-lg transition cursor-pointer"
            >
              Příští týden (výchozí)
            </button>
            <button
              onClick={handleNextWeek}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition cursor-pointer"
              title="Další týden"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Badge sudý / lichý týden */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold text-xs shadow-xs bg-white border-slate-200">
            <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-slate-700">
              {format(weekStart, 'd. M.', { locale: cs })} – {format(weekEnd, 'd. M. yyyy', { locale: cs })}
            </span>
            <span className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
              isEvenWeek 
                ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                : 'bg-amber-100 text-amber-800 border border-amber-200'
            }`}>
              {isEvenWeek ? 'Sudý týden (S)' : 'Lichý týden (L)'}
            </span>
          </div>
        </div>
      </div>

      {/* Banner online suplování GHB */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-slate-900">
                  Suplování a změny v rozvrhu (ghb.cz)
                </span>
                {substitutionData && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    substitutionData.source === 'live' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                    {substitutionData.source === 'live' ? 'Online z Bakalářů' : 'Poslední načtená data'}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                <span>Platnost pro: <strong>{substitutionData?.date || 'Načítání...'}</strong></span>
                <span>•</span>
                <span className="text-[11px] text-slate-400">
                  Pouze vaše skupina v 8.A (AJ skupina HV s p. Fejtem, vynechána skupina VV)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowAllClassChanges(prev => !prev)}
              className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
            >
              {showAllClassChanges ? 'Zobrazit jen moje' : 'Všechny změny 8.A'}
            </button>
            <button
              onClick={loadSuplovani}
              disabled={isLoadingSuplovani}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSuplovani ? 'animate-spin' : ''}`} />
              <span>{isLoadingSuplovani ? 'Načítání...' : 'Aktualizovat'}</span>
            </button>
          </div>
        </div>

        {/* Přehled změn pro studenta na dnešek / načtený den */}
        {substitutionData && (
          <div className="pt-2 border-t border-slate-100">
            {(() => {
              const displayChanges = showAllClassChanges 
                ? substitutionData.classChanges 
                : substitutionData.userChanges;

              if (displayChanges.length === 0) {
                return (
                  <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50/70 border border-emerald-200 rounded-xl px-3 py-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                    <span>Žádné změny ani odpadlé hodiny pro vás v tento den nejsou hlášeny (výuka probíhá beze změn).</span>
                  </div>
                );
              }

              return (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {showAllClassChanges ? 'Všechny hlášené změny třídy 8.A:' : 'Změny týkající se přímo vás:'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {displayChanges.map((ch, idx) => {
                      const isCancelled = ch.changeType.toLowerCase().includes('odpadá') || ch.changeType.toLowerCase().includes('zrušeno');
                      return (
                        <div 
                          key={idx}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                            isCancelled 
                              ? 'bg-red-50 border-red-200 text-red-900' 
                              : 'bg-amber-50 border-amber-200 text-amber-900'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${isCancelled ? 'bg-red-500' : 'bg-amber-500'}`} />
                          <span className="font-extrabold">{ch.period}. hod</span>
                          <span className="px-1.5 py-0.5 rounded bg-white font-mono font-bold text-slate-800 shadow-2xs">
                            {ch.subject} {ch.group ? `(${ch.group})` : ''}
                          </span>
                          <span className="font-bold uppercase text-[10px] tracking-wide">
                            {ch.changeType}
                          </span>
                          {ch.originalTeacher && (
                            <span className="opacity-75">({ch.originalTeacher})</span>
                          )}
                          {ch.substitute && (
                            <span className="font-bold text-indigo-700">➜ {ch.substitute}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Banner o aktivním střídání pro tento týden */}
      <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-indigo-950">
          <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            {isEvenWeek ? (
              <>
                V tomto <strong>sudém týdnu (S)</strong> máte v úterý 6. h <strong>ZSV</strong> a ve středu 3. h <strong>FY</strong>.
              </>
            ) : (
              <>
                V tomto <strong>lichém týdnu (L)</strong> máte v úterý 6. h <strong>DE</strong> a ve středu 3. h <strong>CH</strong>.
              </>
            )}
          </span>
        </div>
        <div className="text-[11px] font-semibold text-indigo-600 flex items-center gap-1">
          <Info className="w-3.5 h-3.5" />
          <span>Číslo týdne: #{isoWeek}</span>
        </div>
      </div>

      {/* ROZVRHOVÁ TABULKA */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px]">
            {/* Header: vyučovací hodiny a časy */}
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 text-xs uppercase font-bold">
                <th className="py-3 px-3 w-16 text-center border-r border-slate-200">Den</th>
                {PERIODS.map(p => (
                  <th key={p.period} className="py-2.5 px-2 text-center border-r border-slate-100 last:border-r-0 min-w-[70px]">
                    <div className="text-sm font-extrabold text-slate-800">{p.period}</div>
                    <div className="text-[10px] font-medium text-slate-400 lowercase tracking-tight">
                      {p.startTime}–{p.endTime}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Dny v týdnu Po - Pá */}
            <tbody className="divide-y divide-slate-100 text-xs">
              {DAYS.map(day => {
                const dayLessons = SCHOOL_TIMETABLE[day.id] || {};
                const isToday = isSameDay(day.date, new Date());

                return (
                  <tr key={day.id} className="hover:bg-slate-50/40 transition">
                    {/* Název dne */}
                    <td className={`py-4 px-3 text-center font-extrabold border-r border-slate-200 ${
                      isToday ? 'bg-indigo-50/80 text-indigo-700' : 'bg-slate-50/40 text-slate-700'
                    }`}>
                      <div className="text-sm">{day.short}</div>
                      <div className="text-[10px] font-normal text-slate-400">{format(day.date, 'd. M.')}</div>
                    </td>

                    {/* Hodiny 0 - 9 */}
                    {PERIODS.map(period => {
                      const allLessons = dayLessons[period.period] || [];
                      // Vybereme lekci platnou pro tento týden (podle sudý/lichý)
                      const activeLesson = allLessons.find(l => {
                        if (!l.weekType || l.weekType === 'both') return true;
                        if (isEvenWeek && l.weekType === 'even') return true;
                        if (!isEvenWeek && l.weekType === 'odd') return true;
                        return false;
                      });

                      if (!activeLesson) {
                        return (
                          <td 
                            key={period.period} 
                            className="p-1 border-r border-slate-100 last:border-r-0 text-center align-middle"
                          >
                            <div className="h-16 rounded-xl border border-dashed border-slate-200/50 flex items-center justify-center">
                              <span className="text-[10px] text-slate-200 select-none">•</span>
                            </div>
                          </td>
                        );
                      }

                      // Zkontrolujeme, zda pro tuto lekci existuje záznam v suplování
                      // Pozn.: Změny v suplování jsou pro konkrétní den (např. 20.11.2026)
                      const formattedDayDate = format(day.date, 'd.M.yyyy').replace(/\s+/g, '');
                      const subDateClean = (substitutionData?.date || '').replace(/\s+/g, '');
                      const isSubDateMatchingDay = subDateClean.includes(formattedDayDate);

                      // Hledáme suplování pro danou hodinu a předmět, které se týká studenta
                      const matchedChange = isSubDateMatchingDay ? substitutionData?.userChanges.find(ch => {
                        if (ch.period !== period.period) return false;
                        if (ch.subject.toUpperCase() !== activeLesson.subject.toUpperCase()) return false;
                        return true;
                      }) : undefined;

                      const isCancelled = matchedChange && (
                        matchedChange.changeType.toLowerCase().includes('odpadá') || 
                        matchedChange.changeType.toLowerCase().includes('zrušeno')
                      );

                      const isSubstituted = matchedChange && !isCancelled && (
                        matchedChange.changeType.toLowerCase().includes('supl') || 
                        matchedChange.substitute
                      );

                      const isRoomChanged = matchedChange && !isCancelled && matchedChange.room && matchedChange.room !== activeLesson.room;

                      const defaultStyle = SUBJECT_STYLES[activeLesson.subject] || {
                        bg: 'bg-indigo-50',
                        text: 'text-indigo-800',
                        border: 'border-indigo-200'
                      };

                      // Vzhled buňky při odpadnutí či změně
                      const cellStyle = isCancelled
                        ? { bg: 'bg-red-50/90', text: 'text-red-900', border: 'border-red-300' }
                        : isSubstituted
                        ? { bg: 'bg-amber-50/90', text: 'text-amber-900', border: 'border-amber-300' }
                        : defaultStyle;

                      return (
                        <td 
                          key={period.period} 
                          className="p-1 border-r border-slate-100 last:border-r-0 align-middle"
                        >
                          <div
                            onClick={() => setActiveLessonModal({
                              lesson: activeLesson,
                              period,
                              dayName: day.name,
                              dateStr: format(day.date, 'd. M. yyyy'),
                              substitution: matchedChange
                            })}
                            className={`relative h-16 p-1.5 rounded-xl border transition cursor-pointer hover:shadow-xs hover:scale-[1.02] flex flex-col justify-between ${cellStyle.bg} ${cellStyle.border} ${cellStyle.text}`}
                            title={isCancelled ? `${activeLesson.subject} ODPADÁ!` : `${activeLesson.subject} (${activeLesson.teacher}, učebna ${activeLesson.room})`}
                          >
                            {/* Odznáček změny / odpadnutí */}
                            {isCancelled && (
                              <div className="absolute -top-1.5 -right-1 px-1.5 py-0.2 rounded-full bg-red-600 text-white font-extrabold text-[8px] uppercase tracking-wider shadow-xs">
                                Odpadá
                              </div>
                            )}

                            {isSubstituted && (
                              <div className="absolute -top-1.5 -right-1 px-1.5 py-0.2 rounded-full bg-amber-600 text-white font-extrabold text-[8px] uppercase tracking-wider shadow-xs">
                                Supl
                              </div>
                            )}

                            {/* Horní řádek: Skupina a Místnost */}
                            <div className="flex items-center justify-between text-[9px] font-bold opacity-75">
                              <span className="truncate max-w-[36px]">{activeLesson.group || ''}</span>
                              <span className={`font-mono ${isRoomChanged ? 'text-amber-700 underline font-extrabold' : ''}`}>
                                {isRoomChanged ? matchedChange?.room : activeLesson.room}
                              </span>
                            </div>

                            {/* Střed: Zkratka předmětu */}
                            <div className={`text-center font-extrabold text-sm tracking-tight ${isCancelled ? 'line-through opacity-70' : ''}`}>
                              {activeLesson.subject}
                            </div>

                            {/* Dolní řádek: Vyučující a případný badge S/L */}
                            <div className="flex items-center justify-between text-[9px] font-semibold opacity-80">
                              <span className={isSubstituted ? 'font-extrabold text-amber-800' : ''}>
                                {isSubstituted && matchedChange?.substitute 
                                  ? matchedChange.substitute 
                                  : isCancelled ? '(odpadá)' : activeLesson.teacher}
                              </span>
                              {activeLesson.weekType && (
                                <span className={`px-1 rounded text-[8px] font-bold uppercase ${
                                  activeLesson.weekType === 'even' 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-amber-600 text-white'
                                }`}>
                                  {activeLesson.weekType === 'even' ? 'S' : 'L'}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETAIL MODAL HODINY */}
      {activeLessonModal && (() => {
        const { lesson, period, dayName, dateStr, substitution } = activeLessonModal;
        const style = SUBJECT_STYLES[lesson.subject] || {
          bg: 'bg-indigo-50',
          text: 'text-indigo-800',
          border: 'border-indigo-200'
        };

        const isCancelled = substitution && (
          substitution.changeType.toLowerCase().includes('odpadá') || 
          substitution.changeType.toLowerCase().includes('zrušeno')
        );

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
              <div className={`p-6 border-b ${isCancelled ? 'bg-red-50 border-red-200 text-red-950' : `${style.bg} ${style.border}`}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                    {dayName}, {dateStr}
                  </span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/80 border border-slate-200 text-slate-800">
                    {period.period}. hodina
                  </span>
                </div>
                <h3 className={`text-3xl font-extrabold mt-2 tracking-tight ${isCancelled ? 'line-through text-red-900' : 'text-slate-900'}`}>
                  {lesson.subject}
                </h3>
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 mt-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{period.startTime} – {period.endTime}</span>
                </div>
              </div>

              {/* Informace o suplování v modalu */}
              {substitution && (
                <div className={`p-4 border-b text-xs ${
                  isCancelled 
                    ? 'bg-red-100/60 border-red-200 text-red-950' 
                    : 'bg-amber-100/60 border-amber-200 text-amber-950'
                }`}>
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Změna z Bakalářů ({substitution.changeType})</span>
                  </div>
                  {isCancelled ? (
                    <p className="text-[11px] font-medium leading-relaxed">
                      Tato vyučovací hodina podle dnešního suplování na GHB <strong>odpadá</strong> (vyučující {substitution.originalTeacher || lesson.teacher}).
                    </p>
                  ) : (
                    <p className="text-[11px] font-medium leading-relaxed">
                      {substitution.substitute && (
                        <span>Supluje: <strong>{substitution.substitute}</strong> (původně {substitution.originalTeacher || lesson.teacher}). </span>
                      )}
                      {substitution.room && (
                        <span>Nová učebna: <strong>{substitution.room}</strong>. </span>
                      )}
                    </p>
                  )}
                </div>
              )}

              <div className="p-6 space-y-3 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-slate-500 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    Vyučující:
                  </span>
                  <span className="font-extrabold text-slate-800 text-sm">
                    {substitution?.substitute ? (
                      <span>{substitution.substitute} <span className="text-xs font-normal text-slate-400 line-through">({lesson.teacher})</span></span>
                    ) : (
                      lesson.teacher
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-slate-500 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    Učebna:
                  </span>
                  <span className="font-extrabold text-indigo-700 text-sm font-mono">
                    {substitution?.room || lesson.room}
                  </span>
                </div>

                {lesson.group && (
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="font-bold text-slate-500">Skupina / Třída:</span>
                    <span className="font-bold text-slate-800">{lesson.group}</span>
                  </div>
                )}

                {lesson.weekType && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                    <span className="font-bold">Střídání týdnů:</span>{' '}
                    {lesson.weekType === 'even' ? 'Sudý týden (S)' : 'Lichý týden (L)'}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => setActiveLessonModal(null)}
                  className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition cursor-pointer"
                >
                  Zavřít
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
