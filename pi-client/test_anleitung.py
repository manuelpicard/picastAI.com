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

# Wo Menschen den Health-Aufruf am Pi abtippen: (Datei, Anfang der Überschrift).
STELLEN = [
    ("pi-client/README.md", "## Manuell starten"),
    ("pi-client/README.md", "#### Später: der Pi im selben WLAN"),
    ("deploy/CHECKLISTE.md", "## B. Pi vorbereiten"),
    ("deploy/EINRICHTUNG.md", "## 8. Pi anbinden"),
]


def abschnitt(text: str, ueberschrift: str) -> str:
    """Text ab der Überschrift bis zur nächsten Überschrift gleicher oder höherer Ebene.

    Zeilen in Codeblöcken (```) zählen nicht als Überschrift: In den Anleitungen beginnen dort
    Kommentare mit `#`.
    """
    ebene = len(ueberschrift) - len(ueberschrift.lstrip("#"))
    zeilen = text.split("\n")
    im_code = False
    start = None
    for i, zeile in enumerate(zeilen):
        if zeile.lstrip().startswith("```"):
            im_code = not im_code
            continue
        if im_code or not zeile.startswith("#"):
            continue
        tiefe = len(zeile) - len(zeile.lstrip("#"))
        if start is None:
            if zeile.startswith(ueberschrift):
                start = i
        elif tiefe <= ebene:
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

    def test_tiefere_ueberschrift_gehoert_dazu(self):
        text = "## A\neins\n### A.1\nzwei\n# Ende\n"
        self.assertEqual(abschnitt(text, "## A"), "## A\neins\n### A.1\nzwei")

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
            for nr, zeile in enumerate(teil.split("\n"), start=1):
                with self.subTest(datei=datei, abschnitt=ueberschrift, zeile=nr):
                    self.assertNotRegex(zeile.replace(aufruf, ""), r"kunibert_client\.py[^`'\n]*--once health")


if __name__ == "__main__":
    unittest.main()
