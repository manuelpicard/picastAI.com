#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

/** Format der Schnittstelle (docs/picastAI-Pi-API.md): mono, 16 Bit, 16 kHz. */
#define KB_WAV_SAMPLE_RATE 16000
#define KB_WAV_CHANNELS    1
#define KB_WAV_BITS        16
#define KB_WAV_HEADER_SIZE 44
/** Obergrenze des Servers für eine Aufnahme (2 MB samt Kopf). */
#define KB_WAV_UPLOAD_MAX  (2u * 1024u * 1024u)

/** Schreibt den 44-Byte-Kopf für data_bytes Audiodaten nach out. */
void kb_wav_write_header(uint8_t out[KB_WAV_HEADER_SIZE], uint32_t data_bytes);

typedef enum {
    KB_WAV_OK = 0,
    KB_WAV_TOO_SHORT,     /**< weniger als 44 Byte */
    KB_WAV_NOT_WAV,       /**< kein RIFF/WAVE mit fmt- und data-Block an der üblichen Stelle */
    KB_WAV_WRONG_FORMAT,  /**< nicht PCM, mono, 16 Bit, 16 kHz */
    KB_WAV_EMPTY          /**< keine Audiodaten */
} kb_wav_result_t;

/**
 * Prüft die ersten 44 Byte einer Antwort des Servers, bevor Ton an den Lautsprecher geht.
 * Erwartet den einfachen Aufbau, den der Server schreibt (fmt-Block mit 16 Byte, dann data).
 * data_bytes bekommt die Länge der Audiodaten laut Kopf.
 */
kb_wav_result_t kb_wav_check_header(const uint8_t *data, size_t len, uint32_t *data_bytes);
