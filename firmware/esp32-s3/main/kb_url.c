// Prüfung der Server-Adresse. Bewusst ohne ESP-IDF, damit sie auf dem Rechner testbar ist.
#include "kb_url.h"

#include <stddef.h>
#include <string.h>

bool kb_api_base_url_ok(const char *base_url)
{
    static const char prefix[] = "https://";
    if (base_url == NULL) {
        return false;
    }
    size_t len = strlen(base_url);
    size_t prefix_len = sizeof(prefix) - 1;
    if (len <= prefix_len || len >= KB_URL_MAX - 16) {
        return false;
    }
    if (strncmp(base_url, prefix, prefix_len) != 0) {
        return false;
    }
    if (base_url[len - 1] == '/') {
        return false;
    }
    // Hostname darf nicht leer sein und keine Leerzeichen enthalten.
    const char *host = base_url + prefix_len;
    if (host[0] == '/' || host[0] == ':' || strchr(host, ' ') != NULL) {
        return false;
    }
    return true;
}
