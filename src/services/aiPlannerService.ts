import { CalendarEvent, TutoringDetails, TutoringPlace, TutoringType, EventCategory } from '../types';
import { format, addDays, addWeeks, getDay } from 'date-fns';

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

/**
 * Zjistí dny v týdnu zmíněné v textu (např. pondělí a čtvrtek -> [1, 4])
 */
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
 * Fallback parser s podporou střídání M a ČJ dvakrát týdně
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

  // === 2. OBSLUHA VYTVÁŘENÍ S MOŽNOSTÍ STŘÍDÁNÍ (M / ČJ) ===
  const isTutoring = lower.includes('douč') || lower.includes('douc') || lower.includes('lekc') || lower.includes('student');
  const isAlternating = lower.includes('stříd') || lower.includes('strid') || (lower.includes('čj') && lower.includes(' m ')) || (lower.includes('matemat') && lower.includes('češtin'));
  const daysOfWeek = extractDaysOfWeek(text);

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
  let studentColor = 'modrá';
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
  if (lower.includes('firma') || lower.includes('firemní') || lower.includes('firemni')) {
    type = 'company';
  }

  let place: TutoringPlace = 'library';
  if (lower.includes('kancl') || lower.includes('kancelář') || lower.includes('office')) {
    place = type === 'company' ? 'office' : 'library';
  }

  // Scénář: Dvakrát týdně střídání (např. Pondělí a Čtvrtek, M a ČJ)
  if (isTutoring && (isAlternating || daysOfWeek.length >= 2)) {
    const activeDays = daysOfWeek.length > 0 ? daysOfWeek : [1, 4]; // výchozí Po a Čt
    const pattern = ['M', 'ČJ'];
    const totalWeeks = 6; // cca 12 lekcí
    const occurrences: ScheduledOccurrence[] = [];
    const allDates: string[] = [];

    // Najdeme nejbližší výskyty pro dny v týdnu
    const sortedDayDates = activeDays.map(d => getNextDayOfWeek(d, now)).sort((a, b) => a.getTime() - b.getTime());

    let patternCounter = 0;
    for (let w = 0; w < totalWeeks; w++) {
      for (const baseDay of sortedDayDates) {
        const occDate = format(addWeeks(baseDay, w), 'yyyy-MM-dd');
        const subj = pattern[patternCounter % pattern.length];
        patternCounter++;
        allDates.push(occDate);
        occurrences.push({
          date: occDate,
          subject: subj,
          studentColor
        });
      }
    }

    const firstDate = occurrences[0]?.date || format(now, 'yyyy-MM-dd');
    const colorKey = mapColorNameToHexOrKey(studentColor);

    return {
      action: 'create',
      title: `Doučování M (${studentColor})`,
      date: firstDate,
      dates: allDates,
      occurrences,
      startTime,
      endTime,
      category: 'tutoring',
      color: colorKey,
      tutoring: {
        studentColor,
        type,
        place,
        subject: 'M',
        sequencePattern: pattern,
        sequenceIndex: 0
      },
      recurrence: { type: 'weekly', count: occurrences.length },
      source: 'rules',
      aiReply: `Naplánována chytrá střídavá série: ${occurrences.length} lekcí pro studenta (${studentColor}), střídání M a ČJ ve dnech ${activeDays.map(d => d === 1 ? 'pondělí' : d === 2 ? 'úterý' : d === 3 ? 'středa' : d === 4 ? 'čtvrtek' : d === 5 ? 'pátek' : 'víkend').join(' a ')}. Pokud lekce odpadne, střídání se automaticky posune!`
    };
  }

  // Jednoduché pravidelné nebo jednorázové doučování
  let targetDate = now;
  if (daysOfWeek.length > 0) {
    targetDate = getNextDayOfWeek(daysOfWeek[0], now);
  } else if (lower.includes('zítra') || lower.includes('zitra')) {
    targetDate = addDays(now, 1);
  } else if (lower.includes('pozítří') || lower.includes('pozitri')) {
    targetDate = addDays(now, 2);
  }

  const isRecurring = lower.includes('každ') || lower.includes('kazd') || lower.includes('pravidelně');
  const repeatCount = isRecurring ? 8 : 1;
  const dates: string[] = [];
  for (let i = 0; i < repeatCount; i++) {
    dates.push(format(addWeeks(targetDate, i), 'yyyy-MM-dd'));
  }

  let subject = 'M';
  if (lower.includes('čj') || lower.includes('cj') || lower.includes('češtin')) subject = 'ČJ';

  const cleanTitle = isTutoring ? `Doučování ${subject} (${studentColor})` : cleanTextNoise(text);
  const colorKey = isTutoring ? mapColorNameToHexOrKey(studentColor) : 'blue';

  return {
    action: 'create',
    title: cleanTitle || 'Událost',
    date: format(targetDate, 'yyyy-MM-dd'),
    dates,
    startTime,
    endTime,
    category: isTutoring ? 'tutoring' : 'event',
    color: colorKey,
    tutoring: isTutoring ? {
      studentColor,
      type,
      place,
      subject
    } : undefined,
    recurrence: isRecurring ? { type: 'weekly', count: repeatCount } : undefined,
    source: 'rules',
    aiReply: isTutoring 
      ? `Naplánováno: ${cleanTitle} (${place === 'library' ? 'knihovna' : 'kancl'}) na ${format(targetDate, 'd. M. yyyy')}${startTime ? ` v ${startTime}` : ''}.`
      : `Naplánována událost "${cleanTitle}" na ${format(targetDate, 'd. M. yyyy')}.`
  };
};

