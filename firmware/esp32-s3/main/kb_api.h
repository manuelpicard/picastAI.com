#pragma once

#include "esp_err.h"

/**
 * Ruft GET <base_url>/health auf (HTTPS, Zertifikat wird geprüft).
 *
 * @return ESP_OK, wenn der Server mit 200 und {"status":"ok"} antwortet,
 *         ESP_ERR_INVALID_ARG bei ungültiger Adresse,
 *         ESP_ERR_INVALID_RESPONSE bei anderer Antwort,
 *         sonst der Fehler des HTTP-Clients (zum Beispiel Zeitüberschreitung).
 */
esp_err_t kb_api_health(const char *base_url);
