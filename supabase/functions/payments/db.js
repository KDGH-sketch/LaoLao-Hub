// Database access over Supabase's REST API (PostgREST). With a learner's token, calls run as that learner (row-level
// security and auth.uid() apply); without one they use the service key, which only this function holds.
export function postgrest({ url, anonKey, serviceKey }){
  async function call(path, { method = "GET", body, token } = {}){
    const r = await fetch(url + path, { method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { apikey: token ? anonKey : serviceKey, Authorization: "Bearer " + (token || serviceKey), "Content-Type": "application/json" } });
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
    if (!r.ok) throw Object.assign(new Error((data && data.message) || r.statusText), { status: r.status, code: data && data.code });
    return data;
  }
  const doc = r => r ? Object.assign({ id: r.id }, r.data) : null;
  return {
    rpc: (name, args = {}, o = {}) => call(`/rest/v1/rpc/${name}`, { method: "POST", body: args, token: o.token }),
    get: async (table, id, o = {}) => doc((await call(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&select=id,data`, { token: o.token }))[0]),
    paymentsOf: async (orderId) => (await call(`/rest/v1/payments?data->>orderId=eq.${encodeURIComponent(orderId)}&select=id,data`)).map(doc)
  };
}
