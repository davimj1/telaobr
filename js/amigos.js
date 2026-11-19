/**
 * amigos.js — Amizades: código de amigo, link de amizade, pedidos, lista de amigos.
 * Mensagem direta só funciona entre amigos (checado também no firestore.rules).
 *
 * Banco:
 *   codigos/{CODIGO}      { uid }                 código curto pra alguém te adicionar
 *   usuarios/{uid}        { ..., codigo }         seu código fica no seu perfil
 *   amizades/{uidA_uidB}  { de, para, status: "pendente" | "aceita", membros, criadoEm }
 *     (o id é o mesmo da conversa direta, então a regra do banco checa a amizade sem buscar nada)
 */
import { db, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, query, where } from "./firebase.js";
import { S, parar } from "./estado.js";
import { $, aviso, copiar, confirmar, criarAvatar, idConversa, menuFlutuante } from "./util.js";
import { ehCelular } from "./compat.js";
import { perfil, statusDe, ouvirPerfis } from "./perfis.js";
import { renderTudo, irPara } from "./ui.js";
import { avisar, atualizarTitulo } from "./avisos.js";

/* ------------------------------------------------------------ código de amigo */

// sem 0/O, 1/I/L: fácil de ditar e de digitar
const LETRAS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const gerarCodigo = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => LETRAS[n % LETRAS.length]).join("");
const limparCodigo = texto => (texto || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);

/** Garante que eu tenho um código de amigo (cria na primeira vez). */
async function garantirCodigo() {
  const eu = await getDoc(doc(db, "usuarios", S.user.uid)).catch(() => null);
  const atual = eu?.exists() ? eu.data().codigo : null;
  if (atual) { S.meuCodigo = atual; return; }
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const codigo = gerarCodigo();
    try {
      await setDoc(doc(db, "codigos", codigo), { uid: S.user.uid }); // a regra recusa se o código já for de alguém
      await setDoc(doc(db, "usuarios", S.user.uid), { codigo }, { merge: true });
      S.meuCodigo = codigo;
      renderTudo();
      return;
    } catch { /* código já usado: tenta outro */ }
  }
}

export const linkDeAmizade = () =>
  S.meuCodigo ? `${location.origin}${location.pathname}#amigo-${S.meuCodigo}` : "";

/* ------------------------------------------------------------ amizades */

/** Situação entre mim e alguém: "amigo", "enviado", "recebido" ou null. */
export function situacao(uid) {
  const a = S.amizades.get(idConversa(S.user.uid, uid));
  if (!a) return null;
  if (a.status === "aceita") return "amigo";
  return a.de === S.user.uid ? "enviado" : "recebido";
}
export const ehAmigo = uid => situacao(uid) === "amigo";

const outroDe = a => a.membros.find(u => u !== S.user.uid);
const lista = filtro => [...S.amizades.values()].filter(filtro).map(outroDe)
  .sort((x, y) => perfil(x).nome.localeCompare(perfil(y).nome));

export const amigos = () => lista(a => a.status === "aceita");
export const pedidosRecebidos = () => lista(a => a.status === "pendente" && a.para === S.user.uid);
const pedidosEnviados = () => lista(a => a.status === "pendente" && a.de === S.user.uid);

let primeiraLeitura = true;

function ouvirAmizades() {
  parar("amizades");
  primeiraLeitura = true;
  const q = query(collection(db, "amizades"), where("membros", "array-contains", S.user.uid));
  S.parar.amizades = onSnapshot(q, snap => {
    const antes = S.amizades;
    S.amizades = new Map();
    snap.forEach(d => S.amizades.set(d.id, d.data()));
    ouvirPerfis([...S.amizades.values()].flatMap(a => a.membros));
    if (!primeiraLeitura) avisarMudancas(antes);
    primeiraLeitura = false;
    atualizarTitulo();
    renderTudo();
  }, () => {});
}

/** Pedido novo pra mim → som + notificação. Meu pedido aceito → aviso. */
function avisarMudancas(antes) {
  for (const [id, a] of S.amizades) {
    const velho = antes.get(id);
    const outro = outroDe(a);
    if (!velho && a.status === "pendente" && a.para === S.user.uid) {
      avisar({
        titulo: "Pedido de amizade",
        texto: `${perfil(outro).nome} quer ser seu amigo no Telão`,
        som: "mensagem",
        tag: "amizade-" + id,
        aoClicar: () => abrirAmigos("pendentes"),
      });
    }
    if (velho?.status === "pendente" && a.status === "aceita" && a.de === S.user.uid)
      aviso(`${perfil(outro).nome} aceitou seu pedido de amizade! 🎉`);
  }
}

