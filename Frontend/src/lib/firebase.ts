import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, getDoc, setDoc, serverTimestamp, arrayUnion, where, getDocs } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyC92lylWlBItRDaoFC2MwCokFH5fFM1GXM",
  authDomain: "hemanthproduction-19d59.firebaseapp.com",
  projectId: "hemanthproduction-19d59",
  storageBucket: "hemanthproduction-19d59.firebasestorage.app",
  messagingSenderId: "538547954610",
  appId: "1:538547954610:web:5e682791d717c944ccbaab",
  measurementId: "G-0XCP1GGHFK"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export { 
  app, db, auth, storage, googleProvider,
  signInWithPopup, signOut, onAuthStateChanged,
  collection, addDoc, updateDoc, doc, onSnapshot, query, orderBy, getDoc, setDoc, serverTimestamp, arrayUnion, where, getDocs
};
