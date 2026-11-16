/**
 * call.js — Entrar/sair de canais de voz e presença (quem está em cada canal).
 * A call continua mesmo se você trocar de servidor ou abrir uma conversa direta.
 */
import { setDoc, updateDoc, deleteDoc, onSnapshot, srvCol, srvDoc } from "./firebase.js";
import { S, parar } from "./estado.js";
import { LIMITES } from "./config.js";
import { aleatorio, aviso } from "./util.js";
import { TEM_WEBRTC, manterTelaAcesa, soltarTela, destravarAudio } from "./compat.js";
import { ouvirSinais, pararSinais, iniciarOferta, fecharPar, fecharTodos } from "./rtc.js";
import { ligarMicrofone, desligarTudo, atualizarBotoes, micEstaAberto } from "./midia.js";
import { renderTudo } from "./ui.js";

/** Meu documento de presença na call atual. */
export const meuDoc = () => srvDoc(S.call.sid, "pessoas", S.user.uid);

/** Atualiza meu status (mic, câmera, tela, AFK) pra todo mundo ver. */
export function atualizarMeuStatus(campos) {
  if (S.call) updateDoc(meuDoc(), campos).catch(() => {});
}

/* ------------------------------------------------------------ presença */

/** Lê os documentos de presença, ignorando quem parou de dar sinal. */
function lerPresencas(snap) {
  const mapa = new Map();
  const agora = Date.now();
  snap.forEach(d => {
    const p = d.data();
    if (agora - p.visto < LIMITES.presencaExpiraMs) mapa.set(d.id, p);
  });
  return mapa;
}

/** Quem está nos canais de voz do servidor ABERTO (pra mostrar na lista de canais). */
export function ouvirPessoas(sid) {
  S.parar.pessoas = onSnapshot(srvCol(sid, "pessoas"), snap => {
    if (sid !== S.atual) return;
    S.pessoas = lerPresencas(snap);
    renderTudo();
  });
}

export function pararPessoas() {
  parar("pessoas");
  S.pessoas = new Map();
}

/** Quem está no MEU canal de voz (pra conectar com cada um). */
function ouvirPessoasCall(sid) {
  S.parar.pessoasCall = onSnapshot(srvCol(sid, "pessoas"), snap => {
    if (S.call?.sid !== sid) return;
    S.pessoasCall = lerPresencas(snap);
    sincronizarConexoes();
    renderTudo();
  });
}

/** Pessoas do meu canal (incluindo eu). */
export const pessoasDoMeuCanal = () => [...S.pessoasCall].filter(([, p]) => p.canal === S.call?.cid);

/** Fecha conexões de quem saiu do canal e abre com quem chegou. */
function sincronizarConexoes() {
  const noCanal = new Map(pessoasDoMeuCanal());
  for (const [uid, par] of S.pares) {
    const p = noCanal.get(uid);
    if (!p || p.sessao !== par.sessao) fecharPar(uid);
  }
  for (const [uid, p] of noCanal) {
    if (uid === S.user.uid || S.pares.has(uid)) continue;
    if (S.user.uid < uid) iniciarOferta(uid, p.sessao); // só um dos dois chama
  }
}

/* ------------------------------------------------------------ entrar / sair */

export async function entrarNaCall(sid, cid) {
  if (S.call?.sid === sid && S.call?.cid === cid) return;
  if (!TEM_WEBRTC) return aviso("Este navegador não faz chamadas. Use Chrome, Edge, Firefox ou Safari atualizados.");
  if (S.call) await sairDaCall();

  if (!S.mic) await ligarMicrofone({ silencioso: true });
  S.call = { sid, cid };
  S.sessao = aleatorio() + aleatorio();
  S.entrouEm = Date.now();
  S.pessoasCall = new Map();

  await setDoc(meuDoc(), {
    nome: S.nome, foto: S.foto, canal: cid, sessao: S.sessao,
    mic: micEstaAberto(), tela: false, cam: false, afk: S.afk, visto: Date.now(),
  });
  S.batida = setInterval(() => atualizarMeuStatus({ visto: Date.now() }), LIMITES.batidaPresencaMs);

  ouvirPessoasCall(sid);
  ouvirSinais(sid);
  manterTelaAcesa();
  destravarAudio();
  atualizarBotoes();
  renderTudo();
}

export async function sairDaCall() {
  const call = S.call;
  if (!call) return;
  desligarTudo();
  fecharTodos();
  pararSinais();
  parar("pessoasCall");
  clearInterval(S.batida);
  soltarTela();
  S.call = null;
  S.pessoasCall = new Map();
  await deleteDoc(srvDoc(call.sid, "pessoas", S.user.uid)).catch(() => {});
  atualizarBotoes();
  renderTudo();
}

export function iniciarCall() {
  for (const bt of document.querySelectorAll('[data-acao="desconectar"]')) bt.addEventListener("click", sairDaCall);
  window.addEventListener("pagehide", () => { if (S.call) deleteDoc(meuDoc()).catch(() => {}); });
}
