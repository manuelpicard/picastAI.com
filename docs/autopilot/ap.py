#!/usr/bin/env python3
"""Hilfsprogramm für den Wochen-Autopiloten (siehe README.md in diesem Ordner).

Es spart den Läufen Schritte und Nutzungslimit. Die Regeln stehen im Auftrag der
Läufe und in README.md; dieses Programm setzt sie nur um. Im Zweifel gilt der
Auftrag. Meldet das Programm einen Fehler, geht es von Hand mit `gh api` weiter.

Aufrufe im Repo-Ordner:
  python3 docs/autopilot/ap.py fahrplan <Rolle>            arbeitet dieser Lauf, oder ist Pause?
  python3 docs/autopilot/ap.py lage                        die Lage in wenigen Zeilen
  python3 docs/autopilot/ap.py status <PR> <Wert>          in-arbeit | fertig | "blockiert: <Grund>"
  python3 docs/autopilot/ap.py mergen <PR>                 prüfen, auf Checks warten, mergen
  python3 docs/autopilot/ap.py lauf <Rolle> start|ende ["<Ergebnis>"]
  python3 docs/autopilot/ap.py bericht <Datei>             Bericht ins Issue (ohne Projects)

Rückgabe von `fahrplan`: 0 arbeiten, 10 Pause.
Rückgabe von `mergen`: 0 gemergt, 1 rot, 2 läuft noch, 3 erst main einmergen,
4 nicht erlaubt, 5 gemergt, aber main danach rot. Sonst: 0 gut, 1 Fehler.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

REPO = "manuelpicard/picastAI.com"
EIGENTUEMER = "manuelpicard"
BRANCH_PRAEFIX = "claude/autopilot-"
PFLICHT_CHECKS = ("test", "pi-audio", "firestore-emulator")
GUTE_ERGEBNISSE = {"success", "skipped", "neutral"}
BERLIN = ZoneInfo("Europe/Berlin")
WOCHENTAGE = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")
VERWAIST_NACH = timedelta(minutes=60)
PLANUNG_UEBERFAELLIG = timedelta(hours=30)
PRUEFUNG_UEBERFAELLIG = timedelta(hours=36)
PRUEFUNG_ZEITRAUM = timedelta(hours=48)
FAHRPLAN_TOLERANZ_MIN = 120
ISSUE_BERICHTE = "Wochen-Autopilot: Berichte"
ISSUE_LAEUFE = "Wochen-Autopilot: Laufprotokoll"
ORDNER = Path(__file__).resolve().parent
ARBEITSLISTE = ORDNER / "backlog.md"
FAHRPLAN = ORDNER / "fahrplan.md"


class GhFehler(RuntimeError):
    """`gh api` ist gescheitert."""


# ---------------------------------------------------------------- Zeit

def jetzt() -> datetime:
    return datetime.now(timezone.utc)


def iso(text: str | None) -> datetime | None:
    if not text:
        return None
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


def berlin(zeit: datetime) -> str:
    b = zeit.astimezone(BERLIN)
    return f"{WOCHENTAGE[b.weekday()]} {b:%d.%m. %H:%M}"


def phase(zeit: datetime) -> tuple[str, str]:
    """Wochenphase: Endspurt von Donnerstag 07:00 bis Freitag 07:59, sonst Wochenmodus."""
    b = zeit.astimezone(BERLIN)
    tag, stunde = b.weekday(), b.hour
    if (tag == 3 and stunde >= 7) or (tag == 4 and stunde < 8):
        return "Endspurt", "weiter, bis das Limit greift (bis Fr 07:59)"
    return "Wochenmodus", "ein Punkt je Lauf (Endspurt ab Do 07:00)"


# ---------------------------------------------------------------- Status-Zeile

STATUS_RE = re.compile(r"^\s*Status:\s*(in Arbeit|fertig|blockiert)\b\s*(?:\((.*)\))?", re.IGNORECASE)
STATUS_ZEILE_RE = re.compile(r"^\s*Status:", re.IGNORECASE)
ZEIT_RE = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{2,4})?\s*,?\s*(\d{1,2}):(\d{2})")


@dataclass
class Status:
    art: str  # "in Arbeit", "fertig", "blockiert" oder "ohne"
    zeit: datetime | None = None
    grund: str = ""


def zeit_aus(text: str, bezug: datetime) -> datetime | None:
    """Liest „TT.MM. HH:MM“ (Europe/Berlin). Ohne Jahr gilt das Jahr von `bezug`."""
    treffer = ZEIT_RE.search(text or "")
    if not treffer:
        return None
    tag, monat, jahr, stunde, minute = treffer.groups()
    b = bezug.astimezone(BERLIN)
    j = int(jahr) if jahr else b.year
    if jahr and j < 100:
        j += 2000
    try:
        zeit = datetime(j, int(monat), int(tag), int(stunde), int(minute), tzinfo=BERLIN)
    except ValueError:
        return None
    if not jahr and zeit - b > timedelta(days=1):
        zeit = zeit.replace(year=j - 1)
    return zeit


def lies_status(text: str | None, bezug: datetime) -> Status:
    erste = (text or "").split("\n", 1)[0].strip()
    treffer = STATUS_RE.match(erste)
    if not treffer:
        return Status("ohne")
    art = {"in arbeit": "in Arbeit", "fertig": "fertig", "blockiert": "blockiert"}[treffer.group(1).lower()]
    klammer = (treffer.group(2) or "").strip()
    if art == "in Arbeit":
        return Status(art, zeit=zeit_aus(klammer, bezug))
    if art == "blockiert":
        return Status(art, grund=klammer)
    return Status(art)


def status_zeile(art: str, zeit: datetime, grund: str = "") -> str:
    if art == "in Arbeit":
        return f"Status: in Arbeit ({zeit.astimezone(BERLIN):%d.%m. %H:%M})"
    if art == "fertig":
        return "Status: fertig"
    if art == "blockiert":
        return f"Status: blockiert ({grund.strip() or 'ohne Grund'})"
    raise ValueError(art)


def setze_status(text: str | None, zeile: str) -> str:
    """Ersetzt die erste Zeile, wenn sie eine Status-Zeile ist; sonst kommt die Zeile davor."""
    text = text or ""
    erste, trenner, rest = text.partition("\n")
    if STATUS_ZEILE_RE.match(erste):
        return zeile + trenner + rest
    return zeile + ("\n\n" + text if text else "")


# ---------------------------------------------------------------- PRs

def ist_autopilot_titel(titel: str | None) -> bool:
    return "[autopilot" in (titel or "").lower()


def ist_eigen(pr: dict) -> bool:
    """Nur PRs aus diesem Repo, Branch claude/autopilot-…, angelegt vom Eigentümer."""
    kopf = pr.get("head") or {}
    repo = (kopf.get("repo") or {}).get("full_name") or ""
    return (
        ist_autopilot_titel(pr.get("title"))
        and repo.lower() == REPO.lower()
        and (kopf.get("ref") or "").startswith(BRANCH_PRAEFIX)
        and ((pr.get("user") or {}).get("login") or "") == EIGENTUEMER
    )


def belegte_ids(titel: str | None) -> list[str]:
    treffer = re.search(r"\[Autopilot\s+([^\]]+)\]", titel or "", re.IGNORECASE)
    return treffer.group(1).split() if treffer else []


def kurz(text: str | None, laenge: int = 70) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= laenge else text[: laenge - 1] + "…"


def bewerte_checks(laeufe: list[dict]) -> tuple[str, str]:
    """grün, rot, läuft, wartet (Pflicht-Check fehlt noch) oder fehlt (Pflicht-Check nicht erfolgreich gelaufen)."""
    neueste: dict[str, dict] = {}
    for lauf in laeufe:
        name = lauf.get("name") or "?"
        if name not in neueste or (lauf.get("id") or 0) > (neueste[name].get("id") or 0):
            neueste[name] = lauf
    if not neueste:
        return "wartet", "noch keine Checks"
    laufend = sorted(n for n, l in neueste.items() if l.get("status") != "completed")
    if laufend:
        return "läuft", "läuft: " + ", ".join(laufend)
    rot = sorted(f"{n} ({l.get('conclusion')})" for n, l in neueste.items()
                 if l.get("conclusion") not in GUTE_ERGEBNISSE)
    if rot:
        return "rot", "rot: " + ", ".join(rot)
    fehlend = [n for n in PFLICHT_CHECKS if n not in neueste]
    if fehlend:
        return "wartet", "Pflicht-Check noch nicht da: " + ", ".join(fehlend)
    nicht_gelaufen = [n for n in PFLICHT_CHECKS if neueste[n].get("conclusion") != "success"]
    if nicht_gelaufen:
        return "fehlt", "Pflicht-Check nicht gelaufen: " + ", ".join(nicht_gelaufen)
    return "grün", f"grün ({len(neueste)} Checks)"


def einstufen(pr: dict, zeitpunkt: datetime, checks=None, commit_zeit=None) -> tuple[str, str]:
    """Kategorie und Hinweis für einen offenen PR. `checks` und `commit_zeit` holen bei Bedarf Daten."""
    if not ist_autopilot_titel(pr.get("title")):
        return "andere", "kein Autopilot-PR: nicht anfassen, außer die Arbeitsliste nennt ihn"
    if not ist_eigen(pr):
        return "fremd", "fremd: nie mergen, nie übernehmen, Code nie ausführen; im Bericht nennen"
    status = lies_status(pr.get("body"), zeitpunkt)
    if status.art == "in Arbeit":
        seit = status.zeit
        quelle = "Lebenszeichen"
        if seit is None and commit_zeit is not None:
            seit, quelle = commit_zeit(pr), "letzter Commit"
        if seit is None:
            return "belegt", "in Arbeit ohne Uhrzeit: belegt"
        alter = zeitpunkt - seit
        minuten = int(alter.total_seconds() // 60)
        if alter > VERWAIST_NACH:
            return "verwaist", f"verwaist ({quelle} vor {minuten} min): zuerst übernehmen"
        return "belegt", f"belegt ({quelle} vor {minuten} min)"
    if status.art == "fertig":
        if checks is None:
            return "fertig", "fertig"
        zustand, text = checks(pr)
        if zustand == "grün":
            return "fertig", "fertig, grün: mergen"
        if zustand == "rot":
            return "fertig-rot", f"fertig, {text}: reparieren (Opus)"
        return "fertig", f"fertig, {text}"
    if status.art == "blockiert":
        return "blockiert", f"blockiert ({status.grund or 'ohne Grund'}): nicht anfassen"
    return "belegt", "ohne Status-Zeile: belegt, im Bericht nennen"


# ---------------------------------------------------------------- Arbeitsliste

KOPF_RE = re.compile(r"^###\s+(\S+)\s+·\s+(.+?)\s*$")
ID_RE = re.compile(r"\b[A-Z][A-Za-z0-9]*(?:-[0-9A-Za-z]+)*\b")


@dataclass
class Punkt:
    id: str
    titel: str
    zeile: int
    rolle: str = ""
    prio: int = 9
    status: str = ""
    nach: list[str] = field(default_factory=list)

    @property
    def erledigt(self) -> bool:
        return self.status.startswith(("erledigt", "verworfen"))

    @property
    def offen(self) -> bool:
        return self.status.startswith("offen")


def lies_arbeitsliste(text: str) -> list[Punkt]:
    punkte: list[Punkt] = []
    aktuell: Punkt | None = None
    for nummer, zeile in enumerate(text.splitlines(), 1):
        kopf = KOPF_RE.match(zeile)
        if kopf:
            aktuell = Punkt(kopf.group(1), kopf.group(2), nummer)
            punkte.append(aktuell)
            continue
        if aktuell is None or aktuell.rolle or not zeile.startswith("- Rolle:"):
            continue
        for teil in (t.strip() for t in zeile[2:].split(" · ")):
            schluessel, _, wert = teil.partition(":")
            if schluessel == "Rolle":
                aktuell.rolle = wert.strip()
            elif schluessel == "Prio":
                zahl = re.match(r"\s*(\d+)", wert)
                aktuell.prio = int(zahl.group(1)) if zahl else 9
            elif schluessel == "Status":
                aktuell.status = wert.strip()
            elif teil.startswith("Nach "):
                aktuell.nach = ID_RE.findall(teil[5:])
    return punkte


def freie_punkte(punkte: list[Punkt], belegt: set[str]) -> list[Punkt]:
    """Offen, nicht belegt, „Nach …“ erfüllt; sortiert nach Prio, dann Position."""
    nach_id = {p.id: p for p in punkte}
    frei = []
    for punkt in punkte:
        if not punkt.offen or punkt.id in belegt:
            continue
        if any(not (nach_id.get(n) and nach_id[n].erledigt) for n in punkt.nach):
            continue
        frei.append(punkt)
    return sorted(frei, key=lambda p: (p.prio, p.zeile))


# ---------------------------------------------------------------- Fahrplan

ZEILE_FAHRPLAN_RE = re.compile(r"^\|\s*([^|]+?)\s*\|\s*(\d{1,2}):(\d{2})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|")


def normale_rolle(rolle: str) -> str:
    rolle = " ".join(rolle.lower().replace("&", " und ").split())
    if rolle.startswith("planen"):
        return "planen"
    return rolle.split(" ")[0] if rolle else ""


def lies_fahrplan(text: str) -> list[tuple[str, int, str, str]]:
    """Zeilen (Rolle, Minute des Tages, Wochenmodus, Endspurt) aus der Tabelle in fahrplan.md."""
    zeilen = []
    for zeile in text.splitlines():
        treffer = ZEILE_FAHRPLAN_RE.match(zeile)
        if treffer and treffer.group(1).lower() != "rolle":
            rolle, stunde, minute, woche, endspurt = treffer.groups()
            zeilen.append((rolle.strip(), int(stunde) * 60 + int(minute), woche.strip(), endspurt.strip()))
    return zeilen


def entscheide_fahrplan(zeilen, rolle: str, zeitpunkt: datetime) -> tuple[bool, str]:
    """Sucht den Termin der Rolle, der am nächsten an der Startzeit liegt."""
    b = zeitpunkt.astimezone(BERLIN)
    jetzt_min = b.hour * 60 + b.minute
    name, _ = phase(zeitpunkt)
    beste = None
    for r, minute, woche, endspurt in zeilen:
        if normale_rolle(r) != normale_rolle(rolle):
            continue
        abstand = min((jetzt_min - minute) % 1440, (minute - jetzt_min) % 1440)
        if beste is None or abstand < beste[0]:
            beste = (abstand, r, minute, woche, endspurt)
    if beste is None or beste[0] > FAHRPLAN_TOLERANZ_MIN:
        return True, f"Fahrplan: kein Termin für „{rolle}“ nahe {b:%H:%M}; der Lauf arbeitet."
    _, r, minute, woche, endspurt = beste
    eintrag = endspurt if name == "Endspurt" else woche
    termin = f"{r} {minute // 60:02d}:{minute % 60:02d}"
    if eintrag.lower().startswith("pause"):
        return False, f"Fahrplan: {termin} im {name}: Pause. Lauf beenden."
    tage = re.findall(r"\b(Mo|Di|Mi|Do|Fr|Sa|So)\b", eintrag)
    heute = WOCHENTAGE[b.weekday()]
    if tage and heute not in tage:
        return False, f"Fahrplan: {termin} im {name}: heute ({heute}) Pause. Lauf beenden."
    return True, f"Fahrplan: {termin} im {name}: arbeiten ({phase(zeitpunkt)[1]})."


# ---------------------------------------------------------------- GitHub

def gh(pfad: str, *, methode: str = "GET", daten: dict | None = None):
    befehl = ["gh", "api", "-X", methode, pfad]
    datei = None
    try:
        if daten is not None:
            datei = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
            json.dump(daten, datei, ensure_ascii=False)
            datei.close()
            befehl += ["--input", datei.name]
        lauf = subprocess.run(befehl, capture_output=True, text=True, timeout=90)
    finally:
        if datei is not None:
            Path(datei.name).unlink(missing_ok=True)
    if lauf.returncode != 0:
        meldung = (lauf.stderr or lauf.stdout).strip().splitlines()
        raise GhFehler(f"gh api {methode} {pfad}: {meldung[-1] if meldung else 'Fehler'}")
    text = lauf.stdout.strip()
    return json.loads(text) if text else None


def checks_von(sha: str) -> list[dict]:
    return (gh(f"repos/{REPO}/commits/{sha}/check-runs?per_page=100") or {}).get("check_runs") or []


def eigene_kommentare(nummer: int, seit: datetime | None = None) -> list[dict]:
    pfad = f"repos/{REPO}/issues/{nummer}/comments?per_page=100"
    if seit is not None:
        pfad += "&since=" + seit.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return [k for k in (gh(pfad) or []) if ((k.get("user") or {}).get("login")) == EIGENTUEMER]


def finde_issue(titel: str, anlegen: bool, beschreibung: str = "") -> int | None:
    liste = gh(f"repos/{REPO}/issues?state=open&creator={EIGENTUEMER}&per_page=100") or []
    for eintrag in liste:
        if "pull_request" not in eintrag and eintrag.get("title") == titel:
            return eintrag["number"]
    if not anlegen:
        return None
    return gh(f"repos/{REPO}/issues", methode="POST", daten={"title": titel, "body": beschreibung})["number"]


def main_ci() -> tuple[str, str, str]:
    lauf = ((gh(f"repos/{REPO}/actions/workflows/tests.yml/runs?branch=main&per_page=1") or {})
            .get("workflow_runs") or [{}])[0]
    zustand = lauf.get("conclusion") or lauf.get("status") or "?"
    return (lauf.get("head_sha") or "")[:7], zustand, lauf.get("updated_at") or ""


# ---------------------------------------------------------------- Befehle

def befehl_fahrplan(rolle: str) -> int:
    if not FAHRPLAN.exists():
        print("Fahrplan: fahrplan.md fehlt; der Lauf arbeitet.")
        return 0
    arbeiten, text = entscheide_fahrplan(lies_fahrplan(FAHRPLAN.read_text(encoding="utf-8")), rolle, jetzt())
    print(text)
    return 0 if arbeiten else 10


def befehl_lage() -> int:
    zeitpunkt = jetzt()
    name, regel = phase(zeitpunkt)
    print(f"Lage {berlin(zeitpunkt)} (Europe/Berlin) · {name}: {regel}")
    sha, zustand, zeit = main_ci()
    hinweis = "  ROT: Reparatur zuerst (Lauf mit Opus)" if zustand not in ("success", "in_progress", "queued") else ""
    print(f"main {sha} · CI „Tests“: {zustand}" + (f" ({berlin(iso(zeit))})" if zeit else "") + hinweis)

    offene = gh(f"repos/{REPO}/pulls?state=open&per_page=100") or []
    belegt: set[str] = set()
    eigene_offen = 0
    print("Offene PRs:" if offene else "Offene PRs: keine")
    for pr in offene:
        kategorie, text = einstufen(
            pr, zeitpunkt,
            checks=lambda p: bewerte_checks(checks_von(p["head"]["sha"])),
            commit_zeit=lambda p: iso(((gh(f"repos/{REPO}/git/commits/{p['head']['sha']}") or {})
                                       .get("committer") or {}).get("date")),
        )
        if kategorie not in ("andere", "fremd"):
            belegt.update(belegte_ids(pr.get("title")))
            if kategorie != "blockiert":
                eigene_offen += 1
        print(f"  #{pr['number']} [{kategorie}] {text} · {kurz(pr.get('title'))}")
    grenze = 6 if name == "Endspurt" else 3
    erlaubt = "ja" if eigene_offen < grenze else "nein, erst einen fertig machen"
    print(f"Eigene Autopilot-PRs offen (ohne blockiert): {eigene_offen} von höchstens {grenze} · neue Punkte: {erlaubt}")

    geschlossen = gh(f"repos/{REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=60") or []
    gemergt = [p for p in geschlossen if p.get("merged_at")]
    letzte_planung = max((iso(p["merged_at"]) for p in gemergt if (p.get("title") or "").startswith("[Autopilot Planung]")),
                         default=None)
    ohne_pruefung, ueberfaellig = [], []
    for pr in sorted(gemergt, key=lambda p: p["merged_at"], reverse=True)[:20]:
        gemergt_um = iso(pr["merged_at"])
        if zeitpunkt - gemergt_um > PRUEFUNG_ZEITRAUM:
            continue
        if (pr.get("title") or "").startswith("[Autopilot Planung]"):
            continue  # Planungs-PRs ändern nur die Arbeitsliste: keine zweite Prüfung nötig.
        if any((k.get("body") or "").startswith("Autopilot-Prüfung") for k in eigene_kommentare(pr["number"])):
            continue
        ohne_pruefung.append(f"#{pr['number']} ({berlin(gemergt_um)})")
        if zeitpunkt - gemergt_um > PRUEFUNG_UEBERFAELLIG:
            ueberfaellig.append(f"#{pr['number']}")
    print("Gemergt in 48 h ohne „Autopilot-Prüfung“: " + (", ".join(ohne_pruefung) or "keine"))
    punkte_ueberfaellig = []
    if letzte_planung is None or zeitpunkt - letzte_planung > PLANUNG_UEBERFAELLIG:
        seit = berlin(letzte_planung) if letzte_planung else "nicht in den letzten 60 PRs"
        punkte_ueberfaellig.append(f"Planung (zuletzt gemergt: {seit})")
    if ueberfaellig:
        punkte_ueberfaellig.append("Prüfung von " + ", ".join(ueberfaellig))
    print("Überfällig: " + ("; ".join(punkte_ueberfaellig) or "nichts"))

    if ARBEITSLISTE.exists():
        punkte = lies_arbeitsliste(ARBEITSLISTE.read_text(encoding="utf-8"))
        frei = freie_punkte(punkte, belegt)
        offen = [p for p in punkte if p.offen]
        print(f"Arbeitsliste: {len(offen)} offen, {len(frei)} frei. Freie Punkte (Bedingungen im Punkt lesen):")
        for rolle in ("Bauen", "Prüfen", "Recherche"):
            auswahl = [p for p in frei if p.rolle == rolle][:4]
            zeile = " · ".join(f"{p.id} (P{p.prio}) {kurz(p.titel, 48)}" for p in auswahl) or "keine"
            print(f"  {rolle}: {zeile}")

    nummer = finde_issue(ISSUE_LAEUFE, anlegen=False)
    if nummer:
        eintraege = eigene_kommentare(nummer, seit=zeitpunkt - timedelta(hours=24))
        zeilen = [kurz((k.get("body") or "").split("\n", 1)[0], 90) for k in eintraege][-8:]
        print("Laufprotokoll (24 h): " + (" | ".join(zeilen) if zeilen else "keine Einträge"))
    return 0


def befehl_status(nummer: int, wert: str) -> int:
    zeitpunkt = jetzt()
    pr = gh(f"repos/{REPO}/pulls/{nummer}")
    if pr.get("state") != "open":
        print(f"#{nummer} ist nicht offen. Status nicht gesetzt.")
        return 1
    if not ist_eigen(pr):
        print(f"#{nummer} ist kein eigener Autopilot-PR. Status nicht gesetzt.")
        return 1
    w = wert.strip()
    if w.lower() in ("in-arbeit", "in arbeit"):
        zeile = status_zeile("in Arbeit", zeitpunkt)
    elif w.lower() == "fertig":
        zeile = status_zeile("fertig", zeitpunkt)
    elif w.lower().startswith("blockiert"):
        zeile = status_zeile("blockiert", zeitpunkt, w.partition(":")[2])
    else:
        print('Wert: in-arbeit, fertig oder "blockiert: <Grund>"')
        return 1
    gh(f"repos/{REPO}/pulls/{nummer}", methode="PATCH", daten={"body": setze_status(pr.get("body"), zeile)})
    print(f"#{nummer}: {zeile}")
    return 0


def befehl_mergen(nummer: int, warten: int, warten_main: int) -> int:
    pr = gh(f"repos/{REPO}/pulls/{nummer}")
    if pr.get("state") != "open":
        print(f"#{nummer} ist nicht offen ({'schon gemergt' if pr.get('merged_at') else pr.get('state')}).")
        return 4
    if not ist_eigen(pr):
        print(f"#{nummer} ist kein eigener Autopilot-PR: nicht mergen.")
        return 4
    if lies_status(pr.get("body"), jetzt()).art != "fertig":
        print(f"#{nummer}: Die Status-Zeile ist nicht „fertig“. Erst `ap.py status {nummer} fertig`, dann erneut.")
        return 4
    sha = pr["head"]["sha"]
    hinter = int((gh(f"repos/{REPO}/compare/main...{sha}") or {}).get("behind_by") or 0)
    if hinter:
        print(f"#{nummer} liegt {hinter} Commit(s) hinter main. Erst `git fetch --depth=200 origin main`, "
              "`git merge origin/main`, Prüfungen, pushen; dann erneut.")
        return 3
    ende = time.monotonic() + max(0, warten)
    while True:
        laeufe = checks_von(sha)
        zustand, text = bewerte_checks(laeufe)
        if zustand in ("grün", "rot", "fehlt") or time.monotonic() >= ende:
            break
        time.sleep(30)
    if zustand in ("rot", "fehlt"):
        print(f"#{nummer} nicht gemergt: {text}")
        for lauf in laeufe:
            if lauf.get("status") == "completed" and lauf.get("conclusion") not in GUTE_ERGEBNISSE:
                print(f"  {lauf.get('name')}: {lauf.get('details_url') or lauf.get('html_url')}")
        return 1
    if zustand != "grün":
        print(f"#{nummer}: Checks noch nicht fertig ({text}). Gleich noch einmal aufrufen.")
        return 2
    try:
        ergebnis = gh(f"repos/{REPO}/pulls/{nummer}/merge", methode="PUT",
                      daten={"merge_method": "merge", "sha": sha}) or {}
    except GhFehler as fehler:
        print(f"#{nummer}: Mergen abgelehnt ({fehler}). Stand von main prüfen, dann erneut.")
        return 3
    merge_sha = ergebnis.get("sha") or ""
    print(f"#{nummer} gemergt: {merge_sha[:7]} ({text})")
    ende = time.monotonic() + max(0, warten_main)
    zustand_main = "läuft noch"
    while True:
        laeufe = (gh(f"repos/{REPO}/actions/workflows/tests.yml/runs?branch=main&per_page=5") or {}).get("workflow_runs") or []
        lauf = next((l for l in laeufe if l.get("head_sha") == merge_sha), None)
        if lauf and lauf.get("status") == "completed":
            zustand_main = "grün" if lauf.get("conclusion") == "success" else f"ROT ({lauf.get('conclusion')})"
            break
        if time.monotonic() >= ende:
            break
        time.sleep(30)
    if zustand_main.startswith("ROT"):
        print(f"main nach dem Merge {zustand_main}: sofort reparieren (PR „[Autopilot Reparatur] …“).")
        return 5
    print(f"main nach dem Merge: {zustand_main}")
    return 0


def befehl_lauf(rolle: str, art: str, ergebnis: str) -> int:
    zeitpunkt = jetzt()
    nummer = finde_issue(
        ISSUE_LAEUFE, anlegen=True,
        beschreibung=("Hier schreiben die Läufe des Wochen-Autopiloten je eine Zeile beim Start und am Ende. "
                      "Fehlt die Ende-Zeile, hat meist das Nutzungslimit den Lauf abgebrochen. "
                      "Siehe `docs/autopilot/README.md`."),
    )
    zeile = f"{art.capitalize()} · {rolle} · {berlin(zeitpunkt)}" + (f" · {kurz(ergebnis, 200)}" if ergebnis else "")
    gh(f"repos/{REPO}/issues/{nummer}/comments", methode="POST", daten={"body": zeile})
    print(zeile)
    return 0


def befehl_bericht(datei: str) -> int:
    text = Path(datei).read_text(encoding="utf-8")
    if len(text) > 60000:
        text = text[:60000] + "\n\n… gekürzt (zu lang für einen Kommentar)."
    nummer = finde_issue(
        ISSUE_BERICHTE, anlegen=True,
        beschreibung="Berichte des Wochen-Autopiloten, wenn das Claude-Projekt nicht erreichbar war.",
    )
    gh(f"repos/{REPO}/issues/{nummer}/comments", methode="POST", daten={"body": text})
    print(f"Bericht im Issue #{nummer} abgelegt.")
    return 0


def main(argumente: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Hilfsprogramm für den Wochen-Autopiloten")
    befehle = parser.add_subparsers(dest="befehl", required=True)
    befehle.add_parser("lage")
    p = befehle.add_parser("fahrplan")
    p.add_argument("rolle")
    p = befehle.add_parser("status")
    p.add_argument("pr", type=int)
    p.add_argument("wert")
    p = befehle.add_parser("mergen")
    p.add_argument("pr", type=int)
    p.add_argument("--warten", type=int, default=360)
    p.add_argument("--warten-main", type=int, default=180)
    p = befehle.add_parser("lauf")
    p.add_argument("rolle")
    p.add_argument("art", choices=["start", "ende"])
    p.add_argument("ergebnis", nargs="?", default="")
    p = befehle.add_parser("bericht")
    p.add_argument("datei")
    a = parser.parse_args(argumente)
    try:
        if a.befehl == "lage":
            return befehl_lage()
        if a.befehl == "fahrplan":
            return befehl_fahrplan(a.rolle)
        if a.befehl == "status":
            return befehl_status(a.pr, a.wert)
        if a.befehl == "mergen":
            return befehl_mergen(a.pr, a.warten, a.warten_main)
        if a.befehl == "lauf":
            return befehl_lauf(a.rolle, a.art, a.ergebnis)
        return befehl_bericht(a.datei)
    except GhFehler as fehler:
        print(f"Fehler: {fehler}. Von Hand mit `gh api` weitermachen.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
