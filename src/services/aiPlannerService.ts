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

export interface ParsedEventResult {
  action: AiActionType; // 'create' | 'delete'
  deleteCriteria?: DeleteCriteria;
  title: string;
  date: string; // YYYY-MM-DD prvního výskytu
  dates: string[]; // Všechna data (1 nebo více při opakování)
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

/**
 * Detekce požadavku na smazání / zrušení
 */
export const isDeleteIntent = (text: string): boolean => {
  const l = text.toLowerCase();
  return (
    l.includes('zruš') || l.includes('zrus') ||
    l.includes('smaž') || l.includes('smaz') ||
    l.includes('odstraň') || l.includes('odstran') ||
    l.includes('vymaž') || l.includes('vymaz')
  );
};

/**
 * Fallback parser pro mazání i vytváření
 */
export const parseEventWithRules = (text: string): ParsedEventResult => {
  const lower = text.toLowerCase();
  const now = new Date();
  let targetDate = new Date();

  // === 1. OBSLUHA MAZÁNÍ (DELETE) ===
  if (isDeleteIntent(text)) {
    // a) Zruš úplně všechno
    if (lower.includes('všechno') || lower.includes('vsechno') || lower.includes('všechny') || lower.includes('úplně vše') || lower.includes('uplne vse')) {
      // zruš všechno na zítra / dnes / v pondělí
      let specificDate: string | undefined;
      let dayDesc = 'všechny události v kalendáři';

      if (lower.includes('zítra') || lower.includes('zitra')) {
        specificDate = format(addDays(now, 1), 'yyyy-MM-dd');
        dayDesc = 'všechny události na zítřek';
      } else if (lower.includes('dnes')) {
        specificDate = format(now, 'yyyy-MM-dd');
        dayDesc = 'všechny události na dnešek';
      } else if (lower.includes('pozítří') || lower.includes('pozitri')) {
        specificDate = format(addDays(now, 2), 'yyyy-MM-dd');
        dayDesc = 'všechny události na pozítří';
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

    // b) Zruš konkrétní datum (např. "zruš zítra", "smaž pátek")
    const dayPatterns: { names: string[]; dayNum: number }[] = [
      { names: ['pondělí', 'pondeli', 'po'], dayNum: 1 },
      { names: ['úterý', 'utery', 'út', 'ut'], dayNum: 2 },
      { names: ['střed', 'stred', 'st'], dayNum: 3 },
      { names: ['čtvrt', 'ctvrt', 'čt', 'ct'], dayNum: 4 },
      { names: ['pátek', 'patek', 'pá', 'pa'], dayNum: 5 },
      { names: ['sobot', 'so'], dayNum: 6 },
      { names: ['neděl', 'nedel', 'ne'], dayNum: 0 }
    ];

    let deleteDate: string | undefined;
    for (const p of dayPatterns) {
      if (p.names.some(name => lower.includes(name))) {
        deleteDate = format(getNextDayOfWeek(p.dayNum, now), 'yyyy-MM-dd');
        break;
      }
    }
    if (!deleteDate) {
      if (lower.includes('zítra') || lower.includes('zitra')) deleteDate = format(addDays(now, 1), 'yyyy-MM-dd');
      else if (lower.includes('dnes')) deleteDate = format(now, 'yyyy-MM-dd');
      else if (lower.includes('pozítří') || lower.includes('pozitri')) deleteDate = format(addDays(now, 2), 'yyyy-MM-dd');
    }

    // Student barva v požadavku na smazání
    let studentColor: string | undefined;
    const colorNames = ['červená', 'červený', 'modrá', 'modrý', 'zelená', 'zelený', 'žlutá', 'žlutý', 'oranžová', 'fialová', 'bílá', 'černá'];
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
        ? `Mažu doučování se studentem (${studentColor})${deleteDate ? ` pro datum ${deleteDate}` : ''}.`
        : `Ruším naplánované události.`
    };
  }

  // === 2. OBSLUHA VYTVÁŘENÍ (CREATE) ===
  const isRecurring = lower.includes('každ') || lower.includes('kazd') || lower.includes('pravidelně') || lower.includes('pravidelne');
  let repeatCount = 1;

  if (isRecurring) {
    repeatCount = 8;
    const countMatch = lower.match(/(\d+)\s*(?:lekc|týdn|tydn|měsíc|mesic|x)/i);
    if (countMatch) {
      const num = parseInt(countMatch[1], 10);
      if (lower.includes('měsíc') || lower.includes('mesic')) {
        repeatCount = Math.min(24, num * 4);
      } else {
        repeatCount = Math.min(24, Math.max(2, num));
      }
    }
  }

  const dayPatterns: { names: string[]; dayNum: number }[] = [
    { names: ['pondělí', 'pondeli', 'po'], dayNum: 1 },
    { names: ['úterý', 'utery', 'út', 'ut'], dayNum: 2 },
    { names: ['střed', 'stred', 'st'], dayNum: 3 },
    { names: ['čtvrt', 'ctvrt', 'čt', 'ct'], dayNum: 4 },
    { names: ['pátek', 'patek', 'pá', 'pa'], dayNum: 5 },
    { names: ['sobot', 'so'], dayNum: 6 },
    { names: ['neděl', 'nedel', 'ne'], dayNum: 0 }
  ];

  let foundDayNum: number | null = null;
  for (const p of dayPatterns) {
    if (p.names.some(name => lower.includes(name))) {
      foundDayNum = p.dayNum;
      break;
    }
  }

  if (foundDayNum !== null) {
    targetDate = getNextDayOfWeek(foundDayNum, now);
  } else if (lower.includes('pozítří') || lower.includes('pozitri')) {
    targetDate = addDays(now, 2);
  } else if (lower.includes('zítra') || lower.includes('zitra')) {
    targetDate = addDays(now, 1);
  } else {
    targetDate = now;
  }

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

  const dates: string[] = [];
  if (isRecurring && repeatCount > 1) {
    for (let i = 0; i < repeatCount; i++) {
      dates.push(format(addWeeks(targetDate, i), 'yyyy-MM-dd'));
    }
  } else {
    dates.push(format(targetDate, 'yyyy-MM-dd'));
  }

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

    const cleanTitle = `Doučování ${subject} (${studentColor})`;
    const colorKey = mapColorNameToHexOrKey(studentColor);

    const replyMsg = isRecurring
      ? `Naplánována série ${repeatCount} lekcí: ${cleanTitle} (${place === 'library' ? 'knihovna' : 'kancl'}) na každý týden od ${format(targetDate, 'd. M. yyyy')}.`
      : `Naplánováno: ${cleanTitle} (${type === 'private' ? 'soukromé' : 'firma'}, ${place === 'library' ? 'knihovna' : 'kancl'}) na ${format(targetDate, 'd. M. yyyy')}${startTime ? ` v ${startTime}` : ''}.`;

    return {
      action: 'create',
      title: cleanTitle,
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

  let pureTitle = cleanTextNoise(text);
  if (!pureTitle) pureTitle = 'Událost';
  pureTitle = pureTitle.charAt(0).toUpperCase() + pureTitle.slice(1);

  return {
    action: 'create',
    title: pureTitle,
    date: format(targetDate, 'yyyy-MM-dd'),
    dates,
    startTime,
    endTime,
    category: 'event',
    color: 'blue',
    recurrence: isRecurring ? { type: 'weekly', count: repeatCount } : undefined,
    source: 'rules',
    aiReply: isRecurring
      ? `Naplánována opakovaná událost "${pureTitle}" (${repeatCount} týdnů od ${format(targetDate, 'd. M. yyyy')}).`
      : `Naplánováno na ${format(targetDate, 'd. M. yyyy')}${startTime ? ` v ${startTime}` : ''}.`
  };
};

/**
 * Gemini Flash s podporou mazání a vytváření
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

AKCE UŽIVATELE:
Uživatel chce buď VYTVIŘIT událost ("create") nebo SMAZAT/ZRUŠIT událost ("delete").

Pokud uživatel chce SMAZAT / ZRUŠIT události (např. "zruš zítra", "zruš všechno na zítra", "smaž úplně všechno", "zruš doučování se studentem červená"):
- "action": "delete"
- "deleteCriteria": {
    "scope": "all" (pro úplně všechno) | "date" (pro dané datum) | "tutoring_student" (pro doučování daného studenta) | "specific" (ostatní),
    "date": "YYYY-MM-DD" nebo null,
    "studentColor": barva slovy nebo null,
    "keyword": hledané klíčové slovo (např. "doučování", "zubař") nebo null
  }
- "aiReply": Stručná odpověď, co se maže (např. "Mažu všechny události na zítřek." nebo "Mažu doučování se studentem červená.").

Pokud uživatel chce VYTVOŘIT událost ("create"):
- "action": "create"
- "title": Pro doučování VÝHRADNĚ tvar: "Doučování {Předmět} ({Barva studenta})".
- ZÁKAZ BALASTU: Žádné "prosím", "chtěl bych" v title ani description.
- "date": přesné datum PRVNÍHO výskytu.
- "isRecurring": true při opakování (např. "každé pondělí"), recurrenceCount (týdny).
- "tutoring": pokud jde o doučování, povinně studentColor, type ('private'|'company'), place ('library'|'office'), subject ('M'|'ČJ'|jiné). Soukromé ("private") nesmí být v kanclu ("office").

Odpověz POUZE validním JSON objektem:
{
  "action": "create" | "delete",
  "deleteCriteria": {
    "scope": "all" | "date" | "tutoring_student" | "specific",
    "date": "YYYY-MM-DD" | null,
    "studentColor": string | null,
    "keyword": string | null
  } | null,
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
      console.warn("Gemini API call failed, falling back to rules:", response.status);
      return parseEventWithRules(promptText);
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return parseEventWithRules(promptText);

    const parsed = JSON.parse(candidateText);

    // Pokud je to mazání
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
        aiReply: parsed.aiReply || 'Mažu zvolené události.'
      };
    }

    // Jinak vytváření
    if (parsed.tutoring) {
      if (parsed.tutoring.type === 'private' && parsed.tutoring.place === 'office') {
        parsed.tutoring.place = 'library';
      }
      if (!parsed.tutoring.studentColor) parsed.tutoring.studentColor = 'modrá';
      if (!parsed.tutoring.subject) parsed.tutoring.subject = 'M';
      if (!parsed.tutoring.type) parsed.tutoring.type = 'private';
      if (!parsed.tutoring.place) parsed.tutoring.place = 'library';

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
