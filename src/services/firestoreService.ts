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
  arrayRemove,
  getDocs
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
    name: 'Všeobecné',
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
 * Seeds a full demo project exactly matching the assignment specification
 * (Organizace školní akce -> Marketing, Organizace, Program -> Tasks -> Subtasks)
 */
export const seedSampleData = async (currentUserId: string, currentUserName: string) => {
  // 1. Ensure mock demo users exist in the 'users' collection so they can be assigned
  const demoUsers = [
    { uid: 'demo_adam', email: 'adam@skola.cz', displayName: 'Adam Novák' },
    { uid: 'demo_bara', email: 'bara@skola.cz', displayName: 'Bára Dvořáková' },
    { uid: 'demo_cyril', email: 'cyril@skola.cz', displayName: 'Cyril Černý' },
  ];

  for (const u of demoUsers) {
    await setDoc(doc(db, 'users', u.uid), u, { merge: true });
  }

  // Also ensure current user is registered in users list
  if (currentUserId) {
    await setDoc(doc(db, 'users', currentUserId), {
      uid: currentUserId,
      email: `${currentUserId.slice(0, 5)}@user.cz`,
      displayName: currentUserName || 'Já (Uživatel)'
    }, { merge: true });
  }

  const allMembers = [currentUserId, 'demo_adam', 'demo_bara', 'demo_cyril'].filter(Boolean);

  // Helper date calculation relative to today
  const today = new Date();
  const formatYMD = (d: Date) => d.toISOString().split('T')[0];

  const pastDate = new Date(today);
  pastDate.setDate(today.getDate() - 3);

  const todayDate = new Date(today);

  const nearDate = new Date(today);
  nearDate.setDate(today.getDate() + 2);

  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + 10);

  // 2. Create Project 1: "Organizace školní akce" (exact assignment example)
  const projRef1 = await addDoc(collection(db, 'projects'), {
    name: 'Organizace školní akce',
    description: 'Příprava maturitního plesu a studentského dne. Ukázkový projekt dle zadání specifikace SIN.',
    ownerId: currentUserId || 'demo_adam',
    members: allMembers,
    createdAt: new Date().toISOString()
  });

  // Sections for Project 1
  const secMarketing = await addDoc(collection(db, 'sections'), {
    projectId: projRef1.id,
    name: 'Marketing',
    order: 0
  });

  const secOrganizace = await addDoc(collection(db, 'sections'), {
    projectId: projRef1.id,
    name: 'Organizace & Logistika',
    order: 1
  });

  const secProgram = await addDoc(collection(db, 'sections'), {
    projectId: projRef1.id,
    name: 'Program & Hudba',
    order: 2
  });

  // Tasks for Project 1
  // Exact task from assignment: Připravit plakát (Marketing)
  await createTask({
    projectId: projRef1.id,
    sectionId: secMarketing.id,
    title: 'Připravit plakát',
    description: 'Vytvořit oficiální grafický vizuál pro tisk a sociální sítě dle zadání.',
    status: 'in_progress',
    priority: 'high',
    deadline: formatYMD(todayDate),
    assigneeId: 'demo_bara',
    order: 0,
    subtasks: [
      { id: 'sub_1', title: 'Vytvořit grafiku', completed: true },
      { id: 'sub_2', title: 'Schválit návrh s vedením', completed: false },
      { id: 'sub_3', title: 'Zadat do tisku', completed: false }
    ]
  });

  // Exact task from assignment: Zajistit prostory (Organizace)
  await createTask({
    projectId: projRef1.id,
    sectionId: secOrganizace.id,
    title: 'Zajistit prostory',
    description: 'Rezervace hlavního sálu a podpis nájemní smlouvy.',
    status: 'done',
    priority: 'high',
    deadline: formatYMD(pastDate),
    assigneeId: currentUserId || 'demo_adam',
    order: 0,
    subtasks: [
      { id: 'sub_4', title: 'Prohlídka sálu', completed: true },
      { id: 'sub_5', title: 'Podpis smlouvy a zaplacení zálohy', completed: true }
    ]
  });

  // Task: Propagace na sociálních sítích (Marketing, To Do, overdue demo)
  await createTask({
    projectId: projRef1.id,
    sectionId: secMarketing.id,
    title: 'Spustit kampaň na Instagramu',
    description: 'Publikovat příspěvky a spustit anketu pro studenty.',
    status: 'todo',
    priority: 'medium',
    deadline: formatYMD(pastDate), // Shows overdue in Timeline & Kanban
    assigneeId: 'demo_cyril',
    order: 0,
    subtasks: [
      { id: 'sub_6', title: 'Napsat texty k příspěvkům', completed: false },
      { id: 'sub_7', title: 'Naplánovat termíny zveřejnění', completed: false }
    ]
  });

  // Task: Domluvit kapelu a moderátora (Program, In Progress)
  await createTask({
    projectId: projRef1.id,
    sectionId: secProgram.id,
    title: 'Domluvit kapelu a moderátora',
    description: 'Kontaktovat studentskou kapelu a domluvit harmonogram vystoupení.',
    status: 'in_progress',
    priority: 'high',
    deadline: formatYMD(nearDate),
    assigneeId: 'demo_adam',
    order: 1,
    subtasks: [
      { id: 'sub_8', title: 'Oslovit kapelu', completed: true },
      { id: 'sub_9', title: 'Poptat moderátora akce', completed: false }
    ]
  });

  // Task: Zabezpečení občerstvení (Organizace, To Do)
  await createTask({
    projectId: projRef1.id,
    sectionId: secOrganizace.id,
    title: 'Zajistit catering a nápoje',
    description: 'Oslovit dodavatele občerstvení a dohodnout menu pro návštěvníky.',
    status: 'todo',
    priority: 'low',
    deadline: formatYMD(futureDate),
    assigneeId: currentUserId || 'demo_bara',
    order: 1,
    subtasks: []
  });

  // 3. Create Project 2: "Vývoj mobilní aplikace" (další ukázkový projekt pro předvedení)
  const projRef2 = await addDoc(collection(db, 'projects'), {
    name: 'Vývoj webového portálu',
    description: 'Týmový semestrální projekt – návrh rozhraní, backend architektura a testování.',
    ownerId: currentUserId || 'demo_adam',
    members: allMembers,
    createdAt: new Date(Date.now() - 3600000).toISOString()
  });

  const secUi = await addDoc(collection(db, 'sections'), {
    projectId: projRef2.id,
    name: 'UI / UX Design',
    order: 0
  });

  const secDev = await addDoc(collection(db, 'sections'), {
    projectId: projRef2.id,
    name: 'Frontend & Backend',
    order: 1
  });

  await createTask({
    projectId: projRef2.id,
    sectionId: secUi.id,
    title: 'Vytvořit wireframy v Figmě',
    description: 'Návrh komponent a wireframů všech hlavních obrazovek.',
    status: 'done',
    priority: 'medium',
    deadline: formatYMD(pastDate),
    assigneeId: 'demo_bara',
    order: 0,
    subtasks: [{ id: 'sub_w1', title: 'Dashboard', completed: true }, { id: 'sub_w2', title: 'Detail projektu', completed: true }]
  });

  await createTask({
    projectId: projRef2.id,
    sectionId: secDev.id,
    title: 'Implementace Kanban boardu s Drag & Drop',
    description: 'Otestovat knihovnu na přesouvání karet mezi sloupci.',
    status: 'in_progress',
    priority: 'high',
    deadline: formatYMD(todayDate),
    assigneeId: currentUserId || 'demo_cyril',
    order: 0,
    subtasks: [{ id: 'sub_d1', title: 'Testování dnd', completed: true }]
  });
};
