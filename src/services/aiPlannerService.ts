import { CalendarEvent, TutoringDetails, TutoringPlace, TutoringType, EventCategory } from '../types';
import { format, addDays, nextDay, Day } from 'date-fns';

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
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  category: EventCategory;
  color: string;
  description?: string;
  tutoring?: TutoringDetails;
  source: 'gemini' | 'rules';
  aiReply?: string;
}

/**
 * Normalizace barvy na platné css barvy v aplikaci
 */
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
 * Fallback parser pro případ, že není zadaný klíč nebo Gemini selže.
 */
export const parseEventWithRules = (text: string): ParsedEventResult => {
  const lower = text.toLowerCase();
  const now = new Date();
  let targetDate = new Date();

  // Datum
  if (lower.includes('pozítří') || lower.includes('pozitri')) {
    targetDate = addDays(now, 2);
  } else if (lower.includes('zítra') || lower.includes('zitra')) {
    targetDate = addDays(now, 1);
  } else if (lower.includes('dnes')) {
    targetDate = now;
  } else {
    const dayMap: Record<string, Day> = {
      'pondělí': 1, 'pondeli': 1,
      'úterý': 2, 'utery': 2,
      'středa': 3, 'stredu': 3, 'streda': 3,
      'čtvrtek': 4, 'ctvrtek': 4,
      'pátek': 5, 'patek': 5,
      'sobota': 6, 'sobotu': 6,
      'neděle': 0, 'nedeli': 0, 'nedele': 0
    };

    for (const [dayName, dayIndex] of Object.entries(dayMap)) {
      if (lower.includes(dayName)) {
        targetDate = nextDay(now, dayIndex);
        break;
      }
    }
  }

  // Čas (např. "v 15:00", "v 15h", "v 9", "14:30")
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

  // Detekce doučování
  const isTutoring = lower.includes('douč') || lower.includes('douc') || lower.includes('lekc') || lower.includes('hodin');
  
  if (isTutoring) {
    // Student barva: např. "červená", "modrý", "zelený", "fialová", "žlutá"
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
        // Zjednodušíme tvar na ženský rod (např. "červená")
        studentColor = cn.replace(/[ýy]/, 'á').replace(/a$/, 'á');
        break;
      }
    }

    // Typ: soukromé / firma
    let type: TutoringType = 'private';
    if (lower.includes('firma') || lower.includes('firemní') || lower.includes('firemni')) {
      type = 'company';
    }

    // Místo: knihovna / kancl
    let place: TutoringPlace = 'library';
    if (lower.includes('kancl') || lower.includes('kancelář') || lower.includes('office')) {
      // Pravidlo: soukromé doučování NEMŮŽE být v kanclu
      if (type === 'company') {
        place = 'office';
      } else {
        place = 'library'; // Vynucena knihovna
      }
    }

    // Předmět: M / ČJ / jiné
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

    return {
      title,
      date: format(targetDate, 'yyyy-MM-dd'),
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
      source: 'rules',
      aiReply: `Naplánováno doučování: ${subject} pro studenta (${studentColor}), ${type === 'private' ? 'soukromé' : 'firma'}, místo: ${place === 'library' ? 'knihovna' : 'kancl'}.`
    };
  }

  // Obecná kategorie & barva
  let category: EventCategory = 'event';
  let color = 'blue';

  if (lower.includes('schůzk') || lower.includes('meeting') || lower.includes('call') || lower.includes('porada')) {
    category = 'meeting';
    color = 'indigo';
  } else if (lower.includes('zkoušk') || lower.includes('test') || lower.includes('škola') || lower.includes('matur') || lower.includes('učení')) {
    category = 'event';
    color = 'purple';
  } else if (lower.includes('doktor') || lower.includes('lékař') || lower.includes('zubař')) {
    category = 'personal';
    color = 'rose';
  } else if (lower.includes('trénink') || lower.includes('sport') || lower.includes('běh') || lower.includes('posilovna')) {
    category = 'personal';
    color = 'emerald';
  } else if (lower.includes('připomeň') || lower.includes('úkol') || lower.includes('koupit')) {
    category = 'task';
    color = 'amber';
  }

  let cleanTitle = text
    .replace(/(?:naplánuj|přidej|nastav|dej mi|mám)\s*(?:mi\s*)?/gi, '')
    .replace(/(?:v\s*)?(?:pondělí|úterý|středu|streda|čtvrtek|pátek|sobotu|sobota|neděli|nedele)/gi, '')
    .replace(/(?:dnes|zítra|pozítří)/gi, '')
    .replace(/(?:v\s*)?\d{1,2}(?::\d{2}|\s*h(?:odin)?)?/gi, '')
    .replace(/(?:na\s*\d+\s*(?:hodin|hodiny|minut))?/gi, '')
    .trim();

  cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);
  if (!cleanTitle) cleanTitle = text;

  return {
    title: cleanTitle,
    date: format(targetDate, 'yyyy-MM-dd'),
    startTime,
    endTime,
    category,
    color,
    source: 'rules',
    aiReply: `Naplánováno na ${format(targetDate, 'd. M. yyyy')}${startTime ? ` v ${startTime}` : ''}.`
  };
};

