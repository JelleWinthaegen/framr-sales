/*
  Jarvis - sales-pagina: de kern van Framr.One Sales op sales.framr.one, zonder scherm.

  Stap 5 van Sales naar Supabase (21-10-2026). Online heeft de browser de motor niet nodig: het
  scherm (dashboard.js) praat met de Edge Function sales. Dit bestand regelt wat daarvoor nodig
  is, in gewone code zonder DOM, zodat het in Node te testen is (test/sales-pagina.test.mjs):

    1. de sessie op het Framr.One-account (Supabase Auth, dezelfde inlog als app.framr.one):
       inloggen met e-mail en wachtwoord, de sessie in de opslag van de browser, en het token
       verversen voordat het verloopt, net als framr-portaal/app/framr.js;
    2. een vervanger voor fetch: elke aanroep van /api/... gaat naar de functie, met het token
       als Bearer. Uitloggen is lokaal (de sessie weg), inloggen met een wachtwoord van Sales
       bestaat niet meer (410), en een 401 van de functie ruimt de sessie op zodat het
       inlogscherm terugkomt. Alles wat geen /api/ is gaat gewoon door.

  Het scherm merkt het verschil niet: dezelfde paden, dezelfde antwoorden. Het startbestand van
  de pagina (crm/publiceer/online/start.mjs) zet dit aan en tekent het inlogscherm.

  Stijl: blokcommentaar, geen lange streepjes en geen emoji, conform de projectafspraken.
*/

export const SESSIE_SLEUTEL = 'framr-sessie';

/* Dezelfde Nederlandse meldingen als het portaal, voor wat hier kan gebeuren. */
export const MELDINGEN = {
  'Invalid login credentials': 'Dit e-mailadres en wachtwoord horen niet bij elkaar.',
  'Email not confirmed': 'Bevestig eerst je e-mailadres via de mail die je van ons kreeg.',
};

/*
  De sessie: lezen, zetten, inloggen, verversen. opslag is localStorage of iets met dezelfde
  drie methoden; fetchFn en nu zijn te vervangen voor de tests.
*/
export function maakSessieBeheer({ supabaseUrl, anonKey, opslag, fetchFn = globalThis.fetch, nu = () => Date.now() } = {}) {
  if (!supabaseUrl || !opslag) throw new Error('maakSessieBeheer vereist supabaseUrl en opslag.');
  const lees = () => { try { return JSON.parse(opslag.getItem(SESSIE_SLEUTEL) || 'null'); } catch { return null; } };
  const zet = (s) => { if (s) opslag.setItem(SESSIE_SLEUTEL, JSON.stringify(s)); else opslag.removeItem(SESSIE_SLEUTEL); };

  async function authVraag(pad, body) {
    const r = await fetchFn(`${supabaseUrl}/auth/v1${pad}`, {
      method: 'POST', headers: { 'content-type': 'application/json', apikey: anonKey || '' }, body: JSON.stringify(body),
    });
    const inhoud = await r.json().catch(() => ({}));
    if (!r.ok) {
      const ruw = inhoud.error_description || inhoud.msg || inhoud.message || '';
      throw new Error(MELDINGEN[ruw] || ruw || 'Inloggen lukte niet.');
    }
    return inhoud;
  }
  const uitToken = (t, email) => ({
    access_token: t.access_token, refresh_token: t.refresh_token,
    verloopt_op: nu() + (t.expires_in ?? 3600) * 1000, email: (t.user && t.user.email) || email,
  });

  async function inloggen(email, wachtwoord) {
    const t = await authVraag('/token?grant_type=password', { email: String(email || '').trim(), password: wachtwoord });
    zet(uitToken(t, String(email || '').trim()));
    return lees();
  }

  /* Een geldig token, ververst als het binnen een minuut verloopt; null als er geen sessie meer is. */
  async function versToken() {
    const s = lees();
    if (!s) return null;
    if (s.verloopt_op - 60000 > nu()) return s.access_token;
    try {
      const t = await authVraag('/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
      zet(uitToken(t, s.email));
      return t.access_token;
    } catch {
      zet(null);
      return null;
    }
  }

  return { lees, zet, wis: () => zet(null), inloggen, versToken };
}

/* Het pad voor de functie: alleen /api/..., met de vraagtekens erbij; anders null. */
export function padVoorMotor(url, basis = 'http://localhost') {
  const u = new URL(url, basis);
  return u.pathname.startsWith('/api/') ? `${u.pathname}${u.search}` : null;
}

/*
  De vervanger voor fetch. motor is het adres van de functie (zonder pad erachter), sessie het
  sessiebeheer hierboven, echteFetch de fetch van de browser, bijUitloggen wat de pagina doet
  als de sessie weg is (het inlogscherm tonen).
*/
export function maakApiFetch({ motor, sessie, echteFetch, bijUitloggen = () => {}, basis = 'http://localhost' } = {}) {
  if (!motor || !sessie || !echteFetch) throw new Error('maakApiFetch vereist motor, sessie en echteFetch.');
  const json = (inhoud, status = 200) => new Response(JSON.stringify(inhoud), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  return async function apiFetch(invoer, init = {}) {
    const url = typeof invoer === 'string' ? invoer : invoer.url;
    const pad = padVoorMotor(url, basis);
    if (!pad) return echteFetch(invoer, init);
    if (pad.startsWith('/api/uitloggen')) { sessie.wis(); bijUitloggen('uitgelogd'); return json({ ok: true }); }
    if (pad.startsWith('/api/inloggen')) return json({ fout: 'Inloggen gaat via je Framr.One-account.' }, 410);
    const token = await sessie.versToken();
    if (!token) { bijUitloggen('verlopen'); return json({ fout: 'log in met je Framr.One-account.' }, 401); }
    const headers = new Headers(init.headers || {});
    headers.set('authorization', `Bearer ${token}`);
    const r = await echteFetch(`${motor}${pad}`, { ...init, headers });
    if (r.status === 401) { sessie.wis(); bijUitloggen('verlopen'); }
    return r;
  };
}
