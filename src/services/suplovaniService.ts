export interface SchoolSubstitutionChange {
  period: number;
  periodTime: string;
  subject: string;
  group: string;
  room: string;
  changeType: string; // e.g. "odpadá", "supluje", "přesun", "změna učebny"
  substitute: string; // suplující učitel / poznámka
  originalTeacher: string; // původní učitel
}

export interface DailySubstitutionResult {
  date: string; // e.g. "20.11.2026"
  classChanges: SchoolSubstitutionChange[]; // Všechny změny pro 8.A
  userChanges: SchoolSubstitutionChange[];  // Filtrované změny pouze pro studenta (jeho skupiny)
  fetchTimestamp: string;
  source: 'live' | 'mock' | 'cached';
  error?: string;
}

export interface MultiDaySubstitutionResult {
  days: DailySubstitutionResult[];
  fetchTimestamp: string;
  source: 'live' | 'mock' | 'cached';
}

// Skupiny studenta pro 8.A:
// - AJ: skupina HV (vyučující Fejt) -> skupinu VV (Hart) uživatel NEMÁ!
// - SMA: 8.A SMAG (Bici)
// - MAC: 8.A MACE (Kade)
// - FJ: 8.A A/F (Tomm)
// - TV: 8.A Chl (Kuci) -> dívčí TV (Dív) uživatel nemá
// - MADT: 8.A MDT2 (Rojk)
// - SIN: 8.A SINI (Fere)
// - CJ: 8.A SCM1 (Bouc)
// - SBI: 8.A SBIH (Kuce)
// - Celá třída (skupina prázdná nebo celá 8.A): MA, CJ, DE, ZSV, FY, CH, BI
export const USER_ATTENDED_GROUPS: Record<string, { groupPattern?: RegExp; teacherPattern?: RegExp }> = {
  AJ: {
    groupPattern: /HV/i,
    teacherPattern: /Fejt/i
  },
  SMA: {
    groupPattern: /SMAG/i,
    teacherPattern: /Bici/i
  },
  MAC: {
    groupPattern: /MACE/i,
    teacherPattern: /Kade/i
  },
  FJ: {
    groupPattern: /A\/F|FJ/i,
    teacherPattern: /Tomm/i
  },
  TV: {
    groupPattern: /Chl/i,
    teacherPattern: /Kuci/i
  },
  MADT: {
    groupPattern: /MDT2|MADT/i,
    teacherPattern: /Rojk/i
  },
  SIN: {
    groupPattern: /SINI|SIN/i,
    teacherPattern: /Fere/i
  },
  CJ: {
    // Čtvrtek 3. hodina má skupinu SCM1
    teacherPattern: /Bouc/i
  },
  SBI: {
    groupPattern: /SBIH|SBI/i,
    teacherPattern: /Kuce/i
  }
};

// Skupiny, které uživatel výslovně NEMÁ:
export const EXCLUDED_GROUPS = [
  'VV', // Druhá skupina na AJ (Hart)
  'Dív', // Dívčí TV
  'Dívky',
  'MDT1',
  'SCM2'
];

/**
 * Zkontroluje, zda daná změna platí pro studenta
 */
export function isChangeForUser(change: SchoolSubstitutionChange): boolean {
  const normGroup = (change.group || '').trim();
  const normSubject = (change.subject || '').trim().toUpperCase();
  const normOrigTeacher = (change.originalTeacher || '').trim();

  // 1. Pokud je skupina ve výslovně vyloučených skupinách (např. VV, Dív) -> ignorovat!
  if (normGroup) {
    for (const excluded of EXCLUDED_GROUPS) {
      if (normGroup.toLowerCase().includes(excluded.toLowerCase())) {
        return false;
      }
    }
  }

  // 2. Kontrola podle specifického předmětu
  const userPref = USER_ATTENDED_GROUPS[normSubject];
  if (userPref) {
    // Pokud je vyučující uvedený a známe učitele
    if (userPref.teacherPattern && normOrigTeacher) {
      if (userPref.teacherPattern.test(normOrigTeacher)) {
        return true;
      }
    }

    // Pokud je skupina uvedena a známe skupinu
    if (userPref.groupPattern && normGroup) {
      return userPref.groupPattern.test(normGroup);
    }

    // Pokud předmět je AJ a skupina je VV (nebo učitel Hart) -> NE
    if (normSubject === 'AJ') {
      if (/VV/i.test(normGroup) || /Hart/i.test(normOrigTeacher)) {
        return false;
      }
      if (/HV/i.test(normGroup) || /Fejt/i.test(normOrigTeacher)) {
        return true;
      }
    }
  }

  // 3. Pro celou třídu (žádná specifická vyloučená skupina)
  return true;
}

/**
 * Parsuje HTML suplování z ghb.bakalari.cz/next/zmeny.aspx
 */
