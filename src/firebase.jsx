// firebase.js
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCUsi5trZiXqkxIen_9wiiNaub7-9XKfBw",
  authDomain: "mess-app-dab87.firebaseapp.com",
  projectId: "mess-app-dab87",
  storageBucket: "mess-app-dab87.appspot.com",  // ✅ fixed from .app to .appspot.com
  messagingSenderId: "866142996355",
  appId: "1:866142996355:web:324d96a7cb8dac404c58b6"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

export {
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail  // ✅ added
};
