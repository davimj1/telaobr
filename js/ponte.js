/**
 * ponte.js — Configurar a ponte de conexão (TURN) pelo próprio site.
 *
 * A senha fica no Firestore (config/turn), não no código do GitHub.
 * Quem salvar primeiro vira o "dono" da configuração e só ele pode trocar depois
 * (regra em firestore.rules). Os outros só leem, e só se tiverem entrado com Google.
 */
import { db, doc, getDoc, setDoc } from "./firebase.js";
import { S } from "./estado.js";
import { $, aviso } from "./util.js";
import { esquecerIce } from "./rtc.js";

const refPonte = () => doc(db, "config", "turn");

/** Mostra o quadro da ponte na janela da conta (só pra quem pode configurar). */
export async function renderPonte() {
  const grupo = $("grupoPonte");
  let dados = null;
  try {
    const snap = await getDoc(refPonte());
    dados = snap.exists() ? snap.data() : null;
  } catch {
    grupo.hidden = true;
    return;
  }
  const possoMexer = !dados || dados.dono === S.user.uid;
  grupo.hidden = !possoMexer;
  if (!possoMexer) return;

  $("ponteEstado").textContent = dados
    ? "✅ Ponte configurada. Pra trocar a senha, preencha de novo e salve."
    : "Ainda não configurada. Cole o Username e o Password da credencial da Metered. Quem salvar primeiro é o único que pode trocar depois.";
  $("campoPonteUsuario").value = dados?.usuario || "";
  $("campoPonteSenha").value = "";
  $("campoPonteSenha").placeholder = dados ? "•••••••• (deixe vazio pra manter)" : "";
  $("selPonteRegiao").value = dados?.regiao || "global";
}

async function salvarPonte() {
  const usuario = $("campoPonteUsuario").value.trim();
  let senha = $("campoPonteSenha").value.trim();
  const regiao = $("selPonteRegiao").value;
  if (!senha) {
    // mantendo a senha antiga (só trocando usuário/região)
    const snap = await getDoc(refPonte()).catch(() => null);
    senha = snap?.exists() ? snap.data().senha : "";
  }
  if (!usuario || !senha) return aviso("Preencha o Username e o Password.");
  try {
    await setDoc(refPonte(), { usuario, senha, regiao, dono: S.user.uid });
    esquecerIce();
    aviso("Ponte salva! Vale a partir da próxima vez que alguém entrar num canal de voz.");
    renderPonte();
  } catch (erro) {
    aviso(erro.code === "permission-denied"
      ? "Sem permissão: publique o firestore.rules novo no Firebase (ou outra pessoa já configurou a ponte)."
      : "Não deu pra salvar: " + (erro.code || erro.message));
  }
}

export function iniciarPonte() {
  $("btSalvarPonte").addEventListener("click", salvarPonte);
}
