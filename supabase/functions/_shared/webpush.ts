// Notificação no aparelho (Web Push) para quem não usa o Telegram: o e-mail de conta e as movimentações do Pluggy
// avisam por aqui. Só WebCrypto (sem biblioteca): criptografia do conteúdo pela RFC 8291 (aes128gcm) e assinatura
// VAPID (RFC 8292, ES256). As inscrições ficam em push_inscricoes (uma por aparelho); a chave privada VAPID, em
// app_cron_segredo (nome 'vapid_jwk', JWK), e a pública em js/config.js (VAPID_PUBLICA).

const enc = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;
const txt = (s: string) => enc.encode(s) as Bytes;

export function b64url(bytes: Bytes): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function deB64url(s: string): Bytes {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
const juntar = (...partes: Bytes[]) => {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
};
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bytes * 8));
}

/** Conteúdo cifrado (corpo do POST, Content-Encoding: aes128gcm) para a inscrição p256dh/auth. */
export async function cifrarPush(texto: string, p256dh: string, auth: string, salt = crypto.getRandomValues(new Uint8Array(16))): Promise<Bytes> {
  const uaPub = deB64url(p256dh), segredo = deB64url(auth);
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartilhado = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, par.privateKey, 256));
  const ikm = await hkdf(segredo, compartilhado, juntar(txt("WebPush: info\0"), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, txt("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, txt("Content-Encoding: nonce\0"), 12);
  const chave = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, chave, juntar(txt(texto), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // tamanho do registro: 4096
  return juntar(salt, rs, new Uint8Array([asPub.length]), asPub, cifrado);
}

/** Cabeçalho Authorization do VAPID para o endpoint (aud = origem do serviço de push). */
export async function cabecalhoVapid(endpoint: string, jwk: JsonWebKey, sub = "https://apps-rafa.github.io/ctrl-fin"): Promise<string> {
  const priv = await crypto.subtle.importKey("jwk", { ...jwk, key_ops: ["sign"] }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const pub = juntar(new Uint8Array([4]), deB64url(jwk.x!), deB64url(jwk.y!));
  const parte = (o: unknown) => b64url(txt(JSON.stringify(o)));
  const corpo = `${parte({ typ: "JWT", alg: "ES256" })}.${parte({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub })}`;
  const assinatura = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, priv, txt(corpo)));
  return `vapid t=${corpo}.${b64url(assinatura)}, k=${b64url(pub)}`;
}

export interface AvisoPush { titulo: string; corpo: string; url?: string; tag?: string }

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Manda o aviso para todos os aparelhos inscritos do usuário. Inscrição expirada (404/410) é apagada.
 *  Devolve quantos aparelhos receberam (0 = sem inscrição ou sem chave VAPID: o chamador segue sem aviso). */
export async function enviarPush(admin: Admin, userId: string, aviso: AvisoPush): Promise<number> {
  try {
    const [{ data: subs }, { data: seg }] = await Promise.all([
      admin.from("push_inscricoes").select("id, endpoint, p256dh, auth").eq("user_id", userId),
      admin.from("app_cron_segredo").select("valor").eq("nome", "vapid_jwk").maybeSingle(),
    ]);
    if (!subs?.length || !seg?.valor) return 0;
    const jwk = JSON.parse(seg.valor) as JsonWebKey;
    const texto = JSON.stringify({ titulo: aviso.titulo, corpo: aviso.corpo.slice(0, 600), url: aviso.url ?? "./", tag: aviso.tag });
    let ok = 0;
    for (const s of subs as { id: number; endpoint: string; p256dh: string; auth: string }[]) {
      try {
        const resp = await fetch(s.endpoint, {
          method: "POST",
          headers: { Authorization: await cabecalhoVapid(s.endpoint, jwk), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal" },
          body: await cifrarPush(texto, s.p256dh, s.auth),
        });
        if (resp.status === 404 || resp.status === 410) await admin.from("push_inscricoes").delete().eq("id", s.id);
        else if (resp.ok) ok++;
        else console.error("push recusado:", resp.status, await resp.text());
      } catch (e) { console.error("push falhou:", e); }
    }
    return ok;
  } catch (e) {
    console.error("enviarPush:", e);
    return 0;
  }
}

/** SHA-256 em hex — o segredo pessoal do script do Gmail é guardado (e procurado) só assim (email_contas_config.segredo_hash). */
export async function sha256Hex(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", txt(texto)));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}
