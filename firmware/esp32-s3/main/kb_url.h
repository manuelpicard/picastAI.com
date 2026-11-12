#pragma once

#include <stdbool.h>

/** Größte Länge einer vollständigen Adresse samt Pfad. */
#define KB_URL_MAX 256

/**
 * Prüft die Adresse des Servers: muss mit "https://" beginnen, einen Hostnamen
 * haben und darf nicht mit "/" enden. Reine Zeichenketten-Prüfung, kein Netz.
 * Ohne ESP-IDF übersetzbar (Rechner-Test in test/test_base_url.c).
 */
bool kb_api_base_url_ok(const char *base_url);

/**
 * true, wenn beide Adressen denselben Ursprung haben: Schema https, gleicher Hostname
 * (Groß-/Kleinschreibung egal), gleicher Port (ohne Angabe 443). Adressen mit
 * Zugangsdaten (user@host), anderem Schema oder ungültigem Port ergeben false.
 * Entspricht same_origin im Pi-Client: Die audio_url muss zum Server gehören,
 * sonst ginge das Gerätetoken an einen fremden Ort.
 */
bool kb_url_same_origin(const char *first, const char *second);

/** Was nach einer Antwort des Servers zu tun ist (Fehlerregeln der Firmware-Spezifikation). */
typedef enum {
    KB_RETRY_NONE = 0, /**< nicht wiederholen */
    KB_RETRY_ONCE      /**< wiederholen, wenn noch ein Versuch und Zeit übrig sind */
} kb_retry_t;

/**
 * Entscheidet über eine Wiederholung.
 * @param http_status   HTTP-Status, 0 bei Netzfehler oder Zeitüberschreitung
 * @param has_retryable true, wenn der Body ein Feld "retryable" hat
 * @param retryable     Wert dieses Felds
 * @param attempts_done Zahl der schon gemachten Versuche (1 nach dem ersten)
 * @param elapsed_ms    Zeit seit dem ersten Versuch
 */
kb_retry_t kb_retry_decide(int http_status, bool has_retryable, bool retryable,
                           int attempts_done, unsigned long elapsed_ms);

/** Höchstens ein Wiederholungsversuch, wie im Pi-Client (KUNIBERT_RETRY_COUNT=1, seit 12.11.2026). */
#define KB_MAX_ATTEMPTS 2
/** Zeitgrenze des Geräts für Frage und Geschichte (Server 120 s, Caddy 130 s). */
#define KB_PIPELINE_TIMEOUT_MS 140000ul
