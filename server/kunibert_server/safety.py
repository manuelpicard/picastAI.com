"""Deterministische Sicherheitsweiche.

Zwei Ebenen: (1) diese Mustererkennung läuft vor jedem KI-Aufruf, (2) das
Sprachmodell kann zusätzlich "sicherheit" melden. In beiden Fällen wird
**kein generierter Text** vorgelesen, sondern die feste Antwort unten. Feste
Texte lassen sich fachlich prüfen; generierte nicht.

WICHTIG: Liste und Antworttext sind ein Startpunkt für einen Prototyp und
müssen vor jeder Nutzung durch Kinder mit Fachleuten (Kinderschutz,
Krisenberatung) überprüft werden. Falsch-positive Treffer sind gewollt
günstiger als übersehene Notlagen.
"""
from __future__ import annotations

import re
import unicodedata

# Ich-Perspektive bzw. akute Lagen. Bewusst keine bloßen Wörter wie "sterben"
# oder "Blut", damit Wünsche wie "der Drache soll ..." nicht auslösen.
_PATTERNS = [
    r"\bich (will|möchte|mag) (nicht mehr leben|sterben|tot sein)",
    r"\b(mich|mir) (selbst )?(umbringen|weh ?tun|wehtun|verletzen|ritzen)",
    r"\bich ritze\b",
    r"\bnicht mehr (leben|da sein) (will|möchte)",
    r"\b(er|sie|der|die|mama|papa|mein \w+|meine \w+|jemand) (schlägt|haut|tritt|würgt) mich",
    r"\b(hat|haben) mich (geschlagen|gehauen|getreten|gewürgt|eingesperrt)",
    r"\b(hat|haben|will|wollte) mich (an ?gefasst|anfassen|berührt) ",
    r"\bfasst mich an\b",
    r"\b(soll|darf) (es )?(niemandem|keinem) (sagen|erzählen|verraten)",
    r"\bich (blute|kann nicht atmen|kriege keine luft|bekomme keine luft)",
    r"\b(es|hier) brennt\b",
    r"\bfeuer (in der|im) (wohnung|haus|zimmer|küche)",
    r"\b(mama|papa|oma|opa|jemand|er|sie) (wacht nicht auf|ist umgefallen|bewegt sich nicht)",
    r"\bich (habe|hab) (mich )?verlaufen",
    r"\bich habe (tabletten|medikamente|putzmittel) (genommen|getrunken|gegessen)",
]
_COMPILED = [re.compile(p) for p in _PATTERNS]


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text or "").lower()
    text = re.sub(r"[^\wäöüß ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip() + " "


def screen(transcript: str) -> bool:
    """True, wenn die Äußerung eine mögliche Notlage enthält."""
    normalized = normalize(transcript)
    return any(p.search(normalized) for p in _COMPILED)


# Telefonnummern als Wörter, damit die Sprachsynthese sie korrekt vorliest.
SAFETY_RESPONSE_DE = (
    "Danke, dass du mir das sagst. Das klingt wichtig, und du bist damit nicht allein. "
    "Bitte sag es jetzt gleich einem Erwachsenen, dem du vertraust, zum Beispiel jemandem aus deiner Familie, "
    "einer Lehrerin, einem Lehrer oder einer Nachbarin. "
    "Wenn jemand verletzt ist oder in Gefahr, dann ruf sofort die Eins Eins Zwei an. "
    "Du kannst auch bei der Nummer gegen Kummer anrufen: Eins Eins Sechs, Eins Eins Eins. "
    "Das kostet nichts, und dort hört dir jemand zu, von Montag bis Samstag am Nachmittag."
)

UNCLEAR_RESPONSE_DE = (
    "Das habe ich leider nicht richtig verstanden. "
    "Halte die Sprechtaste gedrückt, sag es noch einmal, und lass sie dann los."
)

ERROR_RESPONSE_DE = (
    "Oh, da ist gerade etwas schiefgegangen. Versuch es gleich noch einmal."
)
