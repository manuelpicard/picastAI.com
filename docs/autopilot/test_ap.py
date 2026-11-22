"""Tests für das Hilfsprogramm des Wochen-Autopiloten (ohne Netz).

Aufruf im Repo-Ordner: python3 -m unittest discover -s docs/autopilot -p "test_*.py"
"""
import contextlib
import io
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

import ap

BERLIN = ap.BERLIN


def b(jahr, monat, tag, stunde, minute=0):
    return datetime(jahr, monat, tag, stunde, minute, tzinfo=BERLIN)


def pr(titel="[Autopilot B2] Stopp", body="Status: fertig", ref="claude/autopilot-b2-stopp",
       repo="manuelpicard/picastAI.com", login="manuelpicard"):
    return {"title": titel, "body": body, "head": {"ref": ref, "repo": {"full_name": repo}, "sha": "abc"},
            "user": {"login": login}, "number": 7}


class PhaseTest(unittest.TestCase):
    def test_grenzen(self):
        # 26.11.2026 ist ein Donnerstag, 27.11. ein Freitag.
        self.assertEqual(ap.phase(b(2026, 11, 26, 6, 59))[0], "Wochenmodus")
        self.assertEqual(ap.phase(b(2026, 11, 26, 7, 0))[0], "Endspurt")
        self.assertEqual(ap.phase(b(2026, 11, 27, 7, 59))[0], "Endspurt")
        self.assertEqual(ap.phase(b(2026, 11, 27, 8, 0))[0], "Wochenmodus")
        self.assertEqual(ap.phase(b(2026, 11, 25, 23, 0))[0], "Wochenmodus")

    def test_utc_wird_umgerechnet(self):
        # Do 06:30 UTC ist Do 07:30 in Berlin (Winterzeit).
        self.assertEqual(ap.phase(datetime(2026, 11, 26, 6, 30, tzinfo=timezone.utc))[0], "Endspurt")


class StatusTest(unittest.TestCase):
    bezug = b(2026, 11, 20, 10, 0)

    def test_in_arbeit_mit_zeit(self):
        status = ap.lies_status("Status: in Arbeit (20.11. 09:42)\n\nPlan", self.bezug)
        self.assertEqual(status.art, "in Arbeit")
        self.assertEqual(status.zeit, b(2026, 11, 20, 9, 42))

    def test_fertig_und_blockiert(self):
        self.assertEqual(ap.lies_status("Status: fertig", self.bezug).art, "fertig")
        blockiert = ap.lies_status("Status: blockiert (wartet auf Gerät (Pi))", self.bezug)
        self.assertEqual((blockiert.art, blockiert.grund), ("blockiert", "wartet auf Gerät (Pi)"))

    def test_ohne_status_und_ohne_zeit(self):
        self.assertEqual(ap.lies_status("Plan ohne Status", self.bezug).art, "ohne")
        self.assertEqual(ap.lies_status(None, self.bezug).art, "ohne")
        self.assertIsNone(ap.lies_status("Status: in Arbeit", self.bezug).zeit)

    def test_jahreswechsel(self):
        status = ap.lies_status("Status: in Arbeit (31.12. 23:50)", b(2027, 1, 1, 0, 30))
        self.assertEqual(status.zeit, b(2026, 12, 31, 23, 50))

    def test_status_setzen(self):
        zeit = b(2026, 11, 22, 16, 5)
        zeile = ap.status_zeile("in Arbeit", zeit)
        self.assertEqual(zeile, "Status: in Arbeit (22.11. 16:05)")
        self.assertEqual(ap.setze_status("Status: fertig\nRest\n", zeile), zeile + "\nRest\n")
        self.assertEqual(ap.setze_status("Nur Text", "Status: fertig"), "Status: fertig\n\nNur Text")
        self.assertEqual(ap.setze_status("", "Status: fertig"), "Status: fertig")
        self.assertEqual(ap.status_zeile("blockiert", zeit, " kein Gerät "), "Status: blockiert (kein Gerät)")