export async function pedirAmizade(uid) {
  if (uid === S.user.uid) return aviso("Esse é você 😄");
  const agora = situacao(uid);
  if (agora === "amigo") return aviso(`Você e ${perfil(uid).nome} já são amigos.`);
  if (agora === "enviado") return aviso("Pedido já enviado. Agora é esperar.");
  if (agora === "recebido") return aceitar(uid);
  try {
    await setDoc(doc(db, "amizades", idConversa(S.user.uid, uid)), {
      de: S.user.uid, para: uid, status: "pendente",
      membros: [S.user.uid, uid].sort(), criadoEm: Date.now(),
    });
    aviso("Pedido de amizade enviado!");
  } catch {
    // o outro mandou pedido ao mesmo tempo: o documento já existe — vira um "aceitar"
    aviso("Não deu pra enviar o pedido. Tente de novo.");
  }
}

export async function aceitar(uid) {
  await updateDoc(doc(db, "amizades", idConversa(S.user.uid, uid)), { status: "aceita", aceitaEm: Date.now() })
    .then(() => aviso(`Agora você e ${perfil(uid).nome} são amigos!`))
    .catch(() => aviso("Não deu pra aceitar."));
}

/** Recusar pedido, cancelar meu pedido ou desfazer amizade (tudo apaga o documento). */
async function remover(uid, mensagem) {
  await deleteDoc(doc(db, "amizades", idConversa(S.user.uid, uid)))
    .then(() => mensagem && aviso(mensagem))
    .catch(() => aviso("Não deu pra fazer isso agora."));
}

async function desfazer(uid) {
  const nome = perfil(uid).nome;
  if (!await confirmar(`Vocês não vão mais conseguir mandar mensagem direta (a conversa antiga continua visível).`,
    { titulo: `Desfazer amizade com ${nome}?`, botao: "Desfazer amizade" })) return;
  remover(uid, "Amizade desfeita.");
}

async function adicionarPorCodigo(textoCodigo) {
  const codigo = limparCodigo(textoCodigo);
  if (codigo.length < 4) return aviso("Digite o código do seu amigo (6 letras/números).");
  if (codigo === S.meuCodigo) return aviso("Esse é o seu código 😄 Mande ele pro seu amigo.");
  const snap = await getDoc(doc(db, "codigos", codigo)).catch(() => null);
  if (!snap?.exists()) return aviso("Código não encontrado. Confira as letras.");
  await pedirAmizade(snap.data().uid);
}

