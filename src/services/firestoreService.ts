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
import { Project, Section, Task } from '../types';

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

/**
 * Creates clean, professional sample projects with neutral member accounts
 */
export const seedSampleData = async (currentUserId: string, currentUserName: string) => {
  // Neutral team members
  const demoUsers = [
    { uid: 'user_alex', email: 'alex@team.io', displayName: 'Alex' },
    { uid: 'user_sam', email: 'sam@team.io', displayName: 'Sam' },
    { uid: 'user_taylor', email: 'taylor@team.io', displayName: 'Taylor' },
  ];

  for (const u of demoUsers) {
    await setDoc(doc(db, 'users', u.uid), u, { merge: true });
  }

  if (currentUserId) {
    await setDoc(doc(db, 'users', currentUserId), {
      uid: currentUserId,
      email: `${currentUserId.slice(0, 5)}@team.io`,
      displayName: currentUserName || 'Vy'
    }, { merge: true });
  }

  const allMembers = [currentUserId, 'user_alex', 'user_sam', 'user_taylor'].filter(Boolean);

  const today = new Date();
  const formatYMD = (d: Date) => d.toISOString().split('T')[0];

  const pastDate = new Date(today);
  pastDate.setDate(today.getDate() - 2);

  const todayDate = new Date(today);

  const nearDate = new Date(today);
  nearDate.setDate(today.getDate() + 2);

  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + 7);

  // Projekt 1: Redesign webové platformy
  const proj1 = await addDoc(collection(db, 'projects'), {
    name: 'Redesign webové platformy',
    description: 'Kompletní modernizace rozhraní, sjednocení komponent a optimalizace výkonu.',
    ownerId: currentUserId || 'user_alex',
    members: allMembers,
    createdAt: new Date().toISOString()
  });

  const secDesign = await addDoc(collection(db, 'sections'), {
    projectId: proj1.id,
    name: 'Design & UX',
    order: 0
  });

  const secFrontend = await addDoc(collection(db, 'sections'), {
    projectId: proj1.id,
    name: 'Frontend',
    order: 1
  });

  const secTesting = await addDoc(collection(db, 'sections'), {
    projectId: proj1.id,
    name: 'Testování',
    order: 2
  });

  // Úkoly k projektu 1
  await createTask({
    projectId: proj1.id,
    sectionId: secDesign.id,
    title: 'Příprava design systému',
    description: 'Definice barevné palety, typografie a stavů komponent.',
    status: 'done',
    priority: 'high',
    deadline: formatYMD(pastDate),
    assigneeId: 'user_taylor',
    order: 0,
    subtasks: [
      { id: 'st_1', title: 'Export barevné palety', completed: true },
      { id: 'st_2', title: 'Příprava typografie a tlačítek', completed: true }
    ]
  });

  await createTask({
    projectId: proj1.id,
    sectionId: secFrontend.id,
    title: 'Implementace responzivního layoutu',
    description: 'Mobilní a desktopové zobrazení hlavní navigace a panelů.',
    status: 'in_progress',
    priority: 'high',
    deadline: formatYMD(todayDate),
    assigneeId: 'user_alex',
    order: 0,
    subtasks: [
      { id: 'st_3', title: 'Desktop verze', completed: true },
      { id: 'st_4', title: 'Mobilní verze a menu', completed: false }
    ]
  });

  await createTask({
    projectId: proj1.id,
    sectionId: secFrontend.id,
    title: 'Integrace databáze a ukládání stavů',
    description: 'Propojení formulářů se synchronizací v reálném čase.',
    status: 'todo',
    priority: 'medium',
    deadline: formatYMD(nearDate),
    assigneeId: currentUserId || 'user_sam',
    order: 1,
    subtasks: [
      { id: 'st_5', title: 'Návrh schématu', completed: true },
      { id: 'st_6', title: 'Napojení query', completed: false }
    ]
  });

  await createTask({
    projectId: proj1.id,
    sectionId: secTesting.id,
    title: 'Uživatelské testování a feedback',
    description: 'Testování použitelnosti s první skupinou uživatelů.',
    status: 'todo',
    priority: 'low',
    deadline: formatYMD(futureDate),
    assigneeId: 'user_sam',
    order: 0,
    subtasks: []
  });

  // Projekt 2: Produktová kampaň Q4
  const proj2 = await addDoc(collection(db, 'projects'), {
    name: 'Produktová kampaň Q4',
    description: 'Příprava marketingových podkladů, newsletteru a vizuálů pro podzimní uvedení.',
    ownerId: currentUserId || 'user_taylor',
    members: allMembers,
    createdAt: new Date(Date.now() - 3600000).toISOString()
  });

  const secObsah = await addDoc(collection(db, 'sections'), {
    projectId: proj2.id,
    name: 'Obsah & Texty',
    order: 0
  });

  const secVizuály = await addDoc(collection(db, 'sections'), {
    projectId: proj2.id,
    name: 'Grafika & Média',
    order: 1
  });

  await createTask({
    projectId: proj2.id,
    sectionId: secObsah.id,
    title: 'Článek pro blog a sociální sítě',
    description: 'Představení klíčových novinek a funkcí pro uživatele.',
    status: 'in_progress',
    priority: 'medium',
    deadline: formatYMD(todayDate),
    assigneeId: 'user_sam',
    order: 0,
    subtasks: [
      { id: 'st_7', title: 'Návrh osnovy', completed: true },
      { id: 'st_8', title: 'Finální korektura', completed: false }
    ]
  });

  await createTask({
    projectId: proj2.id,
    sectionId: secVizuály.id,
    title: 'Sada promo bannerů',
    description: 'Vizuály pro kampaň ve standardních formátech.',
    status: 'todo',
    priority: 'high',
    deadline: formatYMD(pastDate), // Overdue v Timeline
    assigneeId: 'user_alex',
    order: 0,
    subtasks: []
  });
};
