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
 * Creates realistic student team projects with neutral member names
 */
export const seedSampleData = async (currentUserId: string, currentUserName: string) => {
  // Neutral student team members
  const demoUsers = [
    { uid: 'student_1', email: 'alex@student.cz', displayName: 'Alex' },
    { uid: 'student_2', email: 'sam@student.cz', displayName: 'Sam' },
    { uid: 'student_3', email: 'taylor@student.cz', displayName: 'Taylor' },
  ];

  for (const u of demoUsers) {
    await setDoc(doc(db, 'users', u.uid), u, { merge: true });
  }

  if (currentUserId) {
    await setDoc(doc(db, 'users', currentUserId), {
      uid: currentUserId,
      email: `${currentUserId.slice(0, 5)}@student.cz`,
      displayName: currentUserName || 'Já (Student)'
    }, { merge: true });
  }

  const allMembers = [currentUserId, 'student_1', 'student_2', 'student_3'].filter(Boolean);

  const today = new Date();
  const formatYMD = (d: Date) => d.toISOString().split('T')[0];

  const pastDate = new Date(today);
  pastDate.setDate(today.getDate() - 2);

  const todayDate = new Date(today);

  const nearDate = new Date(today);
  nearDate.setDate(today.getDate() + 2);

  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + 7);

  // Projekt 1: Studentský semestrální projekt
  const proj1 = await addDoc(collection(db, 'projects'), {
    name: 'Studentský ročníkový projekt',
    description: 'Společná týmová práce – příprava rešerše, praktické části a závěrečné prezentace.',
    ownerId: currentUserId || 'student_1',
    members: allMembers,
    createdAt: new Date().toISOString()
  });

  const secReserse = await addDoc(collection(db, 'sections'), {
    projectId: proj1.id,
    name: 'Teoretická část & Rešerše',
    order: 0
  });

  const secPraxe = await addDoc(collection(db, 'sections'), {
    projectId: proj1.id,
    name: 'Praktická realizace',
    order: 1
  });

  const secPrezentace = await addDoc(collection(db, 'sections'), {
    projectId: proj1.id,
    name: 'Prezentace & Obhajoba',
    order: 2
  });

  // Úkoly k projektu 1
  await createTask({
    projectId: proj1.id,
    sectionId: secReserse.id,
    title: 'Vyhledat odbornou literaturu a zdroje',
    description: 'Sehnat podklady k tématu, vytvořit seznam citací a shrnutí poznatků.',
    status: 'done',
    priority: 'medium',
    deadline: formatYMD(pastDate),
    assigneeId: 'student_2',
    order: 0,
    subtasks: [
      { id: 'st_1', title: 'Projít knihovnu a články', completed: true },
      { id: 'st_2', title: 'Zapsat citace do dokumentu', completed: true }
    ]
  });

  await createTask({
    projectId: proj1.id,
    sectionId: secPraxe.id,
    title: 'Zpracování dat a praktických výstupů',
    description: 'Vyhodnotit naměřené výsledky nebo vytvořit funkční prototyp řešení.',
    status: 'in_progress',
    priority: 'high',
    deadline: formatYMD(todayDate),
    assigneeId: 'student_1',
    order: 0,
    subtasks: [
      { id: 'st_3', title: 'Příprava tabulky a grafů', completed: true },
      { id: 'st_4', title: 'Sepsání závěrů k výsledkům', completed: false }
    ]
  });

  await createTask({
    projectId: proj1.id,
    sectionId: secPrezentace.id,
    title: 'Vytvořit snímky v prezentaci',
    description: 'Strukturovat prezentaci na cca 10 minut včetně ukázky a otázek k diskuzi.',
    status: 'todo',
    priority: 'high',
    deadline: formatYMD(nearDate),
    assigneeId: currentUserId || 'student_3',
    order: 0,
    subtasks: [
      { id: 'st_5', title: 'Rozvržení obsahu slajdů', completed: true },
      { id: 'st_6', title: 'Grafické sjednocení a finální zkouška', completed: false }
    ]
  });

  await createTask({
    projectId: proj1.id,
    sectionId: secPrezentace.id,
    title: 'Kontrola zadání a formálních náležitostí',
    description: 'Ověřit shodu se šablonou a požadavky vyučujícího před odevzdáním.',
    status: 'todo',
    priority: 'low',
    deadline: formatYMD(futureDate),
    assigneeId: 'student_3',
    order: 1,
    subtasks: []
  });

  // Projekt 2: Příprava na maturitní / zkouškový týden
  const proj2 = await addDoc(collection(db, 'projects'), {
    name: 'Příprava na zkouškové období',
    description: 'Týmové sdílení zápisků, témat k opakování a harmonogram učení.',
    ownerId: currentUserId || 'student_3',
    members: allMembers,
    createdAt: new Date(Date.now() - 3600000).toISOString()
  });

  const secMaterialy = await addDoc(collection(db, 'sections'), {
    projectId: proj2.id,
    name: 'Materiály & Výpisky',
    order: 0
  });

  const secOpakovani = await addDoc(collection(db, 'sections'), {
    projectId: proj2.id,
    name: 'Okruhy otázek',
    order: 1
  });

  await createTask({
    projectId: proj2.id,
    sectionId: secMaterialy.id,
    title: 'Skenovat a nasdílet společné zápisky',
    description: 'Doplnit chybějící hodiny a uložit výpisky na sdílený disk.',
    status: 'in_progress',
    priority: 'medium',
    deadline: formatYMD(todayDate),
    assigneeId: 'student_2',
    order: 0,
    subtasks: [
      { id: 'st_7', title: 'Sebrat zápisky z celého pololetí', completed: true },
      { id: 'st_8', title: 'Nahrát do složky', completed: false }
    ]
  });

  await createTask({
    projectId: proj2.id,
    sectionId: secOpakovani.id,
    title: 'Projít testové otázky z minulých ročníků',
    description: 'Zkušební test na čas pro ověření znalostí.',
    status: 'todo',
    priority: 'high',
    deadline: formatYMD(pastDate), // Zobrazí se jako po termínu
    assigneeId: 'student_1',
    order: 0,
    subtasks: []
  });
};
