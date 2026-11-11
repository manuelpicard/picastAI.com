#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"
#include "kb_url.h"

/** Ergebnis einer Frage oder eines Geschichtenwunschs. */
typedef struct {
    int http_status;           /**< 0 bei Netzfehler oder Zeitüberschreitung */
    bool has_retryable;        /**< Body hatte ein Feld "retryable" */
    bool retryable;
    bool session_end;          /**< Folge ist zu Ende */
    char audio_url[KB_URL_MAX]; /**< leer, wenn keine gültige Antwort kam */
} kb_api_turn_t;

/**
 * Ruft GET <base_url>/health auf (HTTPS, Zertifikat wird geprüft).
 *
 * @return ESP_OK, wenn der Server mit 200 und {"status":"ok"} antwortet,
 *         ESP_ERR_INVALID_ARG bei ungültiger Adresse,
 *         ESP_ERR_INVALID_RESPONSE bei anderer Antwort,
 *         sonst der Fehler des HTTP-Clients (zum Beispiel Zeitüberschreitung).
 */
esp_err_t kb_api_health(const char *base_url);

/** Neue zufällige Sitzungskennung (einmal pro Start). */
void kb_api_new_session(void);

/**
 * POST /v1/device/question: sendet die Aufnahme (PCM, 16 Bit, mono, 16 kHz) als WAV.
 * ESP_OK nur bei HTTP 200 mit einer audio_url desselben Ursprungs. In jedem Fall ist
 * out gefüllt, damit der Aufrufer über eine Wiederholung entscheiden kann.
 */
esp_err_t kb_api_question(const uint8_t *pcm, size_t pcm_bytes, kb_api_turn_t *out);

/** POST /v1/device/kunibert-story: nächster Teil der Geschichte. */
esp_err_t kb_api_story(kb_api_turn_t *out);

/**
 * Holt die Antwort (einmalig abrufbar) und spielt sie beim Laden ab.
 * Prüft Status 200, Content-Type audio/wav und den WAV-Kopf, bevor Ton ausgegeben wird.
 */
esp_err_t kb_api_play_audio(const char *audio_url);
