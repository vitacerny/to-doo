export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  members: string[]; // list of user uids
  createdAt: string;
}

export interface Section {
  id: string;
  projectId: string;
  name: string;
  order: number;
}

export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  sectionId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline?: string; // YYYY-MM-DD
  assigneeId?: string;
  order: number;
  subtasks: Subtask[];
  createdAt: string;
  updatedAt: string;
}

export type GiftStatus = 'idea' | 'to_buy' | 'bought' | 'wrapped';

export interface ChristmasGift {
  id: string;
  userId: string;
  recipient: string;        // Komu (např. Máma, Petr, Babička)
  title: string;            // Co za dárek (např. Knížka, Svetr)
  price?: number;           // Orientační / reálná cena v Kč
  status: GiftStatus;       // Nápad, Koupit, Koupeno, Zabaleno
  link?: string;            // Odkaz na e-shop
  notes?: string;           // Poznámka / velikost / barva
  createdAt: string;
}

export type EventCategory = 'event' | 'task' | 'meeting' | 'tutoring' | 'reminder' | 'personal';

export type TutoringType = 'private' | 'company'; // soukromé / firma
export type TutoringPlace = 'library' | 'office'; // knihovna / kancl

export interface TutoringDetails {
  studentColor: string; // např. "modrá", "červená", "zelená"
  type: TutoringType;
  place: TutoringPlace;
  subject: string; // "M", "ČJ", nebo vlastní
}

export interface CalendarEvent {
  id: string;
  userId: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm (např. "09:30")
  endTime?: string; // HH:mm (např. "11:00")
  color: string; // 'blue' | 'indigo' | 'purple' | 'emerald' | 'amber' | 'rose'
  category: EventCategory;
  tutoring?: TutoringDetails;
  isDone?: boolean;
  createdAt: string;
}