class PrTest(unittest.TestCase):
    def test_eigen_und_fremd(self):
        self.assertTrue(ap.ist_eigen(pr()))
        self.assertFalse(ap.ist_eigen(pr(repo="fremd/picastAI.com")))
        self.assertFalse(ap.ist_eigen(pr(ref="feature/x")))
        self.assertFalse(ap.ist_eigen(pr(login="jemand")))
        self.assertFalse(ap.ist_eigen(pr(titel="Wochen-Autopilot: Hilfsprogramm")))

    def test_belegte_ids(self):
        self.assertEqual(ap.belegte_ids("[Autopilot R59 R60 R62] Abstimmung"), ["R59", "R60", "R62"])
        self.assertEqual(ap.belegte_ids("[Autopilot Planung] 21.11.2026"), ["Planung"])
        self.assertEqual(ap.belegte_ids("Bump firebase-admin"), [])

    def test_einstufen(self):
        jetzt = b(2026, 11, 20, 12, 0)
        kat, _ = ap.einstufen(pr(body="Status: in Arbeit (20.11. 10:30)"), jetzt)
        self.assertEqual(kat, "verwaist")
        kat, _ = ap.einstufen(pr(body="Status: in Arbeit (20.11. 11:30)"), jetzt)
        self.assertEqual(kat, "belegt")
        kat, _ = ap.einstufen(pr(body="Status: in Arbeit"), jetzt, commit_zeit=lambda p: jetzt - timedelta(hours=3))
        self.assertEqual(kat, "verwaist")
        kat, hinweis = ap.einstufen(pr(), jetzt, checks=lambda p: ("grün", "grün (3 Checks)"))
        self.assertEqual((kat, hinweis), ("fertig", "fertig, grün: mergen"))
        kat, _ = ap.einstufen(pr(), jetzt, checks=lambda p: ("rot", "rot: test (failure)"))
        self.assertEqual(kat, "fertig-rot")
        self.assertEqual(ap.einstufen(pr(login="jemand"), jetzt)[0], "fremd")
        self.assertEqual(ap.einstufen(pr(titel="Bump x"), jetzt)[0], "andere")
        self.assertEqual(ap.einstufen(pr(body="Status: blockiert (Gerät)"), jetzt)[0], "blockiert")


class ChecksTest(unittest.TestCase):
    @staticmethod
    def lauf(name, status="completed", conclusion="success", nummer=1):
        return {"name": name, "status": status, "conclusion": conclusion, "id": nummer}

    def alle(self, **abweichung):
        laeufe = [self.lauf(n, nummer=i) for i, n in enumerate(ap.PFLICHT_CHECKS, 1)]
        for name, wert in abweichung.items():
            laeufe.append(self.lauf(name.replace("_", "-"), nummer=99, **wert))
        return laeufe

    def test_zustaende(self):
        self.assertEqual(ap.bewerte_checks([])[0], "wartet")
        self.assertEqual(ap.bewerte_checks(self.alle())[0], "grün")
        self.assertEqual(ap.bewerte_checks(self.alle(test={"status": "in_progress", "conclusion": None}))[0], "läuft")
        self.assertEqual(ap.bewerte_checks(self.alle(test={"conclusion": "failure"}))[0], "rot")
        self.assertEqual(ap.bewerte_checks(self.alle(pi_audio={"conclusion": "skipped"}))[0], "fehlt")
        self.assertEqual(ap.bewerte_checks([self.lauf("firmware")])[0], "wartet")

    def test_neuester_lauf_zaehlt(self):
        laeufe = self.alle()
        laeufe.insert(0, self.lauf("test", conclusion="failure", nummer=0))
        self.assertEqual(ap.bewerte_checks(laeufe)[0], "grün")


ARBEITSLISTE = """# Arbeitsliste

### A1 · Erster Punkt
- Rolle: Bauen · Prio: 1 · Status: erledigt (PR #63, 20.11.2026)

### B1 · Zweiter Punkt (Kinder)
- Rolle: Bauen · Prio: 2 (vorher 3) · Status: offen · Nach A1 · Bezug: Nr. 1

### C1 · Wartet
- Rolle: Bauen · Prio: 1 · Status: offen · Nach N1121-0607-a

### N1121-0607-a · Neu
- Rolle: Prüfen · Prio: 1 · Status: offen (Teil 1 von 2 erledigt, PR #75)

### H5 · Recherche
- Rolle: Recherche · Prio: 1 · Status: offen
"""


class ArbeitslisteTest(unittest.TestCase):
    def test_lesen(self):
        punkte = ap.lies_arbeitsliste(ARBEITSLISTE)
        self.assertEqual([p.id for p in punkte], ["A1", "B1", "C1", "N1121-0607-a", "H5"])
        self.assertEqual((punkte[1].prio, punkte[1].nach, punkte[1].rolle), (2, ["A1"], "Bauen"))
        self.assertEqual(punkte[2].nach, ["N1121-0607-a"])
        self.assertTrue(punkte[0].erledigt)
        self.assertTrue(punkte[3].offen)

    def test_freie_punkte(self):
        punkte = ap.lies_arbeitsliste(ARBEITSLISTE)
        self.assertEqual([p.id for p in ap.freie_punkte(punkte, set())], ["N1121-0607-a", "H5", "B1"])
        self.assertEqual([p.id for p in ap.freie_punkte(punkte, {"H5"})], ["N1121-0607-a", "B1"])


