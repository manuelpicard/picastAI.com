#pragma once

#include "esp_err.h"

/**
 * Verbindet mit dem WLAN aus der Konfiguration (KB_WIFI_SSID, KB_WIFI_PASSWORD)
 * und wartet, bis eine IP-Adresse da ist.
 *
 * @return ESP_OK bei Erfolg, ESP_ERR_INVALID_ARG ohne SSID,
 *         ESP_FAIL nach KB_WIFI_MAX_RETRY Fehlversuchen.
 */
esp_err_t kb_wifi_connect(void);
