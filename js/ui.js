/**
 * ui.js — Redesenha a tela inteira e controla as abas do celular.
 */
import { S, servidorAtual } from "./estado.js";
import { $, criarAvatar } from "./util.js";
import { renderTrilho, renderTopoServidor } from "./servidores.js";
import { renderCanais } from "./canais.js";
import { renderListaDms } from "./dm.js";
import { renderMembros } from "./membros.js";
import { renderPalco } from "./palco.js";

/* ------------------------------------------------------------ desenho geral */

let agendado = false;

/**
 * Redesenha tudo (junta várias chamadas seguidas num desenho só).
 * Usa setTimeout e não requestAnimationFrame porque este último fica pausado
 * em abas em segundo plano, e a lista da call precisa estar certa ao voltar.
 */
export function renderTudo() {
  if (agendado) return;
  agendado = true;
  setTimeout(() => {
    agendado = false;
    if (!S.user) return;
    renderTrilho();
    renderLateral();
    renderConteudo();
    renderMembros();
    renderPainelUsuario();
    renderPainelVoz();
    renderPalco();
  }, 16);
}

function renderLateral() {
  const dm = S.modo === "dm";
  $("lateralServidor").hidden = dm;
  $("lateralDms").hidden = !dm;
  if (dm) renderListaDms();
  else { renderTopoServidor(); renderCanais(); renderListaDms(); }
}

/** Decide o que aparece no meio: chat, palco de voz ou uma mensagem vazia. */
function renderConteudo() {
  const canal = S.modo === "servidor" ? S.canais.get(S.canalAtual) : null;
  const mostrarChat = !!S.chat && (S.modo === "dm" || canal?.tipo === "texto");
  const mostrarVoz = canal?.tipo === "voz";

  $("painelChat").hidden = !mostrarChat;
  $("painelVoz").hidden = !mostrarVoz;
  $("painelVazio").hidden = mostrarChat || mostrarVoz;
  $("btMembros").hidden = S.modo !== "servidor";
  document.body.classList.toggle("modo-dm", S.modo === "dm");

  if (!mostrarChat && !mostrarVoz) {
    const [titulo, texto] =
      S.modo === "dm" ? ["Mensagens diretas", "Escolha uma conversa ao lado ou clique em + pra começar uma."]
      : !S.servidores.size ? ["Bem-vindo ao Telão", "Clique no + pra criar seu primeiro servidor, ou abra o convite de um amigo."]
      : !servidorAtual() ? ["Escolha um servidor", "Seus servidores ficam na barra da esquerda."]
      : ["Escolha um canal", "Canais de texto pra conversar, canais de voz pra call e live."];
    $("vazioTitulo").textContent = titulo;
    $("vazioTexto").textContent = texto;
  }
}

/** Painel embaixo da lateral: eu, meu status e botões de mic/áudio/config. */
function renderPainelUsuario() {
  const av = criarAvatar(S.nome, S.foto);
  av.dataset.fala = S.user.uid;
  $("meuAvatar").replaceChildren(av);
  $("meuNome").textContent = S.nome;
  $("meuStatus").textContent = S.afk ? "💤 AFK" : "● Online";
  $("meuStatus").classList.toggle("usuario__status--afk", S.afk);
}

/** "Conectado em Lobby / Servidor" quando estou numa call. */
function renderPainelVoz() {
  const painel = $("painelConectado");
  painel.hidden = !S.call;
  if (!S.call) return;
  const srv = S.servidores.get(S.call.sid);
  const canal = S.call.sid === S.atual ? S.canais.get(S.call.cid) : null;
  $("conectadoCanal").textContent = canal ? canal.nome : "Canal de voz";
  $("conectadoServidor").textContent = srv?.nome || "";
  $("btIrParaCall").onclick = irParaCall;
}

/** Abre o canal de voz onde estou conectado (mesmo se estiver em outro servidor). */
export async function irParaCall() {
  if (!S.call) return;
  const { sid, cid } = S.call;
  const { abrirCanal } = await import("./canais.js");
  if (S.atual !== sid) {
    const { abrirServidor } = await import("./servidores.js");
    abrirServidor(sid);
  }
  const tentar = (n = 0) => S.canais.has(cid) ? abrirCanal(cid) : n < 20 && setTimeout(() => tentar(n + 1), 150);
  tentar();
}

/* ------------------------------------------------------------ abas (celular) */

let naoLidas = 0;

export const abaAtual = () => $("telaApp").dataset.aba;

/** Mostra uma aba no celular: "canais", "conversa" ou "membros". */
export function irPara(aba) {
  $("telaApp").dataset.aba = aba;
  for (const bt of document.querySelectorAll(".abas__botao")) {
    const ativo = bt.dataset.aba === aba;
    bt.classList.toggle("abas__botao--ativo", ativo);
    bt.setAttribute("aria-current", ativo ? "page" : "false");
  }
  if (aba === "conversa") {
    zerarNaoLidas();
    S.chat?.aoVer?.();
    const lista = $("mensagens");
    lista.scrollTop = lista.scrollHeight;
  }
  renderTudo(); // a mini live aparece/some conforme a aba
}

export function contarNaoLidas(quantidade) {
  naoLidas += quantidade;
  $("badgeConversa").textContent = naoLidas > 99 ? "99+" : String(naoLidas);
  $("badgeConversa").hidden = naoLidas === 0;
}

export function zerarNaoLidas() {
  naoLidas = 0;
  $("badgeConversa").hidden = true;
}

export function iniciarAbas() {
  for (const bt of document.querySelectorAll(".abas__botao")) bt.addEventListener("click", () => irPara(bt.dataset.aba));
  irPara("canais");
  $("dlgImagem").addEventListener("click", () => $("dlgImagem").close());
}
