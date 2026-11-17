/**
 * canais.js — Canais de texto e de voz de um servidor.
 * Canais de voz mostram quem está dentro; clicar num deles entra na call.
 */
import { addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, srvCol, srvDoc } from "./firebase.js";
import { S, parar, servidorAtual } from "./estado.js";
import { LIMITES, MODELOS } from "./config.js";
import { $, aviso, confirmar, criarAvatar, doModelo, menuFlutuante } from "./util.js";
import { ehCelular } from "./compat.js";
import { pode } from "./permissoes.js";
import { perfil } from "./perfis.js";
import { abrirChat, fecharChat, resumoParaAviso } from "./chat.js";
import { canalNaoLido, canalComMencao, marcarCanalLido } from "./avisos.js";
import { entrarNaCall } from "./call.js";
import { renderTudo, irPara } from "./ui.js";

/* ------------------------------------------------------------ banco */

export async function criarCanaisDoModelo(sid, modelo) {
  let ordem = 0;
  for (const c of MODELOS[modelo].canais) await addDoc(srvCol(sid, "canais"), { ...c, ordem: ordem++, criadoEm: Date.now() });
}

export function ouvirCanais(sid) {
  const q = query(srvCol(sid, "canais"), orderBy("ordem"));
  S.parar.canais = onSnapshot(q, snap => {
    if (sid !== S.atual) return;
    S.canais.clear();
    snap.forEach(d => S.canais.set(d.id, d.data()));

    // servidor antigo, sem canais: o dono cria os básicos
    if (!S.canais.size && servidorAtual()?.dono === S.user.uid && !S.criandoPadrao) {
      S.criandoPadrao = true;
      criarCanaisDoModelo(sid, "vazio").finally(() => (S.criandoPadrao = false));
    }

    // primeiro canal de texto abre sozinho
    if (!S.canalAtual || !S.canais.has(S.canalAtual)) {
      const primeiro = [...S.canais].find(([, c]) => c.tipo === "texto");
      if (primeiro) abrirCanal(primeiro[0], { semTrocarAba: true });
    }

    // aviso de "Fulano entrou no servidor"
    if (S.anunciarEntrada === sid) {
      const texto = [...S.canais].find(([, c]) => c.tipo === "texto");
      if (texto) {
        S.anunciarEntrada = null;
        addDoc(srvCol(sid, "canais", texto[0], "mensagens"), {
          uid: S.user.uid, nome: S.nome, foto: S.foto, tipo: "sistema",
          texto: `${S.nome} entrou no servidor`, ts: Date.now(),
        }).catch(() => {});
      }
    }
    renderTudo();
  });
}

export function pararCanais() {
  parar("canais");
  fecharChat();
  S.canais.clear();
}

/* ------------------------------------------------------------ navegação */

/** Abre um canal: texto mostra o chat, voz entra na call. */
export function abrirCanal(cid, { semTrocarAba = false } = {}) {
  const canal = S.canais.get(cid);
  if (!canal) return;
  S.canalAtual = cid;
  if (canal.tipo === "texto") {
    const sid = S.atual;
    abrirChat({
      chave: `canal:${sid}:${cid}`,
      colecao: () => srvCol(sid, "canais", cid, "mensagens"),
      digitando: () => srvCol(sid, "canais", cid, "digitando"),
      titulo: "# " + canal.nome,
      contexto: "canal",
      // resumo da última mensagem no próprio canal: é assim que os outros sabem que tem novidade
      aoEnviar: m => updateDoc(srvDoc(sid, "canais", cid), {
        ultima: resumoParaAviso(m, S.servidores.get(sid)?.membros || []),
      }).catch(() => {}),
      aoVer: () => marcarCanalLido(cid, Math.max(Date.now(), S.atividade.get(sid)?.get(cid)?.ultima?.ts || 0)),
    });
  } else {
    fecharChat();
    if (S.call?.sid !== S.atual || S.call?.cid !== cid) entrarNaCall(S.atual, cid);
  }
  if (ehCelular() && !semTrocarAba) irPara("conversa");
  renderTudo();
}

/* ------------------------------------------------------------ criar / editar */

function pedirNovoCanal(tipo) {
  $("tituloDlgCanal").textContent = tipo === "voz" ? "Novo canal de voz" : "Novo canal de texto";
  $("dlgCanal").dataset.tipo = tipo;
  $("dlgCanal").dataset.editar = "";
  $("campoNomeCanal").value = "";
  $("dlgCanal").showModal();
}

function pedirRenomear(cid) {
  const canal = S.canais.get(cid);
  $("tituloDlgCanal").textContent = "Renomear canal";
  $("dlgCanal").dataset.editar = cid;
  $("campoNomeCanal").value = canal.nome;
  $("dlgCanal").showModal();
}

