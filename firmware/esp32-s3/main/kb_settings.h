#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "kb_settings_rules.h"

// Einstellungen des Geräts: WLAN, Adresse des Servers, Geräte-ID, Token.
// Quelle: der Speicher des Geräts (NVS, Namensraum "kunibert"). Fehlt dort ein Wert,
// gilt der Wert aus sdkconfig (nur Entwicklung). So lässt sich ein Gerät ohne neuen
// Build einrichten (serielle Konsole, kb_console.h).
//
// Stand: Der Speicher ist NICHT verschlüsselt. Das Token ist mit Zugriff auf den
// Flash auslesbar, bis Flash-Verschlüsselung eingeschaltet ist (späterer Teil von M6).

/** Lädt alle Einstellungen. Muss nach nvs_flash_init() laufen. */
esp_err_t kb_settings_load(void);

/** Wert einer Einstellung, wie er beim Start geladen wurde (nie NULL, leer wenn nicht gesetzt). */
const char *kb_settings_get(kb_setting_id_t id);

/** true, wenn der Wert aus dem Speicher des Geräts kommt (nicht aus sdkconfig). */
bool kb_settings_from_nvs(kb_setting_id_t id);

/** Speichert einen Wert dauerhaft; er gilt nach dem Neustart. Ein leerer Wert löscht den Eintrag (dann gilt wieder sdkconfig). */
esp_err_t kb_settings_set(kb_setting_id_t id, const char *value);

/** Löscht alle gespeicherten Einstellungen (gilt nach dem Neustart). */
esp_err_t kb_settings_erase_all(void);

/** true, wenn WLAN-Name, Adresse, Geräte-ID und Token gesetzt sind. */
bool kb_settings_complete(void);
