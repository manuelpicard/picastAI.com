"""Die Anleitungen zeigen denselben Health-Aufruf, den der Containertest ausführt (Punkt N1121-1937-a).

`install_raspberry_pi.test.sh` führt den Aufruf als Dienstkonto `kunibert` mit den Einstellungen aus
`/etc/kunibert/kunibert.env` aus (Datei, Rechte und Nutzer wie vom Installer). Ohne diese Einstellungen
prüft der Client die Standardadresse statt des eigenen Servers. Dieser Test hält die Stellen in den
Anleitungen an genau diesen Aufruf gebunden.
"""
import re
import unittest
from pathlib import Path

HIER = Path(__file__).resolve().parent
REPO = HIER.parent

# Der Aufruf im Containertest: als Dienstkonto, mit kunibert.env, mit --once health.
AUFRUF_MUSTER = re.compile(r"sudo -u kunibert bash -c '[^'\n]*--once health'")
# Ein Aufruf des Clients mit --once health (als Datei oder als Modul).
CLIENT_HEALTH = re.compile(r"kunibert_client(\.py)?\b[^`'\n]*--once health")

# Wo Menschen den Health-Aufruf am Pi abtippen: (Datei, Anfang der Überschrift).
STELLEN = [
    ("pi-client/README.md", "## Manuell starten"),
    ("pi-client/README.md", "#### Später: der Pi im selben WLAN"),
    ("deploy/CHECKLISTE.md", "## B. Pi vorbereiten"),
    ("deploy/EINRICHTUNG.md", "## 8. Pi anbinden"),
]


def abschnitt(text: str, ueberschrift: str) -> str:
    """Text ab der Überschrift bis zur nächsten Überschrift, gleich welcher Ebene.

    So zählt nur der Text direkt unter der Überschrift: Unterabschnitte (zum Beispiel die Probe am
    Rechner unter „Manuell starten“) gehören nicht dazu. Zeilen in Codeblöcken (```) zählen nicht
    als Überschrift: In den Anleitungen beginnen dort Kommentare mit `#`.
    """
    zeilen = text.split("\n")
    im_code = False
    start = None
    for i, zeile in enumerate(zeilen):
        if zeile.lstrip().startswith("```"):
            im_code = not im_code
            continue
        if im_code or not zeile.startswith("#"):
            continue
        if start is None:
            if zeile.startswith(ueberschrift):
                start = i
        else:
            return "\n".join(zeilen[start:i])
    if start is None:
        raise AssertionError(f"Überschrift nicht gefunden: {ueberschrift}")
    return "\n".join(zeilen[start:])


def aufruf_im_containertest() -> str:
    text = (HIER / "install_raspberry_pi.test.sh").read_text(encoding="utf-8")
    treffer = AUFRUF_MUSTER.findall(text)
    if len(treffer) != 1:
        raise AssertionError(f"Health-Aufruf im Containertest {len(treffer)}-mal gefunden, erwartet: einmal")
    return treffer[0]


class AbschnittTests(unittest.TestCase):
    def test_codeblock_kommentar_beendet_abschnitt_nicht(self):
        text = "## A\neins\n```bash\n# kein Titel\n```\nzwei\n## B\ndrei\n"
        self.assertEqual(abschnitt(text, "## A"), "## A\neins\n```bash\n# kein Titel\n```\nzwei")

    def test_unterabschnitt_gehoert_nicht_dazu(self):
        text = "## A\neins\n### A.1\nzwei\n# Ende\n"
        self.assertEqual(abschnitt(text, "## A"), "## A\neins")
        self.assertEqual(abschnitt(text, "### A.1"), "### A.1\nzwei")

    def test_letzter_abschnitt_bis_zum_ende(self):
        self.assertEqual(abschnitt("x\n#### C\nvier\n", "#### C"), "#### C\nvier\n")

    def test_fehlende_ueberschrift_meldet_sich(self):
        with self.assertRaises(AssertionError):
            abschnitt("## A\n", "## B")


class HealthAufrufTests(unittest.TestCase):
    def test_containertest_liest_kunibert_env_als_dienstkonto(self):
        aufruf = aufruf_im_containertest()
        self.assertIn(". /etc/kunibert/kunibert.env", aufruf)
        self.assertIn("set -a", aufruf)
        self.assertIn("/opt/kunibert/.venv/bin/python /opt/kunibert/pi-client/kunibert_client.py", aufruf)

    def test_anleitungen_zeigen_genau_den_getesteten_aufruf(self):
        aufruf = aufruf_im_containertest()
        for datei, ueberschrift in STELLEN:
            with self.subTest(datei=datei, abschnitt=ueberschrift):
                teil = abschnitt((REPO / datei).read_text(encoding="utf-8"), ueberschrift)
                self.assertIn(aufruf, teil)

    def test_kein_health_aufruf_ohne_einstellungen(self):
        # Ein Aufruf des Clients mit --once health in diesen Abschnitten ist immer der getestete
        # (sonst prüft der Client am Pi die Standardadresse statt des eigenen Servers).
        aufruf = aufruf_im_containertest()
        for datei, ueberschrift in STELLEN:
            teil = abschnitt((REPO / datei).read_text(encoding="utf-8"), ueberschrift)
            # Fortsetzungszeilen (mit \ am Ende) zählen als eine Zeile.
            for nr, zeile in enumerate(re.sub(r"\\\n\s*", " ", teil).split("\n"), start=1):
                with self.subTest(datei=datei, abschnitt=ueberschrift, zeile=nr):
                    self.assertNotRegex(zeile.replace(aufruf, ""), CLIENT_HEALTH)

    def test_suchmuster_findet_aufrufe_ohne_einstellungen(self):
        # Gegenprobe: Diese Formen prüfen am Pi nicht den eigenen Server und müssen auffallen.
        for zeile in [
            "python pi-client/kunibert_client.py --once health",
            "/opt/kunibert/.venv/bin/python /opt/kunibert/pi-client/kunibert_client.py --debug --once health",
            "python3 -m kunibert_client --once health",
            re.sub(r"\\\n\s*", " ", "python3 kunibert_client.py \\\n  --once health"),
        ]:
            with self.subTest(zeile=zeile):
                self.assertRegex(zeile, CLIENT_HEALTH)
        # Auch der getestete Aufruf passt zum Muster; deshalb nimmt der Test ihn vor der Suche heraus.
        self.assertRegex(aufruf_im_containertest(), CLIENT_HEALTH)


if __name__ == "__main__":
    unittest.main()
