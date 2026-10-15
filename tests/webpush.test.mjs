// Web Push (supabase/functions/_shared/webpush.ts): o conteúdo cifrado é aberto aqui com o node:crypto (como faria o
// navegador, RFC 8291) e a assinatura VAPID é conferida com a chave pública — duas implementações independentes.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { cifrarPush, cabecalhoVapid, b64url, deB64url } from "../supabase/functions/_shared/webpush.ts";

function decifrar(corpo, uaEcdh, authSecret) {
  const salt = corpo.subarray(0, 16), idlen = corpo[20], asPub = corpo.subarray(21, 21 + idlen), cifrado = corpo.subarray(21 + idlen);
  const uaPub = uaEcdh.getPublicKey();
  const compartilhado = uaEcdh.computeSecret(asPub);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", compartilhado, authSecret, info, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(cifrado.subarray(cifrado.length - 16));
  const claro = Buffer.concat([d.update(cifrado.subarray(0, cifrado.length - 16)), d.final()]);
  assert.equal(claro[claro.length - 1], 2); // delimitador do último registro
  return claro.subarray(0, claro.length - 1).toString("utf8");
}

test("conteúdo cifrado (aes128gcm) abre no lado do aparelho", async () => {
  const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
  const auth = crypto.randomBytes(16);
  const texto = JSON.stringify({ titulo: "📧 Luz", corpo: "R$ 187,40 · vence 10/11", url: "./" });
  const corpo = await cifrarPush(texto, b64url(ua.getPublicKey()), b64url(auth));
  assert.equal(corpo.readUInt32BE?.(16) ?? new DataView(corpo.buffer).getUint32(16), 4096);
  assert.equal(decifrar(Buffer.from(corpo), ua, auth), texto);
});

test("VAPID: JWT ES256 válido para a origem do endpoint", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = privateKey.export({ format: "jwk" });
  const h = await cabecalhoVapid("https://fcm.googleapis.com/fcm/send/abc", jwk);
  const [, t, k] = h.match(/^vapid t=([^,]+), k=(.+)$/);
  const [cab, carga, ass] = t.split(".");
  const claims = JSON.parse(Buffer.from(deB64url(carga)).toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.ok(claims.exp > Date.now() / 1000);
  const ok = crypto.verify("sha256", Buffer.from(`${cab}.${carga}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(deB64url(ass)));
  assert.ok(ok);
  assert.deepEqual(Buffer.from(deB64url(k)), publicKey.export({ format: "der", type: "spki" }).subarray(-65));
});
