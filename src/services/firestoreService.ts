import { 
  collection, 
  doc, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase';
import { Project, Section, Task, ChristmasGift, CalendarEvent, PendingCompensation, SchoolLessonEvent } from '../types';

// PROJECTS
export const subscribeProjects = (callback: (projects: Project[]) => void) => {
  const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const projects: Project[] = [];
    snapshot.forEach((doc) => {
      projects.push({ id: doc.id, ...doc.data() } as Project);
    });
    callback(projects);
  }, (err) => {
    console.error("subscribeProjects error:", err);
  });
};

export const createProject = async (data: Omit<Project, 'id' | 'createdAt'>) => {
  const docRef = await addDoc(collection(db, 'projects'), {
    ...data,
    createdAt: new Date().toISOString()
  });

  // Create a default section
  await addDoc(collection(db, 'sections'), {
    projectId: docRef.id,
    name: 'Obecné',
    order: 0
  });

  return docRef.id;
};

export const deleteProject = async (projectId: string) => {
  await deleteDoc(doc(db, 'projects', projectId));
};

export const addProjectMember = async (projectId: string, userUid: string) => {
  const projectRef = doc(db, 'projects', projectId);
  await updateDoc(projectRef, {
    members: arrayUnion(userUid)
  });
};

export const removeProjectMember = async (projectId: string, userUid: string) => {
  const projectRef = doc(db, 'projects', projectId);
  await updateDoc(projectRef, {
    members: arrayRemove(userUid)
  });
};

// SECTIONS
export const subscribeSections = (projectId: string, callback: (sections: Section[]) => void) => {
  const q = query(
    collection(db, 'sections'), 
    where('projectId', '==', projectId)
  );
  return onSnapshot(q, (snapshot) => {
    const sections: Section[] = [];
    snapshot.forEach((doc) => {
      sections.push({ id: doc.id, ...doc.data() } as Section);
    });
    sections.sort((a, b) => (a.order || 0) - (b.order || 0));
    callback(sections);
  }, (err) => {
    console.error("subscribeSections error:", err);
  });
};

export const createSection = async (projectId: string, name: string, order: number) => {
  return await addDoc(collection(db, 'sections'), {
    projectId,
    name,
    order
  });
};

export const deleteSection = async (sectionId: string) => {
  await deleteDoc(doc(db, 'sections', sectionId));
};

// TASKS
export const subscribeTasks = (projectId: string, callback: (tasks: Task[]) => void) => {
  const q = query(
    collection(db, 'tasks'), 
    where('projectId', '==', projectId)
  );
  return onSnapshot(q, (snapshot) => {
    const tasks: Task[] = [];
    snapshot.forEach((doc) => {
      tasks.push({ id: doc.id, ...doc.data() } as Task);
    });
    tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
    callback(tasks);
  }, (err) => {
    console.error("subscribeTasks error:", err);
  });
};

export const createTask = async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
  const now = new Date().toISOString();
  return await addDoc(collection(db, 'tasks'), {
    ...task,
    createdAt: now,
    updatedAt: now
  });
};

export const updateTask = async (taskId: string, data: Partial<Task>) => {
  const taskRef = doc(db, 'tasks', taskId);
  await updateDoc(taskRef, {
    ...data,
    updatedAt: new Date().toISOString()
  });
};

export const deleteTask = async (taskId: string) => {
  await deleteDoc(doc(db, 'tasks', taskId));
};

// CHRISTMAS GIFTS (Robust Storage with LocalStorage fallback & sync)
const getStorageKey = (userId: string) => `christmas_gifts_${userId}`;

const getLocalGifts = (userId: string): ChristmasGift[] => {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const saveLocalGifts = (userId: string, gifts: ChristmasGift[]) => {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(gifts));
  } catch (e) {
    console.error("Error saving local gifts:", e);
  }
};

// Dispatch custom event to update subscribers locally across UI
const notifyGiftChange = (userId: string) => {
  window.dispatchEvent(new CustomEvent(`gifts_changed_${userId}`));
};

