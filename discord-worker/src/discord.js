function bytesFromHex(hex) {
  if (typeof hex !== 'string' || hex.length % 2 || !/^[a-f0-9]+$/i.test(hex)) throw new Error('Hex invalide');
  return Uint8Array.from(hex.match(/../g), c => parseInt(c, 16));
}
export async function verifyDiscordSignature(body, timestamp, signature, publicKey) {
  if (!timestamp || !signature || !publicKey) return false;
  // Rejette les anciens messages pour limiter les replays (tolérance de 5 min).
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  try {
    const key = await crypto.subtle.importKey('raw', bytesFromHex(publicKey), {name:'Ed25519'}, false, ['verify']);
    const data = new TextEncoder().encode(timestamp + body);
    return crypto.subtle.verify('Ed25519', key, bytesFromHex(signature), data);
  } catch { return false; }
}
export function discordReply(content, ephemeral = true) {
  return {type:4, data:{content, flags:ephemeral ? 64 : 0, allowed_mentions:{parse:[]}}};
}
export function jsonResponse(value, status=200) {
  return new Response(JSON.stringify(value), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
export async function discordApi(env, method, path, body) {
  const response = await fetch('https://discord.com/api/v10' + path, {
    method, headers:{authorization:`Bot ${env.DISCORD_BOT_TOKEN}`,'content-type':'application/json'},
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  if (!response.ok) throw new Error(`Discord API ${response.status}: ${(await response.text()).slice(0,160)}`);
  if (response.status === 204) return null;
  return response.json();
}

// Chaque `custom_id` de composant interactif doit être unique dans un message.
// Vérification du callback AVANT de le renvoyer à Discord : si une future version
// introduit un doublon, répondre avec une erreur lisible plutôt qu'un timeout.
export function assertUniqueComponentIds(callback) {
  const ids = new Set();
  function visit(component) {
    if (typeof component?.custom_id === 'string') {
      const id = component.custom_id;
      if (id.length < 1 || id.length > 100) throw Error('custom_id hors limites Discord');
      if (ids.has(id)) throw Error(`custom_id Discord dupliqué : ${id}`);
      ids.add(id);
    }
    if (component?.component) visit(component.component);
    for (const child of component?.components || []) visit(child);
  }
  for (const component of callback?.data?.components || []) visit(component);
  return true;
}