FAHRPLAN = """| Rolle | Zeit | Wochenmodus | Endspurt |
|---|---|---|---|
| Prüfen | 23:23 | arbeiten Mo Mi Fr So | arbeiten |
| Bauen | 00:37 | Pause | arbeiten |
| Bauen | 06:37 | arbeiten | arbeiten |
| Planen & Bericht | 18:07 | arbeiten | arbeiten |
"""


class FahrplanTest(unittest.TestCase):
    zeilen = ap.lies_fahrplan(FAHRPLAN)

    def entscheide(self, rolle, zeit):
        return ap.entscheide_fahrplan(self.zeilen, rolle, zeit)[0]

    def test_lesen(self):
        self.assertEqual(len(self.zeilen), 4)
        self.assertEqual(self.zeilen[1], ("Bauen", 37, "Pause", "arbeiten"))

    def test_wochenmodus_und_endspurt(self):
        # 23.11.2026 ist ein Montag, 24.11. ein Dienstag, 26.11. ein Donnerstag.
        self.assertFalse(self.entscheide("Bauen", b(2026, 11, 24, 0, 38)))
        self.assertTrue(self.entscheide("Bauen", b(2026, 11, 24, 6, 40)))
        self.assertTrue(self.entscheide("Bauen", b(2026, 11, 27, 0, 38)))  # Fr 00:38 ist noch Endspurt

    def test_tage_und_verspaetung(self):
        self.assertTrue(self.entscheide("Prüfen", b(2026, 11, 23, 23, 30)))   # Montag
        self.assertFalse(self.entscheide("Prüfen", b(2026, 11, 24, 23, 25)))  # Dienstag
        self.assertTrue(self.entscheide("Planen & Bericht", b(2026, 11, 24, 18, 50)))
        self.assertTrue(self.entscheide("Planen", b(2026, 11, 24, 18, 9)))

    def test_unbekannt_arbeitet(self):
        self.assertTrue(self.entscheide("Recherche", b(2026, 11, 24, 12, 0)))


def eintrag(zeit, text, login="manuelpicard"):
    return {"created_at": zeit.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "body": text,
            "user": {"login": login}}


