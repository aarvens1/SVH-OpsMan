import axios from "axios";
const cache = new Map();
export async function getGraphToken(scope) {
    const entry = cache.get(scope);
    if (entry && Date.now() < entry.expires_at - 60_000) {
        return entry.access_token;
    }
    const tenantId = process.env["GRAPH_TENANT_ID"];
    const clientId = process.env["GRAPH_CLIENT_ID"];
    const clientSecret = process.env["GRAPH_CLIENT_SECRET"];
    const params = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId ?? "",
        client_secret: clientSecret ?? "",
        scope,
    });
    const res = await axios.post(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    const newEntry = {
        access_token: res.data.access_token,
        expires_at: Date.now() + res.data.expires_in * 1000,
    };
    cache.set(scope, newEntry);
    return newEntry.access_token;
}
//# sourceMappingURL=graph.js.map