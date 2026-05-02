import axios from "axios";
let cached = null;
export async function getNinjaToken() {
    if (cached && Date.now() < cached.expires_at - 60_000) {
        return cached.access_token;
    }
    const params = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: process.env["NINJA_CLIENT_ID"] ?? "",
        client_secret: process.env["NINJA_CLIENT_SECRET"] ?? "",
    });
    const res = await axios.post("https://app.ninjarmm.com/oauth/token", params.toString(), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
    cached = {
        access_token: res.data.access_token,
        expires_at: Date.now() + res.data.expires_in * 1000,
    };
    return cached.access_token;
}
//# sourceMappingURL=ninja.js.map