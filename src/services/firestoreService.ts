import { 
  collection, 
  doc, 
  addDoc, 
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
import { Project, Section, Task, ChristmasGift, CalendarEvent } from '../types';

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
// CALENDAR EVENTS (Dual-layer: LocalStorage + Firestore sync)
// ==========================================
const getCalendarStorageKey = (userId: string) => `calendar_events_${userId}`;

const getLocalCalendarEvents = (userId: string): CalendarEvent[] => {
  try {
    const raw = localStorage.getItem(getCalendarStorageKey(userId));
    if (!raw) return [];
    return JSON.parse(raw);
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
        saveLocalCalendarEvents(userId, remoteEvents);
        callback(remoteEvents);
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

    await addDoc(collection(db, 'calendar_events'), payload);
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
    await updateDoc(docRef, payload);
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
