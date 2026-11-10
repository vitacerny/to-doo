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
