#pragma once

#include <stdbool.h>

#include "esp_err.h"

/**
 * Verbindet mit dem WLAN aus der Konfiguration (KB_WIFI_SSID, KB_WIFI_PASSWORD)
 * und wartet, bis eine IP-Adresse da ist.
 *
 * @return ESP_OK bei Erfolg, ESP_ERR_INVALID_ARG ohne SSID,
 *         ESP_FAIL nach KB_WIFI_MAX_RETRY Fehlversuchen.
 */
esp_err_t kb_wifi_connect(void);

/** true, solange eine IP-Adresse da ist. */
bool kb_wifi_is_connected(void);

/**
 * Startet eine neue Runde Verbindungsversuche, wenn kb_wifi_connect() gescheitert ist
 * (zum Beispiel weil der Router nach einem Stromausfall später startet als das Gerät).
 * Ohne Wirkung, wenn schon verbunden oder kein WLAN-Name gesetzt ist.
 */
void kb_wifi_retry(void);
