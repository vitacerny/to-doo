import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  User,
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  updateProfile,
  signInAnonymously
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  usersList: UserProfile[];
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string) => Promise<void>;
  loginAsGuest: (name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Sync all users for assignment
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const users: UserProfile[] = [];
      snapshot.forEach((doc) => {
        users.push(doc.data() as UserProfile);
      });
      setUsersList(users);
    }, (err) => {
      console.warn("Could not fetch user list (check firestore rules):", err);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Fetch or create profile
        try {
          const userRef = doc(db, 'users', user.uid);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            setUserProfile(snap.data() as UserProfile);
          } else {
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || `${user.uid.slice(0, 5)}@guest.local`,
              displayName: user.displayName || 'Uživatel',
            };
            await setDoc(userRef, newProfile);
            setUserProfile(newProfile);
          }
        } catch (e) {
          console.error("Error loading user profile:", e);
          setUserProfile({
            uid: user.uid,
            email: user.email || 'guest@local',
            displayName: user.displayName || 'Uživatel'
          });
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const register = async (email: string, pass: string, name: string) => {
    const res = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(res.user, { displayName: name });
    const profile: UserProfile = {
      uid: res.user.uid,
      email: email,
      displayName: name,
    };
    await setDoc(doc(db, 'users', res.user.uid), profile);
    setUserProfile(profile);
  };

  const loginAsGuest = async (name: string) => {
    const res = await signInAnonymously(auth);
    await updateProfile(res.user, { displayName: name });
    const profile: UserProfile = {
      uid: res.user.uid,
      email: `${name.toLowerCase().replace(/\s+/g, '')}@guest.local`,
      displayName: name,
    };
    await setDoc(doc(db, 'users', res.user.uid), profile);
    setUserProfile(profile);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      userProfile,
      usersList,
      loading,
      login,
      register,
      loginAsGuest,
      logout
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
