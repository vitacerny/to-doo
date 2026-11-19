import { CalendarEvent, TutoringDetails, TutoringPlace, TutoringType, EventCategory } from '../types';
import { format, addDays, addWeeks, getDay, isBefore, parseISO } from 'date-fns';

const GEMINI_API_STORAGE_KEY = 'taskflow_gemini_api_key';

export const getGeminiApiKey = (): string => {
  return localStorage.getItem(GEMINI_API_STORAGE_KEY) || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
};

export const setGeminiApiKey = (key: string): void => {
  if (key) {
    localStorage.setItem(GEMINI_API_STORAGE_KEY, key.trim());
  } else {
    localStorage.removeItem(GEMINI_API_STORAGE_KEY);
  }
};

export type AiActionType = 'create' | 'delete';

export interface DeleteCriteria {
  scope: 'all' | 'date' | 'tutoring_student' | 'specific';
  date?: string; // YYYY-MM-DD
  studentColor?: string; // např. "modrá"
  keyword?: string; // např. "doučování", "zubař"
}

export interface ScheduledOccurrence {
  date: string;
  subject: string;
  studentColor: string;
}

export interface ParsedEventResult {
  action: AiActionType; // 'create' | 'delete'
  deleteCriteria?: DeleteCriteria;
  title: string;
  date: string; // YYYY-MM-DD prvního výskytu
  dates: string[]; // Všechna data
  occurrences?: ScheduledOccurrence[]; // Detaily jednotlivých výskytů při střídání M/ČJ
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  category: EventCategory;
  color: string;
  description?: string;
  tutoring?: TutoringDetails;
  recurrence?: {
    type: 'weekly';
    count: number;
  };
  source: 'gemini' | 'rules';
  aiReply?: string;
}

const mapColorNameToHexOrKey = (colorWord: string): string => {
  const c = colorWord.toLowerCase();
  if (c.includes('červen') || c.includes('cerven') || c.includes('růž') || c.includes('ruz') || c.includes('rose')) return 'rose';
  if (c.includes('modr') || c.includes('blue')) return 'blue';
  if (c.includes('zelen') || c.includes('emerald') || c.includes('green')) return 'emerald';
  if (c.includes('fialov') || c.includes('purple')) return 'purple';
  if (c.includes('žlut') || c.includes('zlut') || c.includes('oranž') || c.includes('amber')) return 'amber';
  if (c.includes('indigo') || c.includes('tmavomodr')) return 'indigo';
  return 'indigo';
};

export const getNextDayOfWeek = (targetDayOfWeek: number, baseDate: Date = new Date()): Date => {
  const result = new Date(baseDate);
  result.setHours(0, 0, 0, 0);
  const currentDay = getDay(result);
  
  let daysToAdd = (targetDayOfWeek - currentDay + 7) % 7;
  return addDays(result, daysToAdd);
};