export const subscribeChristmasGifts = (userId: string, callback: (gifts: ChristmasGift[]) => void) => {
  // First, immediately return local cached gifts
  let currentGifts = getLocalGifts(userId);
  callback(currentGifts);

  // Listen to local storage changes
  const handleLocalChange = () => {
    currentGifts = getLocalGifts(userId);
    callback(currentGifts);
  };
  window.addEventListener(`gifts_changed_${userId}`, handleLocalChange);
  window.addEventListener('storage', handleLocalChange);

  // Also try Firestore subcollection / collection if rules permit, seamlessly merging
  let unsubFirestore: (() => void) | null = null;
  try {
    const q = query(collection(db, 'christmas_gifts'), where('userId', '==', userId));
    unsubFirestore = onSnapshot(q, (snapshot) => {
      const remoteGifts: ChristmasGift[] = [];
      snapshot.forEach((doc) => {
        remoteGifts.push({ id: doc.id, ...doc.data() } as ChristmasGift);
      });
      if (remoteGifts.length > 0) {
        saveLocalGifts(userId, remoteGifts);
        callback(remoteGifts);
      }
    }, () => {
      // Permission denied or offline -> Fallback gracefully to LocalStorage without error!
      callback(getLocalGifts(userId));
    });
  } catch {
    callback(getLocalGifts(userId));
  }

  return () => {
    window.removeEventListener(`gifts_changed_${userId}`, handleLocalChange);
    window.removeEventListener('storage', handleLocalChange);
    if (unsubFirestore) unsubFirestore();
  };
};

export const createChristmasGift = async (gift: Omit<ChristmasGift, 'id' | 'createdAt'>) => {
  const now = new Date().toISOString();
  const giftId = 'gift_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  const newGift: ChristmasGift = {
    id: giftId,
    userId: gift.userId,
    recipient: gift.recipient,
    title: gift.title,
    status: gift.status,
    price: gift.price,
    link: gift.link,
    notes: gift.notes,
    createdAt: now
  };

  // 1. Save locally immediately (100% reliable)
  const localList = getLocalGifts(gift.userId);
  localList.unshift(newGift);
  saveLocalGifts(gift.userId, localList);
  notifyGiftChange(gift.userId);

  // 2. Best-effort background sync to Firestore
  try {
    const payload: Record<string, any> = {
      userId: gift.userId,
      recipient: gift.recipient,
      title: gift.title,
      status: gift.status,
      createdAt: now
    };
    if (gift.price !== undefined) payload.price = gift.price;
    if (gift.link !== undefined) payload.link = gift.link;
    if (gift.notes !== undefined) payload.notes = gift.notes;
    
    await addDoc(collection(db, 'christmas_gifts'), payload);
  } catch (err) {
    console.warn("Firestore sync not available, saved locally:", err);
  }

  return giftId;
};

export const updateChristmasGift = async (giftId: string, data: Partial<ChristmasGift>) => {
  // 1. Update locally first
  // Find which user owns this gift
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('christmas_gifts_')) {
      const userId = key.replace('christmas_gifts_', '');
      const gifts = getLocalGifts(userId);
      const index = gifts.findIndex(g => g.id === giftId);
      if (index !== -1) {
        gifts[index] = { ...gifts[index], ...data };
        saveLocalGifts(userId, gifts);
        notifyGiftChange(userId);
        break;
      }
    }
  }

  // 2. Best-effort Firestore update
  try {
    const giftRef = doc(db, 'christmas_gifts', giftId);
    const payload: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) payload[key] = value;
    }
    await updateDoc(giftRef, payload);
  } catch (err) {
    console.warn("Firestore update skipped, stored locally:", err);
  }
};

export const deleteChristmasGift = async (giftId: string) => {
  // 1. Delete locally
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('christmas_gifts_')) {
      const userId = key.replace('christmas_gifts_', '');
      const gifts = getLocalGifts(userId);
      const filtered = gifts.filter(g => g.id !== giftId);
      if (filtered.length !== gifts.length) {
        saveLocalGifts(userId, filtered);
        notifyGiftChange(userId);
        break;
      }
    }
  }

  // 2. Best-effort Firestore delete
  try {
    await deleteDoc(doc(db, 'christmas_gifts', giftId));
  } catch (err) {
    console.warn("Firestore delete skipped, deleted locally:", err);
  }
};

// ==========================================
// PENDING COMPENSATIONS (Chybějící hodiny k nahrazení)
// ==========================================
const getCompensationsStorageKey = (userId: string) => `pending_compensations_${userId}`;

