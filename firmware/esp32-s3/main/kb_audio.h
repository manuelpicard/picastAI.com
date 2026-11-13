#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

/** Mikrofon (I2S-Eingang) und Verstärker (I2S-Ausgang) einrichten, 16 kHz, mono, 16 Bit. */
esp_err_t kb_audio_init(void);

/** Größe des Aufnahmepuffers in Byte (PCM, ohne WAV-Kopf). 0, wenn kein Speicher da ist. */
size_t kb_audio_record_capacity(void);

/**
 * Nimmt auf, solange keep_going() true liefert, höchstens bis der Puffer voll ist.
 * Liest das Mikrofon nur innerhalb dieses Aufrufs.
 *
 * @param[out] pcm    Zeiger auf die Aufnahme (16 Bit, little endian); gültig bis zur nächsten Aufnahme
 * @param[out] bytes  Länge der Aufnahme in Byte
 */
esp_err_t kb_audio_record(bool (*keep_going)(void), const uint8_t **pcm, size_t *bytes);

/** Überschreibt die letzte Aufnahme mit Nullen (nach dem Senden oder beim Verwerfen). */
void kb_audio_discard_recording(void);

/** Wiedergabe: 16 Bit PCM in Blöcken an den Verstärker geben. */
esp_err_t kb_audio_play_begin(void);
esp_err_t kb_audio_play_write(const uint8_t *pcm, size_t bytes);
void kb_audio_play_end(void);
