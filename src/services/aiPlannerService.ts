import { CalendarEvent, TutoringDetails, TutoringPlace, TutoringType, EventCategory } from '../types';
import { format, addDays, addWeeks, getDay, isBefore } from 'date-fns';

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

/**
 * Spolehlivě najde nejbližší budoucí výskyt daného dne v týdnu (1 = pondělí ... 0 = neděle).
 * Pokud je dnes pondělí a uživatel řekne "každé pondělí", posune na příští pondělí (nebo dnes, pokud ještě nebyl čas).
 */
export const getNextDayOfWeek = (targetDayOfWeek: number, baseDate: Date = new Date()): Date => {
  const result = new Date(baseDate);
  result.setHours(0, 0, 0, 0);
  const currentDay = getDay(result); // 0 (Sun) to 6 (Sat)
  
  let daysToAdd = (targetDayOfWeek - currentDay + 7) % 7;
  // Pokud je to dnes (daysToAdd === 0), ale uživatel plánuje "každé pondělí",
  // raději plánujeme ode dneška pokud ještě není večer, nebo ode dneška jako startovní lekce
  if (daysToAdd === 0) {
    // Pokud je dnes stejný den, první lekce je dnes
    daysToAdd = 0;
  }
  return addDays(result, daysToAdd);
};

/**
 * Odstranění zdvořilostního balastu, časových údajů a instrukčních slov
 */