export const getLocalPendingCompensations = (userId: string): PendingCompensation[] => {
  try {
    const raw = localStorage.getItem(getCompensationsStorageKey(userId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export const saveLocalPendingCompensations = (userId: string, comps: PendingCompensation[]) => {
  try {
    localStorage.setItem(getCompensationsStorageKey(userId), JSON.stringify(comps));
    window.dispatchEvent(new CustomEvent(`pending_compensations_changed_${userId}`));
  } catch (e) {
    console.error("Error saving pending compensations:", e);
  }
};

export const addPendingCompensation = (comp: Omit<PendingCompensation, 'id' | 'cancelledAt'>) => {
  const list = getLocalPendingCompensations(comp.userId);
  const newComp: PendingCompensation = {
    ...comp,
    id: 'comp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    cancelledAt: new Date().toISOString()
  };
  list.push(newComp);
  saveLocalPendingCompensations(comp.userId, list);
  return newComp;
};

export const removePendingCompensation = (userId: string, compId: string) => {
  const list = getLocalPendingCompensations(userId);
  const filtered = list.filter(c => c.id !== compId);
  saveLocalPendingCompensations(userId, filtered);
};
const getCalendarStorageKey = (userId: string) => `calendar_events_${userId}`;

/**
 * Zkontroluje a aktualizuje stavy hodin doučování:
 * 1. Hodiny bez stavu dostanou stav 'unprepared'.
 * 2. Pokud již nadešel čas konce hodiny:
 *    - 'unprepared' nebo 'prepared' u firmy -> automaticky přepne na 'unrecorded' ("nezapsáno")
 *    - 'unprepared' nebo 'prepared' u soukromého -> automaticky přepne na 'unpaid' ("nezaplaceno")
 */
export const syncTutoringStatuses = (events: CalendarEvent[]): { events: CalendarEvent[]; changed: boolean } => {
  const now = new Date();
  let changed = false;

  const updatedEvents = events.map(ev => {
    if (ev.category !== 'tutoring' || !ev.tutoring) return ev;

    const tut = { ...ev.tutoring };
    let evChanged = false;

    // Pokud ještě nemá žádný stav, výchozí je 'unprepared'
    if (!tut.status) {
      tut.status = 'unprepared';
      evChanged = true;
    }

    // Zkontrolujeme, zda již skončil čas hodiny
    const [year, month, day] = ev.date.split('-').map(Number);
    let endH = 23, endM = 59;
    if (ev.endTime) {
      const parts = ev.endTime.split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        endH = parts[0];
        endM = parts[1];
      }
    } else if (ev.startTime) {
      const parts = ev.startTime.split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        endH = parts[0] + 1; // výchozí 60 min
        endM = parts[1];
      }
    }

    const eventEndDate = new Date(year, month - 1, day, endH, endM, 0);

    // Pokud už hodina skončila a je stále ve stavu před hodinou (unprepared / prepared)
    if (now > eventEndDate && (tut.status === 'unprepared' || tut.status === 'prepared')) {
      if (tut.type === 'company') {
        tut.status = 'unrecorded';
        evChanged = true;
      } else {
        tut.status = 'unpaid';
        evChanged = true;
      }
    }

    if (evChanged) {
      changed = true;
      return { ...ev, tutoring: tut };
    }
    return ev;
  });

  return { events: updatedEvents, changed };
};

const getLocalCalendarEvents = (userId: string): CalendarEvent[] => {
  try {
    const raw = localStorage.getItem(getCalendarStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const { events: syncd, changed } = syncTutoringStatuses(parsed);
    if (changed) {
      saveLocalCalendarEvents(userId, syncd);
    }
    return syncd;
  } catch {
    return [];
  }
};

const saveLocalCalendarEvents = (userId: string, events: CalendarEvent[]) => {
  try {
    localStorage.setItem(getCalendarStorageKey(userId), JSON.stringify(events));
  } catch (e) {
    console.error("Error saving local calendar events:", e);
  }
};

const notifyCalendarChange = (userId: string) => {
  window.dispatchEvent(new CustomEvent(`calendar_events_changed_${userId}`));
};

export const subscribeCalendarEvents = (userId: string, callback: (events: CalendarEvent[]) => void) => {
  // 1. Return immediately cached data
  let currentEvents = getLocalCalendarEvents(userId);
  callback(currentEvents);

  const handleLocalChange = () => {
    currentEvents = getLocalCalendarEvents(userId);
    callback(currentEvents);
  };

  window.addEventListener(`calendar_events_changed_${userId}`, handleLocalChange);
  window.addEventListener('storage', handleLocalChange);

  // 2. Sync with Firestore if possible
  let unsubFirestore: (() => void) | null = null;
  try {
    const q = query(collection(db, 'calendar_events'), where('userId', '==', userId));
    unsubFirestore = onSnapshot(q, (snapshot) => {
      const remoteEvents: CalendarEvent[] = [];
      snapshot.forEach((doc) => {
        remoteEvents.push({ id: doc.id, ...doc.data() } as CalendarEvent);
      });
      if (remoteEvents.length > 0) {
        // Merge remote with local so any freshly edited local attributes aren't regressed by stale Firestore reads
        const localList = getLocalCalendarEvents(userId);
        const localMap = new Map(localList.map(e => [e.id, e]));

        // Detect if there are duplicates for the same day and category
        const merged: CalendarEvent[] = [];
        const seenKeys = new Set<string>();

        // We give priority to local modifications if the local timestamp or event matches
        for (const rem of remoteEvents) {
          const loc = localMap.get(rem.id);
          const finalEv = loc ? { ...rem, ...loc } : rem;
          
          const uniqueKey = `${finalEv.date}_${finalEv.title}_${finalEv.category}`;
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            merged.push(finalEv);
          }
        }

        // Add any local events that are not yet in remote
        for (const loc of localList) {
          const uniqueKey = `${loc.date}_${loc.title}_${loc.category}`;
          if (!seenKeys.has(uniqueKey) && !remoteEvents.some(r => r.id === loc.id)) {
            seenKeys.add(uniqueKey);
            merged.push(loc);
          }
        }

        const { events: syncd } = syncTutoringStatuses(merged);
        saveLocalCalendarEvents(userId, syncd);
        callback(syncd);
      }
    }, () => {
      callback(getLocalCalendarEvents(userId));
    });
  } catch {
    callback(getLocalCalendarEvents(userId));
  }

  return () => {
    window.removeEventListener(`calendar_events_changed_${userId}`, handleLocalChange);
    window.removeEventListener('storage', handleLocalChange);
    if (unsubFirestore) unsubFirestore();
  };
};

export const createCalendarEvent = async (event: Omit<CalendarEvent, 'id' | 'createdAt'>) => {
  const now = new Date().toISOString();
  const eventId = 'cal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  const newEvent: CalendarEvent = {
    id: eventId,
    userId: event.userId,
    title: event.title,
    description: event.description,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    color: event.color || 'blue',
    category: event.category || 'event',
    tutoring: event.tutoring,
    recurringSeriesId: event.recurringSeriesId,
    isDone: event.isDone || false,
    createdAt: now
  };

  // 1. Save locally
  const localList = getLocalCalendarEvents(event.userId);
  localList.push(newEvent);
  saveLocalCalendarEvents(event.userId, localList);
  notifyCalendarChange(event.userId);

  // 2. Best-effort Firestore sync
  try {
    const payload: Record<string, any> = {
      userId: event.userId,
      title: event.title,
      date: event.date,
      color: event.color || 'blue',
      category: event.category || 'event',
      isDone: event.isDone || false,
      createdAt: now
    };
    if (event.description) payload.description = event.description;
    if (event.startTime) payload.startTime = event.startTime;
    if (event.endTime) payload.endTime = event.endTime;
    if (event.tutoring) payload.tutoring = event.tutoring;
    if (event.recurringSeriesId) payload.recurringSeriesId = event.recurringSeriesId;

    await setDoc(doc(db, 'calendar_events', eventId), payload);
  } catch (err) {
    console.warn("Firestore sync not available, stored locally:", err);
  }

  return eventId;
};

export const updateCalendarEvent = async (eventId: string, data: Partial<CalendarEvent>) => {
  // 1. Update locally
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('calendar_events_')) {
      const userId = key.replace('calendar_events_', '');
      const events = getLocalCalendarEvents(userId);
      const index = events.findIndex(e => e.id === eventId);
      if (index !== -1) {
        events[index] = { ...events[index], ...data };
        saveLocalCalendarEvents(userId, events);
        notifyCalendarChange(userId);
        break;
      }
    }
  }

  // 2. Best-effort Firestore update
  try {
    const docRef = doc(db, 'calendar_events', eventId);
    const payload: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) payload[k] = v;
    }
    // Pokud je přítomno tutoring, zkontrolujeme, že se status uloží a nepřepíše
    if (data.tutoring) {
      payload.tutoring = data.tutoring;
    }
    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    console.warn("Firestore update skipped, stored locally:", err);
  }
};

