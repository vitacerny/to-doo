import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD_XcrkTr2poGdwsOjZm3Ur8BKOT5GuMbE",
  authDomain: "to-doo-fc973.firebaseapp.com",
  projectId: "to-doo-fc973",
  storageBucket: "to-doo-fc973.firebasestorage.app",
  messagingSenderId: "832621625627",
  appId: "1:832621625627:web:0e87e8b81b3f00d57353be"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
