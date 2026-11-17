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

/**
 * Pergunta "tem certeza?" numa janela do próprio Telão (no lugar do confirm() do navegador).
 * @returns {Promise<boolean>} true se a pessoa confirmou
 */
export function confirmar(texto, { titulo = "Tem certeza?", botao = "Confirmar", perigo = true, campo = null } = {}) {
  const dlg = $("dlgConfirmar");
  $("confirmarTitulo").textContent = titulo;
  $("confirmarTexto").textContent = texto;
  const ok = $("confirmarOk");
  ok.textContent = botao;
  ok.classList.toggle("botao--perigo", perigo);
  ok.classList.toggle("botao--primario", !perigo);
  $("confirmarCancelar").hidden = !!campo;
  const entrada = $("confirmarCampo");
  entrada.hidden = !campo;
  entrada.value = campo || "";
  dlg.returnValue = "";
  dlg.showModal();
  if (campo) { entrada.focus(); entrada.select(); }
  // responde no clique (o evento "close" pode atrasar em aba de fundo)
  const form = dlg.querySelector("form");
  return new Promise(resolver => {
    const terminar = sim => {
      form.removeEventListener("submit", aoEnviar);
      dlg.removeEventListener("cancel", aoCancelar);
      resolver(sim);
    };
    const aoEnviar = e => terminar(e.submitter?.value === "ok" || (!e.submitter && !!campo));
    const aoCancelar = () => terminar(false);
    form.addEventListener("submit", aoEnviar);
    dlg.addEventListener("cancel", aoCancelar);
  });
}

/** Copia um texto; se o navegador não deixar, mostra pra pessoa copiar na mão. */
export async function copiar(texto, mensagem = "Copiado!") {
  try { await navigator.clipboard.writeText(texto); aviso(mensagem); }
  catch { confirmar("Seu navegador não deixou copiar sozinho. Segure (ou dê Ctrl+C) no texto abaixo:", { titulo: "Copie o link", botao: "Pronto", perigo: false, campo: texto }); }
}

/** Lê/grava no localStorage sem quebrar em navegadores que bloqueiam. */
export const guardar = {
  ler: chave => { try { return localStorage.getItem(chave); } catch { return null; } },
  salvar: (chave, valor) => { try { localStorage.setItem(chave, valor); } catch {} },
};

/** Clona o modelo <template id="..."> e devolve o primeiro elemento. */
export const doModelo = id => $(id).content.firstElementChild.cloneNode(true);

/** Transforma o texto em nós, com links http(s) clicáveis e @menções destacadas. */
export function textoRico(texto, nomesMencionaveis = []) {
  const frag = document.createDocumentFragment();
  const partes = String(texto).split(/(https?:\/\/[^\s<>"']+|@\S+)/g);
  for (const parte of partes) {
    if (!parte) continue;
    if (/^https?:\/\//.test(parte)) {
      const a = document.createElement("a");
      a.href = parte; a.textContent = parte; a.target = "_blank"; a.rel = "noopener noreferrer";
      frag.append(a);
    } else if (parte.startsWith("@") && (parte === "@todos" || nomesMencionaveis.some(n => parte.slice(1).toLowerCase() === n.toLowerCase()))) {
      const m = document.createElement("span");
      m.className = "mencao"; m.textContent = parte;
      frag.append(m);
    } else frag.append(parte);
  }
  return frag;
}

/** Lê um arquivo como data URL (texto base64). */
export const lerArquivo = arquivo => new Promise((ok, erro) => {
  const leitor = new FileReader();
  leitor.onload = () => ok(leitor.result);
  leitor.onerror = erro;
  leitor.readAsDataURL(arquivo);
});

/**
 * Reduz uma imagem pra caber no banco (lado máximo e compressão).
 * GIF pequeno fica como está pra não perder a animação.
 */
export async function comprimirImagem(arquivo, ladoMax, qualidade) {
  if (arquivo.type === "image/gif" && arquivo.size < 700_000) return lerArquivo(arquivo);
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
    const escala = Math.min(1, ladoMax / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL("image/webp", qualidade);
    return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", qualidade);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 1536 -> "1,5 KB" */
export function tamanhoLegivel(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(".", ",") + " KB";
  return (bytes / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
}

/** Id de conversa direta: sempre o mesmo pros dois, não importa quem começou. */
export const idConversa = (a, b) => [a, b].sort().join("_");

/** Fecha menus flutuantes abertos. */
export function fecharMenus() {
  document.querySelectorAll(".menu-flutuante").forEach(m => m.remove());
}

/**
 * Mostra um menu pequeno perto de um elemento.
 * @param {HTMLElement} ancora  elemento clicado
 * @param {{rotulo:string, acao:Function, perigo?:boolean}[]} itens
 */
export function menuFlutuante(ancora, itens) {
  fecharMenus();
  const menu = document.createElement("div");
  menu.className = "menu-flutuante";
  menu.setAttribute("role", "menu");
  for (const item of itens) {
    const bt = document.createElement("button");
    bt.type = "button";
    bt.className = "menu-flutuante__item" + (item.perigo ? " menu-flutuante__item--perigo" : "");
    bt.textContent = item.rotulo;
    bt.setAttribute("role", "menuitem");
    bt.addEventListener("click", () => { fecharMenus(); item.acao(); });
    menu.append(bt);
  }
  document.body.append(menu);
  const r = ancora.getBoundingClientRect();
  const largura = menu.offsetWidth, altura = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(r.left, innerWidth - largura - 8)) + "px";
  menu.style.top = (r.bottom + altura + 8 > innerHeight ? r.top - altura - 4 : r.bottom + 4) + "px";
  setTimeout(() => document.addEventListener("click", fecharMenus, { once: true }), 0);
}
