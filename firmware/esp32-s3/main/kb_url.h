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
