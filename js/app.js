/**
 * app.js — Telão como app instalável (PWA).
 *
 *  - Registra o service worker (sw.js), que é o que permite instalar.
 *  - Mostra o botão "Instalar app" quando o navegador deixa (Chrome, Edge, Android)
 *    e o passo a passo no iPhone/iPad (lá a instalação é pelo menu Compartilhar).
 *  - Mostra notificações pelo service worker: é o único jeito que funciona no
 *    Android e no iPhone (app instalado).
 */
import { $, aviso } from "./util.js";

const UA = navigator.userAgent;
const EH_IOS = /iPad|iPhone|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Está aberto como app instalado (janela própria, sem barra do navegador)? */
export const EH_APP = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

let pedidoInstalacao = null; // evento do navegador que abre a janelinha "Instalar"
let registro = null;         // service worker pronto

/* ------------------------------------------------------------ notificações */

const cliques = new Map();   // id da notificação -> o que fazer ao clicar
let proximoId = 1;

/**
 * Mostra uma notificação do sistema. Usa o service worker quando dá
 * (obrigatório no Android e no iPhone); senão, o jeito simples do navegador.
 */
export async function mostrarNotificacao(titulo, { texto, tag, aoClicar }) {
  const id = String(proximoId++);
  cliques.set(id, aoClicar);
  if (cliques.size > 50) cliques.delete(cliques.keys().next().value);
  const opcoes = { body: texto, icon: "img/icones/icone-192.png", badge: "img/icones/icone-192.png", tag, renotify: !!tag, data: { id } };

  if (registro) return registro.showNotification(titulo, opcoes);
  const n = new Notification(titulo, opcoes);
  n.onclick = () => { window.focus(); aoClicar?.(); n.close(); };
}

/* ------------------------------------------------------------ instalar */

const podeInstalar = () => !EH_APP && (!!pedidoInstalacao || EH_IOS);

function renderInstalar() {
  $("btInstalarApp").hidden = !podeInstalar();
  $("appEstado").textContent =
    EH_APP ? "✅ Você está usando o Telão instalado como app."
    : pedidoInstalacao ? "Instale o Telão: ganha ícone na área de trabalho/tela inicial e abre numa janela só dele."
    : EH_IOS ? "No iPhone/iPad, instale pelo botão Compartilhar do Safari."
    : "Pra instalar como app, abra o Telão no Chrome ou no Edge (o Firefox não instala sites).";
  $("btInstalarConta").hidden = !podeInstalar();
}

async function instalar() {
  if (pedidoInstalacao) {
    pedidoInstalacao.prompt();
    await pedidoInstalacao.userChoice.catch(() => null);
    pedidoInstalacao = null; // o navegador só deixa usar uma vez
    renderInstalar();
  } else if (EH_IOS) {
    $("dlgInstalarIos").showModal();
  }
}

/* ------------------------------------------------------------ início */

export function iniciarApp() {
  document.body.classList.toggle("modo-app", EH_APP);

  window.addEventListener("beforeinstallprompt", evento => {
    evento.preventDefault(); // a gente mostra o próprio botão, no lugar certo
    pedidoInstalacao = evento;
    renderInstalar();
  });
  window.addEventListener("appinstalled", () => {
    pedidoInstalacao = null;
    renderInstalar();
    aviso("Telão instalado! Procure o ícone na área de trabalho ou na tela inicial.");
  });
  $("btInstalarApp").addEventListener("click", instalar);
  $("btInstalarConta").addEventListener("click", instalar);
  renderInstalar();

  // service worker: só funciona em https (GitHub Pages) ou no localhost
  const seguro = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (!("serviceWorker" in navigator) || !seguro) return;
  navigator.serviceWorker.register("./sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then(r => { registro = r; })
    .catch(erro => console.warn("Service worker não registrou:", erro));
  navigator.serviceWorker.addEventListener("message", evento => {
    if (evento.data?.tipo !== "notificacao-clicada") return;
    cliques.get(evento.data.id)?.();
  });
}
