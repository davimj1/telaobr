/**
 * privacidade.js — Direitos da LGPD dentro do app (art. 18):
 *  - "Baixar meus dados": arquivo JSON com perfil, servidores, amizades e as mensagens que eu escrevi;
 *  - "Excluir minha conta": apaga meus dados do Firestore e a conta de login.
 */
import { S } from "./estado.js";
import { $, aviso, confirmar } from "./util.js";
import {
  auth, db, doc, getDoc, getDocs, deleteDoc, updateDoc, collection, query, where, arrayRemove,
  GoogleAuthProvider, reauthenticateWithPopup, deleteUser, srvCol, srvDoc,
} from "./firebase.js";
import { sairDaCall } from "./call.js";

const estado = texto => { $("estadoDados").textContent = texto; };
const lista = async q => (await getDocs(q)).docs;
const minhas = col => query(col, where("uid", "==", S.user.uid));
const apagarTodos = docs => Promise.all(docs.map(d => deleteDoc(d.ref || d)));

/** Servidores onde sou membro (não só os que estão abertos agora). */
const meusServidores = () => lista(query(collection(db, "servidores"), where("membros", "array-contains", S.user.uid)));
const minhasConversas = () => lista(query(collection(db, "dms"), where("membros", "array-contains", S.user.uid)));
const minhasAmizades = () => lista(query(collection(db, "amizades"), where("membros", "array-contains", S.user.uid)));

/* ------------------------------------------------------------ baixar */