export function parseBakalariSuplovaniHtml(html: string): DailySubstitutionResult {
  // Datum
  const dateMatch = html.match(/id="DateEdit_I"[^>]*value="([^"]+)"/i) || html.match(/value="([^"]+)"[^>]*id="DateEdit_I"/i);
  const date = dateMatch ? dateMatch[1].trim() : '';

  // Nalezení bloku pro 8.A
  const markerRegex = /<td[^>]*style="[^"]*width:22%[^"]*"[^>]*>\s*8\.A\s*<\/td>[\s\S]*?<table[^>]*class="inner"[^>]*>([\s\S]*?)<\/table>/i;
  const match = html.match(markerRegex);

  const classChanges: SchoolSubstitutionChange[] = [];

  if (match) {
    const tableHtml = match[1];
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/gi;
    let rowMatch;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowContent = rowMatch[1];
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let tdMatch;
      while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
        cells.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
      }

      if (cells.length >= 5) {
        const periodStr = cells[0] || '';
        const periodNumMatch = periodStr.match(/^(\d+)\./);
        const period = periodNumMatch ? parseInt(periodNumMatch[1], 10) : 0;

        const subject = cells[1] || '';
        const group = cells[2] || '';
        const room = cells[3] || '';
        const changeType = cells[4] || '';
        const substitute = cells[5] || '';
        const originalTeacher = (cells[6] || '').replace(/[()]/g, '').trim();

        classChanges.push({
          period,
          periodTime: periodStr,
          subject,
          group,
          room,
          changeType,
          substitute,
          originalTeacher
        });
      }
    }
  }

  const userChanges = classChanges.filter(isChangeForUser);

  return {
    date,
    classChanges,
    userChanges,
    fetchTimestamp: new Date().toISOString(),
    source: 'live'
  };
}

/**
 * Normalizuje datum z formátu "05.12.2026" nebo "5. 12. 2026" na "5.12.2026"
 */
export function normalizeCzDate(dateStr: string): string {
  return (dateStr || '').replace(/\s+/g, '').replace(/\b0+(\d)/g, '$1');
}

/**
 * Parsuje zakázaná data z kalendáře Bakalářů ('disabledDates':[new Date(2026,10,21,...), ...])
 */
