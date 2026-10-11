// Supabase falso para capturas locales: auth mínima + proxy a PostgREST + storage en disco.
import http from "node:http"; import crypto from "node:crypto"; import fs from "node:fs"; import path from "node:path";
const SECRET = "demo-secret-demo-secret-demo-secret-0123456789", DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "storage");
const USER_ID = process.env.DEMO_USER_ID, EMAIL = "maurizio@maurinventario.app";
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const sign = (claims) => { const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims); return `${h}.${p}.${crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const now = () => Math.floor(Date.now() / 1000);
const user = { id: USER_ID, aud: "authenticated", role: "authenticated", email: EMAIL, app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
const session = () => { const exp = now() + 3600 * 24; return { access_token: sign({ sub: USER_ID, role: "authenticated", aud: "authenticated", email: EMAIL, exp, iat: now(), session_id: "demo" }), token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "demo-refresh", user }; };
const service = sign({ role: "service_role", exp: now() + 86400 * 30, iat: now() });
const body = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });
const json = (res, code, o) => { res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" }); res.end(JSON.stringify(o)); };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }); return res.end(); }
  if (u.pathname.startsWith("/auth/v1/")) {
    const p = u.pathname.slice(9);
    if (p === "token") return json(res, 200, session());
    if (p === "user") return json(res, 200, user);
    if (p === "logout") { res.writeHead(204); return res.end(); }
    return json(res, 200, {});
  }
  if (u.pathname.startsWith("/storage/v1/")) {
    const p = decodeURIComponent(u.pathname.slice(12));
    let m;
    if (req.method === "POST" && (m = p.match(/^object\/sign\/([^/]+)$/))) { const b = JSON.parse((await body(req)).toString()); return json(res, 200, b.paths.map((x) => ({ path: x, signedURL: `/object/sign/${m[1]}/${x}?token=demo`, error: null }))); }
    if (req.method === "POST" && (m = p.match(/^object\/sign\/([^/]+)\/(.+)$/))) return json(res, 200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=demo` });
    if (req.method === "GET" && (m = p.match(/^object\/(?:sign|public|authenticated)\/(.+)$/))) { const f = path.join(DIR, m[1]); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": f.endsWith(".pdf") ? "application/pdf" : "image/jpeg", "access-control-allow-origin": "*" }); return fs.createReadStream(f).pipe(res); }
    if ((req.method === "POST" || req.method === "PUT") && (m = p.match(/^object\/(.+)$/))) { const f = path.join(DIR, m[1]); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, await body(req)); return json(res, 200, { Key: m[1] }); }
    if (req.method === "DELETE") return json(res, 200, []);
    return json(res, 200, []);
  }
  if (u.pathname.startsWith("/rest/v1/")) {
    const headers = { ...req.headers }; delete headers.host;
    const auth = (headers.authorization || "").replace(/^Bearer /, "");
    if (auth.startsWith("sb_secret")) headers.authorization = `Bearer ${service}`;
    else if (auth.split(".").length !== 3) delete headers.authorization;
    const b = await body(req);
    const up = http.request({ host: "127.0.0.1", port: 3001, method: req.method, path: u.pathname.slice(8) + u.search, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    up.end(b); return;
  }
  json(res, 404, { error: "not found" });
}).listen(54321, () => console.log("gateway :54321"));