export const cleanTextNoise = (text: string): string => {
  return text
    .replace(/\b(?:prosím|prosim|děkuji|dekuji|chtěl bych|chtel bych|potřebuji|potrebuji|mohl bys|můžeš|muzes|naplánuj|naplanuj|přidej|pridej|nastav|vytvoř|vytvor|dej mi|dej)\b/gi, '')
    .replace(/\b(?:každé|kazde|každý|kazdy|každou|kazdou|pravidelně|pravidelne)\s*(?:pondělí|pondelí|úterý|utery|středu|stredu|čtvrtek|ctvrtek|pátek|patek|sobotu|neděli|nedeli)?/gi, '')
    .replace(/\b(?:pondělí|pondelí|úterý|utery|středu|stredu|streda|čtvrtek|ctvrtek|pátek|patek|sobotu|sobota|neděli|nedele)\b/gi, '')
    .replace(/\b(?:dnes|zítra|zitra|pozítří|pozitri)\b/gi, '')
    .replace(/\b(?:v\s*)?\d{1,2}(?::\d{2}|\s*h(?:odin)?)?\b/gi, '')
    .replace(/\b(?:na\s*\d+\s*(?:hodin|hodiny|hodinu|minut|lekcí|lekci|týdnů|tydnu|měsíců|mesicu))\b/gi, '')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const isDeleteIntent = (text: string): boolean => {
  const l = text.toLowerCase();
  return (
    l.includes('zruš') || l.includes('zrus') ||
    l.includes('smaž') || l.includes('smaz') ||
    l.includes('odstraň') || l.includes('odstran') ||
    l.includes('vymaž') || l.includes('vymaz') ||
    l.includes('odpadá') || l.includes('odpada') ||
    l.includes('odpadla') || l.includes('nebude')
  );
};

export const extractDaysOfWeek = (text: string): number[] => {
  const lower = text.toLowerCase();
  const dayPatterns: { names: string[]; dayNum: number }[] = [
    { names: ['pondělí', 'pondeli', 'po'], dayNum: 1 },
    { names: ['úterý', 'utery', 'út', 'ut'], dayNum: 2 },
    { names: ['střed', 'stred', 'st'], dayNum: 3 },
    { names: ['čtvrt', 'ctvrt', 'čt', 'ct'], dayNum: 4 },
    { names: ['pátek', 'patek', 'pá', 'pa'], dayNum: 5 },
    { names: ['sobot', 'so'], dayNum: 6 },
    { names: ['neděl', 'nedel', 'ne'], dayNum: 0 }
  ];

  const found: number[] = [];
  for (const p of dayPatterns) {
    if (p.names.some(name => lower.includes(name))) {
      found.push(p.dayNum);
    }
  }
  return found;
};

/**
 * Fallback parser pro pravidla
 */
export const parseEventWithRules = (text: string): ParsedEventResult => {
  const lower = text.toLowerCase();
  const now = new Date();

  // === 1. OBSLUHA MAZÁNÍ (DELETE) ===
  if (isDeleteIntent(text)) {
    if (lower.includes('všechno') || lower.includes('vsechno') || lower.includes('všechny') || lower.includes('úplně vše') || lower.includes('uplne vse')) {
      let specificDate: string | undefined;
      let dayDesc = 'všechny události v kalendáři';

      if (lower.includes('zítra') || lower.includes('zitra')) {
        specificDate = format(addDays(now, 1), 'yyyy-MM-dd');
        dayDesc = 'všechny události na zítřek';
      } else if (lower.includes('dnes')) {
        specificDate = format(now, 'yyyy-MM-dd');
        dayDesc = 'všechny události na dnešek';
      }

      return {
        action: 'delete',
        deleteCriteria: {
          scope: specificDate ? 'date' : 'all',
          date: specificDate
        },
        title: 'Smazání',
        date: specificDate || format(now, 'yyyy-MM-dd'),
        dates: [],
        category: 'event',
        color: 'rose',
        source: 'rules',
        aiReply: `Mažu ${dayDesc}.`
      };
    }

    const mentionedDays = extractDaysOfWeek(text);
    let deleteDate: string | undefined;
    if (mentionedDays.length > 0) {
      deleteDate = format(getNextDayOfWeek(mentionedDays[0], now), 'yyyy-MM-dd');
    } else if (lower.includes('zítra') || lower.includes('zitra')) {
      deleteDate = format(addDays(now, 1), 'yyyy-MM-dd');
    } else if (lower.includes('dnes')) {
      deleteDate = format(now, 'yyyy-MM-dd');
    }

    let studentColor: string | undefined;
    const colorNames = ['červená', 'červený', 'modrá', 'modrý', 'zelená', 'zelený', 'žlutá', 'žlutý', 'oranžová', 'fialová'];
    for (const cn of colorNames) {
      if (lower.includes(cn)) {
        studentColor = cn.replace(/[ýy]/, 'á').replace(/a$/, 'á');
        break;
      }
    }

    return {
      action: 'delete',
      deleteCriteria: {
        scope: studentColor ? 'tutoring_student' : (deleteDate ? 'date' : 'specific'),
        date: deleteDate,
        studentColor,
        keyword: studentColor ? undefined : cleanTextNoise(text)
      },
      title: 'Smazání',
      date: deleteDate || format(now, 'yyyy-MM-dd'),
      dates: [],
      category: 'event',
      color: 'rose',
      source: 'rules',
      aiReply: studentColor 
        ? `Mažu lekci doučování pro studenta (${studentColor})${deleteDate ? ` na ${deleteDate}` : ''} a automaticky přepočítám pořadí střídání zbývajících lekcí.`
        : `Ruším naplánované události.`
    };
  }

  // === 2. OBSLUHA VYTVÁŘENÍ ===
  const isTutoring = lower.includes('douč') || lower.includes('douc') || lower.includes('lekc') || lower.includes('student');
  const daysOfWeek = extractDaysOfWeek(text);

  // Zjištění mezního data (např. "do 12. dubna", "do přijímaček 12. a 13. dubna")
  let untilDate: Date | null = null;
  const untilRegex = /do\s*(?:přijímaček|prijimacek)?\s*(\d{1,2})\.\s*(?:a\s*\d{1,2}\.\s*)?([a-zá-ž]+|\d{1,2})/i;
  const untilMatch = text.match(untilRegex);
  if (untilMatch) {
    const dayN = parseInt(untilMatch[1], 10);
    const monthWord = untilMatch[2].toLowerCase();
    let monthIdx = -1;

    const monthMap: Record<string, number> = {
      'ledna': 0, 'leden': 0,
      'února': 1, 'unora': 1, 'únor': 1,
      'března': 2, 'brezna': 2, 'březen': 2,
      'dubna': 3, 'duben': 3,
      'května': 4, 'kvetna': 4, 'květen': 4,
      'června': 5, 'cervna': 5, 'červen': 5
    };

    if (monthMap[monthWord] !== undefined) {
      monthIdx = monthMap[monthWord];
    } else if (!isNaN(parseInt(monthWord, 10))) {
      monthIdx = parseInt(monthWord, 10) - 1;
    }

    if (monthIdx !== -1) {
      const year = (monthIdx < now.getMonth()) ? now.getFullYear() + 1 : now.getFullYear();
      untilDate = new Date(year, monthIdx, dayN, 23, 59, 59);
    }
  }

  // Čas
  let startTime: string | undefined;
  let endTime: string | undefined;
  const timeRegex = /(?:v\s*)?(\d{1,2})(?::(\d{2})|\s*h(?:odin)?)?/i;
  const timeMatch = text.match(timeRegex);
  if (timeMatch && (lower.includes(' v ') || lower.includes(':') || lower.includes('hodin') || lower.includes('h'))) {
    const hours = timeMatch[1].padStart(2, '0');
    const mins = timeMatch[2] ? timeMatch[2].padStart(2, '0') : '00';
    const hNum = parseInt(hours, 10);
    if (hNum >= 0 && hNum <= 23) {
      startTime = `${hours}:${mins}`;
      const endH = String(Math.min(23, hNum + 1)).padStart(2, '0');
      endTime = `${endH}:${mins}`;
    }
  }

  // Barva studenta
  let studentColor = 'červená';
  const colorNames = [
    'červená', 'červený', 'cervena', 'cerveny',
    'modrá', 'modrý', 'modra', 'modry',
    'zelená', 'zelený', 'zelena', 'zeleny',
    'žlutá', 'žlutý', 'zluta', 'zluty',
    'oranžová', 'oranžový', 'oranzova', 'oranzovy',
    'fialová', 'fialový', 'fialova', 'fialovy'
  ];
  for (const cn of colorNames) {
    if (lower.includes(cn)) {
      studentColor = cn.replace(/[ýy]/, 'á').replace(/a$/, 'á');
      break;
    }
  }

  let type: TutoringType = 'private';
  if (lower.includes('firma') || lower.includes('firemní') || lower.includes('firemni') || lower.includes('na firmu')) {
    type = 'company';
  }

  let place: TutoringPlace = 'library';
  if (lower.includes('kancl') || lower.includes('kancelář') || lower.includes('office')) {
    place = type === 'company' ? 'office' : 'library';
  }

  // Vzor střídání: ČJ a M (nebo M a ČJ)
  let pattern = ['ČJ', 'M'];
  if (lower.includes('střídat m a čj') || lower.includes('stridat m a cj')) {
    pattern = ['M', 'ČJ'];
  }

  // Scénář: Dny v týdnu (např. úterý [2] a čtvrtek [4])
  const activeDays = daysOfWeek.length > 0 ? daysOfWeek : [2, 4];
  const occurrences: ScheduledOccurrence[] = [];
  const allDates: string[] = [];

  const sortedDayDates = activeDays.map(d => getNextDayOfWeek(d, now)).sort((a, b) => a.getTime() - b.getTime());

  // Pokud máme mezní datum do přijímaček:
  let patternCounter = 0;
  let weekOffset = 0;
  const maxWeeks = untilDate ? 30 : 6;

  while (weekOffset < maxWeeks) {
    for (const baseDay of sortedDayDates) {
      const curDateObj = addWeeks(baseDay, weekOffset);
      if (untilDate && curDateObj > untilDate) {
        break;
      }
      const occDate = format(curDateObj, 'yyyy-MM-dd');
      const subj = pattern[patternCounter % pattern.length];
      patternCounter++;
      allDates.push(occDate);
      occurrences.push({
        date: occDate,
        subject: subj,
        studentColor
      });
    }

    if (untilDate && addWeeks(sortedDayDates[0], weekOffset + 1) > untilDate) {
      break;
    }
    weekOffset++;
  }

  const firstDate = occurrences[0]?.date || format(now, 'yyyy-MM-dd');
  const colorKey = mapColorNameToHexOrKey(studentColor);

  return {
    action: 'create',
    title: `Doučování ${pattern[0]} (${studentColor})`,
    date: firstDate,
    dates: allDates,
    occurrences,
    startTime: startTime || '16:30',
    endTime: endTime || '17:30',
    category: 'tutoring',
    color: colorKey,
    tutoring: {
      studentColor,
      type,
      place,
      subject: pattern[0],
      sequencePattern: pattern,
      sequenceIndex: 0
    },
    recurrence: { type: 'weekly', count: occurrences.length },
    source: 'rules',
    aiReply: `Úspěšně naplánováno ${occurrences.length} lekcí střídavého doučování (${pattern.join(' a ')}) pro studenta (${studentColor}) od ${firstDate}${untilDate ? ` až do ${format(untilDate, 'd. M. yyyy')}` : ''} v knihovně (${type === 'company' ? 'firma' : 'soukromé'}).`
  };
};

/**
 * Gemini Flash s podporou mezního data (do přijímaček / do data)
 */
export const parseEventWithGemini = async (
  promptText: string,
  apiKey: string,
  userLocalDate: string = format(new Date(), 'yyyy-MM-dd (EEEE)')
): Promise<ParsedEventResult> => {
  if (!apiKey) {
    return parseEventWithRules(promptText);
  }

  const systemInstruction = `
Jsi inteligentní plánovač kalendáře TaskFlow.
Dnešní datum je: ${userLocalDate}.

ZVLÁŠTNÍ SCHOPNOST: STŘÍDAVÉ DOUČOVÁNÍ S MEZNÍM DATEM (např. do přijímaček 12. a 13. dubna):
- Pokud uživatel požaduje doučování dvakrát týdně (např. úterý a čtvrtek) se střídáním (ČJ a M) až do určitého data (např. do přijímaček 12. dubna):
  - "isAlternating": true
  - "alternatingPattern": ["ČJ", "M"] (nebo dle textu)
  - "activeDays": dny v týdnu jako čísla (např. úterý = 2, čtvrtek = 4 -> [2, 4])
  - "untilDate": "YYYY-MM-DD" mezního dne (např. duben školního roku 2026/2027)
  - "tutoring": studentColor ("červená"), type ("company" pro firemní/na firmu, "private" pro soukromé), place ("library" pro knihovnu, "office" pro kancl).
  - "startTime": "16:30" (nebo dle zadání).

POŽADAVKY NA MAZÁNÍ ("delete"):
- "action": "delete" při "zruš", "smaž", "odpadá hodina".

Odpověz POUZE validním JSON objektem:
{
  "action": "create" | "delete",
  "deleteCriteria": {
    "scope": "all" | "date" | "tutoring_student" | "specific",
    "date": "YYYY-MM-DD" | null,
    "studentColor": string | null
  } | null,
  "isAlternating": boolean,
  "alternatingPattern": ["ČJ", "M"] | null,
  "activeDays": number[] | null,
  "untilDate": "YYYY-MM-DD" | null,
  "totalWeeks": number | null,
  "title": string,
  "date": "YYYY-MM-DD",
  "isRecurring": boolean,
  "recurrenceCount": number,
  "startTime": "HH:mm" | null,
  "endTime": "HH:mm" | null,
  "category": "tutoring" | "event" | "task" | "meeting" | "reminder" | "personal",
  "color": "blue" | "indigo" | "purple" | "emerald" | "amber" | "rose",
  "description": string | null,
  "tutoring": {
    "studentColor": string,
    "type": "private" | "company",
    "place": "library" | "office",
    "subject": string
  } | null,
  "aiReply": string
}
`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemInstruction },
              { text: `Uživatelský požadavek: "${promptText}"` }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      return parseEventWithRules(promptText);
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return parseEventWithRules(promptText);

    const parsed = JSON.parse(candidateText);

    if (parsed.action === 'delete') {
      return {
        action: 'delete',
        deleteCriteria: parsed.deleteCriteria || { scope: 'all' },
        title: 'Smazání',
        date: parsed.deleteCriteria?.date || format(new Date(), 'yyyy-MM-dd'),
        dates: [],
        category: 'event',
        color: 'rose',
        source: 'gemini',
        aiReply: parsed.aiReply || 'Mažu zvolené události a přepočítávám střídání.'
      };
    }

    // Alternating Schedule Generation s mezním datem
    if (parsed.isAlternating && parsed.activeDays && parsed.activeDays.length >= 2) {
      const now = new Date();
      const pattern = parsed.alternatingPattern || ['ČJ', 'M'];
      const studentColor = parsed.tutoring?.studentColor || 'červená';
      const occurrences: ScheduledOccurrence[] = [];
      const allDates: string[] = [];

      const sortedDayDates = (parsed.activeDays as number[])
        .map(d => getNextDayOfWeek(d, now))
        .sort((a, b) => a.getTime() - b.getTime());

      const untilDateObj = parsed.untilDate ? new Date(parsed.untilDate + 'T23:59:59') : null;
      const totalWeeks = untilDateObj ? 30 : (parsed.totalWeeks || 6);

      let patternCounter = 0;
      for (let w = 0; w < totalWeeks; w++) {
        for (const baseDay of sortedDayDates) {
          const curD = addWeeks(baseDay, w);
          if (untilDateObj && curD > untilDateObj) {
            break;
          }
          const occDate = format(curD, 'yyyy-MM-dd');
          const subj = pattern[patternCounter % pattern.length];
          patternCounter++;
          allDates.push(occDate);
          occurrences.push({
            date: occDate,
            subject: subj,
            studentColor
          });
        }
        if (untilDateObj && addWeeks(sortedDayDates[0], w + 1) > untilDateObj) {
          break;
        }
      }

      const firstDate = occurrences[0]?.date || format(now, 'yyyy-MM-dd');
      const colorKey = mapColorNameToHexOrKey(studentColor);

      return {
        action: 'create',
        title: `Doučování ${pattern[0]} (${studentColor})`,
        date: firstDate,
        dates: allDates,
        occurrences,
        startTime: parsed.startTime || '16:30',
        endTime: parsed.endTime || '17:30',
        category: 'tutoring',
        color: colorKey,
        tutoring: {
          studentColor,
          type: parsed.tutoring?.type || 'company',
          place: parsed.tutoring?.place || 'library',
          subject: pattern[0],
          sequencePattern: pattern,
          sequenceIndex: 0
        },
        recurrence: { type: 'weekly', count: occurrences.length },
        source: 'gemini',
        aiReply: parsed.aiReply || `Naplánováno ${occurrences.length} lekcí střídavého doučování (${pattern.join(' a ')}) pro studenta (${studentColor}) v úterý a ve čtvrtek v 16:30 v knihovně (firma) až do ${parsed.untilDate || 'přijímaček'}.`
      };
    }

    return parseEventWithRules(promptText);
  } catch (err) {
    console.error("Gemini API error, fallback to rules:", err);
    return parseEventWithRules(promptText);
  }
};