export const cleanTextNoise = (text: string): string => {
  return text
    .replace(/\b(?:prosím|prosim|děkuji|dekuji|chtěl bych|chtel bych|potřebuji|potrebuji|mohl bys|můžeš|muzes|naplánuj|naplanuj|přidej|pridej|nastav|vytvoř|vytvor|dej mi|dej)\b/gi, '')
    .replace(/\b(?:každé|kazde|každý|kazdy|každou|kazdou|každou|pravidelně|pravidelne)\s*(?:pondělí|pondelí|pondelí|úterý|utery|středu|stredu|čtvrtek|ctvrtek|pátek|patek|sobotu|neděli|nedeli)?/gi, '')
    .replace(/\b(?:pondělí|pondelí|úterý|utery|středu|stredu|streda|čtvrtek|ctvrtek|pátek|patek|sobotu|sobota|neděli|nedele)\b/gi, '')
    .replace(/\b(?:dnes|zítra|zitra|pozítří|pozitri)\b/gi, '')
    .replace(/\b(?:v\s*)?\d{1,2}(?::\d{2}|\s*h(?:odin)?)?\b/gi, '')
    .replace(/\b(?:na\s*\d+\s*(?:hodin|hodiny|hodinu|minut|lekcí|lekci|týdnů|tydnu|měsíců|mesicu))\b/gi, '')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Fallback parser s neprůstřelnou logikou pro dny a čisté názvy
 */
export const parseEventWithRules = (text: string): ParsedEventResult => {
  const lower = text.toLowerCase();
  const now = new Date();
  let targetDate = new Date();

  // 1. Zjištění opakování (Recurrence)
  const isRecurring = lower.includes('každ') || lower.includes('kazd') || lower.includes('pravidelně') || lower.includes('pravidelne');
  let repeatCount = 1;

  if (isRecurring) {
    repeatCount = 8; // Výchozí 8 lekcí (cca 2 měsíce)
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

  // 2. Přesné dny v týdnu (1 = pondělí ... 0 = neděle)
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

  // 3. Čas
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

  // 4. Generování termínů
  const dates: string[] = [];
  if (isRecurring && repeatCount > 1) {
    for (let i = 0; i < repeatCount; i++) {
      dates.push(format(addWeeks(targetDate, i), 'yyyy-MM-dd'));
    }
  } else {
    dates.push(format(targetDate, 'yyyy-MM-dd'));
  }

  // 5. Doučování vs. Obecná událost
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
        place = 'library'; // Pravidlo: soukromé nesmí do kanclu
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

    // ČISTÝ NÁZEV BEZ BALASTU
    const cleanTitle = `Doučování ${subject} (${studentColor})`;
    const colorKey = mapColorNameToHexOrKey(studentColor);

    const replyMsg = isRecurring
      ? `Naplánována série ${repeatCount} lekcí: ${cleanTitle} (${place === 'library' ? 'knihovna' : 'kancl'}) na každý týden od ${format(targetDate, 'd. M. yyyy')}.`
      : `Naplánováno: ${cleanTitle} (${type === 'private' ? 'soukromé' : 'firma'}, ${place === 'library' ? 'knihovna' : 'kancl'}) na ${format(targetDate, 'd. M. yyyy')}${startTime ? ` v ${startTime}` : ''}.`;

    return {
      title: cleanTitle,
      date: format(targetDate, 'yyyy-MM-dd'),
      dates,
      startTime,
      endTime,
      category: 'tutoring',
      color: colorKey,
      description: undefined, // Žádná zbytečná slova z promptu
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

  // Obecná událost s vyčištěným názvem
  let pureTitle = cleanTextNoise(text);
  if (!pureTitle) pureTitle = 'Událost';
  pureTitle = pureTitle.charAt(0).toUpperCase() + pureTitle.slice(1);

  return {
    title: pureTitle,
    date: format(targetDate, 'yyyy-MM-dd'),
    dates,
    startTime,
    endTime,
    category: 'event',
    color: 'blue',
    description: undefined,
    recurrence: isRecurring ? { type: 'weekly', count: repeatCount } : undefined,
    source: 'rules',
    aiReply: isRecurring
      ? `Naplánována opakovaná událost "${pureTitle}" (${repeatCount} týdnů od ${format(targetDate, 'd. M. yyyy')}).`
      : `Naplánováno na ${format(targetDate, 'd. M. yyyy')}${startTime ? ` v ${startTime}` : ''}.`
  };
};

/**
 * Gemini Flash s přísnými instrukcemi proti balastu a správným výpočtem termínů
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
Jsi precizní plánovač kalendáře TaskFlow.
Dnešní datum je: ${userLocalDate}.

PŘÍSNÁ PRAVIDLA PRO NÁZVY A POPISY:
1. ZÁKAZ BALASTU: Nikdy do "title" ani "description" nedávej slova jako "prosím", "chtěl bych", "naplánuj", "přidej", dny v týdnu ani časy.
2. NÁZEV DOUČOVÁNÍ: Pokud se jedná o doučování, "title" MUSÍ mít POUZE a VÝHRADNĚ tvar:
   "Doučování {Předmět} ({Barva studenta})" -> např. "Doučování M (zelená)", "Doučování ČJ (modrá)".
3. "description": Nech null, pokud uživatel výslovně nespecifikoval konkrétní studijní látku (např. "téma kvadratické rovnice"). ŽÁDNÝ zdvořilostní text tam nesmí být!

PRAVIDLA PRO OPAKOVÁNÍ (každé pondělí, každý týden atd.):
- "isRecurring": true pokud uživatel chce opakování ("každé pondělí", "pravidelně", "X lekcí").
- "recurrenceCount": počet týdnů (pokud uživatel neuvede, nastav 8).
- "date": přesné datum PRVNÍHO výskytu. Pokud dnes není daný den (např. dnes je středa a uživatel řekne "každé pondělí"), datum PRVNÍHO výskytu MUSÍ být nejbližší nadcházející pondělí!

PRAVIDLA PRO DOUČOVÁNÍ:
- "category": "tutoring"
- "tutoring": {
    "studentColor": string (barva slovy, např. "červená", "zelená", "modrá"),
    "type": "private" | "company",
    "place": "library" | "office",
    "subject": string ("M", "ČJ", nebo vlastní)
  }
- PRAVIDLO MÍSTA: Soukromé doučování ("private") NIKDY nesmí být v kanclu ("office")! Pokud uživatel požaduje soukromé v kanclu, automaticky nastav "place": "library" a v "aiReply" to slušně vysvětli.

Odpověz POUZE validním JSON objektem:
{
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
      console.warn("Gemini API call returned status:", response.status);
      return parseEventWithRules(promptText);
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) return parseEventWithRules(promptText);

    const parsed = JSON.parse(candidateText);

    // Vynucení čistého formátu pro doučování
    if (parsed.tutoring) {
      if (parsed.tutoring.type === 'private' && parsed.tutoring.place === 'office') {
        parsed.tutoring.place = 'library';
      }
      if (!parsed.tutoring.studentColor) parsed.tutoring.studentColor = 'modrá';
      if (!parsed.tutoring.subject) parsed.tutoring.subject = 'M';
      if (!parsed.tutoring.type) parsed.tutoring.type = 'private';
      if (!parsed.tutoring.place) parsed.tutoring.place = 'library';

      // Garantujeme čistý název bez ohledu na to, co Gemini vygeneroval
      parsed.title = `Doučování ${parsed.tutoring.subject} (${parsed.tutoring.studentColor})`;
      parsed.color = mapColorNameToHexOrKey(parsed.tutoring.studentColor);
    }

    // Vyčištění popisu od zdvořilostí
    if (parsed.description) {
      const cleanDesc = cleanTextNoise(parsed.description);
      parsed.description = cleanDesc.length > 2 ? cleanDesc : undefined;
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
    console.error("Gemini API error, falling back to rules:", err);
    return parseEventWithRules(promptText);
  }
};
