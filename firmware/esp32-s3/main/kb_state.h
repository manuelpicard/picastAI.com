#pragma once

#include <stdbool.h>
#include <stdint.h>

/** Zustände wie im Pi-Client (ClientState in pi-client/kunibert_client.py). */
typedef enum {
    KB_STATE_BOOT = 0,
    KB_STATE_WIFI_CONNECTING,
    KB_STATE_READY,
    KB_STATE_RECORDING,
    KB_STATE_UPLOADING,
    KB_STATE_REQUESTING_STORY,
    KB_STATE_PLAYING,
    KB_STATE_MIC_OFF,
    KB_STATE_ERROR,
    KB_STATE_SHUTDOWN,
    KB_STATE_COUNT
} kb_state_t;

/** LED-Muster wie im Pi-Client (GpioStatusLed._PATTERNS). */
typedef enum {
    KB_LED_OFF = 0,
    KB_LED_READY,
    KB_LED_RECORDING,
    KB_LED_BUSY,
    KB_LED_MIC_OFF,
    KB_LED_ERROR,
    KB_LED_COUNT
} kb_led_mode_t;

/** Ein Muster: abwechselnd an/aus in Millisekunden, beginnend mit "an". count == 0: dauerhaft an oder aus. */
typedef struct {
    bool steady_on;
    uint8_t count;
    uint16_t ms[4];
} kb_led_pattern_t;

/** true, wenn der Wechsel erlaubt ist (Tabelle aus KunibertClient.transition). */
bool kb_state_can_transition(kb_state_t from, kb_state_t to);

/**
 * Führt den Wechsel aus. Ein unerlaubter Wechsel ist ein Programmfehler: Der Zustand
 * wird dann ERROR (oder bleibt SHUTDOWN) und die Funktion gibt false zurück.
 */
bool kb_state_transition(kb_state_t *state, kb_state_t to);

kb_led_mode_t kb_state_led_mode(kb_state_t state);
const kb_led_pattern_t *kb_led_pattern(kb_led_mode_t mode);
const char *kb_state_name(kb_state_t state);

/** Grenzen der Aufnahme wie im Pi-Client (min_record_seconds, max_record_seconds). */
#define KB_RECORD_MIN_MS 350
#define KB_RECORD_MAX_MS 15000

/**
 * Entscheidet nach dem Loslassen der Sprechtaste, ob die Aufnahme gesendet wird.
 * Mikrofon-Aus hat Vorrang: Wurde der Schalter während der Aufnahme umgelegt,
 * wird nichts gesendet. Zu kurze Aufnahmen werden auch nicht gesendet.
 */
bool kb_record_should_send(uint32_t duration_ms, bool mic_off_seen);