async function salvarCanal() {
  const dlg = $("dlgCanal");
  let nome = $("campoNomeCanal").value.trim().slice(0, LIMITES.tamanhoNome);
  if (!nome) return;
  const tipo = dlg.dataset.tipo;
  if (!dlg.dataset.editar && tipo === "texto") nome = nome.toLowerCase().replace(/\s+/g, "-");
  try {
    if (dlg.dataset.editar) await updateDoc(srvDoc(S.atual, "canais", dlg.dataset.editar), { nome });
    else {
      const ordem = Math.max(-1, ...[...S.canais.values()].map(c => c.ordem ?? 0)) + 1;
      await addDoc(srvCol(S.atual, "canais"), { nome, tipo, ordem, criadoEm: Date.now() });
    }
  } catch (erro) {
    aviso(erro.code === "permission-denied" ? "Você não tem permissão pra isso." : "Erro: " + erro.code);
  }
}

async function apagarCanal(cid) {
  const canal = S.canais.get(cid);
  if (!await confirmar(`As mensagens de "${canal.nome}" somem junto.`, { titulo: "Apagar canal?", botao: "Apagar canal" })) return;
  await deleteDoc(srvDoc(S.atual, "canais", cid)).catch(e => aviso("Erro: " + e.code));
}

/* ------------------------------------------------------------ desenho */

/** Lista de canais no painel lateral (texto em cima, voz embaixo com quem está dentro). */
export function renderCanais() {
  const lista = $("listaCanais");
  if (!S.atual) return lista.replaceChildren();

  const secoes = [];
  for (const tipo of ["texto", "voz"]) {
    const secao = doModelo("modeloSecaoCanais");
    secao.querySelector(".canais__titulo").textContent = tipo === "texto" ? "Canais de texto" : "Canais de voz";
    const btMais = secao.querySelector(".canais__mais");
    btMais.hidden = !pode("criarCanais");
    btMais.setAttribute("aria-label", tipo === "texto" ? "Criar canal de texto" : "Criar canal de voz");
    btMais.addEventListener("click", () => pedirNovoCanal(tipo));

    const ul = secao.querySelector(".canais__lista");
    for (const [cid, canal] of S.canais) if (canal.tipo === tipo) ul.append(criarItemCanal(cid, canal));
    secoes.push(secao);
  }
  lista.replaceChildren(...secoes);
}

function criarItemCanal(cid, canal) {
  const li = doModelo("modeloCanal");
  const bt = li.querySelector(".canal");
  bt.classList.add(canal.tipo === "voz" ? "canal--voz" : "canal--texto");
  bt.classList.toggle("canal--atual", cid === S.canalAtual);
  bt.classList.toggle("canal--conectado", S.call?.sid === S.atual && S.call?.cid === cid);
  bt.querySelector(".canal__icone").textContent = canal.tipo === "voz" ? "🔊" : "#";
  bt.querySelector(".canal__nome").textContent = canal.nome;
  bt.addEventListener("click", () => abrirCanal(cid));
  if (canal.tipo === "texto" && cid !== S.canalAtual) {
    const atividade = S.atividade.get(S.atual)?.get(cid) || canal;
    bt.classList.toggle("canal--naolido", canalNaoLido(cid, atividade));
    if (canalComMencao(cid)) {
      const selo = document.createElement("span");
      selo.className = "selo-numero canal__mencao";
      selo.textContent = "@";
      selo.title = "Te marcaram aqui";
      bt.append(selo);
    }
  }

  const btOpcoes = li.querySelector(".canal__opcoes");
  btOpcoes.hidden = !pode("gerenciarCanais");
  btOpcoes.addEventListener("click", e => {
    e.stopPropagation();
    menuFlutuante(btOpcoes, [
      { rotulo: "Renomear", acao: () => pedirRenomear(cid) },
      { rotulo: "Apagar canal", acao: () => apagarCanal(cid), perigo: true },
    ]);
  });

  if (canal.tipo === "voz") {
    const dentro = [...S.pessoas].filter(([, p]) => p.canal === cid);
    const ul = li.querySelector(".canal__pessoas");
    for (const [uid, p] of dentro) {
      const item = document.createElement("li");
      item.className = "canal__pessoa";
      const av = criarAvatar(p.nome, p.foto || perfil(uid).foto);
      av.dataset.fala = uid;
      const nome = document.createElement("span");
      nome.className = "canal__pessoa-nome";
      nome.textContent = p.nome;
      const icones = document.createElement("span");
      icones.className = "canal__pessoa-icones";
      icones.textContent = [p.tela && "🔴", p.cam && "📷", p.afk && "💤", !p.mic && "🔇"].filter(Boolean).join(" ");
      item.append(av, nome, icones);
      ul.append(item);
    }
  }
  return li;
}

export function iniciarCanais() {
  $("dlgCanal").addEventListener("close", () => { if ($("dlgCanal").returnValue === "ok") salvarCanal(); });
}
