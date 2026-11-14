/**
 * call.js — Entrar/sair da call e saber quem está nela (presença).
 */
import { setDoc, updateDoc, deleteDoc, onSnapshot, srvCol, srvDoc } from "./firebase.js";
import { S } from "./estado.js";
import { LIMITES } from "./config.js";
import { $, aleatorio, aviso, criarAvatar, doModelo } from "./util.js";
import { TEM_WEBRTC, ehCelular, manterTelaAcesa, soltarTela, destravarAudio } from "./compat.js";
import { ouvirSinais, pararSinais, iniciarOferta, fecharPar, fecharTodos } from "./rtc.js";
import { ligarMicrofone, desligarTudo, atualizarBotoes } from "./midia.js";
import { renderTudo, irPara } from "./ui.js";
import { renderPalco } from "./palco.js";

/** Meu documento de presença na call atual. */
export const meuDoc = () => srvDoc(S.call, "pessoas", S.user.uid);

/** Atualiza meu status (mic, câmera, tela) pra todo mundo ver. */
export function atualizarMeuStatus(campos) {
  if (S.call) updateDoc(meuDoc(), campos).catch(() => {});
}

/* ------------------------------------------------------------ presença */

/** Ouve quem está na call do servidor aberto e conecta/desconecta as pessoas. */
export function ouvirPessoas(sid) {
  S.pararPessoas = onSnapshot(srvCol(sid, "pessoas"), snap => {
    if (sid !== S.atual) return;
    const agora = Date.now();
    S.pessoas.clear();
    snap.forEach(d => {
      const p = d.data();
      if (agora - p.visto < LIMITES.presencaExpiraMs) S.pessoas.set(d.id, p);
    });
    if (S.call === sid) sincronizarConexoes();
    renderPessoas();
    renderPalco();
  });
}

export function pararPessoas() {
  S.pararPessoas?.();
  S.pararPessoas = null;
}

/** Fecha conexões de quem saiu e abre com quem chegou. */
function sincronizarConexoes() {
  for (const [uid, par] of S.pares) {
    const p = S.pessoas.get(uid);
    if (!p || p.sessao !== par.sessao) fecharPar(uid); // saiu ou recarregou a página
  }
  for (const [uid, p] of S.pessoas) {
    if (uid === S.user.uid || S.pares.has(uid)) continue;
    if (S.user.uid < uid) iniciarOferta(uid, p.sessao); // só um dos dois chama, pra não duplicar
  }
}

/* ------------------------------------------------------------ entrar / sair */

export async function entrarNaCall() {
  const sid = S.atual;
  if (!sid || S.call === sid) return;
  if (!TEM_WEBRTC) return aviso("Este navegador não faz chamadas. Use Chrome, Edge, Firefox ou Safari atualizados.");
  if (S.call) await sairDaCall();

  await ligarMicrofone({ silencioso: true });
  S.call = sid;
  S.sessao = aleatorio() + aleatorio();
  S.entrouEm = Date.now();

  await setDoc(meuDoc(), {
    nome: S.nome, foto: S.foto, sessao: S.sessao,
    mic: !!S.mic, tela: false, cam: false, visto: Date.now(),
  });
  S.batida = setInterval(() => atualizarMeuStatus({ visto: Date.now() }), LIMITES.batidaPresencaMs);

  ouvirSinais(sid);
  manterTelaAcesa();
  destravarAudio();
  atualizarBotoes();
  if (ehCelular()) irPara("call");
  renderTudo();
}

export async function sairDaCall() {
  const sid = S.call;
  if (!sid) return;
  desligarTudo();
  fecharTodos();
  pararSinais();
  clearInterval(S.batida);
  soltarTela();
  S.call = null;
  await deleteDoc(srvDoc(sid, "pessoas", S.user.uid)).catch(() => {});
  renderTudo();
}

/* ------------------------------------------------------------ desenho */

/** Lista "quem está na call" no painel lateral. */
export function renderPessoas() {
  const lista = $("listaPessoas");
  if (!S.atual) return lista.replaceChildren();
  if (!S.pessoas.size) {
    const vazio = document.createElement("li");
    vazio.className = "pessoa pessoa--vazia";
    vazio.textContent = "Ninguém na call";
    return lista.replaceChildren(vazio);
  }
  const itens = [...S.pessoas].map(([uid, p]) => {
    const li = doModelo("modeloPessoa");
    const avatar = criarAvatar(p.nome, p.foto);
    avatar.dataset.fala = uid;
    li.prepend(avatar);
    li.querySelector(".pessoa__nome").textContent = p.nome + (uid === S.user.uid ? " (você)" : "");
    li.querySelector(".pessoa__vivo").hidden = !p.tela;
    const status = li.querySelector(".pessoa__status");
    status.textContent = (p.cam ? "📷 " : "") + (p.mic ? "🎤" : "🔇");
    status.title = (p.cam ? "Câmera ligada, " : "") + (p.mic ? "microfone ligado" : "microfone desligado");
    return li;
  });
  lista.replaceChildren(...itens);
}

export function iniciarCall() {
  $("btCall").addEventListener("click", entrarNaCall);
  $("btDesligar").addEventListener("click", sairDaCall);
  window.addEventListener("pagehide", () => { if (S.call) deleteDoc(meuDoc()).catch(() => {}); });
}
