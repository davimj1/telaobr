/**
 * perfis.js — Nome, foto e status (online/AFK/offline) das pessoas, e o AFK automático.
 */
import { db, doc, setDoc, updateDoc, onSnapshot } from "./firebase.js";
import { S } from "./estado.js";
import { LIMITES } from "./config.js";
import { renderTudo } from "./ui.js";

const ouvindo = new Map(); // uid -> função pra parar
let timerRender = null;

/** Redesenha no máximo 1x a cada 150ms (vários perfis chegam juntos). */
function agendarRender() {
  clearTimeout(timerRender);
  timerRender = setTimeout(renderTudo, 150);
}

/** Garante que estou ouvindo o perfil dessas pessoas. */
export function ouvirPerfis(uids) {
  for (const uid of new Set(uids)) {
    if (!uid || ouvindo.has(uid)) continue;
    ouvindo.set(uid, onSnapshot(doc(db, "usuarios", uid), snap => {
      if (snap.exists()) { S.perfis.set(uid, snap.data()); agendarRender(); }
    }, () => {}));
  }
}

export function pararPerfis() {
  for (const parar of ouvindo.values()) parar();
  ouvindo.clear();
  S.perfis.clear();
}

/** Perfil de alguém (ou um genérico enquanto carrega). */
export function perfil(uid) {
  if (uid === S.user?.uid) return { nome: S.nome, foto: S.foto, status: S.afk ? "afk" : "online", visto: Date.now() };
  return S.perfis.get(uid) || { nome: "Carregando…", foto: "", status: "offline", visto: 0 };
}

/** "online" | "afk" | "offline" */
export function statusDe(uid) {
  const p = perfil(uid);
  if (Date.now() - (p.visto || 0) > LIMITES.onlineExpiraMs) return "offline";
  return p.status === "afk" ? "afk" : "online";
}

/* ------------------------------------------------------------ meu status */

let ultimoMovimento = Date.now();

function gravarMeuStatus() {
  if (!S.user) return;
  setDoc(doc(db, "usuarios", S.user.uid), {
    nome: S.nome, foto: S.foto, visto: Date.now(), status: S.afk ? "afk" : "online",
  }, { merge: true }).catch(() => {});
}

/** Liga/desliga o AFK (manual ou automático). */
export function definirAfk(afk) {
  if (S.afk === afk) return;
  S.afk = afk;
  gravarMeuStatus();
  if (S.call) updateDoc(doc(db, "servidores", S.call.sid, "pessoas", S.user.uid), { afk }).catch(() => {});
  renderTudo();
}

/** Batida de "estou online" e detecção de AFK por inatividade. */
export function iniciarMeuStatus() {
  gravarMeuStatus();
  setInterval(gravarMeuStatus, LIMITES.batidaOnlineMs);
  const mexeu = () => { ultimoMovimento = Date.now(); if (S.afk && !S.afkManual) definirAfk(false); };
  for (const ev of ["pointerdown", "keydown", "mousemove", "touchstart"]) document.addEventListener(ev, mexeu, { passive: true });
  setInterval(() => {
    const parado = Date.now() - ultimoMovimento > LIMITES.afkMinutos * 60_000;
    if (parado && !S.afk) definirAfk(true);
  }, 30_000);
}
