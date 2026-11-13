#pragma once

#include <stdbool.h>
#include <stddef.h>

// Regeln für die Einstellungen des Geräts. Ohne ESP-IDF, damit sie auf dem Rechner
// getestet werden können (test/test_logic.c).

typedef enum {
    KB_SETTING_WIFI_SSID = 0,
    KB_SETTING_WIFI_PASSWORD,
    KB_SETTING_API_BASE_URL,
    KB_SETTING_DEVICE_ID,
    KB_SETTING_DEVICE_TOKEN,
    KB_SETTING_COUNT
} kb_setting_id_t;

typedef struct {
    kb_setting_id_t id;
    const char *name;    // Name auf der seriellen Konsole
    const char *nvs_key; // Schlüssel im Speicher (höchstens 15 Zeichen)
    size_t max_len;      // längster erlaubter Wert, ohne Endezeichen
    bool secret;         // wird nie angezeigt
} kb_setting_def_t;

#define KB_SETTING_VALUE_MAX 200

/** Liefert die Beschreibung einer Einstellung oder NULL. */
const kb_setting_def_t *kb_settings_def(kb_setting_id_t id);

/** Sucht eine Einstellung nach ihrem Namen auf der Konsole (Groß/klein genau) oder NULL. */
const kb_setting_def_t *kb_settings_find(const char *name);

/**
 * Prüft einen Wert: nicht NULL, nicht zu lang, keine Steuerzeichen. Die Adresse des
 * Servers muss zusätzlich kb_api_base_url_ok bestehen; Geräte-ID und Token dürfen
 * keine Leerzeichen enthalten. Ein leerer Wert ist erlaubt (löscht die Einstellung).
 */
bool kb_settings_value_ok(const kb_setting_def_t *def, const char *value);
