# MeinHandwerker Faktura Assistent

Chrome-Extension für die MeinHandwerker-Online-App. Die Extension öffnet auf Rechnungsseiten ein seitliches Panel und unterstützt dort die Kalkulation von Dachschrägenregal-Positionen.

## Zweck

Der Faktura Assistent soll Rechnungspositionen für Dachschrägenregale schneller und konsistenter erstellen. Auf einer MeinHandwerker-Rechnungsseite liest die Extension die Rechnungs-ID aus der URL, lädt die Rechnung über die MeinHandwerker-API und zeigt vorhandene Dachschrägenregal-Positionen an.

Aktuell kann die Extension:

- Rechnungsdaten im Panel anzeigen
- Dachschrägenregal-Positionen erkennen
- neue Dachschrägenregal-Positionen kalkulieren und hinzufügen
- vorhandene Dachschrägenregal-Positionen bearbeiten
- die komplette Positionsliste der Rechnung über die API zurückschreiben

## Voraussetzungen

- Google Chrome oder ein Chromium-basierter Browser mit Extension-Entwicklermodus
- Zugriff auf die MeinHandwerker-Online-App
- gültige MeinHandwerker-API-Zugangsdaten:
  - `client_id`
  - `client_password` / API-Key
- eine Rechnung im Entwurfsstatus, wenn Positionen geändert werden sollen

Die API-Zugangsdaten werden lokal in Chrome über `chrome.storage.local` gespeichert. Sie bleiben bei einem Reload derselben entpackten Extension erhalten.

## Installation

1. `chrome://extensions` öffnen
2. Entwicklermodus aktivieren
3. "Entpackte Erweiterung laden" wählen
4. Den Ordner `extension/` auswählen
5. Eine MeinHandwerker-Rechnungsseite öffnen
6. Das Extension-Icon klicken
7. Im Panel `client_id` und API-Key speichern

Die Extension liegt in diesem Repository unter:

```text
extension/
```

Aktuelle Version:

```text
0.6.1
```

## Nutzung

Die Extension wird automatisch auf Rechnungsseiten geladen, deren URL so beginnt:

```text
https://verwaltung.mein-handwerker-app.de/billing/edit/
https://verwaltung.mein-handwerker-app.de/billing/create_billing/
```

Die Rechnungs-ID wird aus dem letzten URL-Segment gelesen, z.B. `43928` aus:

```text
https://verwaltung.mein-handwerker-app.de/billing/edit/43928
```

Beim Erstellen einer noch nicht gespeicherten Rechnung steht in der URL statt einer Rechnungs-ID die Projekt-ID:

```text
https://verwaltung.mein-handwerker-app.de/billing/create_billing/1526229
```

In diesem Zustand gibt es noch keine `invoice_id` und keine gespeicherte Positionsliste. Die Extension startet deshalb direkt mit dem Kalkulator für die erste Dachschrägenregal-Position. Beim Speichern ruft sie `insert_invoice` auf, legt damit einen Rechnungsentwurf für die `construction_id` an und leitet anschließend auf die Bearbeitungsseite weiter:

```text
https://verwaltung.mein-handwerker-app.de/billing/edit/{invoice_id}
```

Bedienung:

```text
Extension-Icon: Panel auf einer passenden Rechnungsseite öffnen
Schlüssel-Icon: client_id und API-Key im Panel bearbeiten
Reload-Icon: Rechnungsdaten neu laden
X-Icon: Panel schließen
```

Wenn auf einer unpassenden Seite auf das Extension-Icon geklickt wird, erscheint ein Hinweis mit der Option, zu `https://verwaltung.mein-handwerker-app.de/` zu wechseln.

## Dachschrägenregal-Kalkulator

Eine relevante Rechnungsposition wird aktuell am Wort `Dachschrägenregal` in der Positionsbeschreibung erkannt.

Kalkulationsfelder:

```text
Breite in cm
Höhe außen in cm
Höhe innen in cm
Außenseite: links oder rechts
Fächer
Regalböden je Fach
```

Formularverhalten:

- Breite, Höhe außen und Höhe innen stehen kompakt in einer Zeile mit Platzhaltern.
- Außenseite wird über zwei Chips gewählt.
- Regalbodenanzahlen werden je Fach als Tabelle mit Spalten `0`, `1`, `2`, `3`, `4`, `5` gesetzt.
- Zahlenfelder selektieren beim Fokus ihren kompletten Inhalt.
- Der Speichern-Button sitzt im Kalkulator-Kopf als blaues Disketten-Icon.
- Speichern ist nur aktiv, wenn es ungespeicherte Änderungen gibt.
- Beim Schließen mit ungespeicherten Änderungen erscheint eine Warnung.

Die Korpuszeichnung im Kalkulator wird maßstabsgerecht mit einem gemeinsamen Skalierungsfaktor für Breite und Höhe gezeichnet.

Preisformel:

```text
Fläche = Breite * ((Höhe außen + Höhe innen) / 2)
Grundpreis netto = Fläche in m² * 500 EUR
Trennwände = 25 EUR pro laufendem Meter
Regalböden = 20 EUR pro laufendem Meter
```

## Positionsbeschreibung

Beim Speichern schreibt die Extension alle Kalkulationsdaten in die Positionsbeschreibung, damit die Position später wieder erkannt und bearbeitet werden kann.

Beispiel:

```text
Dachschrägenregal
Abbmessungen: 200cm Breite, 0cm Höhe außen, 150cm Höhe innen
Außenseite: links
Fächer: 4
Regalböden je Fach: 1, 2, 0, 1
```

Preise werden nicht in die Positionsbeschreibung geschrieben. Der berechnete Nettopreis wird als `unit_price` der Rechnungsposition gespeichert.

## API

OpenAPI/Swagger-Dokumentation:

```text
https://verwaltung.mein-handwerker-app.de/api_doku
```

Direkter OpenAPI-JSON-Pfad für maschinelles Auslesen:

```text
https://verwaltung.mein-handwerker-app.de/public/Api_dokumentation
```

API-Basis-URL für Requests:

```text
https://verwaltung.mein-handwerker-app.de/public/MH_Api
```

Authentifizierung:

```text
client_id       = MEINHANDWERKER_CLIENTID aus .env
client_password = MEINHANDWERKER_API_KEY aus .env
```

Verbindungstest:

```bash
curl -X POST "https://verwaltung.mein-handwerker-app.de/public/MH_Api/check_password_validation" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"<client_id>","client_password":"<api_key>"}'
```

Die Extension verwendet aktuell:

```text
POST /insert_invoice
POST /get_invoice
GET  /get_customers
POST /update_invoice
```

Wichtig: `update_invoice` ersetzt die komplette Positionsliste, wenn `positions` mitgegeben wird. Deshalb liest die Extension die vorhandenen Positionen, ersetzt oder ergänzt die Dachschrägenregal-Position und schreibt anschließend die komplette Liste zurück.

## Entwicklung

Die Extension ist eine Manifest-V3-Extension ohne Build-Schritt.

Wichtige Dateien:

```text
extension/manifest.json
extension/background.js
extension/content.js
extension/content.css
```

Syntaxcheck:

```bash
node --check extension/background.js
node --check extension/content.js
```

Versionierung erfolgt nach Semantic Versioning:

```text
MAJOR.MINOR.PATCH
```

Layout-Regel:

```text
Abstände und Positionierung folgen einem 12x12px-Raster.
```
