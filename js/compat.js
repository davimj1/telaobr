/**
 * compat.js — Diferenças entre aparelhos e navegadores (celular, iPhone, apps).
 */
import { S } from "./estado.js";

const UA = navigator.userAgent;

/** Aberto dentro do WhatsApp/Instagram/etc. — o Google bloqueia login aí. */
export const NAVEGADOR_DE_APP = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|TikTok|musical_ly|Twitter|; wv\)/i.test(UA);

/** Celulares não deixam sites capturarem a tela. */
export const PODE_TRANSMITIR = !!navigator.mediaDevices?.getDisplayMedia;

/** Navegador faz chamadas de voz/vídeo? */
export const TEM_WEBRTC = !!window.RTCPeerConnection && !!navigator.mediaDevices?.getUserMedia;

/** <dialog> só existe em navegadores de 2022 pra frente. */
export const TEM_DIALOG = typeof document.createElement("dialog").showModal === "function";

/** Layout de celular (abas embaixo)? */
export const ehCelular = () => matchMedia("(max-width: 900px)").matches;

/* ------------------------------------------------------------ áudio */
let contexto = null;

/** Um AudioContext só para o app todo (usado no indicador de fala). */
export function contextoAudio() {
  contexto ??= new (window.AudioContext || window.webkitAudioContext)();
  return contexto;
}

/** iPhone/Android bloqueiam som automático: a cada toque, tentamos tocar de novo. */
export function destravarAudio() {
  contexto?.resume?.();
  for (const par of S.pares.values()) par.saida.play().catch(() => {});
}

/* ------------------------------------------------------------ tela acesa */
let trava = null;

/** Pede pro celular não apagar a tela durante a call. */
export async function manterTelaAcesa() {
  try { trava = await navigator.wakeLock?.request("screen"); } catch {}
}

export function soltarTela() {
  trava?.release?.().catch(() => {});
  trava = null;
}

/* ------------------------------------------------------------ tela cheia */
/** Tela cheia que funciona também no iPhone (que só aceita no <video>). */
export function telaCheia(elemento) {
  const video = elemento.querySelector("video");
  if (elemento.requestFullscreen) return elemento.requestFullscreen().catch(() => video?.webkitEnterFullscreen?.());
  if (elemento.webkitRequestFullscreen) return elemento.webkitRequestFullscreen();
  video?.webkitEnterFullscreen?.();
}

/**
 * Navegadores antigos (Safari antes de 2022) não têm <dialog>.
 * Aqui damos a eles um showModal()/close() simples, pra o resto do código não precisar saber.
 */
function instalarDialogoSimples() {
  if (TEM_DIALOG) return;
  for (const dlg of document.querySelectorAll("dialog")) {
    dlg.returnValue = "";
    dlg.showModal = () => { dlg.setAttribute("open", ""); dlg.classList.add("janela--simples"); };
    dlg.close = valor => {
      if (valor !== undefined) dlg.returnValue = valor;
      dlg.removeAttribute("open");
      dlg.dispatchEvent(new Event("close"));
    };
    dlg.querySelector("form[method=dialog]")?.addEventListener("submit", e => {
      e.preventDefault();
      dlg.close(e.submitter?.value ?? "");
    });
  }
}

/** Liga os ajustes que dependem de eventos da página. */
export function iniciarCompat() {
  instalarDialogoSimples();
  document.addEventListener("pointerdown", destravarAudio, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    destravarAudio();
    if (S.call) manterTelaAcesa();
  });
}
