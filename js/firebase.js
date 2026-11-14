/**
 * firebase.js — Inicializa o Firebase e reexporta só o que o Telão usa.
 * Assim a versão do SDK fica num lugar só.
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, updateDoc, deleteDoc, collection, addDoc, onSnapshot,
  query, where, orderBy, limitToLast, arrayUnion, arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut,
  doc, setDoc, updateDoc, deleteDoc, collection, addDoc, onSnapshot,
  query, where, orderBy, limitToLast, arrayUnion, arrayRemove,
};

/** Documento dentro de um servidor. Ex.: srvDoc(id, "pessoas", uid) */
export const srvDoc = (sid, ...caminho) => doc(db, "servidores", sid, ...caminho);

/** Coleção dentro de um servidor. Ex.: srvCol(id, "mensagens") */
export const srvCol = (sid, ...caminho) => collection(db, "servidores", sid, ...caminho);
