import { CalendarEvent, TutoringDetails, TutoringPlace, TutoringType, EventCategory } from '../types';
import { format, addDays, addWeeks, nextDay, Day } from 'date-fns';

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

export interface ParsedEventResult {
  title: string;
  date: string; // YYYY-MM-DD prvního výskytu
  dates?: string[]; // Všechna data při opakování
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  category: EventCategory;
  color: string;
  description?: string;
  tutoring?: TutoringDetails;
  recurrence?: {
    type: 'weekly';
    count: number; // Počet opakování (týdnů)
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

/**
 * Fallback parser s podporou opakování
 */
export const parseEventWithRules = (text: string): ParsedEventResult => {
  const lower = text.toLowerCase();
  const now = new Date();
  let targetDate = new Date();

  // Opakování (např. "každý týden", "každé úterý", "každou středu", "8 lekcí", "na 2 měsíce")
  let isRecurring = lower.includes('každ') || lower.includes('kazd') || lower.includes('pravidelně') || lower.includes('pravidelne');
  let repeatCount = 1;

  if (isRecurring) {
    repeatCount = 8; // Výchozí 8 týdnů (2 měsíce)
    const countMatch = lower.match(/(\d+)\s*(?:lekc|týdn|tydn|měsíc|mesic|x)/i);
    if (countMatch) {
      const num = parseInt(countMatch[1], 10);
      if (lower.includes('měsíc') || lower.includes('mesic')) {
        repeatCount = num * 4;
      } else {
        repeatCount = Math.min(24, Math.max(2, num));
      }
    }
  }

  // Den v týdnu
  const dayMap: Record<string, Day> = {
    'pondělí': 1, 'pondeli': 1,
    'úterý': 2, 'utery': 2,
    'středa': 3, 'stredu': 3, 'streda': 3,
    'čtvrtek': 4, 'ctvrtek': 4,
    'pátek': 5, 'patek': 5,
    'sobota': 6, 'sobotu': 6,
    'neděle': 0, 'nedeli': 0, 'nedele': 0
  };

  let foundDay = false;
  for (const [dayName, dayIndex] of Object.entries(dayMap)) {
    if (lower.includes(dayName)) {
      targetDate = nextDay(now, dayIndex);
      foundDay = true;
      break;
    }
  }

  if (!foundDay) {
    if (lower.includes('pozítří') || lower.includes('pozitri')) {
      targetDate = addDays(now, 2);
    } else if (lower.includes('zítra') || lower.includes('zitra')) {
      targetDate = addDays(now, 1);
    } else {
      targetDate = now;
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
    if (parseInt(hours, 10) >= 0 && parseInt(hours, 10) <= 23) {
      startTime = `${hours}:${mins}`;
      const endH = String(Math.min(23, parseInt(hours, 10) + 1)).padStart(2, '0');
      endTime = `${endH}:${mins}`;
    }
  }

  // Generování všech dat pro opakování
  const dates: string[] = [];
  if (isRecurring && repeatCount > 1) {
    for (let i = 0; i < repeatCount; i++) {
      dates.push(format(addWeeks(targetDate, i), 'yyyy-MM-dd'));
    }
  } else {
    dates.push(format(targetDate, 'yyyy-MM-dd'));
  }

  // Detekce doučování
  const isTutoring = lower.includes('douč') || lower.includes('douc') || lower.includes('lekc') || lower.includes('student');

  if (isTutoring) {
    let studentColor = 'modrá';
    const colorNames = [
      'červená', 'červený', 'cervena', 'cerveny',
      'modrá', 'modrý', 'modra', 'modry',
      'zelená', 'zelený', 'zelena', 'zeleny',
      'žlutá', 'žlutý', 'zluta', 'zluty',
      'oranžová', 'oranžový', 'oranzova', 'oranzovy',
      'fialová', 'fialový', 'fialova', 'fialovy',
      'bílá', 'bílý', 'bila', 'bily',
      'černá', 'černý', 'cerna', 'cerny',
      'šedá', 'šedý', 'seda', 'sedy'
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
      if (type === 'company') {
        place = 'office';
      } else {
        place = 'library';
      }
    }

    let subject = 'M';
    if (lower.includes('čj') || lower.includes('cj') || lower.includes('češtin') || lower.includes('cestin')) {
      subject = 'ČJ';
    } else if (lower.includes('matemat') || lower.includes('matyk') || lower.includes('matika') || lower.includes(' m ')) {
      subject = 'M';
    } else if (lower.includes('angličtin') || lower.includes('aj')) {
      subject = 'AJ';
    } else if (lower.includes('fyzik')) {
      subject = 'FYZ';
    }

    const colorKey = mapColorNameToHexOrKey(studentColor);
    const title = `Doučování ${subject} (${studentColor})`;

    const replyMsg = isRecurring
      ? `Naplánována série ${repeatCount} lekcí doučování (${subject}, student ${studentColor}, ${place === 'library' ? 'knihovna' : 'kancl'}) na každý týden od ${format(targetDate, 'd. M. yyyy')}.`
      : `Naplánováno doučování: ${subject} pro studenta (${studentColor}), ${type === 'private' ? 'soukromé' : 'firma'}, místo: ${place === 'library' ? 'knihovna' : 'kancl'}.`;

    return {
      title,
      date: format(targetDate, 'yyyy-MM-dd'),
      dates,
      startTime,
      endTime,
      category: 'tutoring',
      color: colorKey,
      tutoring: {
        studentColor,
        type,
        place,
        subject
      },
      recurrence: isRecurring ? { type: 'weekly', count: repeatCount } : undefined,
      source: 'rules',
      aiReply: replyMsg
    };
  }

  // Obecná událost
  let cleanTitle = text
    .replace(/(?:každý|každé|každou|pravidelně|kazdy|kazde)\s*(?:týden|tyden)?/gi, '')
    .replace(/(?:naplánuj|přidej|nastav|dej mi|mám)\s*(?:mi\s*)?/gi, '')
    .replace(/(?:v\s*)?(?:pondělí|úterý|středu|streda|čtvrtek|pátek|sobotu|sobota|neděli|nedele)/gi, '')
    .replace(/(?:dnes|zítra|pozítří)/gi, '')
    .replace(/(?:v\s*)?\d{1,2}(?::\d{2}|\s*h(?:odin)?)?/gi, '')
    .trim();

  cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  if (!cleanTitle) cleanTitle = text;

  return {
    title: cleanTitle,
    date: format(targetDate, 'yyyy-MM-dd'),
    dates,
    startTime,
    endTime,
    category: 'event',
    color: 'blue',
    recurrence: isRecurring ? { type: 'weekly', count: repeatCount } : undefined,
    source: 'rules',
    aiReply: isRecurring
      ? `Naplánována opakovaná událost "${cleanTitle}" (${repeatCount} týdnů od ${format(targetDate, 'd. M. yyyy')}).`
      : `Naplánováno na ${format(targetDate, 'd. M. yyyy')}${startTime ? ` v ${startTime}` : ''}.`
  };
};

/**
 * Gemini Flash s podporou opakovaných akcí (weekly recurring series)
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
Jsi inteligentní plánovač kalendáře v aplikaci TaskFlow.
Dnešní datum je: ${userLocalDate}.
Uživatel plánuje události do kalendáře, doučování a často plánuje OPAKOVANÉ AKCE (např. "každé úterý", "každý týden ve čtvrtek na 2 měsíce", "8 lekcí").

Pravidla pro OPAKOVÁNÍ (Recurrence):
- Pokud uživatel požaduje opakování ("každé úterý", "každý týden", "pravidelně", "X lekcí", "na X měsíců"):
  - "isRecurring": true
  - "recurrenceCount": počet týdnů/opakování (např. 8 pokud uživatel řekne "2 měsíce" nebo nespecifikuje počet týdnů; jinak konkrétní číslo uvedené uživatelem, max 24).
  - "date": datum PRVNÍHO výskytu této akce ve formátu YYYY-MM-DD.

Pravidla pro doučování:
- Pokud text zmiňuje doučování / lekci / studenta (např. "student modrá"), nastav "category": "tutoring".
- "tutoring": {
    "studentColor": string, // např. "modrá", "červená", "zelená"
    "type": "private" nebo "company", // Soukromé / Firma
    "place": "library" nebo "office", // Knihovna / Kancl
    "subject": string // "M", "ČJ", nebo vlastní
  }
- PRAVIDLO: Soukromá doučování ("private") NEMŮŽOU být v kanclu ("office")! Pokud uživatel žádá soukromé v kanclu, automaticky nastav "place": "library" a v "aiReply" to zmiň.
- "color": barva odpovídající studentovi ("blue", "indigo", "purple", "emerald", "amber", "rose").

Odpověz POUZE validním JSON objektem:
{
  "title": string,
  "date": "YYYY-MM-DD", // první datum
  "isRecurring": boolean,
  "recurrenceCount": number, // např. 8 týdnů
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
      console.warn("Gemini API status not OK:", response.status);
      return parseEventWithRules(promptText);
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return parseEventWithRules(promptText);

    const parsed = JSON.parse(candidateText);

    // Business rule check
    if (parsed.tutoring) {
      if (parsed.tutoring.type === 'private' && parsed.tutoring.place === 'office') {
        parsed.tutoring.place = 'library';
      }
      if (!parsed.tutoring.studentColor) parsed.tutoring.studentColor = 'modrá';
      if (!parsed.tutoring.subject) parsed.tutoring.subject = 'M';
      if (!parsed.tutoring.type) parsed.tutoring.type = 'private';
      if (!parsed.tutoring.place) parsed.tutoring.place = 'library';
    }

    // Vygenerování všech dat
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
      title: parsed.title || promptText,
      date: firstDate,
      dates,
      startTime: parsed.startTime || undefined,
      endTime: parsed.endTime || undefined,
      category: parsed.category || 'event',
      color: parsed.color || 'blue',
      description: parsed.description || undefined,
      tutoring: parsed.tutoring || undefined,
      recurrence: isRecurring ? { type: 'weekly', count } : undefined,
      source: 'gemini',
      aiReply: parsed.aiReply || `Událost byla úspěšně naplánována.`
    };
  } catch (err) {
    console.error("Gemini API error, falling back:", err);
    return parseEventWithRules(promptText);
  }
};