/**
 * Plné zpracování přes Google Gemini Flash API s JSON structured outputem
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
Uživatel plánuje události do kalendáře, a VELMI ČASTO plánuje DOUČOVÁNÍ.

Pravidla pro doučování:
- Pokud text zmiňuje doučování / lekci / studenta / školní předmět (nebo má atributy doučování), nastav:
  - "category": "tutoring"
  - "tutoring": {
      "studentColor": string, // Barva studenta vyjádřená slovem, např. "červená", "modrá", "zelená", "žlutá", "fialová", "oranžová". Pokud uživatel nezmíní, zvol např. "modrá".
      "type": "private" nebo "company", // soukromé nebo firma. Výchozí je "private".
      "place": "library" nebo "office", // knihovna nebo kancl.
      "subject": string // Předmět (obvykle "M" jako matematika, "ČJ" jako čeština, nebo jiný např. "AJ", "FYZ").
    }
  - DŮLEŽITÉ PRAVIDLO VALIDACE: Soukromá doučování ("private") NEMŮŽOU být v kanclu ("office")! Pokud uživatel požaduje soukromé doučování v kanclu, automaticky nastav "place": "library" (knihovna) a v "aiReply" ho na to slušně upozorni ("Soukromé doučování nemůže být v kanclu, nastavil jsem knihovnu.").
  - "color": Zvol barvu odpovídající barvě studenta ("blue", "indigo", "purple", "emerald", "amber", "rose").
  - "title": např. "Doučování M (červená)" nebo "Doučování ČJ - firma"

Obecná pravidla pro události:
1. "date": YYYY-MM-DD (dopočti z "zítra", "ve středu", apod.).
2. "startTime": HH:mm (např. "14:00") nebo null.
3. "endTime": HH:mm nebo null (pokud znáš začátek a není délka, odhadni 60 minut).
4. "category": "tutoring" | "event" | "task" | "meeting" | "reminder" | "personal".
5. "color": "blue" | "indigo" | "purple" | "emerald" | "amber" | "rose".
6. "aiReply": Přátelské shrnutí v češtině, co bylo vytvořeno a zda došlo k úpravě místa.

Odpověz POUZE validním JSON objektem v tomto tvaru:
{
  "title": string,
  "date": "YYYY-MM-DD",
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

    // Dvojitá kontrola business pravidla na straně klienta:
    if (parsed.tutoring) {
      if (parsed.tutoring.type === 'private' && parsed.tutoring.place === 'office') {
        parsed.tutoring.place = 'library';
      }
      if (!parsed.tutoring.studentColor) parsed.tutoring.studentColor = 'modrá';
      if (!parsed.tutoring.subject) parsed.tutoring.subject = 'M';
      if (!parsed.tutoring.type) parsed.tutoring.type = 'private';
      if (!parsed.tutoring.place) parsed.tutoring.place = 'library';
    }

    return {
      title: parsed.title || promptText,
      date: parsed.date || format(new Date(), 'yyyy-MM-dd'),
      startTime: parsed.startTime || undefined,
      endTime: parsed.endTime || undefined,
      category: parsed.category || 'event',
      color: parsed.color || 'blue',
      description: parsed.description || undefined,
      tutoring: parsed.tutoring || undefined,
      source: 'gemini',
      aiReply: parsed.aiReply || `Událost byla úspěšně naplánována.`
    };
  } catch (err) {
    console.error("Gemini API error, falling back:", err);
    return parseEventWithRules(promptText);
  }
};
