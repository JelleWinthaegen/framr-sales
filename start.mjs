/*
  De start van Framr.One Sales op sales.framr.one (stap 5 van Sales naar Supabase, 21-10-2026).

  Online heeft de browser de motor niet nodig: het scherm (dashboard.js) praat met de Edge
  Function sales. Dit bestand doet drie dingen, in deze volgorde:
    1. is er een sessie op het Framr.One-account (dezelfde inlog als app.framr.one), dan gaat
       het door; anders tekent het een inlogscherm en wacht het op e-mail en wachtwoord;
    2. het vervangt fetch door de versie uit sales-pagina.mjs: elke aanroep van /api/ gaat naar
       de functie, met het token als Bearer; uitloggen is lokaal; een 401 brengt het inlogscherm
       terug (de pagina laadt opnieuw);
    3. dan pas laadt het dashboard.js, dat het verschil niet merkt.

  Er staat hier geen sleutel en geen adres: die komen uit config.js (publieke waarden, net als
  bij het portaal) dat het bouwscript crm/publiceer/pagina.mjs schrijft.
*/

import { maakSessieBeheer, maakApiFetch } from './sales-pagina.mjs?v=691eeb9f';

const CONF = window.FRAMR_SALES_CONFIG || {};
const sessie = maakSessieBeheer({ supabaseUrl: CONF.SUPABASE_URL, anonKey: CONF.ANON_KEY, opslag: localStorage });
const echteFetch = window.fetch.bind(window);
const scherm = document.getElementById('scherm');
const zijvoet = document.getElementById('zijvoet');
const e = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function toonInloggen(melding = '') {
  if (zijvoet) zijvoet.innerHTML = '<span class="naam">Niet ingelogd</span><span class="sub">je Framr.One-account</span>';
  scherm.innerHTML = `
    <style>
      .sl-inlog { max-width: 420px; margin: 48px auto; }
      .sl-inlog h1 { font-size: 30px; margin: 0 0 6px; }
      .sl-inlog p { margin: 0 0 20px; }
      .sl-inlog label { display: block; margin: 14px 0 6px; font-weight: 500; }
      .sl-inlog input { width: 100%; }
      .sl-inlog .sl-knop { margin-top: 20px; }
      .sl-inlog .sl-fout { margin-top: 14px; color: #b42318; }
      .sl-inlog .sl-sub { margin-top: 24px; font-size: 14px; }
    </style>
    <form class="sl-inlog" id="sl-inlog" autocomplete="on">
      <h1 class="fr-kop">Inloggen</h1>
      <p class="fr-hint">Met je Framr.One-account, dezelfde inlog als app.framr.one.</p>
      <label for="sl-email">E-mailadres</label>
      <input class="fr-in" id="sl-email" name="email" type="email" autocomplete="username" required>
      <label for="sl-ww">Wachtwoord</label>
      <input class="fr-in" id="sl-ww" name="wachtwoord" type="password" autocomplete="current-password" required>
      <button class="fr-knop sl-knop" type="submit">Inloggen</button>
      <div class="sl-fout" id="sl-fout" role="alert">${e(melding)}</div>
      <p class="fr-hint sl-sub">Wachtwoord vergeten? Dat zet je terug op <a href="https://app.framr.one/">app.framr.one</a>; het is dezelfde inlog.</p>
    </form>`;
  const form = document.getElementById('sl-inlog');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const knop = form.querySelector('button');
    knop.disabled = true;
    document.getElementById('sl-fout').textContent = '';
    try {
      await sessie.inloggen(document.getElementById('sl-email').value, document.getElementById('sl-ww').value);
      await startScherm();
    } catch (err) {
      document.getElementById('sl-fout').textContent = err.message || 'Inloggen lukte niet.';
      knop.disabled = false;
    }
  });
  setTimeout(() => document.getElementById('sl-email').focus(), 0);
}

async function startScherm() {
  window.fetch = maakApiFetch({ motor: CONF.MOTOR, sessie, echteFetch, basis: location.origin, bijUitloggen: () => location.reload() });
  scherm.innerHTML = '<p class="fr-hint">Laden.</p>';
  await import(`./dashboard.js?v=${encodeURIComponent(CONF.VERSIE || '')}`);
}

if (sessie.lees()) startScherm(); else toonInloggen();
