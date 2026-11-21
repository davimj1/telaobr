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
  if (!contexto) setTimeout(direcionarTudo, 0); // primeira vez: já manda os toques pra saída escolhida
  contexto ??= new (window.AudioContext || window.webkitAudioContext)();
  return contexto;
}

/** iPhone/Android bloqueiam som automático: a cada toque, tentamos tocar de novo. */
export function destravarAudio() {
  contexto?.resume?.();
  for (const par of S.pares.values()) for (const saida of par.saidas) if (saida.srcObject?.getAudioTracks().length) saida.play().catch(() => {});
}

/* ------------------------------------------------------------ vídeo (câmera e telas) */

/** É iPhone/iPad? (lá todo navegador usa o motor do Safari, inclusive o Chrome) */
export const EH_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Liga um vídeo recebido (câmera ou tela) num elemento <video>.
 * No iPhone, se o vídeo for ligado ANTES da imagem começar a chegar (ex.: o amigo liga a
 * transmissão depois que você entrou), ele fica preto pra sempre. Por isso, quando a imagem
 * começa a chegar ("unmute"), religamos o vídeo e damos play de novo.
 */
export function ligarVideo(video, stream) {
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  const tocar = () => { if (video.isConnected || video.id) video.play().catch(() => {}); };
  if (video.srcObject !== stream) video.srcObject = stream;
  if (!video.dataset.ligado) {
    video.dataset.ligado = "1";
    video.addEventListener("loadedmetadata", tocar);
  }
  for (const faixa of stream.getVideoTracks()) {
    faixa.addEventListener("unmute", () => {
      if (video.srcObject !== stream) return; // esse vídeo já mostra outra coisa
      video.srcObject = null;
      video.srcObject = stream;
      tocar();
    });
  }
  requestAnimationFrame(tocar);
}

/* ------------------------------------------------------------ onde o som sai (fone, caixa…) */

/** O navegador deixa escolher a saída de áudio? (Chrome e Edge sim; Safari não) */
export const PODE_ESCOLHER_SAIDA = typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;

/** Manda o som de um tocador pra saída escolhida nas configurações de voz. */
export function direcionarSaida(elemento) {
  if (!PODE_ESCOLHER_SAIDA) return;
  // só troca se for diferente: trocar a saída reinicia o áudio (e pode travar o "verde")
  if ((elemento.sinkId || "") === (S.config.saidaId || "")) return;
  elemento.setSinkId(S.config.saidaId || "").catch(() => {
    // o fone foi desconectado, por exemplo: volta pro padrão do sistema
    elemento.setSinkId("").catch(() => {});
  });
}

/** Aplica a saída escolhida em tudo que toca som: vozes, som das lives e os toques de aviso. */
export function direcionarTudo() {
  for (const par of S.pares.values()) par.saidas.forEach(direcionarSaida);
  const alvo = S.config.saidaId || "";
  const atual = typeof contexto?.sinkId === "string" ? contexto.sinkId : "";
  if (contexto?.setSinkId && atual !== alvo) contexto.setSinkId(alvo).catch(() => {});
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