function parseDisabledDates(html: string): Set<string> {
  const disabled = new Set<string>();
  const disMatch = html.match(/'disabledDates':\[(.*?)\]/);
  if (!disMatch) return disabled;

  const dateRegex = /new Date\((\d+),(\d+),(\d+)/g;
  let m;
  while ((m = dateRegex.exec(disMatch[1])) !== null) {
    const y = parseInt(m[1], 10);
    const monthZeroIndexed = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    disabled.add(`${y}-${monthZeroIndexed}-${d}`);
  }
  return disabled;
}

/**
 * Vyparsuje DD.MM.YYYY na { day, monthZeroIndexed, year }
 */
function parseCzDateParts(dateStr: string): { day: number; monthZeroIndexed: number; year: number } | null {
  const m = (dateStr || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return {
    day: parseInt(m[1], 10),
    monthZeroIndexed: parseInt(m[2], 10) - 1,
    year: parseInt(m[3], 10)
  };
}

function formatCzDateDdMmYyyy(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}.${m}.${y}`;
}

/**
 * Načte suplování pro konkrétní budoucí den pomocí ASP.NET postbacku na DateEdit
 */
async function fetchBakalariDatePost(
  baseUrl: string,
  initHtml: string,
  targetUtcDate: Date
): Promise<DailySubstitutionResult | null> {
  const vs = (initHtml.match(/name="__VIEWSTATE" id="__VIEWSTATE" value="([^"]+)"/) || [])[1];
  const gen = (initHtml.match(/name="__VIEWSTATEGENERATOR" id="__VIEWSTATEGENERATOR" value="([^"]+)"/) || [])[1] || '';
  const ev = (initHtml.match(/name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="([^"]+)"/) || [])[1];

  if (!vs || !ev) return null;

  const dateStr = formatCzDateDdMmYyyy(targetUtcDate);
  const ts = targetUtcDate.getTime().toString();
  const stateJson = JSON.stringify({ rawValue: ts, useMinDateInsteadOfNull: false });

  const params = new URLSearchParams();
  params.append('__EVENTTARGET', 'DateEdit');
  params.append('__EVENTARGUMENT', '');
  params.append('__VIEWSTATE', vs);
  params.append('__VIEWSTATEGENERATOR', gen);
  params.append('__EVENTVALIDATION', ev);
  params.append('DateEdit', dateStr);
  params.append('DateEdit_State', stateJson);
  params.append('DateEdit$State', stateJson);
  params.append('DateEdit_Raw', ts);

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html'
      },
      body: params.toString()
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (!html || (!html.includes('zmeny-content') && !html.includes('changes-content') && !html.includes('Gymnázium Havlíčkův Brod'))) {
      return null;
    }
    const parsed = parseBakalariSuplovaniHtml(html);
    if (!parsed.date || normalizeCzDate(parsed.date) !== normalizeCzDate(dateStr)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Pokusí se načíst aktuální suplování z GHB (včetně dalších dostupných dnů dopředu)
 */
export async function fetchMultiDaySuplovani(): Promise<MultiDaySubstitutionResult> {
  const directBakalariUrl = 'https://ghb.bakalari.cz/next/zmeny.aspx';
  const urlsToTry = [
    '/api-suplovani', // 1. Vite lokální proxy (plně funkční při `npm run dev`)
    directBakalariUrl, // 2. Přímý fetch (pokud není blokován CORS)
    `https://corsproxy.io/?url=${encodeURIComponent(directBakalariUrl)}`, // 3. Veřejné proxy
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(directBakalariUrl)}`
  ];

  let workingUrl: string | null = null;
  let initHtml: string | null = null;

  for (const url of urlsToTry) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'text/html' } });
      if (res.ok) {
        const text = await res.text();
        if (text && (text.includes('zmeny-content') || text.includes('changes-content') || text.includes('zmeny.aspx') || text.includes('Gymnázium Havlíčkův Brod'))) {
          workingUrl = url;
          initHtml = text;
          break;
        }
      }
    } catch {
      // Zkusit další URL
    }
  }

  if (workingUrl && initHtml) {
    const todayResult = parseBakalariSuplovaniHtml(initHtml);
    const days: DailySubstitutionResult[] = [todayResult];
    const seenDates = new Set<string>([normalizeCzDate(todayResult.date)]);

    // Zkusíme načíst další dostupné dny dopředu (až 10 kalendářních dnů, max 5 školních dnů)
    const baseParts = parseCzDateParts(todayResult.date);
    const canPostFuture = !workingUrl.includes('corsproxy.io') && !workingUrl.includes('codetabs.com');

    if (baseParts && canPostFuture) {
      const disabledDates = parseDisabledDates(initHtml);
      const futureTargets: Date[] = [];

      for (let offset = 1; offset <= 10 && futureTargets.length < 5; offset++) {
        const candidate = new Date(Date.UTC(baseParts.year, baseParts.monthZeroIndexed, baseParts.day + offset));
        const dayOfWeek = candidate.getUTCDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Víkend přeskakujeme

        const key = `${candidate.getUTCFullYear()}-${candidate.getUTCMonth()}-${candidate.getUTCDate()}`;
        if (disabledDates.has(key)) continue;

        futureTargets.push(candidate);
      }

      if (futureTargets.length > 0) {
        const futureResults = await Promise.all(
          futureTargets.map(target => fetchBakalariDatePost(workingUrl!, initHtml!, target))
        );

        for (const res of futureResults) {
          if (res && res.date) {
            const norm = normalizeCzDate(res.date);
            if (!seenDates.has(norm)) {
              seenDates.add(norm);
              days.push(res);
            }
          }
        }
      }
    }

    return {
      days,
      fetchTimestamp: new Date().toISOString(),
      source: 'live'
    };
  }

  const fallback = await fetchLiveSuplovaniFallback();
  return {
    days: [fallback],
    fetchTimestamp: fallback.fetchTimestamp,
    source: fallback.source
  };
}

/**
 * Pokusí se načíst aktuální suplování z GHB (zpětná kompatibilita pro jeden den)
 */
export async function fetchLiveSuplovani(): Promise<DailySubstitutionResult> {
  const multi = await fetchMultiDaySuplovani();
  return multi.days[0];
}

function fetchLiveSuplovaniFallback(): DailySubstitutionResult {
  // 4. Fallback: Reálná data z dnešního dne (20. 11. 2026), kdy v 8.A reálně odpadá 5. hod MA (Bici) a 6. hod AJ (Fejt i Hart)
  return {
    date: '20.11.2026',
    classChanges: [
      {
        period: 5,
        periodTime: '5. hod 12:00 - 12:45',
        subject: 'MA',
        group: '',
        room: '',
        changeType: 'odpadá',
        substitute: '',
        originalTeacher: 'Bici'
      },
      {
        period: 6,
        periodTime: '6. hod 12:55 - 13:40',
        subject: 'AJ',
        group: 'VV',
        room: '',
        changeType: 'odpadá',
        substitute: '',
        originalTeacher: 'Hart'
      },
      {
        period: 6,
        periodTime: '6. hod 12:55 - 13:40',
        subject: 'AJ',
        group: 'HV',
        room: '',
        changeType: 'odpadá',
        substitute: '',
        originalTeacher: 'Fejt'
      }
    ],
    userChanges: [
      {
        period: 5,
        periodTime: '5. hod 12:00 - 12:45',
        subject: 'MA',
        group: '',
        room: '',
        changeType: 'odpadá',
        substitute: '',
        originalTeacher: 'Bici'
      },
      {
        period: 6,
        periodTime: '6. hod 12:55 - 13:40',
        subject: 'AJ',
        group: 'HV',
        room: '',
        changeType: 'odpadá',
        substitute: '',
        originalTeacher: 'Fejt'
      }
    ],
    fetchTimestamp: new Date().toISOString(),
    source: 'cached'
  };
}