async function baixarDados() {
  const bt = $("btBaixarDados");
  bt.disabled = true;
  estado("Juntando seus dados…");
  try {
    const uid = S.user.uid;
    const perfil = (await getDoc(doc(db, "usuarios", uid))).data() || {};
    const servidores = [];
    for (const s of await meusServidores()) {
      const d = s.data();
      const canais = [];
      for (const c of await lista(srvCol(s.id, "canais"))) {
        const msgs = await lista(minhas(srvCol(s.id, "canais", c.id, "mensagens")));
        canais.push({ id: c.id, nome: c.data().nome, tipo: c.data().tipo, minhasMensagens: msgs.map(m => ({ id: m.id, ...m.data() })) });
      }
      servidores.push({
        id: s.id, nome: d.nome, souDono: d.dono === uid,
        meuCargo: d.dono === uid ? "dono" : (d.cargos || {})[uid] || "membro", canais,
      });
    }
    const conversas = [];
    for (const c of await minhasConversas()) {
      const msgs = await lista(minhas(collection(db, "dms", c.id, "mensagens")));
      conversas.push({ com: c.data().membros.find(m => m !== uid), minhasMensagens: msgs.map(m => ({ id: m.id, ...m.data() })) });
    }
    const amizades = (await minhasAmizades()).map(a => a.data());
    const dados = {
      geradoEm: new Date().toISOString(),
      servico: "Zart Telão (um projeto do grupo Zart)",
      conta: { uid, nome: S.user.displayName || "", email: S.user.email || "", fotoGoogle: S.user.photoURL || "" },
      perfil, servidores, conversasDiretas: conversas, amizades,
      preferenciasNesteAparelho: Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith("telao-")).map(k => [k, localStorage.getItem(k)])),
    };
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `meus-dados-zart-telao-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    estado("Pronto! O arquivo foi baixado.");
  } catch (e) {
    console.error(e);
    estado("Não deu pra juntar seus dados agora. Tente de novo ou peça pelo e-mail projetozart@gmail.com.");
  } finally {
    bt.disabled = false;
  }
}

/* ------------------------------------------------------------ excluir */

/** Apaga tudo de um servidor do qual sou dono (mensagens, canais, presença e o servidor). */
export async function apagarServidorInteiro(sid) {
  for (const c of await lista(srvCol(sid, "canais"))) {
    await apagarTodos(await lista(srvCol(sid, "canais", c.id, "mensagens")));
    await apagarTodos(await lista(srvCol(sid, "canais", c.id, "digitando")));
    await deleteDoc(c.ref);
  }
  await apagarTodos(await lista(srvCol(sid, "pessoas")));
  await deleteDoc(srvDoc(sid));
}

/** Tira só o que é meu de um servidor de outra pessoa e sai dele. */
async function sairDeixandoNada(sid) {
  const uid = S.user.uid;
  for (const c of await lista(srvCol(sid, "canais"))) {
    await apagarTodos(await lista(minhas(srvCol(sid, "canais", c.id, "mensagens"))));
    await deleteDoc(srvDoc(sid, "canais", c.id, "digitando", uid)).catch(() => {});
  }
  await deleteDoc(srvDoc(sid, "pessoas", uid)).catch(() => {});
  await updateDoc(srvDoc(sid), { membros: arrayRemove(uid) });
}

/** Login recente é exigido pelo Google pra excluir a conta. */
function precisaReautenticar() {
  const ultimo = Date.parse(auth.currentUser?.metadata?.lastSignInTime || "");
  return !ultimo || Date.now() - ultimo > 4 * 60 * 1000;
}

async function excluirConta() {
  const ok = await confirmar(
    "Vamos apagar seu perfil, suas amizades, as mensagens que você escreveu e os servidores dos quais você é dono (com tudo que tem neles). Isso não tem volta.",
    { titulo: "Excluir sua conta?", botao: "Excluir minha conta" });
  if (!ok) return;
  const usuario = auth.currentUser;
  if (!usuario) return;

  // confirma que é você mesmo ANTES de apagar qualquer coisa
  if (precisaReautenticar()) {
    estado("Confirme sua conta Google na janela que abriu…");
    try {
      const provedor = new GoogleAuthProvider();
      provedor.setCustomParameters({ prompt: "select_account" });
      await reauthenticateWithPopup(usuario, provedor);
    } catch (e) {
      estado(e.code === "auth/user-mismatch"
        ? "Essa não é a mesma conta Google. Nada foi apagado."
        : "Não deu pra confirmar sua conta, então nada foi apagado. Libere janelas pop-up e tente de novo.");
      return;
    }
  }

  $("btExcluirConta").disabled = true;
  $("btBaixarDados").disabled = true;
  const uid = usuario.uid;
  try {
    if (S.call) await sairDaCall();
    Object.values(S.parar).forEach(f => { try { typeof f === "function" && f(); } catch { /* já parado */ } });

    estado("Apagando servidores…");
    for (const s of await meusServidores()) {
      if (s.data().dono === uid) await apagarServidorInteiro(s.id);
      else await sairDeixandoNada(s.id);
    }

    estado("Apagando conversas diretas…");
    for (const c of await minhasConversas()) {
      await apagarTodos(await lista(minhas(collection(db, "dms", c.id, "mensagens"))));
      await deleteDoc(doc(db, "dms", c.id, "digitando", uid)).catch(() => {});
      await deleteDoc(doc(db, "dms", c.id)).catch(() => {});
    }

    estado("Apagando amizades e perfil…");
    await apagarTodos(await minhasAmizades());
    const perfil = (await getDoc(doc(db, "usuarios", uid))).data() || {};
    if (perfil.codigo) await deleteDoc(doc(db, "codigos", perfil.codigo)).catch(() => {});
    await deleteDoc(doc(db, "usuarios", uid));

    Object.keys(localStorage).filter(k => k.startsWith("telao-") && k !== "telao-cookies").forEach(k => localStorage.removeItem(k));

    estado("Apagando a conta de login…");
    await deleteUser(usuario);
    aviso("Sua conta foi excluída.", 4000);
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    console.error(e);
    estado("Algo deu errado no meio do caminho (" + (e.code || e.message) + "). Tente de novo; o que já foi apagado não volta. Se continuar, peça pelo e-mail projetozart@gmail.com.");
    $("btExcluirConta").disabled = false;
    $("btBaixarDados").disabled = false;
  }
}

export function iniciarPrivacidade() {
  $("btBaixarDados").addEventListener("click", baixarDados);
  $("btExcluirConta").addEventListener("click", excluirConta);
}
