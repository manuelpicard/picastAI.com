const MAX_NAME = 60;
const MAX_STYLE = 700;
const MAX_REFERENCES = 5;
const MAX_REFERENCE_CHARS = 700;

function clean(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

export function buildStylePackage(profile) {
  if (!profile || !Array.isArray(profile.references) || !profile.references.length) {
    throw new Error('Für ein Stilpaket braucht dieses Profil mindestens ein freigegebenes Textbeispiel.');
  }
  const kind = profile.kind === 'kunibert' ? 'kunibert' : 'personal';
  const references = profile.references.slice(-MAX_REFERENCES).map((text) => clean(text, MAX_REFERENCE_CHARS)).filter(Boolean);
  return {
    format: 'erzaehlerschmiede-style-package',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      name: clean(profile.name, MAX_NAME) || 'Importierter Erzähler',
      kind,
      style: clean(profile.style, MAX_STYLE),
      references,
    },
  };
}

export function parseStylePackage(raw) {
  if (!raw || typeof raw !== 'object' || raw.format !== 'erzaehlerschmiede-style-package' || raw.version !== 1) {
    throw new Error('Das ist kein unterstütztes Erzählerschmiede-Stilpaket.');
  }
  const incoming = raw.profile;
  if (!incoming || typeof incoming !== 'object') throw new Error('Im Stilpaket fehlt das Erzählerprofil.');
  const name = clean(incoming.name, MAX_NAME);
  if (!name) throw new Error('Das Stilpaket enthält keinen Profilnamen.');
  if (!['personal', 'kunibert'].includes(incoming.kind)) throw new Error('Der Profiltyp im Stilpaket ist ungültig.');
  if (!Array.isArray(incoming.references)) throw new Error('Das Stilpaket enthält keine gültige Beispiel-Liste.');
  const references = incoming.references.slice(-MAX_REFERENCES).map((text) => clean(text, MAX_REFERENCE_CHARS)).filter(Boolean);
  if (!references.length) throw new Error('Das Stilpaket enthält keine freigegebenen Textbeispiele.');
  return {
    name,
    kind: incoming.kind,
    style: clean(incoming.style, MAX_STYLE),
    references,
  };
}

export function mergeStylePackage(data, packageProfile, idFactory = () => `imported-${globalThis.crypto.randomUUID()}`) {
  if (!data || !Array.isArray(data.profiles)) throw new Error('Lokale Profile konnten nicht geladen werden.');
  const target = data.profiles.find((profile) =>
    profile.kind === packageProfile.kind && profile.name.trim().toLocaleLowerCase() === packageProfile.name.toLocaleLowerCase(),
  );
  if (target) {
    const merged = [...target.references];
    let added = 0;
    for (const reference of packageProfile.references) {
      if (!merged.includes(reference)) { merged.push(reference); added += 1; }
    }
    target.references = merged.slice(-MAX_REFERENCES);
    return { profile: target, created: false, added };
  }
  const profile = {
    id: idFactory(),
    name: packageProfile.name,
    kind: packageProfile.kind,
    style: packageProfile.style,
    references: packageProfile.references.slice(-MAX_REFERENCES),
    feedback: [],
    messages: [],
  };
  data.profiles.push(profile);
  return { profile, created: true, added: profile.references.length };
}
