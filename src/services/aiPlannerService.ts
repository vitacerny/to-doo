import { CalendarEvent } from '../types';
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
  category: 'event' | 'task' | 'meeting' | 'reminder' | 'personal';
  color: 'blue' | 'indigo' | 'purple' | 'emerald' | 'amber' | 'rose';
  description?: string;
  source: 'gemini' | 'rules';
  aiReply?: string;
}

/**
 * Fallback parser pro případ, že není zadaný klíč nebo Gemini selže.
 * Rozpozná základní češtinu (dnes, zítra, pozítří, dny v týdnu, časy).
 */
export const parseEventWithRules = (text: string): ParsedEventResult => {
  const lower = text.toLowerCase();
  const now = new Date();
  let targetDate = new Date();

  // Datum
  if (lower.includes('pozítří')) {
    targetDate = addDays(now, 2);
  } else if (lower.includes('zítra')) {
    targetDate = addDays(now, 1);
  } else if (lower.includes('dnes')) {
    targetDate = now;
  } else {
    // Dny v týdnu
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
      // Odhad konce o hodinu později
      const endH = String(Math.min(23, parseInt(hours, 10) + 1)).padStart(2, '0');
      endTime = `${endH}:${mins}`;
    }
  }

  // Kategorie & barva
  let category: ParsedEventResult['category'] = 'event';
  let color: ParsedEventResult['color'] = 'blue';

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

  // Očištění názvu od časových slov
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
Jsi inteligentní plánovač kalendáře a osobní asistent v aplikaci TaskFlow.
Dnešní datum je: ${userLocalDate}.
Tvým úkolem je porozumět uživatelskému vstupu v češtině a extrahovat data pro vytvoření události do kalendáře.

Pravidla:
1. "date": Přesné datum ve formátu YYYY-MM-DD. Pokud uživatel řekne "zítra", "ve čtvrtek", "příští týden", dopočítej to vůči dnešnímu datu.
2. "startTime": Čas začátku ve formátu HH:mm (např. "14:30"). Pokud není specifikován konkrétní čas, nech null.
3. "endTime": Čas konce ve formátu HH:mm (pokud trvání není uvedeno a je znám začátek, odhadni rozumně např. 1 hodinu, jinak null).
4. "title": Stručný a výstižný název události (např. "Zubař - preventivní prohlídka", "Doučování matematiky", "Schůzka s Petrem").
5. "description": Volitelný doplňující kontext nebo detaily, pokud je uživatel zmínil.
6. "category": Jedna z možností: "event", "task", "meeting", "reminder", "personal".
7. "color": Jedna z barev: "blue", "indigo", "purple", "emerald", "amber", "rose" (zvol vhodnou barvu např. rose pro lékaře/urgence, indigo pro schůzky, emerald pro sport/volno, purple pro studium/školu).
8. "aiReply": Jedna přátelská věta v češtině shrnující, co bylo naplánováno.

Odpověz POUZE validním JSON objektem v tomto tvaru:
{
  "title": string,
  "date": "YYYY-MM-DD",
  "startTime": "HH:mm" | null,
  "endTime": "HH:mm" | null,
  "category": "event" | "task" | "meeting" | "reminder" | "personal",
  "color": "blue" | "indigo" | "purple" | "emerald" | "amber" | "rose",
  "description": string | null,
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
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      console.warn("Gemini API call returned status:", response.status, "Falling back to rules.");
      return parseEventWithRules(promptText);
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      return parseEventWithRules(promptText);
    }

    const parsed = JSON.parse(candidateText);

    return {
      title: parsed.title || promptText,
      date: parsed.date || format(new Date(), 'yyyy-MM-dd'),
      startTime: parsed.startTime || undefined,
      endTime: parsed.endTime || undefined,
      category: parsed.category || 'event',
      color: parsed.color || 'blue',
      description: parsed.description || undefined,
      source: 'gemini',
      aiReply: parsed.aiReply || `Událost "${parsed.title}" byla uložena na ${parsed.date}.`
    };
  } catch (err) {
    console.error("Gemini API error, falling back:", err);
    return parseEventWithRules(promptText);
  }
};
