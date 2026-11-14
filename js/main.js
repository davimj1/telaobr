/**
 * main.js — Ponto de entrada do Telão. Só liga as partes, na ordem certa.
 *
 *   config.js      configurações (Firebase, qualidade, limites)
 *   firebase.js    conexão com o Firebase
 *   estado.js      estado global do app
 *   util.js        funções pequenas reutilizáveis
 *   compat.js      celular, iPhone, navegadores
 *   ui.js          redesenhar a tela e abas do celular
 *   auth.js        login com Google
 *   servidores.js  criar/abrir/convidar/sair de servidores
 *   chat.js        mensagens
 *   call.js        entrar/sair da call e presença
 *   rtc.js         conexões de voz/vídeo (WebRTC)
 *   midia.js       microfone, câmera, tela, ensurdecer
 *   palco.js       área central com telas e pessoas
 *   fala.js        indicador de quem está falando
 */
import { iniciarCompat } from "./compat.js";
import { iniciarAbas, renderTudo } from "./ui.js";
import { iniciarLogin } from "./auth.js";
import { iniciarServidores, ouvirServidores, tratarConvite } from "./servidores.js";
import { iniciarChat } from "./chat.js";
import { iniciarCall } from "./call.js";
import { iniciarMidia } from "./midia.js";

iniciarCompat();
iniciarAbas();
iniciarServidores();
iniciarChat();
iniciarCall();
iniciarMidia();

iniciarLogin({
  async aoEntrar() {
    ouvirServidores();
    await tratarConvite();
    renderTudo();
  },
});
