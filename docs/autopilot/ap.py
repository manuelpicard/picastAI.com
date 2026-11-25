#!/usr/bin/env python3
"""Hilfsprogramm für den Wochen-Autopiloten (siehe README.md in diesem Ordner).

Es spart den Läufen Schritte und Nutzungslimit. Die Regeln stehen im Auftrag der
Läufe und in README.md; dieses Programm setzt sie nur um. Im Zweifel gilt der
Auftrag. Meldet das Programm einen Fehler, geht es von Hand mit `gh api` weiter.

Aufrufe im Repo-Ordner:
  python3 docs/autopilot/ap.py fahrplan <Rolle>            arbeitet dieser Lauf (Fahrplan, Wochenbudget)?
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
PFLICHT_CHECKS = ("test", "pi-audio", "firestore-emulator", "pi-installer", "caddy")
GUTE_ERGEBNISSE = {"success", "skipped", "neutral"}
BERLIN = ZoneInfo("Europe/Berlin")
WOCHENTAGE = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")
VERWAIST_NACH = timedelta(minutes=60)
PLANUNG_UEBERFAELLIG = timedelta(hours=30)
PRUEFUNG_UEBERFAELLIG = timedelta(hours=36)
# So weit zurück sucht `lage` gemergte PRs ohne „Autopilot-Prüfung“ (N1122-1808-a). Überfällig sind sie
# ab PRUEFUNG_UEBERFAELLIG, ohne Obergrenze im Auftrag; 7 Tage decken auch eine Woche ohne Prüfläufe ab.
PRUEFUNG_ZEITRAUM = timedelta(days=7)
FAHRPLAN_TOLERANZ_MIN = 120
# Neustart des Wochenlimits: Wochentag (Mo = 0), Stunde, Minute (Europe/Berlin). Standard Fr 08:00;
# main() liest die Zeile „Neustart des Wochenlimits: So 17:30“ aus fahrplan.md.
NEUSTART = (4, 8, 0)
ENDSPURT_DAUER = timedelta(hours=25)
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


def zeitpunkt_text(zeit: datetime) -> str:
    b = zeit.astimezone(BERLIN)
    return f"{WOCHENTAGE[b.weekday()]} {b:%H:%M}"


def phase(zeit: datetime) -> tuple[str, str]:
    """Wochenphase: Endspurt in den letzten 25 Stunden vor dem Neustart des Wochenlimits, sonst Wochenmodus."""
    b = zeit.astimezone(BERLIN)
    beginn = wochenbeginn(b)
    endspurt = endspurt_beginn(beginn)
    if b >= endspurt:
        ende = beginn + timedelta(days=7) - timedelta(minutes=1)
        return "Endspurt", f"weiter, bis das Limit greift (bis {zeitpunkt_text(ende)})"
    return "Wochenmodus", f"ein Punkt je Lauf (Endspurt ab {zeitpunkt_text(endspurt)})"


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


# ---------------------------------------------------------------- Wochenbudget

WOCHENBUDGET_RE = re.compile(r"^[ \t>*_-]*Wochenbudget\b[^:\n]*:[ \t*_]*(\d+)\s*Minuten", re.IGNORECASE | re.MULTILINE)
LAUF_ZEILE_RE = re.compile(r"^\s*(Start|Ende)\s*·\s*([^·\n]+?)\s*·")
# Diese Rollen zählen zum Verbrauch. Recherche läuft mit Sonnet (je Token die Hälfte).
# Planen & Bericht zählt nicht mit. Gebremst wird nur Bauen; Prüfen, Recherche und Planen & Bericht
# laufen immer, wenn die Tabelle „arbeiten“ sagt.
GEWICHT = {"bauen": 1.0, "prüfen": 1.0, "recherche": 0.5}
GEBREMST = {"bauen"}
ABGEBROCHEN_MIN = 45       # ein Start ohne Ende zählt so viele Minuten
LAUF_HOECHSTENS_MIN = 240  # mehr zählt ein einzelner Lauf nicht


def lies_wochenbudget(text: str) -> int | None:
    """Minuten aus der Zeile „Wochenbudget im Wochenmodus: <n> Minuten“ in fahrplan.md, sonst None."""
    treffer = WOCHENBUDGET_RE.search(text or "")
    return int(treffer.group(1)) if treffer else None


NEUSTART_RE = re.compile(r"^[ \t>*_-]*Neustart des Wochenlimits\b[^:\n]*:[ \t*_]*(Mo|Di|Mi|Do|Fr|Sa|So)\s+(\d{1,2}):(\d{2})",
                         re.IGNORECASE | re.MULTILINE)


def lies_neustart(text: str) -> tuple[int, int, int] | None:
    """(Wochentag, Stunde, Minute) aus der Zeile „Neustart des Wochenlimits: So 17:30“, sonst None."""
    treffer = NEUSTART_RE.search(text or "")
    if not treffer:
        return None
    tag = WOCHENTAGE.index(treffer.group(1).capitalize())
    stunde, minute = int(treffer.group(2)), int(treffer.group(3))
    return (tag, stunde, minute) if stunde < 24 and minute < 60 else None


def wochenbeginn(zeit: datetime) -> datetime:
    """Letzter Neustart des Wochenlimits (Europe/Berlin) vor `zeit`."""
    tag, stunde, minute = NEUSTART
    b = zeit.astimezone(BERLIN)
    beginn = (b - timedelta(days=(b.weekday() - tag) % 7)).replace(hour=stunde, minute=minute, second=0, microsecond=0)
    if beginn > b:
        beginn -= timedelta(days=7)
    return beginn


def endspurt_beginn(beginn: datetime) -> datetime:
    """Beginn des Endspurts: 25 Stunden vor dem nächsten Neustart (Uhrzeit Europe/Berlin)."""
    return beginn + timedelta(days=7) - ENDSPURT_DAUER


def wochenverbrauch(eintraege: list[dict], beginn: datetime, bis: datetime, zeitpunkt: datetime) -> float:
    """Gewichtete Minuten der Läufe, die zwischen `beginn` und `bis` gestartet sind.

    Grundlage sind die Kommentare im Laufprotokoll („Start · Rolle · …“ und „Ende · Rolle · …“) mit
    ihrer Zeit `created_at`. Ein Start ohne Ende zählt ABGEBROCHEN_MIN Minuten (läuft er noch, die Zeit
    seit dem Start, höchstens ABGEBROCHEN_MIN).
    """
    zeilen = []
    for eintrag in eintraege:
        treffer = LAUF_ZEILE_RE.match((eintrag.get("body") or "").split("\n", 1)[0])
        zeit = iso(eintrag.get("created_at"))
        if treffer and zeit:
            zeilen.append((zeit, treffer.group(1).lower(), normale_rolle(treffer.group(2))))
    zeilen.sort(key=lambda z: z[0])
    offen: dict[str, datetime] = {}
    summe = 0.0

    def anrechnen(rolle: str, minuten: float) -> None:
        nonlocal summe
        summe += GEWICHT[rolle] * max(0.0, min(minuten, LAUF_HOECHSTENS_MIN))

    for zeit, art, rolle in zeilen:
        if rolle not in GEWICHT:
            continue
        if art == "start":
            if rolle in offen:
                anrechnen(rolle, ABGEBROCHEN_MIN)
                del offen[rolle]
            if beginn <= zeit < bis:
                offen[rolle] = zeit
        elif rolle in offen:
            anrechnen(rolle, (zeit - offen.pop(rolle)).total_seconds() / 60)
    for rolle, start in offen.items():
        anrechnen(rolle, min(ABGEBROCHEN_MIN, (zeitpunkt - start).total_seconds() / 60))
    return summe


def taktung(verbrauch: float, budget: int, beginn: datetime, bis: datetime,
            zeitpunkt: datetime) -> tuple[bool, float]:
    """Das Budget wächst gleichmäßig von `beginn` bis `bis`. Ein Lauf arbeitet, solange der Verbrauch
    unter dem bis jetzt erlaubten Anteil liegt. Gibt (arbeiten, erlaubte Minuten) zurück."""
    gesamt = (bis.astimezone(timezone.utc) - beginn.astimezone(timezone.utc)).total_seconds()
    vergangen = (zeitpunkt.astimezone(timezone.utc) - beginn.astimezone(timezone.utc)).total_seconds()
    anteil = min(1.0, max(0.0, vergangen / gesamt)) if gesamt > 0 else 1.0
    erlaubt = budget * anteil
    return verbrauch < erlaubt, erlaubt


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


def eigene_kommentare(nummer: int, seit: datetime | None = None, seiten: int = 1) -> list[dict]:
    ergebnis: list[dict] = []
    for seite in range(1, seiten + 1):
        pfad = f"repos/{REPO}/issues/{nummer}/comments?per_page=100&page={seite}"
        if seit is not None:
            pfad += "&since=" + seit.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        teil = gh(pfad) or []
        ergebnis += [k for k in teil if ((k.get("user") or {}).get("login")) == EIGENTUEMER]
        if len(teil) < 100:
            break
    return ergebnis


def finde_issues(titel: str) -> list[int]:
    """Nummern aller offenen eigenen Issues mit diesem Titel, das älteste zuerst."""
    liste = gh(f"repos/{REPO}/issues?state=open&creator={EIGENTUEMER}&per_page=100") or []
    return sorted(e["number"] for e in liste if "pull_request" not in e and e.get("title") == titel)


def finde_issue(titel: str, anlegen: bool, beschreibung: str = "") -> int | None:
    """Das älteste offene Issue mit diesem Titel. Legen zwei Läufe es gleichzeitig an, gilt danach das älteste."""
    nummern = finde_issues(titel)
    if nummern:
        return nummern[0]
    if not anlegen:
        return None
    neu = gh(f"repos/{REPO}/issues", methode="POST", daten={"title": titel, "body": beschreibung})["number"]
    nummern = finde_issues(titel)
    return nummern[0] if nummern else neu


def main_ci() -> tuple[str, str, str]:
    lauf = ((gh(f"repos/{REPO}/actions/workflows/tests.yml/runs?branch=main&per_page=1") or {})
            .get("workflow_runs") or [{}])[0]
    zustand = lauf.get("conclusion") or lauf.get("status") or "?"
    return (lauf.get("head_sha") or "")[:7], zustand, lauf.get("updated_at") or ""


# ---------------------------------------------------------------- Befehle

def verbrauch_der_woche(zeitpunkt: datetime) -> tuple[float, datetime, datetime]:
    """Verbrauch im Wochenmodus dieser Woche laut Laufprotokoll, dazu Wochenbeginn und Endspurt-Beginn."""
    beginn = wochenbeginn(zeitpunkt)
    bis = endspurt_beginn(beginn)
    eintraege = [k for n in finde_issues(ISSUE_LAEUFE) for k in eigene_kommentare(n, seit=beginn, seiten=3)]
    return wochenverbrauch(eintraege, beginn, bis, zeitpunkt), beginn, bis


def wochenbudget_zeile(budget: int, zeitpunkt: datetime) -> tuple[bool, str]:
    verbrauch, beginn, bis = verbrauch_der_woche(zeitpunkt)
    frei, erlaubt = taktung(verbrauch, budget, beginn, bis, zeitpunkt)
    return frei, (f"Wochenbudget (Bauen, Prüfen, Recherche): {verbrauch:.0f} Minuten verbraucht, "
                  f"bis jetzt erlaubt {erlaubt:.0f} von {budget} (wächst gleichmäßig bis zum Endspurt)")


def befehl_fahrplan(rolle: str) -> int:
    if not FAHRPLAN.exists():
        print("Fahrplan: fahrplan.md fehlt; der Lauf arbeitet.")
        return 0
    text = FAHRPLAN.read_text(encoding="utf-8")
    zeitpunkt = jetzt()
    arbeiten, meldung = entscheide_fahrplan(lies_fahrplan(text), rolle, zeitpunkt)
    print(meldung)
    budget = lies_wochenbudget(text)
    if arbeiten and budget and phase(zeitpunkt)[0] == "Wochenmodus" and normale_rolle(rolle) in GEBREMST:
        try:
            arbeiten, zeile = wochenbudget_zeile(budget, zeitpunkt)
        except (GhFehler, OSError, ValueError, KeyError, TypeError) as fehler:
            print(f"Wochenbudget: nicht lesbar ({fehler}); der Lauf arbeitet laut Fahrplan.")
            return 0
        print(zeile + (". Der Lauf arbeitet." if arbeiten else ". Pause. Lauf beenden."))
    return 0 if arbeiten else 10


def nummer_aus_url(url: str | None) -> int | None:
    """Nummer des Issues oder PRs aus `issue_url` eines Kommentars (…/issues/69 → 69)."""
    ende = (url or "").rstrip("/").rsplit("/", 1)[-1]
    return int(ende) if ende.isdigit() else None


def gepruefte_prs(kommentare: list[dict]) -> dict[int, datetime]:
    """PRs mit einem Kommentar „Autopilot-Prüfung“ vom Konto des Eigentümers: Nummer und Zeit des
    jüngsten solchen Kommentars. Kommentare anderer Konten zählen nie (das Repo ist öffentlich)."""
    geprueft: dict[int, datetime] = {}
    for k in kommentare:
        if ((k.get("user") or {}).get("login")) != EIGENTUEMER or not (k.get("body") or "").startswith("Autopilot-Prüfung"):
            continue
        nummer, zeit = nummer_aus_url(k.get("issue_url")), iso(k.get("created_at"))
        if nummer is not None and zeit is not None and (nummer not in geprueft or zeit > geprueft[nummer]):
            geprueft[nummer] = zeit
    return geprueft


def kommentare_seit(seit: datetime, seiten: int = 10) -> list[dict]:
    """Alle Kommentare an Issues und PRs des Repos seit `seit`: wenige Aufrufe statt einem je PR.
    Höchstens `seiten` mal 100; greift die Grenze, sagt eine Zeile das (dann fehlen die jüngsten, und
    `lage` meldet eher zu viele PRs ohne Prüfung als zu wenige)."""
    ergebnis: list[dict] = []
    stempel = seit.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for seite in range(1, seiten + 1):
        teil = gh(f"repos/{REPO}/issues/comments?per_page=100&page={seite}&sort=created&direction=asc&since={stempel}") or []
        ergebnis += teil
        if len(teil) < 100:
            return ergebnis
    print(f"Hinweis: mehr als {seiten * 100} Kommentare seit {berlin(seit)}; die jüngsten fehlen in der Prüfliste.")
    return ergebnis


def gemergte_prs_seit(seit: datetime, seiten: int = 5) -> list[dict]:
    """Gemergte PRs, die seit `seit` zuletzt geändert wurden (ein Merge ist auch eine Änderung).

    Die Liste ist nach der letzten Änderung sortiert. Sie wird seitenweise gelesen, bis eine Seite
    über `seit` hinaus zurückreicht oder nicht mehr voll ist.
    """
    ergebnis: list[dict] = []
    for seite in range(1, seiten + 1):
        teil = gh(f"repos/{REPO}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page={seite}") or []
        ergebnis += teil
        if len(teil) < 100 or (iso(teil[-1].get("updated_at")) or seit) < seit:
            break
    return [p for p in ergebnis if p.get("merged_at")]


def pruefliste(gemergt: list[dict], zeitpunkt: datetime, geprueft: dict[int, datetime]) -> tuple[list[str], list[str]]:
    """Gemergte PRs ohne „Autopilot-Prüfung“ (bis PRUEFUNG_ZEITRAUM zurück) und davon die überfälligen
    (älter als PRUEFUNG_UEBERFAELLIG). Als Prüfung zählt nur ein Kommentar nach dem Merge. Planungs-PRs
    brauchen keine zweite Prüfung."""
    ohne_pruefung, ueberfaellig = [], []
    for pr in sorted(gemergt, key=lambda p: p["merged_at"], reverse=True):
        gemergt_um = iso(pr["merged_at"])
        if zeitpunkt - gemergt_um > PRUEFUNG_ZEITRAUM:
            break  # absteigend sortiert: alle weiteren sind älter
        if (pr.get("title") or "").startswith("[Autopilot Planung]"):
            continue
        if pr["number"] in geprueft and geprueft[pr["number"]] >= gemergt_um:
            continue
        ohne_pruefung.append(f"#{pr['number']} ({berlin(gemergt_um)})")
        if zeitpunkt - gemergt_um > PRUEFUNG_UEBERFAELLIG:
            ueberfaellig.append(f"#{pr['number']}")
    return ohne_pruefung, ueberfaellig


def zeile_ohne_pruefung(ohne_pruefung: list[str]) -> str:
    tage = PRUEFUNG_ZEITRAUM.days
    return f"Gemergt in {tage} Tagen ohne „Autopilot-Prüfung“: " + (", ".join(ohne_pruefung) or "keine")


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

    gemergt = gemergte_prs_seit(zeitpunkt - PRUEFUNG_ZEITRAUM)
    letzte_planung = max((iso(p["merged_at"]) for p in gemergt if (p.get("title") or "").startswith("[Autopilot Planung]")),
                         default=None)
    geprueft = gepruefte_prs(kommentare_seit(zeitpunkt - PRUEFUNG_ZEITRAUM))
    ohne_pruefung, ueberfaellig = pruefliste(gemergt, zeitpunkt, geprueft)
    print(zeile_ohne_pruefung(ohne_pruefung))
    punkte_ueberfaellig = []
    if letzte_planung is None or zeitpunkt - letzte_planung > PLANUNG_UEBERFAELLIG:
        seit = berlin(letzte_planung) if letzte_planung else f"nicht in den letzten {PRUEFUNG_ZEITRAUM.days} Tagen"
        punkte_ueberfaellig.append(f"Planung (zuletzt gemergt: {seit})")
    if ueberfaellig:
        stunden = int(PRUEFUNG_UEBERFAELLIG.total_seconds() // 3600)
        punkte_ueberfaellig.append("Prüfung von " + ", ".join(ueberfaellig) + f" (gemergt vor mehr als {stunden} h)")
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

    nummern = finde_issues(ISSUE_LAEUFE)
    nummer = nummern[0] if nummern else None
    if nummer:
        eintraege = sorted((k for n in nummern for k in eigene_kommentare(n, seit=zeitpunkt - timedelta(hours=24))),
                           key=lambda k: k.get("created_at") or "")
        zeilen = [kurz((k.get("body") or "").split("\n", 1)[0], 90) for k in eintraege][-8:]
        print("Laufprotokoll (24 h): " + (" | ".join(zeilen) if zeilen else "keine Einträge"))

    beginn = wochenbeginn(zeitpunkt)
    print(f"Neustart des Wochenlimits: {zeitpunkt_text(beginn)} (zuletzt {berlin(beginn)}, "
          f"nächster {berlin(beginn + timedelta(days=7))}).")
    if nummer and zeitpunkt - beginn < timedelta(hours=48):  # nur in den ersten zwei Tagen nach dem Neustart
        seit_neustart = [k for n in nummern for k in eigene_kommentare(n, seit=beginn, seiten=3)]
        bericht_da = any((k.get("body") or "").startswith("Ende · Planen") for k in seit_neustart)
        print("Wochenbericht fällig: " + ("nein (seit dem Neustart lief „Planen & Bericht“ schon)" if bericht_da
                                          else "ja (erster Lauf „Planen & Bericht“ seit dem Neustart)"))
    budget = lies_wochenbudget(FAHRPLAN.read_text(encoding="utf-8")) if FAHRPLAN.exists() else None
    if budget:
        try:
            print(wochenbudget_zeile(budget, zeitpunkt)[1] + ".")
        except (GhFehler, OSError, ValueError, KeyError, TypeError) as fehler:
            print(f"Wochenbudget: nicht lesbar ({fehler}).")
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
    name, hinweis = phase(jetzt())
    print(f"Phase jetzt: {name} – {hinweis}.")
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
    global NEUSTART
    if FAHRPLAN.exists():
        NEUSTART = lies_neustart(FAHRPLAN.read_text(encoding="utf-8")) or NEUSTART
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