/**
 * Gemini Flash s podporou střídání předmětů a pokročilého plánování
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

ZVLÁŠTNÍ SCHOPNOST: STŘÍDAVÉ DOUČOVÁNÍ (M a ČJ):
Pokud uživatel požaduje doučování dvakrát týdně (např. pondělí a čtvrtek) se střídáním předmětů (např. jednou M, jednou ČJ, střídavě):
- "isAlternating": true
- "alternatingPattern": ["M", "ČJ"]
- "activeDays": pole čísel dnů v týdnu (1 = pondělí, 2 = úterý, 3 = středa, 4 = čtvrtek, 5 = pátek, 6 = sobota, 0 = neděle). Např. pro pondělí a čtvrtek: [1, 4].
- "totalWeeks": počet týdnů (výchozí 6, tj. 12 lekcí).
- "tutoring": studentColor (např. "modrá"), type ('private'|'company'), place ('library'|'office').

POŽADAVKY NA MAZÁNÍ ("delete"):
- Pokud uživatel píše "zruš", "smaž", "odpadá hodina", "odpadla lekce":
  - "action": "delete"
  - "deleteCriteria": { "scope": "all" | "date" | "tutoring_student", "date": "YYYY-MM-DD" | null, "studentColor": string | null }
  - "aiReply": potvrdit smazání s informací, že střídání dalších lekcí se automaticky posune.

POŽADAVKY NA VYTVÁŘENÍ ("create"):
- "action": "create"
- ZÁKAZ BALASTU v názvu i popisu.

Odpověz POUZE validním JSON objektem:
{
  "action": "create" | "delete",
  "deleteCriteria": {
    "scope": "all" | "date" | "tutoring_student" | "specific",
    "date": "YYYY-MM-DD" | null,
    "studentColor": string | null
  } | null,
  "isAlternating": boolean,
  "alternatingPattern": ["M", "ČJ"] | null,
  "activeDays": number[] | null,
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

    // Delete
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

    // Alternating Schedule Generation
    if (parsed.isAlternating && parsed.activeDays && parsed.activeDays.length >= 2) {
      const now = new Date();
      const pattern = parsed.alternatingPattern || ['M', 'ČJ'];
      const totalWeeks = parsed.totalWeeks || 6;
      const studentColor = parsed.tutoring?.studentColor || 'modrá';
      const occurrences: ScheduledOccurrence[] = [];
      const allDates: string[] = [];

      const sortedDayDates = (parsed.activeDays as number[])
        .map(d => getNextDayOfWeek(d, now))
        .sort((a, b) => a.getTime() - b.getTime());

      let patternCounter = 0;
      for (let w = 0; w < totalWeeks; w++) {
        for (const baseDay of sortedDayDates) {
          const occDate = format(addWeeks(baseDay, w), 'yyyy-MM-dd');
          const subj = pattern[patternCounter % pattern.length];
          patternCounter++;
          allDates.push(occDate);
          occurrences.push({
            date: occDate,
            subject: subj,
            studentColor
          });
        }
      }

      const firstDate = occurrences[0]?.date || format(now, 'yyyy-MM-dd');
      const colorKey = mapColorNameToHexOrKey(studentColor);

      return {
        action: 'create',
        title: `Doučování M (${studentColor})`,
        date: firstDate,
        dates: allDates,
        occurrences,
        startTime: parsed.startTime || undefined,
        endTime: parsed.endTime || undefined,
        category: 'tutoring',
        color: colorKey,
        tutoring: {
          studentColor,
          type: parsed.tutoring?.type || 'private',
          place: (parsed.tutoring?.type === 'private' && parsed.tutoring?.place === 'office') ? 'library' : (parsed.tutoring?.place || 'library'),
          subject: 'M',
          sequencePattern: pattern,
          sequenceIndex: 0
        },
        recurrence: { type: 'weekly', count: occurrences.length },
        source: 'gemini',
        aiReply: parsed.aiReply || `Naplánováno střídavé doučování (${pattern.join(' a ')}) pro studenta (${studentColor}) na celkem ${occurrences.length} lekcí.`
      };
    }

    // Normální vytvoření
    if (parsed.tutoring) {
      if (parsed.tutoring.type === 'private' && parsed.tutoring.place === 'office') {
        parsed.tutoring.place = 'library';
      }
      if (!parsed.tutoring.studentColor) parsed.tutoring.studentColor = 'modrá';
      if (!parsed.tutoring.subject) parsed.tutoring.subject = 'M';
      parsed.title = `Doučování ${parsed.tutoring.subject} (${parsed.tutoring.studentColor})`;
      parsed.color = mapColorNameToHexOrKey(parsed.tutoring.studentColor);
    }

    const firstDate = parsed.date || format(new Date(), 'yyyy-MM-dd');
    const dates: string[] = [];
    const isRecurring = !!parsed.isRecurring;
    const count = parsed.recurrenceCount && parsed.recurrenceCount > 1 ? Math.min(24, parsed.recurrenceCount) : (isRecurring ? 8 : 1);

    if (isRecurring && count > 1) {
      const baseD = new Date(firstDate);
      for (let i = 0; i < count; i++) {
        dates.push(format(addWeeks(baseD, i), 'yyyy-MM-dd'));
      }
    } else {
      dates.push(firstDate);
    }

    return {
      action: 'create',
      title: parsed.title,
      date: firstDate,
      dates,
      startTime: parsed.startTime || undefined,
      endTime: parsed.endTime || undefined,
      category: parsed.category || 'event',
      color: parsed.color || 'indigo',
      description: parsed.description || undefined,
      tutoring: parsed.tutoring || undefined,
      recurrence: isRecurring ? { type: 'weekly', count } : undefined,
      source: 'gemini',
      aiReply: parsed.aiReply || `Událost byla úspěšně naplánována.`
    };
  } catch (err) {
    console.error("Gemini API error, fallback to rules:", err);
    return parseEventWithRules(promptText);
  }
};
