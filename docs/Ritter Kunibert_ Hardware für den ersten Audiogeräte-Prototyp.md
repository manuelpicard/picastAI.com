# Ritter Kunibert: Hardware für den ersten Audiogeräte-Prototyp

> **Aktualisierung (November 2026):** Dieses Dokument ist die ursprüngliche Planung von Anfang Oktober. Entscheidung für den **ersten Aufbau**: der hier beschriebene **Raspberry Pi 5 (4 GB)** mit Raspberry Pi OS Lite und zwei getrennten USB-Geräten (USB-Mikrofon, geplant BerryBase „USB Mini Mikrofon“, und der Adafruit-USB-Lautsprecher 3369; noch nicht bestellt). Beim ersten Test fehlt noch der Mikrofon-Aus-Schalter (GPIO 22). Der **Raspberry Pi Zero 2 W** mit Audio-HAT bleibt die spätere kleine Version. Der Client (`pi-client/`) und das Installationsskript sind für beide gedacht, wurden aber noch auf keinem echten Pi ausgeführt. Einrichtung mit zwei USB-Geräten: [`pi-client/README.md`](../pi-client/README.md#erster-aufbau-pi-5-mit-usb-mikrofon-und-usb-lautsprecher). Die Plattform heißt inzwischen **picastAI.com**; der Dienst ist in diesem Repository als Node-Server umgesetzt (`docs/picastAI-Pi-API.md`).

**Stand: 2. Oktober 2026.** Empfehlung für einen **Tisch-Prototypen**, noch nicht für ein unbeaufsichtigt von Kindern genutztes Produkt. Das Kind braucht keinen Bildschirm; ein Computer/Telefon wird zunächst nur für Einrichtung und Entwicklung verwendet.

## Empfohlene Stückliste (Version 1)

| Teil | Empfehlung | Warum |
| --- | --- | --- |
| Einplatinencomputer | [Raspberry Pi 5](https://www.raspberrypi.com/products/raspberry-pi-5/) mit **4 GB RAM** | Genug Reserven für Linux, Audioaufnahme, WLAN und Steuerung; USB-Ports und GPIO sind direkt vorhanden. Die eigentliche KI kann online laufen. |
| Speicher | Marken-microSD, **32 GB oder mehr** | Raspberry Pi OS und Gerätesoftware; kein dauerhafter Speicher für Kinder-Audio nötig. |
| Stromversorgung | [Offizielles 27-W-USB-C-Netzteil](https://www.raspberrypi.com/products/27w-power-supply/), 5,1 V / 5 A | Für Pi 5 und angeschlossene USB-Geräte geeignet; zunächst **Steckdosenbetrieb statt Akku**. |
| Kühlung/Gehäuse | Pi-5-Gehäuse mit Lüfter oder offizieller Active Cooler; später eigenes geschlossenes Gehäuse | Der Pi 5 profitiert unter Last von Kühlung. Prototypenplatinen und Leitungen dürfen für Kinder nicht frei zugänglich sein. |
| Mikrofon | Ein einfaches, Linux-taugliches **USB-Mikrofon**, z. B. [Adafruit Mini USB Microphone](https://www.adafruit.com/product/3367) | Plug-and-play statt Audio-Schaltung. Das genannte Modell ist für Raspberry Pi dokumentiert; Klangqualität und Abstand im echten Raum müssen erprobt werden. |
| Lautsprecher | Ein **USB-Lautsprecher**, z. B. [Adafruit Mini External USB Speaker](https://www.adafruit.com/product/3369) | Kein separater DAC und kein Verstärker nötig; Pi 5 hat keinen gewöhnlichen 3,5-mm-Audioausgang. |
| Bedienelemente | **2 große Taster**, 1 Status-LED mit passendem Vorwiderstand, optional Lautstärkedrehregler | „Frage stellen“: drücken und sprechen; „Geschichte“: eigene Taste. LED zeigt die aktive Aufnahme sichtbar an. GPIOzero dokumentiert Taster und LED. |
| Privatsphäre | **Physischer Mikrofon-Aus-Schalter**, der nur das Mikrofon elektrisch trennt bzw. dessen USB-Versorgung abschaltet; sichtbare OFF-Markierung | Ein reiner Software-Mute ist keine verlässliche Hardware-Unterbrechung. Bei einem USB-Schalter müssen Datenleitung, Wiedereinstecken und Zustand in der konkreten Schaltung getestet werden. **Nicht** das Pi-Netzteil per billigem Inline-Schalter unterbrechen. |
| Aufbau | Breadboard/Lochraster, isolierte Leitungen, Tasterkappen, Gehäuse mit Lautsprecheröffnungen und Zugentlastung | Erst auf dem Tisch testen; danach leitungs- und kindersicher einbauen. |

**Kein Bildschirm, keine Kamera und kein Wake-Word-Mikrofon** sind für die erste Version erforderlich. WLAN verbindet das Gerät mit dem Dienst. Eine Kopfhörerbuchse ist zunächst nicht nötig. Die genannten Produktlinks sind technische Beispiele, keine Kaufaufforderung und keine Verfügbarkeitsgarantie.

## So arbeiten die Teile zusammen

```text
Kind hält Sprechtaste → Status-LED an → USB-Mikrofon nimmt begrenzt auf
                     → verschlüsselte Übertragung an den Sprachdienst
                     → Sprache-zu-Text → kindgerechte Antwort/Kunibert-Erzählung
                     → Text-zu-Sprache → USB-Lautsprecher spielt ab
```

Während das Gerät spricht, ist das Mikrofon in Version 1 nicht offen. Das vermeidet, dass es seine eigene Stimme hört; Unterbrechen oder freihändiges Reden sind spätere Erweiterungen. Bei Verbindungsausfall gibt es eine fest gespeicherte kurze Ansage und optional einige lokale Geschichten. Eine Taste zum Wiederholen der letzten Antwort lässt sich später ergänzen.

## Warum noch nicht der kleinste Pi?

Der [Raspberry Pi Zero 2 W](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/) misst nur **65 × 30 mm**, hat aber **512 MB RAM**, einen **Micro-USB-OTG-Port** und keine normalen USB-A-Buchsen. Für zwei USB-Audiogeräte braucht er Adapter/Hub oder eine integrierte Audioplatine. Er ist eine sinnvolle **Miniaturisierung nach dem Funktionstest**, aber nicht die einfachste erste Testplattform. Eine mögliche kompakte Audioalternative ist der [Raspberry Pi Codec Zero](https://www.raspberrypi.com/documentation/accessories/audio.html) mit eingebautem Mikrofon und Anschluss für einen kleinen Monolautsprecher; seine Einrichtung ist komplexer als zwei USB-Geräte. Für vollständig lokale Spracherkennung **und** gute freie KI-Antworten müsste die Rechenplattform gesondert erprobt werden; die kleine Platine ist dafür nicht automatisch ausreichend.

## picast.com: derzeit eine offene Abhängigkeit

Die direkt geprüfte Adresse [picast.com](https://picast.com) zeigt aktuell **eine Verkaufsseite für die Domain**, keine dokumentierte Sprachplattform oder API. In der vorhandenen Projektkonfiguration ist auch kein Picast-Connector erkennbar. Deshalb kann ich nicht seriös festlegen, dass Sprachaufnahme, KI und Sprachausgabe *bereits* darüber laufen. Die Hardware oben bleibt verwendbar, falls später ein eigener Server unter dieser Domain betrieben wird: Das Gerät würde dann nur mit einem autorisierten HTTPS-Endpunkt unter `picast.com` sprechen; die konkreten KI-Dienste müssten dort serverseitig integriert werden. **Weder Domain noch Hardware wurden gekauft.**

## Praktische Reihenfolge

1. Pi 5 mit Netzteil, Kühlung, SD-Karte, USB-Mikrofon und USB-Lautsprecher auf dem Tisch aufbauen; Tonaufnahme und Wiedergabe getrennt prüfen.
2. Sprechtaste und Aufnahme-LED über GPIO anschließen; die Anleitung [GPIOzero Basic Recipes](https://gpiozero.readthedocs.io/en/stable/recipes.html) zeigt das Prinzip. Eine zweite Taste startet eine Kunibert-Geschichte.
3. Erst dann Sprachdienst anbinden und mit Erwachsenen testen: kurze Fragen, lange Geschichten, Fehlerfall und unklare Aussprache.
4. Mikrofon-Aus-Schalter und sichere Gehäuseintegration prüfen; insbesondere testen, dass bei OFF **elektrisch keine Aufnahme** möglich ist.
5. Bevor Kinder allein damit spielen: Antworten, Datenfluss, Einwilligung der Sorgeberechtigten, Umgang mit Notlagen und elektrische/mechanische Sicherheit fachlich prüfen. Der Prototyp ist noch kein sicheres Kinderprodukt.

**Entscheidung vor der Software-Anbindung:** Ist `picast.com` eine Domain, die du erwerben und als eigene Plattform betreiben willst, oder meintest du einen anderen bereits existierenden Dienst? Bis dahin bleibt die Serveranbindung offen.
