/**
 * emoji.js — Seletor de emoji (com "usados recentemente" salvo no navegador).
 */
import { EMOJIS } from "./config.js";
import { guardar } from "./util.js";

const CHAVE_RECENTES = "telao-emojis-recentes";
let painelAberto = null;

const recentes = () => JSON.parse(guardar.ler(CHAVE_RECENTES) || "[]");

function lembrar(emoji) {
  const lista = [emoji, ...recentes().filter(e => e !== emoji)].slice(0, 24);
  guardar.salvar(CHAVE_RECENTES, JSON.stringify(lista));
}

export function fecharSeletorEmoji() {
  painelAberto?.remove();
  painelAberto = null;
}

/**
 * Abre o seletor perto de um botão.
 * @param {HTMLElement} ancora
 * @param {(emoji:string)=>void} aoEscolher
 * @param {{rapidas?:string[]}} opcoes  rapidas = linha de reações rápidas no topo
 */
export function abrirSeletorEmoji(ancora, aoEscolher, { rapidas = [] } = {}) {
  if (painelAberto) { fecharSeletorEmoji(); return; }
  const painel = document.createElement("div");
  painel.className = "seletor-emoji";
  painel.setAttribute("role", "dialog");
  painel.setAttribute("aria-label", "Escolher emoji");

  const escolher = emoji => { lembrar(emoji); aoEscolher(emoji); fecharSeletorEmoji(); };
  const botaoEmoji = emoji => {
    const bt = document.createElement("button");
    bt.type = "button";
    bt.className = "seletor-emoji__emoji";
    bt.textContent = emoji;
    bt.setAttribute("aria-label", emoji);
    bt.addEventListener("click", () => escolher(emoji));
    return bt;
  };

  if (rapidas.length) {
    const linha = document.createElement("div");
    linha.className = "seletor-emoji__rapidas";
    linha.append(...rapidas.map(botaoEmoji));
    painel.append(linha);
  }

  const busca = document.createElement("input");
  busca.className = "campo seletor-emoji__busca";
  busca.placeholder = "Filtrar categoria…";
  busca.setAttribute("aria-label", "Filtrar categoria de emoji");
  painel.append(busca);

  const corpo = document.createElement("div");
  corpo.className = "seletor-emoji__corpo";
  const grupos = { "Usados recentemente": recentes().join(" "), ...EMOJIS };
  for (const [titulo, lista] of Object.entries(grupos)) {
    const emojis = lista.split(" ").filter(Boolean);
    if (!emojis.length) continue;
    const secao = document.createElement("section");
    secao.dataset.titulo = titulo.toLowerCase();
    const h = document.createElement("h4");
    h.className = "seletor-emoji__titulo";
    h.textContent = titulo;
    const grade = document.createElement("div");
    grade.className = "seletor-emoji__grade";
    grade.append(...emojis.map(botaoEmoji));
    secao.append(h, grade);
    corpo.append(secao);
  }
  painel.append(corpo);
  busca.addEventListener("input", () => {
    const termo = busca.value.trim().toLowerCase();
    for (const s of corpo.children) s.hidden = termo && !s.dataset.titulo.includes(termo);
  });

  document.body.append(painel);
  painelAberto = painel;
  const r = ancora.getBoundingClientRect();
  const w = painel.offsetWidth, h = painel.offsetHeight;
  painel.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
  painel.style.top = (r.top - h - 6 > 8 ? r.top - h - 6 : Math.min(r.bottom + 6, innerHeight - h - 8)) + "px";

  setTimeout(() => {
    const fora = e => {
      if (!painel.contains(e.target)) { fecharSeletorEmoji(); document.removeEventListener("pointerdown", fora); }
    };
    document.addEventListener("pointerdown", fora);
  }, 0);
  document.addEventListener("keydown", function esc(e) {
    if (e.key === "Escape") { fecharSeletorEmoji(); document.removeEventListener("keydown", esc); }
  });
}
