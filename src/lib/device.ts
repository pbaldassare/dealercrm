/**
 * Identificativo di installazione: surroga dell'indirizzo MAC, che una web app non può leggere.
 * Generato al primo avvio, salvato in modo persistente e inviato a ogni richiesta come header x-device-id.
 * Il database lo confronta con dealercrm.device (stato authorized): senza dispositivo approvato non si legge nessun dato.
 */
const KEY = "dealercrm.install_id";

export function getInstallId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Storage bloccato (navigazione privata): id di sessione, il dispositivo risulterà sempre "in attesa".
    return "volatile-" + crypto.randomUUID();
  }
}

export function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Dispositivo";
  const browser = /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : "Browser";
  return `${os} · ${browser}`;
}