export const deleteCalendarEvent = async (eventId: string) => {
  // 1. Delete locally
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('calendar_events_')) {
      const userId = key.replace('calendar_events_', '');
      const events = getLocalCalendarEvents(userId);
      const filtered = events.filter(e => e.id !== eventId);
      if (filtered.length !== events.length) {
        saveLocalCalendarEvents(userId, filtered);
        notifyCalendarChange(userId);
        break;
      }
    }
  }

  // 2. Best-effort Firestore delete
  try {
    await deleteDoc(doc(db, 'calendar_events', eventId));
  } catch (err) {
    console.warn("Firestore delete skipped, deleted locally:", err);
  }
};

/**
 * Přeuspořádá střídavé předměty (např. M, ČJ) v celé budoucí sérii doučování po změně, smazání nebo přidání lekce.
 * Pokud je zadáno seriesId, přeuspořádá danou sérii.
 * Pokud seriesId není k dispozici, ale je zadán studentColor, najde a přeuspořádá všechny lekce daného studenta.
 */
export const rebalanceTutoringSeries = async (
  seriesIdOrParam: string | { seriesId?: string; studentColor?: string },
  userId: string
) => {
  const allEvents = getLocalCalendarEvents(userId);
  const seriesId = typeof seriesIdOrParam === 'string' ? seriesIdOrParam : seriesIdOrParam.seriesId;
  const studentColor = typeof seriesIdOrParam === 'object' ? seriesIdOrParam.studentColor : undefined;

  let relevantEvents: CalendarEvent[] = [];
  if (seriesId) {
    relevantEvents = allEvents.filter(e => e.recurringSeriesId === seriesId || (studentColor && e.tutoring?.studentColor?.trim().toLowerCase() === studentColor.trim().toLowerCase()));
  } else if (studentColor) {
    relevantEvents = allEvents.filter(e => e.category === 'tutoring' && e.tutoring?.studentColor?.trim().toLowerCase() === studentColor.trim().toLowerCase());
  }

  if (relevantEvents.length === 0) return;

  // Najdeme vzor střídání (např. ["M", "ČJ"]) z událostí, které mají sequencePattern definovaný
  const evWithPattern = relevantEvents.find(e => e.tutoring?.sequencePattern && e.tutoring.sequencePattern.length >= 2);
  const pattern = evWithPattern?.tutoring?.sequencePattern;
  
  // Pokud student nemá žádné nastavené střídání (např. má jen pevnou matematiku), není co přeuspořádávat
  if (!pattern || pattern.length < 2) return;

  const targetSeriesId = seriesId || evWithPattern?.recurringSeriesId;

  // Seřadíme chronologicky
  relevantEvents.sort((a, b) => {
    const cmpDate = a.date.localeCompare(b.date);
    if (cmpDate !== 0) return cmpDate;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  // Určíme výchozí předmět:
  // Pokud existuje první lekce v sérii s daným indexem 0, nebo vezmeme předmět první lekce
  // Zjistíme, jestli první lekce má specifický počátek
  let patternIdx = 0;
  const firstEvent = relevantEvents[0];
  if (firstEvent.tutoring?.subject) {
    const startIdxInPattern = pattern.indexOf(firstEvent.tutoring.subject);
    if (startIdxInPattern !== -1) {
      patternIdx = startIdxInPattern;
    }
  }

  // Projdeme události a zajistíme striktní střídání vzoru
  for (let i = 0; i < relevantEvents.length; i++) {
    const ev = relevantEvents[i];
    const expectedSubject = pattern[patternIdx % pattern.length];
    const colorName = ev.tutoring?.studentColor || studentColor || 'červená';
    const newTitle = `Doučování ${expectedSubject} (${colorName})`;

    const needsSubjectUpdate = ev.tutoring && ev.tutoring.subject !== expectedSubject;
    const needsTitleUpdate = ev.title !== newTitle;
    const needsSeriesId = targetSeriesId && ev.recurringSeriesId !== targetSeriesId;

    if (needsSubjectUpdate || needsTitleUpdate || needsSeriesId) {
      const updatedTutoring = {
        ...ev.tutoring!,
        studentColor: colorName,
        subject: expectedSubject,
        sequenceIndex: i,
        sequencePattern: pattern,
        status: ev.tutoring?.status // Explicitně zachováme stav (např. 'recorded', 'paid' apod.)
      };
      await updateCalendarEvent(ev.id, {
        title: newTitle,
        recurringSeriesId: ev.recurringSeriesId || targetSeriesId,
        tutoring: updatedTutoring
      });
    }
    patternIdx++;
  }
};

/**
 * Zajistí přidání jednorázové středeční hodiny Matematiky pro studenta červená, pokud ještě v kalendáři chybí,
 * a správně zkalibruje střídání předmětů.
 */
export const ensureWednesdayLessonForRedStudent = async (_userId: string) => {
  // Deprecated: No-op to prevent creating or overriding Wednesday lessons with default 16:30
  return;
};

/**
 * Zajistí pondělní doučování studenta modrá (18:00 - 19:00, 60 minut, průběžné, kancl) pro každé pondělí
 * a upraví i existující minulé/budoucí pondělní lekce z 18:30 (nebo 30min) na 18:00 - 19:00.
 */
export const ensureMondayLessonsForBlueStudent = async (userId: string) => {
  const allEvents = getLocalCalendarEvents(userId);
  let updated = false;

  // 1. Zkontrolujeme existující pondělní doučování studenta modrá a upravíme na 18:00 - 19:00 (v kanclu, protože končí v 19:00)
  for (let i = 0; i < allEvents.length; i++) {
    const ev = allEvents[i];
    const isBlue = ev.tutoring?.studentColor?.toLowerCase().includes('modr') || ev.title.toLowerCase().includes('modr');
    if (ev.category === 'tutoring' && isBlue) {
      const d = new Date(ev.date + 'T12:00:00');
      if (d.getDay() === 1) { // Pondělí
        if (ev.startTime !== '18:00' || ev.endTime !== '19:00' || ev.tutoring?.place !== 'office') {
          allEvents[i] = {
            ...ev,
            startTime: '18:00',
            endTime: '19:00',
            tutoring: {
              ...ev.tutoring!,
              place: 'office',
              goal: 'continuous'
            }
          };
          updated = true;
        }
      }
    }
  }

  // 2. Zkontrolujeme, zda existuje série pro modrého studenta na pondělky až do konce školního roku
  const blueMondayEvents = allEvents.filter(ev => {
    const isBlue = ev.tutoring?.studentColor?.toLowerCase().includes('modr') || ev.title.toLowerCase().includes('modr');
    if (ev.category !== 'tutoring' || !isBlue) return false;
    const d = new Date(ev.date + 'T12:00:00');
    return d.getDay() === 1;
  });

  if (blueMondayEvents.length === 0) {
    // Vytvoříme pondělní doučování pro studenta modrá od aktuálního týdne do konce školního roku (30. 6.)
    const now = new Date();
    const curYear = now.getFullYear();
    const endYear = (now.getMonth() + 1) >= 9 ? curYear + 1 : curYear;
    const schoolYearEnd = new Date(endYear, 5, 30, 23, 59, 59);

    // Najdeme nejbližší pondělí (pondělí v aktuálním týdnu)
    const currentMon = new Date(now);
    const day = currentMon.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    currentMon.setDate(currentMon.getDate() + diff);
    currentMon.setHours(0, 0, 0, 0);

    const seriesId = 'series_blue_monday_' + Date.now();
    let iter = new Date(currentMon);
    let seqIdx = 0;

    while (iter <= schoolYearEnd) {
      const dateStr = iter.toISOString().split('T')[0];
      const newEv: CalendarEvent = {
        id: 'cal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        userId,
        title: 'Doučování M (modrá)',
        date: dateStr,
        startTime: '18:00',
        endTime: '19:00',
        color: 'blue',
        category: 'tutoring',
        tutoring: {
          studentColor: 'modrá',
          type: 'company',
          place: 'office',
          goal: 'continuous',
          subject: 'M',
          sequencePattern: ['M'],
          sequenceIndex: seqIdx,
          status: 'unprepared'
        },
        recurringSeriesId: seriesId,
        isDone: false,
        createdAt: new Date().toISOString()
      };
      allEvents.push(newEv);
      seqIdx++;
      updated = true;
      iter.setDate(iter.getDate() + 7);
    }
  }

  if (updated) {
    saveLocalCalendarEvents(userId, allEvents);
    notifyCalendarChange(userId);
  }
};

/**
 * Označí existující doučování studenta (např. modrá) jako průběžná (goal = 'continuous').
 */
export const markTutoringAsContinuousForStudent = (userId: string, studentColorName: string) => {
  const allEvents = getLocalCalendarEvents(userId);
  let updated = false;

  for (let i = 0; i < allEvents.length; i++) {
    const ev = allEvents[i];
    const match = ev.tutoring?.studentColor?.toLowerCase().includes(studentColorName.toLowerCase()) ||
      ev.title.toLowerCase().includes(studentColorName.toLowerCase());
    
    if (match && ev.tutoring && ev.tutoring.goal !== 'continuous') {
      allEvents[i] = {
        ...ev,
        tutoring: {
          ...ev.tutoring,
          goal: 'continuous'
        }
      };
      updated = true;
    }
  }

  if (updated) {
    saveLocalCalendarEvents(userId, allEvents);
    notifyCalendarChange(userId);
  }
};

// SCHOOL LESSON EVENTS (Písemka, Zkoušení, Domácí úkol na konkrétní hodinu)
const getSchoolEventsKey = (userId: string) => `school_lesson_events_${userId}`;

export const getLocalSchoolEvents = (userId: string): SchoolLessonEvent[] => {
  try {
    const raw = localStorage.getItem(getSchoolEventsKey(userId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export const saveLocalSchoolEvents = (userId: string, events: SchoolLessonEvent[]) => {
  try {
    localStorage.setItem(getSchoolEventsKey(userId), JSON.stringify(events));
  } catch (e) {
    console.error("Error saving local school events:", e);
  }
};

const notifySchoolEventsChange = (userId: string) => {
  window.dispatchEvent(new CustomEvent(`school_events_changed_${userId}`));
};

export const subscribeSchoolEvents = (userId: string, callback: (events: SchoolLessonEvent[]) => void) => {
  const current = getLocalSchoolEvents(userId);
  callback(current);

  const handler = () => {
    callback(getLocalSchoolEvents(userId));
  };

  window.addEventListener(`school_events_changed_${userId}`, handler);
  window.addEventListener('storage', handler);

  return () => {
    window.removeEventListener(`school_events_changed_${userId}`, handler);
    window.removeEventListener('storage', handler);
  };
};

export const createSchoolEvent = async (data: Omit<SchoolLessonEvent, 'id' | 'createdAt'>, userId: string): Promise<string> => {
  const id = 'school_ev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  const newEv: SchoolLessonEvent = {
    ...data,
    id,
    createdAt: new Date().toISOString()
  };

  const list = getLocalSchoolEvents(userId);
  list.push(newEv);
  saveLocalSchoolEvents(userId, list);
  notifySchoolEventsChange(userId);
  return id;
};

export const updateSchoolEvent = async (id: string, updates: Partial<SchoolLessonEvent>, userId: string): Promise<void> => {
  const list = getLocalSchoolEvents(userId);
  const idx = list.findIndex(e => e.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    saveLocalSchoolEvents(userId, list);
    notifySchoolEventsChange(userId);
  }
};

export const deleteSchoolEvent = async (id: string, userId: string): Promise<void> => {
  const list = getLocalSchoolEvents(userId);
  const filtered = list.filter(e => e.id !== id);
  saveLocalSchoolEvents(userId, filtered);
  notifySchoolEventsChange(userId);
};

