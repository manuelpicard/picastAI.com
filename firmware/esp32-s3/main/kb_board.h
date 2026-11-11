#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "kb_state.h"

/** Tasten, Schalter und LED einrichten; startet den LED-Task. */
esp_err_t kb_board_init(void);

bool kb_board_speak_pressed(void);
bool kb_board_story_pressed(void);
/** true, wenn der Mikrofon-Aus-Schalter auf "aus" steht (ohne Schalter immer false). */
bool kb_board_mic_off(void);

/** Setzt das LED-Muster; der LED-Task spielt es ab. */
void kb_board_set_led(kb_led_mode_t mode);
