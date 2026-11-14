/**
 * auth.js — Login com Google e conta do usuário.
 */
import {
  auth, db, doc, setDoc, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut,
} from "./firebase.js";
import { S } from "./estado.js";
import { $, esc, fotoSegura, imagemIniciais } from "./util.js";
import { NAVEGADOR_DE_APP, TEM_DIALOG } from "./compat.js";
import { sairDaCall } from "./call.js";
import { pararServidores } from "./servidores.js";

/** Traduz os erros mais comuns do login pra algo que dá pra resolver. */
function explicarErro(erro) {
  if (erro.code === "auth/unauthorized-domain") {
    if (location.protocol === "file:")
      return "Você abriu o arquivo direto do PC. Use o Live Server do VS Code ou o site no GitHub Pages.";
    return `O endereço "${location.hostname}" não está autorizado no Firebase (Authentication → Configurações → Domínios autorizados).`;
  }
  if (erro.code === "auth/operation-not-allowed") return "O login com Google não está ativado no Firebase.";
  if (erro.code === "auth/network-request-failed") return "Sem internet. Confira a conexão e tente de novo.";
  return "Erro no login: " + (erro.code || erro.message);
}

/** Abre a janelinha do Google (ou redireciona, se a janelinha for bloqueada). */
async function entrarComGoogle() {
  $("erroLogin").textContent = "";
  if (NAVEGADOR_DE_APP) {
    $("erroLogin").textContent = "Abra o site no Chrome ou no Safari pra entrar com Google.";
    return;
  }
  const provedor = new GoogleAuthProvider();
  provedor.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provedor);
  } catch (erro) {
    const bloqueado = ["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"];
    const cancelado = ["auth/popup-closed-by-user", "auth/cancelled-popup-request"];
    if (bloqueado.includes(erro.code)) return signInWithRedirect(auth, provedor);
    if (!cancelado.includes(erro.code)) $("erroLogin").textContent = explicarErro(erro);
  }
}

/** Sai da call, para de ouvir o banco e desloga. */
export async function sairDaConta() {
  await sairDaCall();
  pararServidores();
  await signOut(auth);
}

/** Mostra quem está logado e a opção de sair. */
function abrirConta() {
  if (!TEM_DIALOG) {
    if (confirm(`Conectado como ${S.nome}.\nSair da conta?`)) sairDaConta();
    return;
  }
  $("infoConta").innerHTML = `<strong>${esc(S.nome)}</strong><br>${esc(S.user?.email || "")}`;
  $("dlgConta").showModal();
}

/**
 * Liga o login.
 * @param {{ aoEntrar: Function }} opcoes  aoEntrar roda depois que a pessoa loga
 */
export function iniciarLogin({ aoEntrar }) {
  if (NAVEGADOR_DE_APP) $("avisoNavegador").hidden = false;

  getRedirectResult(auth).catch(erro => ($("erroLogin").textContent = explicarErro(erro)));
  $("btGoogle").addEventListener("click", entrarComGoogle);
  $("btConta").addEventListener("click", abrirConta);
  $("dlgConta").addEventListener("close", () => {
    if ($("dlgConta").returnValue === "sair") sairDaConta();
  });

  onAuthStateChanged(auth, async usuario => {
    S.user = usuario;
    $("telaLogin").hidden = !!usuario;
    $("telaApp").hidden = !usuario;
    if (!usuario) return;

    S.nome = usuario.displayName || (usuario.email || "Sem nome").split("@")[0];
    S.foto = usuario.photoURL || "";
    $("fotoConta").src = fotoSegura(S.foto) || imagemIniciais(S.nome);
    $("fotoConta").alt = `Conta de ${S.nome}`;

    await setDoc(doc(db, "usuarios", usuario.uid), { nome: S.nome, foto: S.foto, visto: Date.now() }, { merge: true })
      .catch(() => {});
    aoEntrar();
  });
}
