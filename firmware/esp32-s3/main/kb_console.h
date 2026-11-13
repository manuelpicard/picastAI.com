#pragma once

#include "esp_err.h"

/**
 * Startet die serielle Konsole zum Einrichten (USB-Kabel, idf.py monitor):
 *   zeige                   Einstellungen anzeigen (Passwort und Token nie im Klartext)
 *   setze <name> <wert>     wlan, wlan-passwort, server, geraet, token
 *   loesche                 alle gespeicherten Einstellungen löschen
 *   neustart                Gerät neu starten (Einstellungen gelten nach dem Neustart)
 * Läuft in einem eigenen Task neben dem Betrieb.
 */
esp_err_t kb_console_start(void);