/** Abriu um link #amigo-CODIGO: manda o pedido sozinho. */
async function tratarLinkAmigo() {
  const m = location.hash.match(/^#amigo-([A-Za-z0-9]+)/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  await adicionarPorCodigo(m[1]);
}

/* ------------------------------------------------------------ tela de amigos */

let aba = "online";

/** Abre a tela de amigos (no modo de mensagens diretas). */
export async function abrirAmigos(qualAba) {
  const { fecharChat } = await import("./chat.js");
  if (qualAba) aba = qualAba;
  S.modo = "dm";
  S.dmAtual = null;
  fecharChat();
  if (ehCelular()) irPara("conversa");
  renderTudo();
}

export function renderAmigos() {
  const recebidos = pedidosRecebidos();
  for (const bt of document.querySelectorAll(".amigos__aba")) {
    const ativa = bt.dataset.aba === aba;
    bt.classList.toggle("amigos__aba--ativa", ativa);
    bt.setAttribute("aria-selected", String(ativa));
  }
  $("contadorPendentes").textContent = recebidos.length || "";
  $("contadorPendentes").hidden = !recebidos.length;
  $("contadorAmigosLateral").textContent = recebidos.length || "";
  $("contadorAmigosLateral").hidden = !recebidos.length;

  $("adicionarAmigo").hidden = aba !== "adicionar";
  $("listaAmigos").hidden = aba === "adicionar";
  if (aba === "adicionar") {
    $("meuCodigo").textContent = S.meuCodigo || "…";
    return;
  }

  let grupos;
  if (aba === "pendentes") {
    grupos = [["Recebidos", recebidos, "recebido"], ["Enviados", pedidosEnviados(), "enviado"]];
  } else {
    const todos = amigos();
    const mostrados = aba === "online" ? todos.filter(uid => statusDe(uid) !== "offline") : todos;
    grupos = [[aba === "online" ? "Online" : "Todos os amigos", mostrados, "amigo"]];
  }

  const itens = [];
  for (const [titulo, uids, tipo] of grupos) {
    if (!uids.length) continue;
    const h = document.createElement("li");
    h.className = "amigos__titulo";
    h.textContent = `${titulo} — ${uids.length}`;
    itens.push(h, ...uids.map(uid => criarLinha(uid, tipo)));
  }
  if (!itens.length) {
    const vazio = document.createElement("li");
    vazio.className = "amigos__vazio";
    vazio.textContent = {
      online: "Nenhum amigo online agora.",
      todos: "Você ainda não tem amigos no Telão. Vá em Adicionar e mande seu código pra galera!",
      pendentes: "Nenhum pedido de amizade.",
    }[aba];
    itens.push(vazio);
  }
  $("listaAmigos").replaceChildren(...itens);
}

function criarLinha(uid, tipo) {
  const p = perfil(uid);
  const li = document.createElement("li");
  li.className = "amigo";
  const av = criarAvatar(p.nome, p.foto);
  av.classList.add("avatar--" + statusDe(uid));
  const textos = document.createElement("span");
  textos.className = "amigo__textos";
  const nome = document.createElement("strong");
  nome.textContent = p.nome;
  const sub = document.createElement("span");
  sub.className = "amigo__sub";
  sub.textContent = tipo === "recebido" ? "Quer ser seu amigo"
    : tipo === "enviado" ? "Pedido enviado"
    : { online: "Online", afk: "AFK", offline: "Offline" }[statusDe(uid)];
  textos.append(nome, sub);
  li.append(av, textos);

  const botao = (rotulo, titulo, acao, classe = "") => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "botao-icone amigo__acao " + classe;
    b.textContent = rotulo;
    b.title = titulo;
    b.setAttribute("aria-label", titulo);
    b.addEventListener("click", e => acao(e.currentTarget));
    li.append(b);
  };
  if (tipo === "recebido") {
    botao("✓", "Aceitar", () => aceitar(uid), "amigo__acao--sim");
    botao("✕", "Recusar", () => remover(uid, "Pedido recusado."), "amigo__acao--nao");
  } else if (tipo === "enviado") {
    botao("✕", "Cancelar pedido", () => remover(uid, "Pedido cancelado."), "amigo__acao--nao");
  } else {
    botao("💬", "Mensagem direta", () => import("./dm.js").then(m => m.abrirDm(uid)));
    botao("⋯", "Mais opções", ancora => menuFlutuante(ancora, [
      { rotulo: "Desfazer amizade", acao: () => desfazer(uid), perigo: true },
    ]));
  }
  return li;
}

/* ------------------------------------------------------------ início */

export async function aoEntrarAmigos() {
  ouvirAmizades();
  await garantirCodigo();
  await tratarLinkAmigo();
}

export function pararAmigos() {
  parar("amizades");
  S.amizades = new Map();
  S.meuCodigo = null;
}

export function iniciarAmigos() {
  $("btAmigos").addEventListener("click", () => abrirAmigos());
  for (const bt of document.querySelectorAll(".amigos__aba"))
    bt.addEventListener("click", () => { aba = bt.dataset.aba; renderAmigos(); });
  $("btCopiarCodigo").addEventListener("click", () => copiar(S.meuCodigo || "", "Código copiado!"));
  $("btCopiarLinkAmigo").addEventListener("click", () => copiar(linkDeAmizade(), "Link copiado! Mande pro seu amigo."));
  $("formAdicionarAmigo").addEventListener("submit", e => {
    e.preventDefault();
    adicionarPorCodigo($("campoCodigoAmigo").value);
    $("campoCodigoAmigo").value = "";
  });
  // também funciona se o link de amizade for aberto com o Telão já aberto
  window.addEventListener("hashchange", () => { if (S.user) tratarLinkAmigo(); });
}
