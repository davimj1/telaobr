/**
 * dm.js — Mensagens diretas (conversa privada entre duas pessoas).
 */
import { db, doc, setDoc, collection, onSnapshot, query, where } from "./firebase.js";
import { S, parar } from "./estado.js";
import { $, criarAvatar, dataCurta, idConversa, guardar } from "./util.js";
import { ehCelular } from "./compat.js";
import { perfil, statusDe, ouvirPerfis } from "./perfis.js";
import { abrirChat, fecharChat } from "./chat.js";
import { renderTudo, irPara } from "./ui.js";
import { avisar, atualizarTitulo, definirContadorDms, estouVendo } from "./avisos.js";

/** Guarda "quando li cada conversa" separado por conta (duas contas no mesmo PC não se misturam). */
const chaveLidas = () => "telao-dms-lidas:" + S.user.uid;
const lidas = () => JSON.parse(guardar.ler(chaveLidas()) || "{}");

const outroDa = conversa => conversa.membros.find(u => u !== S.user.uid) || S.user.uid;

/** Conversa tem mensagem nova que eu não vi? */
function naoLida(id, conversa) {
  return conversa.ultima && conversa.ultima.uid !== S.user.uid && conversa.ultima.ts > (lidas()[id] || 0);
}

function marcarLida(id) {
  const l = lidas();
  const ultima = S.dms.get(id)?.ultima?.ts || 0;
  if ((l[id] || 0) >= Math.max(Date.now() - 1000, ultima)) return;
  l[id] = Math.max(Date.now(), ultima); // max: o relógio de cada PC pode estar um pouco diferente
  guardar.salvar(chaveLidas(), JSON.stringify(l));
  atualizarTitulo();
  renderTudo();
}

const dmsNaoLidas = () => [...S.dms].filter(([id, c]) => naoLida(id, c)).length;
const ultimasVistas = new Map(); // id -> ts (pra avisar só de mensagem nova de verdade)

/* ------------------------------------------------------------ banco */

export function ouvirDms() {
  parar("dms");
  const q = query(collection(db, "dms"), where("membros", "array-contains", S.user.uid));
  S.parar.dms = onSnapshot(q, snap => {
    S.dms.clear();
    snap.forEach(d => S.dms.set(d.id, d.data()));
    ouvirPerfis([...S.dms.values()].flatMap(c => c.membros));
    for (const [id, c] of S.dms) avisarSeNova(id, c);
    if (S.modo === "dm" && S.dmAtual && estouVendo()) marcarLida(S.dmAtual);
    atualizarTitulo();
    renderTudo();
  }, () => {});
}

/** Mensagem direta nova de outra pessoa: som + notificação (se eu não estiver olhando a conversa). */
function avisarSeNova(id, c) {
  const u = c.ultima;
  const antes = ultimasVistas.get(id);
  ultimasVistas.set(id, u?.ts || 0);
  if (antes === undefined || !u || u.ts <= antes || u.uid === S.user.uid) return;
  if (S.modo === "dm" && S.dmAtual === id && estouVendo()) return;
  const outro = outroDa(c);
  avisar({
    titulo: `Mensagem de ${perfil(outro).nome}`,
    texto: u.texto,
    som: "mensagem",
    tag: "dm-" + id,
    aoClicar: () => abrirDm(outro),
  });
}

/** Abre (ou cria) a conversa com alguém. */
export async function abrirDm(uid) {
  const id = idConversa(S.user.uid, uid);
  const membros = [S.user.uid, uid].sort();
  await setDoc(doc(db, "dms", id), { membros }, { merge: true }).catch(() => {});
  S.modo = "dm";
  S.dmAtual = id;
  abrirChat({
    chave: "dm:" + id,
    colecao: () => collection(db, "dms", id, "mensagens"),
    titulo: "@ " + perfil(uid).nome,
    contexto: "dm",
    digitando: () => collection(db, "dms", id, "digitando"),
    aoEnviar: m => setDoc(doc(db, "dms", id), { membros, ultima: { uid: m.uid, texto: (m.texto || "📎 anexo").slice(0, 80), ts: m.ts } }, { merge: true }),
    aoVer: () => marcarLida(id),
  });
  if (ehCelular()) irPara("conversa");
  renderTudo();
}