class WochenbudgetTest(unittest.TestCase):
    # 27.11.2026 ist ein Freitag, 30.11. ein Montag, 03.12. ein Donnerstag.
    beginn, bis = b(2026, 11, 27, 8), b(2026, 12, 3, 7)

    def test_lesen(self):
        self.assertEqual(ap.lies_wochenbudget("x\nWochenbudget im Wochenmodus: 150 Minuten\n"), 150)
        self.assertEqual(ap.lies_wochenbudget("**Wochenbudget im Wochenmodus:** 90 Minuten"), 90)
        self.assertIsNone(ap.lies_wochenbudget("- **Wochenbudget:** Im Wochenmodus teilen sich drei Rollen 150 Minuten"))
        self.assertIsNone(ap.lies_wochenbudget("- 27.11.2026: Wochenbudget: 150 → 110 Minuten"))
        self.assertIsNone(ap.lies_wochenbudget(""))

    def test_wochenbeginn(self):
        self.assertEqual(ap.wochenbeginn(b(2026, 11, 22, 16, 45)), b(2026, 11, 20, 8))
        self.assertEqual(ap.wochenbeginn(b(2026, 11, 27, 7, 59)), b(2026, 11, 20, 8))
        self.assertEqual(ap.wochenbeginn(b(2026, 11, 27, 8, 0)), b(2026, 11, 27, 8))
        self.assertEqual(ap.wochenbeginn(datetime(2026, 11, 27, 7, 30, tzinfo=timezone.utc)), b(2026, 11, 27, 8))
        self.assertEqual(ap.endspurt_beginn(b(2026, 11, 27, 8)), self.bis)

    def test_verbrauch(self):
        eintraege = [
            eintrag(b(2026, 11, 27, 6, 40), "Start · Bauen · Fr 27.11. 06:40"),             # vor Wochenbeginn
            eintrag(b(2026, 11, 27, 9, 0), "Ende · Bauen · Fr 27.11. 09:00 · fertig"),
            eintrag(b(2026, 11, 27, 11, 55), "Start · Recherche · Fr 27.11. 11:55"),
            eintrag(b(2026, 11, 27, 12, 35), "Ende · Recherche · Fr 27.11. 12:35 · R3"),    # 40 × 0,5 = 20
            eintrag(b(2026, 11, 27, 18, 8), "Start · Planen & Bericht · Fr 27.11. 18:08"),  # zählt nicht
            eintrag(b(2026, 11, 27, 23, 25), "Start · Prüfen · Fr 27.11. 23:25"),           # ohne Ende: 45
            eintrag(b(2026, 11, 28, 6, 38), "Start · Bauen · Sa 28.11. 06:38"),
            eintrag(b(2026, 11, 28, 7, 8), "Ende · Bauen · Sa 28.11. 07:08 · B4 gemergt"),  # 30
            eintrag(b(2026, 11, 29, 6, 38), "Start · Bauen · So 29.11. 06:38"),             # läuft seit 10 min
            eintrag(b(2026, 11, 29, 6, 39), "Kein Laufeintrag"),
        ]
        verbrauch = ap.wochenverbrauch(eintraege, self.beginn, self.bis, b(2026, 11, 29, 6, 48))
        self.assertAlmostEqual(verbrauch, 20 + 45 + 30 + 10)
        self.assertEqual(ap.wochenverbrauch([], self.beginn, self.bis, b(2026, 11, 29, 6, 48)), 0)

    def test_zweiter_start_ohne_ende(self):
        eintraege = [
            eintrag(b(2026, 11, 28, 6, 38), "Start · Bauen · Sa 28.11. 06:38"),
            eintrag(b(2026, 11, 29, 6, 38), "Start · Bauen · So 29.11. 06:38"),
            eintrag(b(2026, 11, 29, 7, 0), "Ende · Bauen · So 29.11. 07:00"),
        ]
        self.assertAlmostEqual(ap.wochenverbrauch(eintraege, self.beginn, self.bis, b(2026, 11, 30, 8)), 45 + 22)

    def test_taktung(self):
        frei, erlaubt = ap.taktung(0, 150, self.beginn, self.bis, b(2026, 11, 27, 11, 53))
        self.assertTrue(frei)
        self.assertLess(erlaubt, 10)
        self.assertFalse(ap.taktung(80, 150, self.beginn, self.bis, b(2026, 11, 30, 6, 37))[0])  # erlaubt etwa 74
        self.assertTrue(ap.taktung(80, 150, self.beginn, self.bis, b(2026, 11, 30, 23, 23))[0])  # erlaubt etwa 92
        self.assertEqual(ap.taktung(149, 150, self.beginn, self.bis, b(2026, 12, 3, 9, 0)), (True, 150))


class FahrplanMitBudgetTest(unittest.TestCase):
    def setUp(self):
        self.ordner = tempfile.TemporaryDirectory()
        self.datei = Path(self.ordner.name) / "fahrplan.md"
        self.datei.write_text(FAHRPLAN + "\nWochenbudget im Wochenmodus: 150 Minuten\n", encoding="utf-8")

    def tearDown(self):
        self.ordner.cleanup()

    def rufe(self, rolle, zeit, verbrauch=0.0, fehler=None):
        def verbrauch_der_woche(zeitpunkt):
            if fehler:
                raise fehler
            beginn = ap.wochenbeginn(zeitpunkt)
            return verbrauch, beginn, ap.endspurt_beginn(beginn)

        with mock.patch.object(ap, "FAHRPLAN", self.datei), mock.patch.object(ap, "jetzt", return_value=zeit), \
                mock.patch.object(ap, "verbrauch_der_woche", side_effect=verbrauch_der_woche), \
                contextlib.redirect_stdout(io.StringIO()):
            return ap.befehl_fahrplan(rolle)

    def test_budget_bremst_nur_im_wochenmodus(self):
        montag_frueh = b(2026, 11, 30, 6, 40)  # erlaubt etwa 74 von 150
        self.assertEqual(self.rufe("Bauen", montag_frueh, verbrauch=60), 0)
        self.assertEqual(self.rufe("Bauen", montag_frueh, verbrauch=80), 10)
        self.assertEqual(self.rufe("Planen & Bericht", b(2026, 11, 30, 18, 10), verbrauch=500), 0)
        self.assertEqual(self.rufe("Bauen", b(2026, 12, 4, 0, 40), verbrauch=500), 0)  # Fr 00:40: Endspurt
        self.assertEqual(self.rufe("Bauen", b(2026, 12, 1, 0, 40)), 10)               # Tabelle: Pause

    def test_fehler_heisst_arbeiten(self):
        self.assertEqual(self.rufe("Bauen", b(2026, 11, 30, 6, 40), fehler=ap.GhFehler("kein Netz")), 0)


if __name__ == "__main__":
    unittest.main()
