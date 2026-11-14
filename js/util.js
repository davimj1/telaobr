/**
 * util.js — Funções pequenas usadas no app todo.
 */

/** Atalho para document.getElementById. */
export const $ = id => document.getElementById(id);

/** Escapa texto pra colocar dentro de HTML com segurança (evita injeção de código). */
export function esc(texto) {
  const mapa = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(texto ?? "").replace(/[&<>"']/g, c => mapa[c]);
}

/** Gera uma cor fixa a partir de um texto (o mesmo nome sempre tem a mesma cor). */
export function cor(texto) {
  let h = 0;
  for (const c of String(texto)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 45%)`;
}

/** "Davi Mello" -> "DM" */
export function iniciais(nome) {
  return String(nome || "?").trim().split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
}

/** Data curta pro chat: 14/11 21:03 */
export function dataCurta(ts) {
  return new Date(ts).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Texto aleatório curto (ids de sessão). */
export const aleatorio = () => Math.random().toString(36).slice(2, 10);

/** Só aceita fotos https (a do Google). */
export const fotoSegura = url => (/^https:\/\//.test(url || "") ? url : "");

/**
 * Cria o avatar de uma pessoa: foto se tiver, senão as iniciais coloridas.
 * @returns {HTMLElement}
 */
export function criarAvatar(nome, foto, { id = "", classe = "avatar" } = {}) {
  const el = document.createElement("div");
  el.className = classe;
  if (id) el.id = id;
  const f = fotoSegura(foto);
  if (f) el.style.backgroundImage = `url("${f.replace(/"/g, "%22")}")`;
  else { el.style.backgroundColor = cor(nome); el.textContent = iniciais(nome); }
  el.setAttribute("aria-hidden", "true");
  return el;
}

/** Imagem SVG com as iniciais, usada quando a pessoa não tem foto. */
export function imagemIniciais(nome) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect width='48' height='48' fill='${cor(nome)}'/><text x='24' y='31' font-size='19' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='700'>${esc(iniciais(nome))}</text></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

/** Mostra uma mensagem rápida embaixo da tela. */
let timerAviso;
export function aviso(texto) {
  const el = $("aviso");
  el.textContent = texto;
  el.classList.add("visivel");
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => el.classList.remove("visivel"), 2800);
}

/** Copia um texto; se o navegador não deixar, mostra pra pessoa copiar na mão. */
export async function copiar(texto, mensagem = "Copiado!") {
  try { await navigator.clipboard.writeText(texto); aviso(mensagem); }
  catch { prompt("Copie:", texto); }
}

/** Lê/grava no localStorage sem quebrar em navegadores que bloqueiam. */
export const guardar = {
  ler: chave => { try { return localStorage.getItem(chave); } catch { return null; } },
  salvar: (chave, valor) => { try { localStorage.setItem(chave, valor); } catch {} },
};

/** Clona o modelo <template id="..."> e devolve o primeiro elemento. */
export const doModelo = id => $(id).content.firstElementChild.cloneNode(true);