/** Entra no modo "Mensagens diretas". */
export function abrirModoDm() {
  S.modo = "dm";
  if (S.dmAtual && S.dms.has(S.dmAtual)) return abrirDm(outroDa(S.dms.get(S.dmAtual)));
  fecharChat();
  S.dmAtual = null;
  if (ehCelular()) irPara("canais");
  renderTudo();
}

/* ------------------------------------------------------------ desenho */

export function renderListaDms() {
  const ul = $("listaDms");
  const conversas = [...S.dms].sort((a, b) => (b[1].ultima?.ts || 0) - (a[1].ultima?.ts || 0));
  const itens = conversas.map(([id, c]) => {
    const uid = outroDa(c);
    const p = perfil(uid);
    const li = document.createElement("li");
    const bt = document.createElement("button");
    bt.type = "button";
    bt.className = "dm";
    bt.classList.toggle("dm--atual", id === S.dmAtual);
    bt.classList.toggle("dm--nova", naoLida(id, c));
    const textos = document.createElement("span");
    textos.className = "dm__textos";
    const nome = document.createElement("span");
    nome.className = "dm__nome";
    nome.textContent = p.nome;
    const ultima = document.createElement("span");
    ultima.className = "dm__ultima";
    ultima.textContent = c.ultima ? `${c.ultima.texto} · ${dataCurta(c.ultima.ts)}` : "Sem mensagens";
    textos.append(nome, ultima);
    const av = criarAvatar(p.nome, p.foto);
    av.classList.add("avatar--" + statusDe(uid));
    bt.append(av, textos);
    bt.addEventListener("click", () => abrirDm(uid));
    li.append(bt);
    return li;
  });
  if (!itens.length) {
    const vazio = document.createElement("li");
    vazio.className = "dm-vazio";
    vazio.textContent = "Nenhuma conversa ainda. Clique em + ou em alguém na lista de membros.";
    itens.push(vazio);
  }
  ul.replaceChildren(...itens);
  $("btDms").classList.toggle("trilho__item--alerta", [...S.dms].some(([id, c]) => naoLida(id, c) && id !== S.dmAtual));
}

/** Janela "Nova conversa": pessoas que estão em algum servidor comigo. */
function abrirNovaConversa() {
  const conhecidos = new Set([...S.servidores.values()].flatMap(s => s.membros || []));
  conhecidos.delete(S.user.uid);
  const ul = $("listaContatos");
  const itens = [...conhecidos].sort((a, b) => perfil(a).nome.localeCompare(perfil(b).nome)).map(uid => {
    const li = document.createElement("li");
    const bt = document.createElement("button");
    bt.type = "button";
    bt.className = "dm";
    const nome = document.createElement("span");
    nome.className = "dm__nome";
    nome.textContent = perfil(uid).nome;
    bt.append(criarAvatar(perfil(uid).nome, perfil(uid).foto), nome);
    bt.addEventListener("click", () => { $("dlgNovaConversa").close(); abrirDm(uid); });
    li.append(bt);
    return li;
  });
  if (!itens.length) ul.innerHTML = `<li class="dm-vazio">Entre num servidor com seus amigos pra poder conversar com eles aqui.</li>`;
  else ul.replaceChildren(...itens);
  $("dlgNovaConversa").showModal();
}

export function iniciarDms() {
  definirContadorDms(() => (S.user ? dmsNaoLidas() : 0));
  $("btDms").addEventListener("click", abrirModoDm);
  $("btNovaConversa").addEventListener("click", abrirNovaConversa);
}
