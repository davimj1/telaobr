/**
 * ui.js — Coisas gerais da interface: redesenhar tudo e as abas do celular.
 */
import { $ } from "./util.js";
import { renderTrilho, renderLateral } from "./servidores.js";
import { renderPessoas } from "./call.js";
import { renderPalco } from "./palco.js";

/** Redesenha todas as partes da tela. */
export function renderTudo() {
  renderTrilho();
  renderLateral();
  renderPessoas();
  renderPalco();
}

/* ------------------------------------------------------------ abas (celular) */
let naoLidas = 0;

export const abaAtual = () => $("telaApp").dataset.aba;

/** Mostra uma aba no celular: "servidores", "call" ou "chat". */
export function irPara(aba) {
  $("telaApp").dataset.aba = aba;
  for (const bt of document.querySelectorAll(".abas__botao")) {
    const ativo = bt.dataset.aba === aba;
    bt.classList.toggle("abas__botao--ativo", ativo);
    bt.setAttribute("aria-current", ativo ? "page" : "false");
  }
  if (aba === "chat") {
    zerarNaoLidas();
    const lista = $("mensagens");
    lista.scrollTop = lista.scrollHeight;
  }
}

/** Soma mensagens novas no contador da aba Chat. */
export function contarNaoLidas(quantidade) {
  naoLidas += quantidade;
  const badge = $("badgeChat");
  badge.textContent = naoLidas > 99 ? "99+" : String(naoLidas);
  badge.hidden = naoLidas === 0;
}

export function zerarNaoLidas() {
  naoLidas = 0;
  $("badgeChat").hidden = true;
}

export function iniciarAbas() {
  for (const bt of document.querySelectorAll(".abas__botao")) bt.addEventListener("click", () => irPara(bt.dataset.aba));
  irPara("servidores");
}
