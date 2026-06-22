# MeinHandwerker

## API

OpenAPI/Swagger-Dokumentation:

```text
https://verwaltung.mein-handwerker-app.de/api_doku
```

Direkter OpenAPI-JSON-Pfad fuer maschinelles Auslesen:

```text
https://verwaltung.mein-handwerker-app.de/public/Api_dokumentation
```

API-Basis-URL fuer Requests:

```text
https://verwaltung.mein-handwerker-app.de/public/MH_Api
```

Authentifizierung erfolgt mit:

```text
client_id       = MEINHANDWERKER_CLIENTID aus .env
client_password = MEINHANDWERKER_API_KEY aus .env
```

Beispiel fuer den Verbindungstest:

```bash
curl -X POST "https://verwaltung.mein-handwerker-app.de/public/MH_Api/check_password_validation" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"<client_id>","client_password":"<api_key>"}'
```

## Chrome Extension

Die Extension liegt unter:

```text
extension/
```

Name der Extension:

```text
MeinHandwerker Faktura Assistent
```

Aktuelle Version:

```text
0.2.0
```

Sie wird automatisch auf Rechnungsseiten geladen, deren URL so beginnt:

```text
https://verwaltung.mein-handwerker-app.de/billing/edit/
```

Die Rechnungs-ID wird aus dem letzten URL-Segment gelesen, z.B. `43928` aus:

```text
https://verwaltung.mein-handwerker-app.de/billing/edit/43928
```

Lokale Installation in Chrome:

1. `chrome://extensions` oeffnen
2. Entwicklermodus aktivieren
3. "Entpackte Erweiterung laden" waehlen
4. Den Ordner `extension/` auswaehlen
5. Eine MeinHandwerker-Rechnungsseite oeffnen
6. Das Extension-Icon klicken und im Panel `client_id` und API-Key speichern

Die Extension zeigt aktuell eine Rechnungsuebersicht und alle Positionen, deren Beschreibung
`Dachschrägenregal` enthaelt. Ueber `+` kann eine neue Dachschraegenregal-Position
angelegt werden; vorhandene Dachschraegenregal-Positionen koennen angeklickt und bearbeitet
werden.

Bedienung:

```text
Extension-Icon: Panel auf einer passenden Rechnungsseite oeffnen
Schluessel-Icon: client_id und API-Key im Panel bearbeiten
Reload-Icon: Rechnungsdaten neu laden
X-Icon: Panel schließen
```

Wenn auf einer unpassenden Seite auf das Extension-Icon geklickt wird, erscheint ein
Hinweis mit der Option, zu `https://verwaltung.mein-handwerker-app.de/` zu wechseln.

Aktuelle Kalkulationsfelder:

```text
Breite in cm
Hoehe außen in cm
Hoehe innen in cm
```

Aktuelle Preisformel:

```text
Flaeche = Breite * ((Hoehe außen + Hoehe innen) / 2)
Preis netto = Flaeche in m² * 500 EUR
```

Gespeicherte Positionsbeschreibung:

```text
Dachschrägenregal
Abbmessungen: 200cm Breite, 0cm Höhe außen, 150cm Höhe innen
```

Beim Speichern wird die komplette Positionsliste der Rechnung ueber `update_invoice`
zurueckgeschrieben, weil die API keine einzelne Positions-Patch-Operation dokumentiert.
Nach erfolgreichem Speichern wird die MeinHandwerker-Seite neu geladen.
