/**
 * perfis.js — Nome, foto e status (online/AFK/offline) das pessoas, e o AFK automático.
 */
import { db, doc, getDoc, setDoc, updateDoc, onSnapshot } from "./firebase.js";
import { S } from "./estado.js";
import { LIMITES } from "./config.js";
import { renderTudo } from "./ui.js";
import { $, aviso, criarAvatar, marcarChegada, tempoSemSinal, comprimirImagem } from "./util.js";

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
      if (!snap.exists()) return;
      const p = snap.data();
      marcarChegada("perfil:" + uid, p.visto);
      S.perfis.set(uid, p);
      agendarRender();
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
  if (uid !== S.user?.uid && tempoSemSinal("perfil:" + uid) > LIMITES.onlineExpiraMs) return "offline";
  return p.status === "afk" ? "afk" : "online";
}

/* ------------------------------------------------------------ meu status */

let ultimoMovimento = Date.now();

let ultimoNomeFoto = "";

/** Sinal de vida a cada minuto. Nome e foto só vão junto quando mudam (a foto pode ser grandinha). */
function gravarMeuStatus() {
  if (!S.user) return;
  const dados = { visto: Date.now(), status: S.afk ? "afk" : "online" };
  const nomeFoto = S.nome + "|" + S.foto;
  if (nomeFoto !== ultimoNomeFoto) Object.assign(dados, { nome: S.nome, foto: S.foto });
  setDoc(doc(db, "usuarios", S.user.uid), dados, { merge: true })
    .then(() => { ultimoNomeFoto = nomeFoto; })
    .catch(() => {});
}

/* ------------------------------------------------------------ meu apelido e minha foto */

const FOTO_LADO = 256;          // a foto aparece no máximo com ~100 px; 256 fica nítida em tela retina
const FOTO_MAX = 90_000;        // caracteres: todo mundo que te vê baixa sua foto

/**
 * Lê o apelido e a foto que a pessoa escolheu no Telão (se escolheu).
 * Sem escolha, ficam o nome e a foto da conta Google.
 */
export async function carregarMeuPerfil() {
  const google = { nome: S.user.displayName || (S.user.email || "Sem nome").split("@")[0], foto: S.user.photoURL || "" };
  S.google = google;
  try {
    const snap = await getDoc(doc(db, "usuarios", S.user.uid));
    const d = snap.exists() ? snap.data() : {};
    S.apelido = d.apelido || "";
    S.fotoPropria = d.fotoPropria || "";
    S.consentimento = d.consentimento || null;
  } catch { /* sem internet: fica o do Google */ }
  aplicarMeuPerfil();
}

function aplicarMeuPerfil() {
  S.nome = S.apelido || S.google.nome;
  S.foto = S.fotoPropria || S.google.foto;
}

/** Salva apelido e/ou foto. `foto`: data URL, "" pra voltar pra foto do Google, ou undefined pra não mexer. */
export async function salvarMeuPerfil({ apelido, foto }) {
  if (apelido !== undefined) S.apelido = apelido.trim().slice(0, LIMITES.tamanhoNome);
  if (foto !== undefined) S.fotoPropria = foto;
  aplicarMeuPerfil();
  await setDoc(doc(db, "usuarios", S.user.uid), {
    apelido: S.apelido, fotoPropria: S.fotoPropria, nome: S.nome, foto: S.foto,
  }, { merge: true });
  ultimoNomeFoto = S.nome + "|" + S.foto;
  // quem está na call comigo vê o nome/foto novos na hora
  if (S.call) updateDoc(doc(db, "servidores", S.call.sid, "pessoas", S.user.uid), { nome: S.nome, foto: S.foto }).catch(() => {});
  renderTudo();
}

export async function prepararFoto(arquivo) {
  if (!arquivo?.type.startsWith("image/")) throw new Error("não é imagem");
  // GIF animado também é reduzido (vira imagem parada) pra foto não ficar pesada
  const foto = await comprimirImagem(arquivo, FOTO_LADO, 0.82, { forcarRedimensionar: true, quadrado: true });
  if (foto.length > FOTO_MAX) throw new Error("muito grande");
  return foto;
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

/* ------------------------------------------------------------ janela "Sua conta": apelido e foto */

export function renderEdicaoPerfil() {
  const av = criarAvatar(S.nome, S.foto, { classe: "avatar perfil-edicao__avatar" });
  $("previewFotoPerfil").replaceChildren(av);
  $("campoApelido").value = S.apelido || "";
  $("campoApelido").placeholder = S.google?.nome || "";
  $("btFotoGoogle").hidden = !S.fotoPropria;
}

async function salvarApelido() {
  const novo = $("campoApelido").value.trim();
  if (novo === (S.apelido || "")) return;
  try {
    await salvarMeuPerfil({ apelido: novo });
    aviso(novo ? `Pronto, agora você é "${novo}"!` : "Voltou pro nome da conta Google.");
    renderEdicaoPerfil();
  } catch { aviso("Não deu pra salvar o apelido."); }
}

async function trocarFoto(arquivo) {
  if (!arquivo) return;
  try {
    aviso("Preparando a foto…");
    await salvarMeuPerfil({ foto: await prepararFoto(arquivo) });
    aviso("Foto nova salva!");
    renderEdicaoPerfil();
  } catch (erro) {
    aviso(erro.message === "não é imagem" ? "Escolha uma imagem." : "Não deu pra usar essa foto. Tente outra.");
  }
}

export function iniciarEdicaoPerfil() {
  $("btSalvarApelido").addEventListener("click", salvarApelido);
  $("campoApelido").addEventListener("keydown", e => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    salvarApelido();
  });
  $("btTrocarFoto").addEventListener("click", () => $("entradaFotoPerfil").click());
  $("entradaFotoPerfil").addEventListener("change", e => { trocarFoto(e.target.files[0]); e.target.value = ""; });
  $("btFotoGoogle").addEventListener("click", async () => {
    await salvarMeuPerfil({ foto: "" }).catch(() => aviso("Não deu pra trocar a foto."));
    renderEdicaoPerfil();
  });
}
